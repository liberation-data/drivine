import { hasLabels, PostgresGraph, textOf } from '@/backend/postgres/PostgresGraph';
import { embedding, holds, searchedText } from '@/backend/postgres/PostgresSearch';
import { CATALOG_KINDS, catalogProperties, catalogRecord } from '@/backend/sql/SqlCatalog';
import { sqlText } from '@/backend/sql/SqlGraph';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import {
    FullTextIndexSpec,
    IndexSpec,
    itemName,
    RangeIndexSpec,
    UniquenessConstraintSpec,
    VectorIndexSpec
} from '@/schema/SchemaSpecs';

/**
 * Indexes and constraints on Postgres, as drivine4j makes them, so a store's schema is one whichever library made it. A
 * property is a key of the `jsonb` column `props`, and Postgres indexes the part of a table a predicate selects, so each
 * is a partial index over an expression, for the nodes of one label:
 *
 * - a range index is `((props ->> 'p')) WHERE labels @> '["L"]'`. A statement tests each label of a node on its own and
 *   reads a property as that same expression, so the planner sees that the index holds the nodes it asks for;
 * - a uniqueness constraint is that index made `UNIQUE`. A node without the property reads it as null, which a unique
 *   index does not hold, so it is not constrained, as on the graph engines;
 * - a vector index is an HNSW index of pgvector over the embeddings of the label's nodes that are of its size;
 * - a full-text index is a GIN index of the trigrams of the text a search reads, which narrows a search to the nodes
 *   whose text holds a term's words.
 *
 * What is made is recorded in the graph's catalog, as drivine4j records it, and read back from there: an index's
 * expression does not say which label and properties it was made for. The object manager makes the store before it
 * runs a statement of its schema, so the catalog is there.
 */
export class PostgresSchemaGrammar implements SchemaGrammar {
    readonly engine = 'Postgres';

    constructor(private readonly graph: PostgresGraph) {}

    get listRanges(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('RANGE');
    }

    get listUniques(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('UNIQUE');
    }

    get listVectors(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('VECTOR');
    }

    get listFullTexts(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('FULLTEXT');
    }

    createRange(spec: RangeIndexSpec): string[] {
        const name = this.graph.objectName('ix', [spec.label, ...spec.properties]);
        return [
            `CREATE INDEX IF NOT EXISTS ${name} ON ${this.over(spec.label, spec.properties)}`,
            this.recorded(spec, name)
        ];
    }

    dropRange(spec: RangeIndexSpec): string[] {
        return [this.forgotten(spec)];
    }

    createUnique(spec: UniquenessConstraintSpec): string[] {
        const name = this.graph.objectName('uq', [spec.label, ...spec.properties]);
        return [
            `CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${this.over(spec.label, spec.properties)}`,
            this.recorded(spec, name)
        ];
    }

    dropUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.forgotten(spec)];
    }

    /** An HNSW index over the embeddings of the label's nodes that are of its size: one of another size is left out. */
    createVector(spec: VectorIndexSpec): string[] {
        const property = spec.properties[0];
        const name = this.graph.objectName('v', [spec.label, property]);
        const operators = spec.similarity === 'COSINE' ? 'vector_cosine_ops' : 'vector_l2_ops';
        return [
            'CREATE EXTENSION IF NOT EXISTS vector',
            `CREATE INDEX IF NOT EXISTS ${name} ON ${this.graph.nodes} USING hnsw ((${embedding(
                '',
                property,
                spec.dimensions
            )}) ${operators}) ` + `WHERE ${hasLabels('', [spec.label])} AND ${holds('', property, spec.dimensions)}`,
            this.recorded(spec, name, `{"dimensions": ${spec.dimensions}, "similarity": "${spec.similarity}"}`)
        ];
    }

    /** drivine4j makes pgvector's index with its own parameters. */
    unsupportedVectorTuning(spec: VectorIndexSpec): string[] {
        return [
            ...(spec.hnswM !== undefined ? ['hnswM'] : []),
            ...(spec.hnswEfConstruction !== undefined ? ['hnswEfConstruction'] : [])
        ];
    }

    dropVector(spec: VectorIndexSpec): string[] {
        return [this.forgotten(spec)];
    }

    /** Trigrams of the text a search reads, which answer whether it holds a term's words. */
    createFullText(spec: FullTextIndexSpec): string[] {
        const name = this.graph.objectName('t', [spec.label, ...spec.properties]);
        return [
            'CREATE EXTENSION IF NOT EXISTS pg_trgm',
            `CREATE INDEX IF NOT EXISTS ${name} ON ${this.graph.nodes} USING gin ((${searchedText(
                '',
                spec.properties
            )}) gin_trgm_ops) WHERE ${hasLabels('', [spec.label])}`,
            this.recorded(spec, name)
        ];
    }

    dropFullText(spec: FullTextIndexSpec): string[] {
        return [this.forgotten(spec)];
    }

    conflicts(spec: UniquenessConstraintSpec, limit: number): string {
        const values = spec.properties.map((it) => textOf('n', it));
        return (
            // One property's value as it is, several as a list, as the graph engines give them.
            `SELECT ${values.length === 1 ? values[0] : `jsonb_build_array(${values.join(', ')})`} AS "value" ` +
            `FROM ${this.graph.nodes} n ` +
            `WHERE ${hasLabels('n', [spec.label])} AND ${values.map((it) => `${it} IS NOT NULL`).join(' AND ')} ` +
            `GROUP BY ${values.join(', ')} HAVING COUNT(*) > 1 LIMIT ${limit}`
        );
    }

    /**
     * The partial index over the properties of the label's nodes: each property as a statement reads it, and the test
     * of the label a statement makes, both of the table's own columns.
     */
    private over(label: string, properties: string[]): string {
        return `${this.graph.nodes} (${properties.map((it) => `(${textOf('', it)})`).join(', ')}) WHERE ${hasLabels(
            '',
            [label]
        )}`;
    }

    /** Records the item as made, as `objectName`, unless it is recorded already. Two processes record it once. */
    private recorded(spec: IndexSpec | UniquenessConstraintSpec, objectName: string, details: string = '{}'): string {
        return (
            `INSERT INTO ${this.graph.catalog} (kind, label, properties, name, object_name, details) ` +
            `VALUES (${sqlText(CATALOG_KINDS[spec.kind])}, ${sqlText(spec.label)}, ${sqlText(
                catalogProperties(spec.properties)
            )}, ` +
            `${sqlText(itemName(spec))}, ${sqlText(objectName)}, ${sqlText(details)}) ` +
            `ON CONFLICT (kind, label, properties) DO NOTHING`
        );
    }

    /**
     * Forgets the item, and drops what it was made as when nothing else recorded uses it: the object the record names,
     * so an item is dropped as it was made whatever a later version would call it.
     */
    private forgotten(spec: IndexSpec | UniquenessConstraintSpec): string {
        const record = catalogRecord(spec);
        return `DO $forget$
DECLARE
    v_object text;
    v_others int;
BEGIN
    IF to_regclass(${sqlText(this.graph.catalog)}) IS NULL THEN
        RETURN;
    END IF;
    SELECT max(object_name) INTO v_object FROM ${this.graph.catalog} WHERE ${record};
    SELECT count(*) INTO v_others FROM ${this.graph.catalog} WHERE object_name = v_object AND NOT (${record});
    IF v_object IS NOT NULL AND v_others = 0 THEN
        EXECUTE 'DROP INDEX IF EXISTS ' || v_object;
    END IF;
    DELETE FROM ${this.graph.catalog} WHERE ${record};
END
$forget$`;
    }

    /**
     * What is recorded of the kind, and still there: an index dropped by hand is not listed, so that it is made again
     * when asked for.
     */
    private listing(kind: keyof typeof CATALOG_KINDS): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return {
            statement:
                `SELECT jsonb_build_object('label', c.label, 'properties', c.properties::jsonb, 'name', c.name, ` +
                `'details', c.details) AS "item" FROM ${this.graph.catalog} c WHERE c.kind = ${sqlText(
                    CATALOG_KINDS[kind]
                )} ` +
                `AND (c.object_name IS NULL OR to_regclass(c.object_name) IS NOT NULL) ORDER BY c.label, c.properties`,
            read: (rows) =>
                rows.map((it) => ({
                    label: it.label,
                    properties: it.properties,
                    name: it.name,
                    dimensions: it.details?.dimensions,
                    similarity: it.details?.similarity
                }))
        };
    }
}
