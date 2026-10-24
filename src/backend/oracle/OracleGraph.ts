import { DEFAULT_GRAPH, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { Stamps } from '@/model/Stamps';

export { DEFAULT_GRAPH, sqlText };

/**
 * A graph as Oracle keeps it: the tables of a SqlGraph, and the SQL property graph over the two, which view reads go
 * through.
 */
export class OracleGraph extends SqlGraph {
    constructor(name: string = DEFAULT_GRAPH) {
        super(name, 'Oracle', 128);
    }

    /** What makes the store. Each statement may run again. */
    get ddl(): string[] {
        return [
            `CREATE TABLE IF NOT EXISTS ${this.nodes} (
                nid    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                labels JSON NOT NULL,
                props  JSON NOT NULL,
                stamp  VARCHAR2(33)
            )`,
            `CREATE TABLE IF NOT EXISTS ${this.edges} (
                eid   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                src   NUMBER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
                dst   NUMBER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
                type  VARCHAR2(128) NOT NULL,
                props JSON DEFAULT '{}' NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS ${this.catalog} (
                kind        VARCHAR2(40) NOT NULL,
                label       VARCHAR2(400) NOT NULL,
                properties  VARCHAR2(2000) NOT NULL,
                name        VARCHAR2(400),
                object_name VARCHAR2(128),
                details     JSON NOT NULL,
                PRIMARY KEY (kind, label, properties)
            )`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_src ON ${this.edges} (src, type)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_dst ON ${this.edges} (dst, type)`,
            `CREATE MULTIVALUE INDEX IF NOT EXISTS ${this.name}_node_labels ON ${this.nodes} n (n.labels.string())`,
            `CREATE OR REPLACE PROPERTY GRAPH ${this.name}
                VERTEX TABLES (${this.nodes} KEY (nid) LABEL node PROPERTIES (nid, labels, props, stamp))
                EDGE TABLES (${this.edges} KEY (eid)
                    SOURCE KEY (src) REFERENCES ${this.nodes} (nid)
                    DESTINATION KEY (dst) REFERENCES ${this.nodes} (nid)
                    LABEL edge PROPERTIES (eid, src, dst, type, props))`
        ];
    }

    /**
     * The block that makes the store when it is not there and does nothing when it is: the property graph is made
     * last, so its presence says the rest is. One another process made meanwhile (ORA-00955) is taken as made.
     */
    get ensuring(): string {
        const statements = this.ddl
            .map((it) => `    BEGIN EXECUTE IMMEDIATE ${sqlText(it)}; EXCEPTION WHEN e_exists THEN NULL; END;`)
            .join('\n');
        return `DECLARE
    v_made NUMBER;
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    SELECT COUNT(*) INTO v_made FROM user_property_graphs WHERE graph_name = '${this.name.toUpperCase()}';
    IF v_made = 0 THEN
${statements}
    END IF;
END;`;
    }
}

/** A JSON path step naming a key, quoted: `."metadata.source"`. */
export function jsonKey(name: string): string {
    return `."${escapedLabel(name)}"`;
}

/**
 * The JSON the property of the node row `alias` is read from: its properties, or, for the stamp, which is a column of
 * its own, a document of that column under the stamp's property, so a query reads it as any other.
 */
export function holding(alias: string, property: string): string {
    return property === Stamps.PROPERTY
        ? `JSON_OBJECT(${sqlText(property)} VALUE ${alias}.stamp ABSENT ON NULL RETURNING JSON)`
        : `${alias}.props`;
}

/** The map a load returns for the node row `alias`: its properties, its stamp among them, and its labels apart. */
export function nodeDocument(alias: string): string {
    return (
        `JSON_OBJECT('props' VALUE JSON_TRANSFORM(${alias}.props, SET '$${jsonKey(
            Stamps.PROPERTY
        )}' = ${alias}.stamp ` + `IGNORE ON NULL), 'labels' VALUE ${alias}.labels RETURNING JSON)`
    );
}

/**
 * The SELECT of a subquery over related nodes, with the hint every one carries and any more given. Oracle 23
 * coalesces two such subqueries ORed together into one, and rewrites the second's label test as a multivalue index
 * lookup that, evaluated as a filter, misses nodes with more than one label: of two roots, one related to each
 * subclass, `instanceOf(A) OR instanceOf(B)` found one. NO_COALESCE_SQ prevents it.
 */
export function relatedSubquery(...hints: string[]): string {
    return `SELECT /*+ ${['NO_COALESCE_SQ', ...hints].join(' ')} */ 1`;
}

/**
 * A predicate that holds when the node row `alias` carries every one of the labels. A label may come from data (a
 * `@NodeLabels` filter's value, a search's partition label): it is escaped as `jsonKey` escapes a name, the backslash
 * first, for the JSON string the path or the labels' text holds it in, and then the SQL literal around it.
 *
 * The first label is tested so the multivalue index over labels can answer it, and the rest by the labels' text, which
 * that index can't: when two tests of the labels are answered by the index, Oracle (23.26) finds no node the open
 * transaction has written and not yet committed (#221). drivine4j's `OracleSql.hasLabels` writes the same.
 */
export function hasLabels(alias: string, labels: string[]): string {
    return labels
        .map((it, i) =>
            i === 0
                ? `JSON_EXISTS(${alias}.labels, '$?(@ == "${escapedLabel(it)}")')`
                : `INSTR(JSON_SERIALIZE(${alias}.labels), '"${escapedLabel(it)}"') > 0`
        )
        .join(' AND ');
}

/** A label or a key as JSON writes it inside a string, the backslash first, in a SQL literal. */
function escapedLabel(label: string): string {
    return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''");
}

/**
 * A property of the node row `alias` as a range index or a uniqueness constraint over the label holds it: as text, for
 * the label's nodes alone, and null for every other node, for a value that isn't a scalar, and for one longer than
 * 4,000 bytes. A predicate over this expression implies the label.
 */
export function labelledValue(alias: string, label: string, property: string): string {
    return (
        `CASE WHEN ${hasLabels(alias, [label])} THEN JSON_VALUE(${alias}.props, '$${jsonKey(property)}' ` +
        `RETURNING VARCHAR2(4000) NULL ON ERROR) END`
    );
}
