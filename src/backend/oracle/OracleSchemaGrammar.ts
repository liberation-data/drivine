import { drivine4jStep, hasLabels, jsonKey, labelledValue, OracleGraph, sqlText } from '@/backend/oracle/OracleGraph';
import { OracleSideTable } from '@/backend/oracle/OracleSideTable';
import { CATALOG_KINDS, catalogProperties, catalogRecord } from '@/backend/sql/SqlCatalog';
import { SchemaSpec } from '@/schema/SchemaCatalog';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import {
    FullTextIndexSpec,
    itemName,
    rangeIndex,
    RangeIndexSpec,
    sampledNodeId,
    UniquenessConstraintSpec,
    VectorIndexSpec
} from '@/schema/SchemaSpecs';

type Kind = keyof typeof CATALOG_KINDS;

/**
 * What this library recorded each kind as before it recorded drivine4j's: Drivine's own name for it, with the objects
 * named otherwise. These are read beside drivine4j's kinds and never written, so a store written so is still
 * understood: listed, searched through, and dropped as it was made.
 */
const EARLIER: Record<Kind, string> = { RANGE: 'RANGE', UNIQUE: 'UNIQUE', VECTOR: 'VECTOR', FULLTEXT: 'FULLTEXT' };

/** The kinds a record of `kind` is read as. */
export function recordedAs(kind: Kind): string[] {
    return [CATALOG_KINDS[kind], EARLIER[kind]];
}

/** Whether the labelled index the catalog's record `c` names is there. */
const LABELLED_THERE =
    "EXISTS (SELECT 1 FROM user_indexes l WHERE l.index_name = UPPER(JSON_VALUE(c.details, '$.labelled')))";

/** Whether the catalog's record `u` is of a uniqueness constraint whose index is there, which stands for a labelled one. */
const UNIQUE_THERE =
    `u.kind IN (${recordedAs('UNIQUE').map(sqlText).join(', ')}) ` +
    'AND EXISTS (SELECT 1 FROM user_indexes q WHERE q.index_name = UPPER(u.object_name))';

/**
 * How many times {@link made} runs an index's statement that another session's lock on the node table turned away
 * (ORA-00054), a tenth of a second apart, before it throws: as drivine4j's `OracleGraph.BUSY_ATTEMPTS`.
 */
export const BUSY_ATTEMPTS = 300;

/**
 * A block that runs `ddl`, an index over the node table, an object another session made meanwhile (ORA-00955) taken as
 * made. A statement turned away because another session holds the node table's lock (ORA-00054), as one making the same
 * index, or writing a node, does, is run again a tenth of a second later, for up to {@link BUSY_ATTEMPTS} tries, and
 * then finds what the other made: managers making the store key's constraint together otherwise ran out of attempts on
 * the busy lock, and went on without the constraint. drivine4j's `OracleGraph.ensuring` waits out a busy lock so.
 */
function made(ddl: string): string {
    return `DECLARE
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
    e_busy EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_busy, -54);
BEGIN
    FOR attempt IN 1 .. ${BUSY_ATTEMPTS} LOOP
        BEGIN
            EXECUTE IMMEDIATE ${sqlText(ddl)};
            RETURN;
        EXCEPTION
            WHEN e_exists THEN RETURN;
            WHEN e_busy THEN
                IF attempt = ${BUSY_ATTEMPTS} THEN RAISE; END IF;
                DBMS_SESSION.SLEEP(0.1);
        END;
    END LOOP;
END;`;
}

/**
 * Indexes and constraints on Oracle, made and recorded as drivine4j makes and records them, so a store's schema is one
 * whichever library made it. A property is a path into the JSON column `props`, so each index is over an expression:
 *
 * - a range index is two indexes. One reads the properties as text whatever the label, so two labels that index a
 *   property of one name share it. The other, the labelled index, reads the properties of the label's nodes and is
 *   null for every other node (see `labelledValue`), which an index holds none of: a filter on the label's nodes is
 *   read through it, so the one index answers both the label and the property;
 * - a uniqueness constraint is a unique index of the labelled index's expression. So it stands for one: the range
 *   index it comes with is recorded as served by it, and has no labelled index of its own (Oracle refuses a second
 *   index over the same expressions).
 *
 * A vector index is a table of embeddings beside the nodes, and a full-text index a table of their text (see
 * OracleSideTable). Oracle's dictionary holds the expressions and not what they were made for, so each item is recorded
 * in the graph's catalog with the object made for it, and read back from there.
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

    /** Vector indexes as recorded, with the size and similarity they were made with. */
    get listVectors(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('VECTOR');
    }

    get listFullTexts(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('FULLTEXT');
    }

    /**
     * A range index: the index over the properties of every node, and the labelled index, unless a uniqueness
     * constraint's stands for it. It is recorded with the labelled index's name among its details, and a record there
     * already takes them, so one listed as incomplete is made whole.
     */
    createRange(spec: RangeIndexSpec): string[] {
        const [shared, index] = this.sharedIndex(spec);
        const labelled = this.graph.objectName('lx', [spec.label, ...spec.properties]);
        const columns = spec.properties.map((it) => labelledValue('n', spec.label, it)).join(', ');
        return [
            index,
            `DECLARE
    v_unique NUMBER;
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    SELECT COUNT(*) INTO v_unique FROM ${this.graph.catalog} u WHERE u.label = ${sqlText(spec.label)} ` +
                `AND u.properties = ${sqlText(catalogProperties(spec.properties))} AND ${UNIQUE_THERE};
    IF v_unique = 0 THEN
        EXECUTE IMMEDIATE ${sqlText(`CREATE INDEX IF NOT EXISTS ${labelled} ON ${this.graph.nodes} n (${columns})`)};
    END IF;
EXCEPTION
    WHEN e_exists THEN NULL;
END;`,
            this.recorded(spec, shared, `{"labelled": "${labelled}"}`, true)
        ];
    }

    dropRange(spec: RangeIndexSpec): string[] {
        return [this.forgotten(spec)];
    }

    /**
     * A uniqueness constraint, with the range index a node is found by, which it serves: the range index is recorded as
     * served by the unique index, and a labelled index made for it before is dropped first, as Oracle would refuse the
     * unique index over the same expressions (ORA-01408). Data the constraint refuses stops the statements at the unique
     * index, and leaves the range index incomplete, to be made whole by an `ensure` of it.
     *
     * drivine4j's unique index over several properties is of another expression than its labelled index, and it makes
     * both; this library's is the labelled index's expression whatever the number of properties, so it stands for one.
     */
    createUnique(spec: UniquenessConstraintSpec): string[] {
        const name = this.graph.objectName('uq', [spec.label, ...spec.properties]);
        const columns = spec.properties.map((it) => labelledValue('n', spec.label, it)).join(', ');
        const range = rangeIndex(spec.label, spec.properties);
        const [shared, index] = this.sharedIndex(range);
        const served = `{"unique": "${name}"}`;
        return [
            index,
            this.recorded(range, shared, served),
            this.servedBy(range, served),
            made(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${this.graph.nodes} n (${columns})`),
            this.recorded(spec, name)
        ];
    }

    dropUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.forgotten(spec)];
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
            this.recorded(spec, side.name, `{"dimensions": ${spec.dimensions}, "similarity": "${spec.similarity}"}`)
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
        return [this.forgotten(spec)];
    }

    /**
     * A full-text index, where the database has Oracle Text: the text of the label's nodes kept in a table beside them,
     * with a JSON search index over it, kept in step on commit. Not over the node table: once an Oracle Text index is
     * there, Oracle answers ordinary tests of a JSON property from it, and it holds only what has been committed, so a
     * save would not find a node it made a moment before (drivine4j's finding). Without Oracle Text (ORA-29833) nothing
     * is made, the index is recorded with no object, and a search reads the text of every node of the label.
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
                ${this.recorded(spec, undefined).replace(/\n/g, '\n                ')}
                RETURN;
        END;
    END IF;
    EXECUTE IMMEDIATE ${sqlText(side.triggerDdl)};
    EXECUTE IMMEDIATE ${sqlText(side.backfill)};
    ${this.recorded(spec, side.name).replace(/\n/g, '\n    ')}
END;`
        ];
    }

    dropFullText(spec: FullTextIndexSpec): string[] {
        return [this.forgotten(spec)];
    }

    /**
     * Each node of a key that repeats is numbered within its key, and counted with it, so that a row names `limit` of
     * its nodes at most however many hold the key. A node's own id is its `nid`. The nodes are aggregated as JSON, since
     * as text they would be held to 4000 bytes, and a large sample overflows that (ORA-40478).
     */
    conflicts(spec: UniquenessConstraintSpec, limit: number): string {
        const value = (property: string): string => `JSON_VALUE(n.props, '$${jsonKey(property)}')`;
        const values = spec.properties.map(value);
        const properties = spec.properties.map((it, k) => `${sqlText(it)} VALUE k${k}`).join(', ');
        const nodeId = sampledNodeId(spec);
        const node = [`'elementId' VALUE nid`, ...(nodeId !== undefined ? [`${sqlText(nodeId)} VALUE i`] : [])].join(
            ', '
        );
        const selected = [
            ...values.map((it, k) => `${it} AS k${k}`),
            ...(nodeId !== undefined ? [`${value(nodeId)} AS i`] : [])
        ].join(', ');
        const partition = values.join(', ');
        return (
            `SELECT JSON_OBJECT('properties' VALUE JSON_OBJECT(${properties}), 'count' VALUE MAX(c), 'nodes' VALUE ` +
            `JSON_ARRAYAGG(JSON_OBJECT(${node}) ORDER BY nid RETURNING JSON) RETURNING JSON) AS "value" ` +
            `FROM (SELECT n.nid, ${selected}, COUNT(*) OVER (PARTITION BY ${partition}) AS c, ` +
            `ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY n.nid) AS r ` +
            `FROM ${this.graph.nodes} n ` +
            `WHERE ${hasLabels('n', [spec.label])} AND ${values.map((it) => `${it} IS NOT NULL`).join(' AND ')}) ` +
            `WHERE c > 1 AND r <= ${limit} GROUP BY ${spec.properties.map((_, k) => `k${k}`).join(', ')} ` +
            `FETCH FIRST ${limit} ROWS ONLY`
        );
    }

    /**
     * The index over the properties of every node, whatever the label: its name, and the statement that makes it. Its
     * paths are drivine4j's, so it is one index whichever library makes it, and not those this library reads a property
     * by (`'$."p"'`): Oracle would then read the property through this index's column inside a filter on the labelled
     * index's expression, which it then no longer matches to the labelled index, and reads every node.
     */
    private sharedIndex(spec: RangeIndexSpec): [string, string] {
        const name = this.graph.objectName('ix', spec.properties);
        const columns = spec.properties.map((it) => `JSON_VALUE(props, '$.${drivine4jStep(it)}')`).join(', ');
        return [name, made(`CREATE INDEX IF NOT EXISTS ${name} ON ${this.graph.nodes} (${columns})`)];
    }

    /**
     * What is recorded of the kind, and still there: an index or a table beside the nodes dropped by hand is not listed,
     * so that it is made again when asked for. A range index with neither its labelled index nor a uniqueness
     * constraint's to stand for it is listed as incomplete, so that `ensure` makes the rest; an earlier record's object
     * is its labelled index, so it is whole while it is there.
     */
    private listing(kind: Kind): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        const incomplete =
            `CASE WHEN c.kind = ${sqlText(CATALOG_KINDS.RANGE)} AND NOT ${LABELLED_THERE} ` +
            `AND NOT EXISTS (SELECT 1 FROM ${this.graph.catalog} u WHERE u.label = c.label ` +
            `AND u.properties = c.properties AND ${UNIQUE_THERE}) THEN 'true' END`;
        return {
            statement:
                `SELECT JSON_OBJECT('label' VALUE c.label, 'properties' VALUE JSON(c.properties), 'name' VALUE c.name, ` +
                `'details' VALUE c.details, 'incomplete' VALUE ${incomplete} RETURNING JSON) AS "item" ` +
                `FROM ${this.graph.catalog} c WHERE c.kind IN (${recordedAs(kind).map(sqlText).join(', ')}) ` +
                `AND (c.object_name IS NULL ` +
                `OR EXISTS (SELECT 1 FROM user_indexes i WHERE i.index_name = UPPER(c.object_name)) ` +
                `OR EXISTS (SELECT 1 FROM user_tables t WHERE t.table_name = UPPER(c.object_name))) ` +
                `ORDER BY c.label, c.properties`,
            read: (rows) =>
                rows.map((it) => ({
                    label: it.label,
                    properties: it.properties,
                    name: it.name,
                    dimensions: it.details?.dimensions,
                    similarity: it.details?.similarity,
                    ...(it.incomplete === 'true' ? { incomplete: true } : {})
                }))
        };
    }

    /**
     * Records the item as made, as `objectName` (none for one nothing was made for), unless it is recorded already; with
     * `updated`, a record there already takes `details`. A MERGE doesn't read again before it inserts, so of two
     * sessions recording it at once the second is refused on the catalog's key: that refusal is taken as recorded.
     */
    private recorded(
        spec: SchemaSpec,
        objectName: string | undefined,
        details: string = '{}',
        updated: boolean = false
    ): string {
        const key =
            `SELECT ${sqlText(CATALOG_KINDS[spec.kind])} AS kind, ${sqlText(spec.label)} AS label, ` +
            `${sqlText(catalogProperties(spec.properties))} AS properties FROM dual`;
        const values = [sqlText(itemName(spec)), objectName ? sqlText(objectName) : 'NULL', sqlText(details)];
        return `BEGIN
    MERGE INTO ${this.graph.catalog} c
    USING (${key}) k
    ON (c.kind = k.kind AND c.label = k.label AND c.properties = k.properties)${
        updated ? `\n    WHEN MATCHED THEN UPDATE SET c.details = ${sqlText(details)}` : ''
    }
    WHEN NOT MATCHED THEN INSERT (kind, label, properties, name, object_name, details)
        VALUES (k.kind, k.label, k.properties, ${values.join(', ')});
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN NULL;
END;`;
    }

    /**
     * Records the range index as served by a uniqueness constraint's index, `details`, and drops the labelled index it
     * was made with, when it was: the one its record names, and an earlier record's, which the record now made stands
     * for. The index is dropped first: a drop that fails leaves the record naming it, for the next constraint made to
     * find and drop.
     */
    private servedBy(spec: RangeIndexSpec, details: string): string {
        const record = catalogRecord(spec);
        const earlier = catalogRecord(spec, [EARLIER.RANGE]);
        return `DECLARE
    v_labelled VARCHAR2(128);
BEGIN
    SELECT MAX(JSON_VALUE(details, '$.labelled')) INTO v_labelled FROM ${this.graph.catalog} WHERE ${record};
    IF v_labelled IS NOT NULL THEN
        EXECUTE IMMEDIATE 'DROP INDEX IF EXISTS ' || v_labelled;
    END IF;
    FOR it IN (SELECT object_name FROM ${this.graph.catalog} WHERE ${earlier}) LOOP
        EXECUTE IMMEDIATE 'DROP INDEX IF EXISTS ' || it.object_name;
    END LOOP;
    DELETE FROM ${this.graph.catalog} WHERE ${earlier};
    UPDATE ${this.graph.catalog} SET details = ${sqlText(details)} WHERE ${record};
    COMMIT;
END;`;
    }

    /**
     * Forgets the item, recorded as drivine4j records it or as this library did before, and drops what each record was
     * made as when nothing else recorded uses it: an index, or for a vector or a full-text index the table beside the
     * nodes with its trigger, which takes the index over it along. What is dropped is the object the record names, so an
     * item is dropped as it was made whatever a later version would call it. A range index's labelled index is its own,
     * and is dropped with the record. Dropped first and forgotten last: a drop that fails leaves the record naming what
     * is still there, for the next drop to find.
     */
    private forgotten(spec: SchemaSpec): string {
        const record = catalogRecord(spec, recordedAs(spec.kind));
        const drops =
            spec.kind === 'VECTOR' || spec.kind === 'FULLTEXT'
                ? OracleSideTable.dropping('it.object_name')
                : ["'DROP INDEX IF EXISTS ' || it.object_name"];
        const labelled =
            spec.kind === 'RANGE'
                ? `
        IF it.labelled IS NOT NULL THEN
            EXECUTE IMMEDIATE 'DROP INDEX IF EXISTS ' || it.labelled;
        END IF;`
                : '';
        return `DECLARE
    v_others NUMBER;
BEGIN
    FOR it IN (SELECT object_name, JSON_VALUE(details, '$.labelled') AS labelled FROM ${
        this.graph.catalog
    } WHERE ${record}) LOOP
        SELECT COUNT(*) INTO v_others FROM ${this.graph.catalog}
            WHERE UPPER(object_name) = UPPER(it.object_name) AND NOT (${record});${labelled}
        IF it.object_name IS NOT NULL AND v_others = 0 THEN
            ${drops.map((it) => `EXECUTE IMMEDIATE ${it};`).join('\n            ')}
        END IF;
    END LOOP;
    DELETE FROM ${this.graph.catalog} WHERE ${record};
    COMMIT;
END;`;
    }
}
