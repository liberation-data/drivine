import { DrivineError } from '@/DrivineError';
import { Stamps } from '@/model/Stamps';

/** The graph a manager on Oracle works on when none is named. */
export const DEFAULT_GRAPH = 'drivine';

/**
 * A graph's name: the longest leaves room for the longest name it gives an object, a table beside the nodes
 * (`_v__` and a hash, with nothing readable) and the trigger beside that, within Oracle's 128. drivine4j's rule.
 */
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,113}$/;

/**
 * A graph as Oracle keeps it (drivine4j's layout, so a store written from the JVM and from Node is one): a table of
 * nodes, each with its labels (a JSON array), its properties (a JSON object keyed by stored name) and its stamp; a
 * table of relationships, from `src` to `dst`, with a type and JSON properties; and the SQL property graph over the
 * two, which view reads go through. A node's relationships go with it: the relationship table cascades.
 */
export class OracleGraph {
    readonly nodes: string;
    readonly edges: string;
    /** What Drivine made of indexes and constraints. */
    readonly catalog: string;

    constructor(readonly name: string = DEFAULT_GRAPH) {
        if (!NAME.test(name)) {
            throw new DrivineError(
                `'${name}' can't name a graph on Oracle: it names tables, so it is letters, digits and underscores, ` +
                    `beginning with a letter, at most 114.`
            );
        }
        this.nodes = `${name}_node`;
        this.edges = `${name}_edge`;
        this.catalog = `${name}_schema`;
    }

    /** The table that holds the embeddings a vector index on the label's property is over. */
    vectors(label: string, property: string): string {
        return this.objectName('v', [label, property]);
    }

    /** The table that holds the text a full-text index on the label's properties is over. */
    texts(label: string, properties: string[]): string {
        return this.objectName('t', [label, ...properties]);
    }

    /**
     * A name for an object of `kind` made for `parts`, as drivine4j names it, so the JVM and Node make one: the graph's
     * name, the kind, what of the parts reads as a name, and a hash of the parts (Java's String.hashCode), leaving room
     * for the `_t` or `_i` an object made beside it adds within Oracle's 128.
     */
    objectName(kind: string, parts: string[]): string {
        const hash = (javaHash(parts.join('\u0000')) >>> 0).toString(16);
        const fixed = `${this.name}_${kind}__${hash}`.length + 2;
        const room = Math.min(Math.max(128 - fixed, 0), 40);
        const readable = parts
            .map((it) => it.replace(/[^A-Za-z0-9]/g, ''))
            .join('')
            .slice(0, room);
        return `${this.name}_${kind}_${readable}_${hash}`;
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

/** A string as an SQL literal. */
export function sqlText(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

/** A JSON path step naming a key, quoted: `."metadata.source"`. */
export function jsonKey(name: string): string {
    return `."${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''")}"`;
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
 * The hint every subquery over related nodes carries. Oracle 23 coalesces two such subqueries ORed together into one,
 * and rewrites the second's label test as a multivalue index lookup that, evaluated as a filter, misses nodes with more
 * than one label: of two roots, one related to each subclass, `instanceOf(A) OR instanceOf(B)` found one.
 */
export const RELATED_SUBQUERY = 'SELECT /*+ NO_COALESCE_SQ */ 1';

/**
 * A predicate that holds when the node row `alias` carries every one of the labels. A label may come from data (a
 * `@NodeLabels` filter's value, a search's partition label): it is escaped as `jsonKey` escapes a name, the backslash
 * first, for the JSON path's string and then the SQL literal around it.
 */
export function hasLabels(alias: string, labels: string[]): string {
    return labels
        .map(
            (it) =>
                `JSON_EXISTS(${alias}.labels, '$?(@ == "${it
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/'/g, "''")}")')`
        )
        .join(' AND ');
}

/** Java's String.hashCode, over UTF-16 code units, as a 32-bit int. */
function javaHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return hash;
}
