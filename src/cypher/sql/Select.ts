import type { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { Value } from '@/cypher/sql/Value';

/** A test of a node's labels among a part's conditions: the entry of its `where` at `at`, that the labels `labels` hold each of `all`. */
interface LabelTest {
    at: number;
    labels: string;
    all: string[];
}

/** The rows a part of a statement reads: its sources and joins, its conditions, and the variables it binds. */
export class Select {
    readonly sources: string[] = [];
    readonly where: string[] = [];
    readonly bound: Map<string, Value> = new Map();

    /**
     * Whether a variable-length walk is among its sources, or among those of a `WITH` it reads: a term it sorts by is
     * then bound in no subquery (see `CypherWriter.sorts`).
     */
    walks = false;

    /** The order its rows are read in, where it has one: each term, and whether it descends. */
    readonly order: [string, boolean][] = [];

    /** The tests among its {@link where} of the labels of each node, by the node's key, in the order they were added. */
    private readonly labelTests: Map<string, LabelTest[]> = new Map();

    constructor(private readonly outer: Map<string, Value>) {}

    /** What an expression of this part sees: the variables bound around it, then its own. */
    get scope(): Map<string, Value> {
        return new Map([...this.outer, ...this.bound]);
    }

    bind(variable: string, value: Value): void {
        this.bound.set(variable, value);
    }

    /** The test `test`, of `node`'s labels holding each of `all`, among its conditions, kept where {@link relabel} finds it. */
    labelTest(node: { nid: string; labels: string }, all: string[], test: string): void {
        const tests = this.labelTests.get(node.nid) ?? [];
        tests.push({ at: this.where.length, labels: node.labels, all });
        this.labelTests.set(node.nid, tests);
        this.where.push(test);
    }

    /** Whether the node whose key is `nid` is bound here, not in a part around it. */
    bindsNode(nid: string): boolean {
        return [...this.bound.values()].some((it) => it.kind === 'Node' && it.nid === nid);
    }

    /** Where the node whose key is `nid`, bound here, is first tested for its labels among its conditions; undefined where it is not. */
    labelled(nid: string): number | undefined {
        const first = this.labelTests.get(nid)?.[0];
        return first && this.bindsNode(nid) ? first.at : undefined;
    }

    /** Each test of the labels of the node whose key is `nid` written again, as `test` gives it for its labels and those it tests. */
    relabel(nid: string, test: (labels: string, all: string[]) => string): void {
        this.labelTests.get(nid)?.forEach((it) => (this.where[it.at] = test(it.labels, it.all)));
    }

    /** Reads the rows of `text`, after those of its other sources, joined as the store `sql` joins them. */
    source(text: string, sql: Pick<SqlCypherCompiler, 'crossJoin'>): void {
        this.sources.push(this.sources.length === 0 ? `FROM ${text}` : sql.crossJoin(text));
    }

    join(text: string): void {
        if (this.sources.length === 0) {
            this.sources.push('FROM (SELECT 1) one');
        }
        this.sources.push(text);
    }

    from(): string[] {
        return this.sources;
    }

    whereClause(): string | undefined {
        return this.where.length > 0 ? `WHERE ${this.where.join('\n  AND ')}` : undefined;
    }

    /** How much this part reads: it reads more when a clause adds to it. */
    size(): number {
        return this.sources.length + this.where.length + this.bound.size;
    }
}
