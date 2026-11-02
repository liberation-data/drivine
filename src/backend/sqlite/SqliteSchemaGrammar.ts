import { hasLabels, JSON_ROWS, SqliteGraph, textOf } from '@/backend/sqlite/SqliteGraph';
import { CATALOG_KINDS, catalogProperties, catalogRecord } from '@/backend/sql/SqlCatalog';
import { sqlText } from '@/backend/sql/SqlGraph';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { catalogEntries, LOWER_COPY_KIND, LowerCopyStatements } from '@/schema/LowerCopyCatalog';
import {
    FullTextIndexSpec,
    IndexSpec,
    itemName,
    RangeIndexSpec,
    sampledNodeId,
    UniquenessConstraintSpec,
    VectorIndexSpec
} from '@/schema/SchemaSpecs';

/** What the name of a range index, and of a uniqueness constraint's index, says it is: drivine4j's. */
const RANGE = 'ix';
const UNIQUE = 'uq';

/**
 * Indexes and constraints over a graph kept by SQLite, as drivine4j makes them, so a file's schema is one whichever
 * library made it. A property is a key of the JSON text `props`, and SQLite indexes an expression over the part of a
 * table a predicate selects, so each is a partial index over the property, for the nodes of one label:
 *
 * - a range index is `((props read as text)) WHERE instr(labels, '"L"') > 0`. A statement tests each label of a node on
 *   its own and reads a property as that same expression (see SqliteGraph), so the planner sees that the index holds
 *   the nodes the statement asks for: a load, a filter, and the write function finding a node by its id;
 * - a uniqueness constraint is that index made `UNIQUE`. A node without the property reads it as null, which a unique
 *   index does not hold, so it is not constrained, as on the graph engines.
 *
 * A vector index and a full-text index are recorded, so that a schema that declares one is applied, and nothing is made
 * for them yet: a search measures every node it may find (see SqliteSearch).
 *
 * What Drivine made is recorded in the graph's catalog table, as on Oracle and Postgres, and read back from there. An
 * index a record names that is no longer there is not listed, so it is made again when asked for.
 */
export class SqliteSchemaGrammar implements SchemaGrammar {
    readonly engine = 'SQLite';

    constructor(private readonly graph: SqliteGraph) {}

    /**
     * The lowercased copies on SQLite, as drivine4j's `SqliteLowerCopies` writes them: a property of the node's JSON,
     * filled in by `drivine_lower_copies`, which lowercases it as `drivine_lower` does; recorded as a row of the graph's
     * catalog, of kind `LOWER_COPY`.
     */
    get lowerCopies(): LowerCopyStatements {
        const graph = this.graph;
        return {
            fill(label: string, property: string, batch: number): string {
                return (
                    `SELECT drivine_lower_copies(${sqlText(graph.name)}, ${sqlText(label)}, ${sqlText(property)}, ` +
                    `${batch}) AS "written"`
                );
            },
            record(label: string, property: string) {
                return {
                    statement:
                        `INSERT INTO ${graph.catalog} (kind, label, properties, name, object_name, details) ` +
                        `VALUES (${sqlText(LOWER_COPY_KIND)}, ${sqlText(label)}, ${sqlText(
                            catalogProperties([property])
                        )}, NULL, NULL, '{}') ON CONFLICT (kind, label, properties) DO NOTHING`
                };
            },
            read: `SELECT label AS "label", properties AS "properties" FROM ${graph.catalog} WHERE kind = ${sqlText(
                LOWER_COPY_KIND
            )}`,
            entries: catalogEntries
        };
    }

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
        const name = this.graph.objectName(RANGE, [spec.label, ...spec.properties]);
        return [
            `CREATE INDEX IF NOT EXISTS ${name} ON ${this.over(spec.label, spec.properties)}`,
            this.recorded(spec, name)
        ];
    }

    dropRange(spec: RangeIndexSpec): string[] {
        return this.forgotten(spec, RANGE);
    }

    createUnique(spec: UniquenessConstraintSpec): string[] {
        const name = this.graph.objectName(UNIQUE, [spec.label, ...spec.properties]);
        return [
            `CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${this.over(spec.label, spec.properties)}`,
            this.recorded(spec, name)
        ];
    }

    dropUnique(spec: UniquenessConstraintSpec): string[] {
        return this.forgotten(spec, UNIQUE);
    }

    /** Recorded and not made: SQLite has no vector index of its own, so a search measures every node of the label. */
    createVector(spec: VectorIndexSpec): string[] {
        return [
            this.recorded(spec, undefined, `{"dimensions": ${spec.dimensions}, "similarity": "${spec.similarity}"}`)
        ];
    }

    /** There is no index whose parameters a pin could set. */
    unsupportedVectorTuning(spec: VectorIndexSpec): string[] {
        return [
            ...(spec.hnswM !== undefined ? ['hnswM'] : []),
            ...(spec.hnswEfConstruction !== undefined ? ['hnswEfConstruction'] : [])
        ];
    }

    dropVector(spec: VectorIndexSpec): string[] {
        return this.forgotten(spec);
    }

    /** Recorded and not made yet: a search reads every node of the label. */
    createFullText(spec: FullTextIndexSpec): string[] {
        return [this.recorded(spec, undefined)];
    }

    dropFullText(spec: FullTextIndexSpec): string[] {
        return this.forgotten(spec);
    }

    /** A node's own id is its `nid`; `limit` of a key's nodes at most are named, the first made first. */
    conflicts(spec: UniquenessConstraintSpec, limit: number): string {
        const keys = spec.properties.map((it) => textOf('n', it));
        const columns = keys.map((key, i) => `${key} AS k${i}`).join(', ');
        const grouping = keys.map((_, i) => `k${i}`).join(', ');
        const entries = spec.properties.map((property, i) => `${sqlText(property)}, k.k${i}`).join(', ');
        const sampled = sampledNodeId(spec);
        const node = [`'elementId', k.nid`, ...(sampled !== undefined ? [`${sqlText(sampled)}, k.sampled`] : [])].join(
            ', '
        );
        return [
            JSON_ROWS,
            `SELECT json_object('properties', json_object(${entries}), 'count', MAX(k.total), ` +
                `'nodes', json_group_array(json_object(${node}) ORDER BY k.nid) FILTER (WHERE k.position <= ${limit})) AS "value"`,
            `FROM (`,
            `    SELECT n.nid, ${columns}${sampled !== undefined ? `, ${textOf('n', sampled)} AS sampled` : ''},`,
            `           row_number() OVER (PARTITION BY ${keys.join(', ')} ORDER BY n.nid) AS position,`,
            `           COUNT(*) OVER (PARTITION BY ${keys.join(', ')}) AS total`,
            `    FROM ${this.graph.nodes} n`,
            `    WHERE ${hasLabels('n', [spec.label])} AND ${keys.map((it) => `${it} IS NOT NULL`).join(' AND ')}`,
            `) k`,
            `WHERE k.total > 1`,
            `GROUP BY ${grouping}`,
            `LIMIT ${limit}`
        ].join('\n');
    }

    /**
     * The partial index over the properties of the label's nodes: each property as a statement reads it, and the test
     * of the label a statement makes, both of the table's own columns.
     */
    private over(label: string, properties: string[]): string {
        return `${this.graph.nodes} (${properties.map((it) => textOf('', it)).join(', ')}) WHERE ${hasLabels('', [
            label
        ])}`;
    }

    /** Records the item as made, as `objectName` (none for an item nothing was made for), unless it is recorded already. */
    private recorded(
        spec: IndexSpec | UniquenessConstraintSpec,
        objectName: string | undefined,
        details: string = '{}'
    ): string {
        return (
            `INSERT INTO ${this.graph.catalog} (kind, label, properties, name, object_name, details) ` +
            `VALUES (${sqlText(CATALOG_KINDS[spec.kind])}, ${sqlText(spec.label)}, ${sqlText(
                catalogProperties(spec.properties)
            )}, ${sqlText(itemName(spec))}, ${objectName ? sqlText(objectName) : 'NULL'}, ${sqlText(details)}) ` +
            `ON CONFLICT (kind, label, properties) DO NOTHING`
        );
    }

    /**
     * Forgets the item, and drops the index it was made as. SQLite has no block to read the record's object in, so the
     * index is named again from the item's kind, label and properties, as drivine4j names it. Nothing was made for a
     * vector or a full-text index, so nothing is dropped for one.
     */
    private forgotten(spec: IndexSpec | UniquenessConstraintSpec, kind?: string): string[] {
        return [
            ...(kind ? [`DROP INDEX IF EXISTS ${this.graph.objectName(kind, [spec.label, ...spec.properties])}`] : []),
            `DELETE FROM ${this.graph.catalog} WHERE ${catalogRecord(spec)}`
        ];
    }

    /**
     * What is recorded of the kind, and still there: an index dropped by hand is not listed, so that it is made again
     * when asked for.
     */
    private listing(kind: keyof typeof CATALOG_KINDS): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return {
            statement:
                `${JSON_ROWS}\nSELECT json_object('label', c.label, 'properties', json(c.properties), 'name', c.name, ` +
                `'details', json(c.details)) AS "item" FROM ${this.graph.catalog} c WHERE c.kind = ${sqlText(
                    CATALOG_KINDS[kind]
                )} AND (c.object_name IS NULL OR EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'index' ` +
                `AND name = c.object_name)) ORDER BY c.label, c.properties`,
            read: (rows) =>
                rows.map((it) => ({
                    label: it.label,
                    properties: it.properties,
                    name: it.name ?? undefined,
                    dimensions: it.details?.dimensions,
                    similarity: it.details?.similarity
                }))
        };
    }
}
