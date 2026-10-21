import { createHash } from 'crypto';
import { hasLabels, jsonKey, labelledValue, OracleGraph, sqlText } from '@/backend/oracle/OracleGraph';
import { OracleSideTable } from '@/backend/oracle/OracleSideTable';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import {
    FullTextIndexSpec,
    itemName,
    RangeIndexSpec,
    UniquenessConstraintSpec,
    VectorIndexSpec
} from '@/schema/SchemaSpecs';

type Kind = 'RANGE' | 'UNIQUE';

/**
 * Indexes and constraints on Oracle, as drivine4j makes them: over the JSON properties of one label's nodes, a
 * function-based index of `CASE WHEN <the node carries the label> THEN JSON_VALUE(props, '$.<p>') END` per property,
 * so other labels' nodes are left out (their entries are null, which an index holds none of). A uniqueness
 * constraint is the same index, unique. Each item is recorded in the graph's catalog with the name of the object made
 * for it; listing reads the catalog, keeping items whose object is still there, and a drop drops the object recorded.
 */
export class OracleSchemaGrammar implements SchemaGrammar {
    readonly engine = 'Oracle';
    readonly labelledIndexes = true;

    constructor(private readonly graph: OracleGraph) {}

    get listRanges(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('RANGE');
    }

    get listUniques(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('UNIQUE');
    }

    /** Vector and full-text indexes as recorded: each with the table made for it, where one was. */
    get listVectors(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return {
            statement:
                `SELECT JSON_OBJECT('label' VALUE c.label, 'properties' VALUE JSON(c.properties), 'name' VALUE c.name, ` +
                `'details' VALUE c.details RETURNING JSON) AS "item" FROM ${this.graph.catalog} c WHERE c.kind = 'VECTOR'`,
            read: (rows) =>
                rows.map((it) => ({
                    label: it.label,
                    properties: it.properties,
                    name: it.name,
                    dimensions: it.details.dimensions,
                    similarity: it.details.similarity
                }))
        };
    }

    get listFullTexts(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('FULLTEXT', false);
    }

    createRange(spec: RangeIndexSpec): string[] {
        return [this.create('RANGE', spec.label, spec.properties)];
    }

    dropRange(spec: RangeIndexSpec): string[] {
        return [this.drop('RANGE', spec.label, spec.properties)];
    }

    createUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.create('UNIQUE', spec.label, spec.properties)];
    }

    dropUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.drop('UNIQUE', spec.label, spec.properties)];
    }

    /**
     * A vector index, as drivine4j makes it: Oracle indexes a VECTOR column, and an embedding is a list among a node's
     * JSON properties, so the label's embeddings are kept in a table beside the nodes, with a vector index over it by
     * neighbour partitions (which needs no vector memory set aside, as a neighbour graph does). The table is filled
     * before the index is made, so the partitions are trained on the embeddings there are.
     */
    createVector(spec: VectorIndexSpec): string[] {
        const property = spec.properties[0];
        const path = `'$${jsonKey(property)}'`;
        const side = new OracleSideTable(
            this.graph.vectors(spec.label, property),
            this.graph.nodes,
            'embedding',
            `VECTOR(${spec.dimensions}, FLOAT32)`,
            (row) => `TO_VECTOR(JSON_QUERY(${row}.props, ${path} RETURNING CLOB))`,
            (row) => `${hasLabels(row, [spec.label])} AND JSON_EXISTS(${row}.props, ${path})`,
            (row) =>
                `VECTOR_DIMENSION_COUNT(TO_VECTOR(JSON_QUERY(${row}.props, ${path} RETURNING CLOB))) = ${spec.dimensions}`,
            true
        );
        const metric = spec.similarity === 'COSINE' ? 'COSINE' : 'EUCLIDEAN_SQUARED';
        return [
            side.create,
            side.triggerStatement,
            side.backfill,
            `CREATE VECTOR INDEX IF NOT EXISTS ${side.index} ON ${side.name} (embedding) ORGANIZATION NEIGHBOR PARTITIONS DISTANCE ${metric}`,
            this.record('VECTOR', spec, { dimensions: spec.dimensions, similarity: spec.similarity }, side.name)
        ];
    }

    /** Its vector index is by neighbour partitions, which have no HNSW parameters. */
    unsupportedVectorTuning(spec: VectorIndexSpec): string[] {
        return [
            ...(spec.hnswM !== undefined ? ['hnswM'] : []),
            ...(spec.hnswEfConstruction !== undefined ? ['hnswEfConstruction'] : [])
        ];
    }

    dropVector(spec: VectorIndexSpec): string[] {
        return [
            ...OracleSideTable.dropping(this.graph.vectors(spec.label, spec.properties[0])),
            this.unrecord('VECTOR', spec)
        ];
    }

    /**
     * A full-text index, where the database has Oracle Text: the text of the label's nodes kept in a table beside them,
     * with a JSON search index over it, kept in step on commit. Not over the node table: once an Oracle Text index is
     * there, Oracle answers ordinary tests of a JSON property from it, and it holds only what has been committed, so a
     * save would not find a node it made a moment before (drivine4j's finding). Without Oracle Text (ORA-29833) nothing
     * is made, the index is recorded, and a search reads the text of every node of the label.
     */
    createFullText(spec: FullTextIndexSpec): string[] {
        const side = new OracleSideTable(
            this.graph.texts(spec.label, spec.properties),
            this.graph.nodes,
            'doc',
            'JSON',
            (row) =>
                `JSON_OBJECT(${spec.properties
                    .map((it) => `${sqlText(it)} VALUE JSON_VALUE(${row}.props, '$${jsonKey(it)}' RETURNING CLOB)`)
                    .join(', ')} ABSENT ON NULL RETURNING JSON)`,
            (row) => hasLabels(row, [spec.label])
        );
        return [
            `DECLARE
    v_indexed NUMBER;
    e_no_text EXCEPTION;
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_no_text, -29833);
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    EXECUTE IMMEDIATE ${sqlText(side.create)};
    SELECT COUNT(*) INTO v_indexed FROM user_indexes WHERE index_name = '${side.index.toUpperCase()}';
    IF v_indexed = 0 THEN
        BEGIN
            EXECUTE IMMEDIATE ${sqlText(
                `CREATE SEARCH INDEX ${side.index} ON ${side.name} (doc) FOR JSON PARAMETERS ('SYNC (ON COMMIT)')`
            )};
        EXCEPTION
            WHEN e_exists THEN NULL;
            WHEN e_no_text THEN
                EXECUTE IMMEDIATE 'DROP TABLE ${side.name} PURGE';
                ${this.record('FULLTEXT', spec, {}).replace(/^BEGIN\s*|\s*END;$/g, '')}
                RETURN;
        END;
    END IF;
    EXECUTE IMMEDIATE ${sqlText(side.triggerDdl)};
    EXECUTE IMMEDIATE ${sqlText(side.backfill)};
    ${this.record('FULLTEXT', spec, {}, side.name).replace(/^BEGIN\s*|\s*END;$/g, '')}
END;`
        ];
    }

    dropFullText(spec: FullTextIndexSpec): string[] {
        return [
            ...OracleSideTable.dropping(this.graph.texts(spec.label, spec.properties)),
            this.unrecord('FULLTEXT', spec)
        ];
    }

    conflicts(spec: UniquenessConstraintSpec, limit: number): string {
        const values = spec.properties.map((it) => `JSON_VALUE(n.props, '$${jsonKey(it)}')`);
        return (
            // One property's value as it is, several as a list, as the graph engines give them.
            `SELECT ${
                values.length === 1 ? values[0] : `JSON_ARRAY(${values.join(', ')} RETURNING JSON)`
            } AS "value" ` +
            `FROM ${this.graph.nodes} n ` +
            `WHERE ${hasLabels('n', [spec.label])} AND ${values.map((it) => `${it} IS NOT NULL`).join(' AND ')} ` +
            `GROUP BY ${values.join(', ')} HAVING COUNT(*) > 1 FETCH FIRST ${limit} ROWS ONLY`
        );
    }

    /** The name of the object made for an item: the graph's, the kind, and a hash of what it is over. */
    objectName(kind: Kind, label: string, properties: string[]): string {
        const hash = createHash('sha1')
            .update([kind, label, ...properties].join('\u0000'))
            .digest('hex')
            .slice(0, 12);
        return `${this.graph.name}_${kind === 'RANGE' ? 'r' : 'u'}_${hash}`.toUpperCase();
    }

    private listing(
        kind: Kind | 'FULLTEXT',
        made: boolean = true
    ): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        const exists = made ? ` AND EXISTS (SELECT 1 FROM user_indexes i WHERE i.index_name = c.object_name)` : '';
        return {
            statement:
                `SELECT JSON_OBJECT('label' VALUE c.label, 'properties' VALUE JSON(c.properties), 'name' VALUE c.name ` +
                `RETURNING JSON) AS "item" FROM ${this.graph.catalog} c WHERE c.kind = '${kind}'${exists}`,
            read: (rows) => rows.map((it) => ({ label: it.label, properties: it.properties, name: it.name }))
        };
    }

    /**
     * Makes the index and records it, in one block; an item recorded already is recorded again. Another session may
     * make and record the same item at once, as managers that start together each ensure the store's key: an index of
     * the name is this one, its name a hash of what it is over, and a record of the item is this record.
     */
    private create(kind: Kind, label: string, properties: string[]): string {
        const object = this.objectName(kind, label, properties);
        const columns = properties.map((it) => labelledValue('n', label, it)).join(', ');
        const ddl = `CREATE ${kind === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX ${object} ON ${this.graph.nodes} n (${columns})`;
        const name = `${label}_${properties.join('_')}_${kind === 'RANGE' ? 'range' : 'unique'}`;
        return `DECLARE
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    BEGIN EXECUTE IMMEDIATE ${sqlText(ddl)}; EXCEPTION WHEN e_exists THEN NULL; END;
    DELETE FROM ${this.graph.catalog} WHERE kind = '${kind}' AND label = ${sqlText(label)} AND properties = ${sqlText(
        JSON.stringify(properties)
    )};
    INSERT INTO ${this.graph.catalog} (kind, label, properties, name, object_name, details)
        VALUES ('${kind}', ${sqlText(label)}, ${sqlText(JSON.stringify(properties))}, ${sqlText(
            name
        )}, '${object}', JSON('{}'));
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN NULL;
END;`;
    }

    /** Records an index that is not made: what it is over and how, for drift to be told. */
    /** Records an index: what it is over and how, and the table made for it, if one was. */
    private record(
        kind: 'VECTOR' | 'FULLTEXT',
        spec: VectorIndexSpec | FullTextIndexSpec,
        details: object,
        objectName?: string
    ): string {
        const properties = sqlText(JSON.stringify(spec.properties));
        return `BEGIN
    DELETE FROM ${this.graph.catalog} WHERE kind = '${kind}' AND label = ${sqlText(
        spec.label
    )} AND properties = ${properties};
    INSERT INTO ${this.graph.catalog} (kind, label, properties, name, object_name, details)
        VALUES ('${kind}', ${sqlText(spec.label)}, ${properties}, ${sqlText(itemName(spec))}, ${
            objectName ? sqlText(objectName) : 'NULL'
        }, JSON(${sqlText(JSON.stringify(details))}));
END;`;
    }

    private unrecord(kind: 'VECTOR' | 'FULLTEXT', spec: VectorIndexSpec | FullTextIndexSpec): string {
        return (
            `DELETE FROM ${this.graph.catalog} WHERE kind = '${kind}' AND label = ${sqlText(spec.label)} ` +
            `AND properties = ${sqlText(JSON.stringify(spec.properties))}`
        );
    }

    private drop(kind: Kind, label: string, properties: string[]): string {
        const where = `kind = '${kind}' AND label = ${sqlText(label)} AND properties = ${sqlText(
            JSON.stringify(properties)
        )}`;
        return `DECLARE
    e_missing EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_missing, -1418);
BEGIN
    FOR it IN (SELECT object_name FROM ${this.graph.catalog} WHERE ${where}) LOOP
        BEGIN EXECUTE IMMEDIATE 'DROP INDEX ' || it.object_name; EXCEPTION WHEN e_missing THEN NULL; END;
    END LOOP;
    DELETE FROM ${this.graph.catalog} WHERE ${where};
END;`;
    }
}
