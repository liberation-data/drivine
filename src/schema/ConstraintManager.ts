import { DrivineError } from '@/DrivineError';
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
    /** @param changed told once this has made or dropped a constraint, as the object manager's list is then stale. */
    constructor(
        private readonly executor: SchemaExecutor,
        private readonly grammar: SchemaGrammar,
        private readonly changed: () => void = () => undefined
    ) {}

    async list(): Promise<SchemaItem[]> {
        return this.grammar.listUniques.read(await this.executor.run(this.grammar.listUniques.statement));
    }

    /**
     * Makes the constraint unless it is there. The data is checked first, and up to `sampleSize` values held more than
     * once are reported; 0 skips the check, leaving the engine to refuse a constraint the data breaks.
     */
    async ensure(
        spec: UniquenessConstraintSpec,
        sampleSize: number = VIOLATION_SAMPLE
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        if (await this.exists(spec)) {
            return { status: 'ALREADY_MATCHING', spec };
        }
        const sample = sampleSize > 0 ? await this.conflicts(spec, sampleSize) : [];
        if (sample.length) {
            return { status: 'VIOLATION', spec, sample };
        }
        if (this.grammar.uniqueNeedsRange) {
            await new IndexManager(this.executor, this.grammar, this.changed).ensure(
                rangeIndex(spec.label, spec.properties)
            );
        }
        for (const statement of this.grammar.createUnique(spec)) {
            await this.executor.run(statement);
        }
        await this.awaitBuilt(spec);
        this.changed();
        return { status: 'CREATED', spec };
    }

    async drop(spec: UniquenessConstraintSpec): Promise<void> {
        if (await this.exists(spec)) {
            for (const statement of this.grammar.dropUnique(spec)) {
                await this.executor.run(statement);
            }
            this.changed();
        }
    }

    private async exists(spec: UniquenessConstraintSpec): Promise<boolean> {
        return (await this.list()).some((it) => it.label === spec.label && same(it.properties, spec.properties));
    }

    private async conflicts(spec: UniquenessConstraintSpec, sampleSize: number): Promise<unknown[]> {
        return this.executor.run(this.grammar.conflicts(spec, sampleSize));
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
