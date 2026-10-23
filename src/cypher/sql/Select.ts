import { Value } from '@/cypher/sql/Value';

/** The rows a part of a statement reads: its sources and joins, its conditions, and the variables it binds. */
export class Select {
    readonly sources: string[] = [];
    readonly where: string[] = [];
    readonly bound: Map<string, Value> = new Map();

    /** The order its rows are read in, where it has one: each term, and whether it descends. */
    readonly order: [string, boolean][] = [];

    constructor(private readonly outer: Map<string, Value>) {}

    /** What an expression of this part sees: the variables bound around it, then its own. */
    get scope(): Map<string, Value> {
        return new Map([...this.outer, ...this.bound]);
    }

    bind(variable: string, value: Value): void {
        this.bound.set(variable, value);
    }

    source(text: string): void {
        this.sources.push(this.sources.length === 0 ? `FROM ${text}` : `CROSS JOIN ${text}`);
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
