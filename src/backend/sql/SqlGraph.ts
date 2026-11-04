import { DrivineError } from '@/DrivineError';

/** The graph a manager on a SQL store works on when none is named. */
export const DEFAULT_GRAPH = 'drivine';

/** What the longest name a graph gives an object adds to the graph's own: `_v__`, a hash and the `_t` beside it. */
const LONGEST_ADDED = '_v__'.length + 8 + 2;

/**
 * A graph as a SQL store keeps it, drivine4j's layout, so a store written from the JVM, from Node and from Python is
 * one: a table of nodes, each with its labels (a JSON array), its properties (a JSON object keyed by stored name) and
 * its stamp; a table of relationships, from `src` to `dst`, with a type and JSON properties; and a catalog of what
 * Drivine made of indexes and constraints. A node's relationships go with it: the relationship table cascades.
 *
 * What a store makes beside the tables is named by `objectName`, within the longest name the store allows.
 */
export abstract class SqlGraph {
    readonly nodes: string;
    readonly edges: string;
    /** What Drivine made of indexes and constraints. */
    readonly catalog: string;

    /**
     * @param engine the store's name, for what is said of a name it can't take
     * @param maxObjectName the longest name the store allows
     */
    protected constructor(
        readonly name: string,
        engine: string,
        private readonly maxObjectName: number
    ) {
        const longest = maxObjectName - LONGEST_ADDED;
        if (!new RegExp(`^[A-Za-z][A-Za-z0-9_]{0,${longest - 1}}$`).test(name)) {
            throw new DrivineError(
                `'${name}' can't name a graph on ${engine}: it names tables, so it is letters, digits and underscores, ` +
                    `beginning with a letter, at most ${longest}.`
            );
        }
        this.nodes = `${name}_node`;
        this.edges = `${name}_edge`;
        this.catalog = `${name}_schema`;
    }

    /**
     * The relationship rows read both ways round, for a relationship of either direction from one node: each row once
     * with its ends `a` and `b` as it is stored, `back` 0, and once the other way round, `back` 1, with its `src` and
     * `dst` as stored. A read joins on `a` with an equality, which a store can index, where an OR across the two
     * directions left Postgres reading every relationship of the type for a node's neighbours, and Oracle's and
     * SQLite's recursive cascade reading every relationship at each step (#588). It is read with {@link selfLoopOnce}.
     * The same rows as compiled Cypher's (`SqlCypherCompiler.bothWays`).
     */
    bothWays(): string {
        return (
            `(SELECT eid, src, dst, type, props, src AS a, dst AS b, 0 AS back FROM ${this.edges}` +
            ` UNION ALL SELECT eid, src, dst, type, props, dst AS a, src AS b, 1 AS back FROM ${this.edges})`
        );
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
     * for the `_t` or `_i` an object made beside it adds within the longest name the store allows.
     */
    objectName(kind: string, parts: string[]): string {
        const hash = (javaHash(parts.join('\u0000')) >>> 0).toString(16);
        const fixed = `${this.name}_${kind}__${hash}`.length + 2;
        const room = Math.min(Math.max(this.maxObjectName - fixed, 0), 40);
        const readable = parts
            .map((it) => it.replace(/[^A-Za-z0-9]/g, ''))
            .join('')
            .slice(0, room);
        return `${this.name}_${kind}_${readable}_${hash}`;
    }
}

/**
 * That a row `edge` of {@link SqlGraph.bothWays} is a relationship from a node to itself only once, read as it is
 * stored: a condition of the join, not a `WHERE` of the second half, which would stop Postgres reading each half by
 * its index (liberation-data/drivine4j#570).
 */
export function selfLoopOnce(edge: string): string {
    return `(${edge}.back = 0 OR ${edge}.src <> ${edge}.dst)`;
}

/** A string as an SQL literal. */
export function sqlText(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

/** Java's String.hashCode, over UTF-16 code units, as a 32-bit int. */
function javaHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return hash;
}
