import { SchemaExecutor } from '@/schema/SchemaExecutor';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, RangeIndexSpec } from '@/schema/SchemaSpecs';

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it, k) => it === b[k]);

/**
 * Range indexes, made idempotently: `ensure` makes one only when the engine holds none over the label and properties.
 */
export class IndexManager {
    constructor(
        private readonly executor: SchemaExecutor,
        private readonly grammar: SchemaGrammar
    ) {}

    async list(): Promise<SchemaItem[]> {
        return this.grammar.listRanges.read(await this.executor.run(this.grammar.listRanges.statement));
    }

    async ensure(spec: RangeIndexSpec): Promise<EnsureResult<RangeIndexSpec>> {
        if (await this.exists(spec)) {
            return { status: 'ALREADY_MATCHING', spec };
        }
        for (const statement of this.grammar.createRange(spec)) {
            await this.executor.run(statement);
        }
        return { status: 'CREATED', spec };
    }

    async drop(spec: RangeIndexSpec): Promise<void> {
        if (await this.exists(spec)) {
            for (const statement of this.grammar.dropRange(spec)) {
                await this.executor.run(statement);
            }
        }
    }

    private async exists(spec: RangeIndexSpec): Promise<boolean> {
        const items = (await this.list()).filter((it) => it.label === spec.label);
        if (this.grammar.rangesPerProperty) {
            // An engine that indexes properties one by one holds a composite index when it holds each property's.
            return spec.properties.every((property) => items.some((it) => it.properties[0] === property));
        }
        return items.some((it) => same(it.properties, spec.properties));
    }
}
