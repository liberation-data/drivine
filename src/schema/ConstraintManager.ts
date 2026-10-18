import { DrivineError } from '@/DrivineError';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { SchemaExecutor } from '@/schema/SchemaExecutor';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, rangeIndex, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';
import { IndexManager } from '@/schema/IndexManager';

/** How many conflicting values a constraint violation reports. */
export const VIOLATION_SAMPLE = 10;

/** Whether two constraints cover the same properties: order means nothing to uniqueness, and engines reorder them. */
const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

/**
 * Uniqueness constraints, made idempotently. Before making one, the data is checked: if two nodes already hold the same
 * values, nothing is made and the result is a VIOLATION with a sample of the values.
 */
export class ConstraintManager {
    constructor(
        private readonly executor: SchemaExecutor,
        private readonly grammar: SchemaGrammar
    ) {}

    async list(): Promise<SchemaItem[]> {
        return this.grammar.listUniques.read(await this.executor.run(this.grammar.listUniques.statement));
    }

    async ensure(spec: UniquenessConstraintSpec): Promise<EnsureResult<UniquenessConstraintSpec>> {
        if (await this.exists(spec)) {
            return { status: 'ALREADY_MATCHING', spec };
        }
        const sample = await this.conflicts(spec);
        if (sample.length) {
            return { status: 'VIOLATION', spec, sample };
        }
        if (this.grammar.uniqueNeedsRange) {
            await new IndexManager(this.executor, this.grammar).ensure(rangeIndex(spec.label, spec.properties));
        }
        for (const statement of this.grammar.createUnique(spec)) {
            await this.executor.run(statement);
        }
        await this.awaitBuilt(spec);
        return { status: 'CREATED', spec };
    }

    async drop(spec: UniquenessConstraintSpec): Promise<void> {
        if (await this.exists(spec)) {
            for (const statement of this.grammar.dropUnique(spec)) {
                await this.executor.run(statement);
            }
        }
    }

    private async exists(spec: UniquenessConstraintSpec): Promise<boolean> {
        return (await this.list()).some((it) => it.label === spec.label && same(it.properties, spec.properties));
    }

    private async conflicts(spec: UniquenessConstraintSpec): Promise<unknown[]> {
        const values = spec.properties.map((it) => `n.${quoteName(it)}`);
        const present = values.map((it) => `${it} IS NOT NULL`).join(' AND ');
        const key = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
        const rows = await this.executor.run(
            `MATCH (n${labelExpression([spec.label])}) WHERE ${present} WITH ${key} AS value, count(*) AS holders ` +
                `WHERE holders > 1 RETURN value LIMIT ${VIOLATION_SAMPLE}`
        );
        return rows;
    }

    /** FalkorDB builds a constraint in the background; wait until it reports it, or says it failed. */
    private async awaitBuilt(spec: UniquenessConstraintSpec): Promise<void> {
        for (let attempt = 0; attempt < 50; attempt++) {
            if (await this.exists(spec)) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        }
        throw new DrivineError(
            `The uniqueness constraint on ${spec.label}(${spec.properties.join(', ')}) was not built.`
        );
    }
}
