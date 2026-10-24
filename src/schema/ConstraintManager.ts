import { DrivineError } from '@/DrivineError';
import { SchemaExecutor } from '@/schema/SchemaExecutor';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, rangeIndex, UniquenessConstraintSpec, ViolatingKey } from '@/schema/SchemaSpecs';
import { IndexManager } from '@/schema/IndexManager';
import { DrivineLogger } from '@/logger';

/** How many conflicting values a constraint violation reports. */
export const VIOLATION_SAMPLE = 10;

/** Whether two constraints cover the same properties: order means nothing to uniqueness, and engines reorder them. */
const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

/** Whether an index covers the properties in the constraint's order: an index over them in another order is another. */
const sameInOrder = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it, k) => it === b[k]);

/**
 * Uniqueness constraints, made idempotently. Before making one, the data is checked: if two nodes already hold the same
 * values, nothing is made and the result is a VIOLATION with a sample of the keys, each naming the nodes that hold it.
 * On Neo4j a plain range index over the same label and properties is in the way of a constraint: the result is then
 * BLOCKED_BY_INDEX, naming it, unless replacing it is asked for.
 */
export class ConstraintManager {
    private readonly logger = new DrivineLogger(ConstraintManager.name);

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
     * Makes the constraint unless it is there. The data is checked first, and up to `sampleSize` keys held more than
     * once are reported, each with up to `sampleSize` of the nodes that hold it; 0 skips the check, leaving the engine
     * to refuse a constraint the data breaks. FalkorDB doesn't refuse one: it builds it in the background and marks the
     * build FAILED. The failed constraint is then dropped, and the result is a VIOLATION when the data shows a key held
     * more than once, with up to `sampleSize` of them (none at 0, though the data is still read to confirm it). A build
     * that fails with no key held more than once throws.
     *
     * @param replaceBlockingIndex drop a plain index in the way of the constraint and make the constraint, whose own
     * index takes its place, rather than returning BLOCKED_BY_INDEX. The data is read first: a key held more than once
     * keeps the index and is a VIOLATION, with an empty sample when `sampleSize` is 0, and data that can't be read keeps
     * it and throws the refusal. Only an engine whose constraint brings its own index reports one in the way (Neo4j), so
     * elsewhere this changes nothing.
     */
    async ensure(
        spec: UniquenessConstraintSpec,
        sampleSize: number = VIOLATION_SAMPLE,
        replaceBlockingIndex: boolean = false
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        if (await this.exists(spec)) {
            return { status: 'ALREADY_MATCHING', spec };
        }
        const sample = sampleSize > 0 ? await this.conflicts(spec, sampleSize) : [];
        if (sample.length) {
            return { status: 'VIOLATION', spec, sample };
        }
        const indexes = new IndexManager(this.executor, this.grammar, this.changed);
        if (this.grammar.uniqueNeedsRange) {
            await indexes.ensure(rangeIndex(spec.label, spec.properties));
        }
        try {
            await this.create(spec);
        } catch (e) {
            const index = this.grammar.blockedByIndex?.(e) ? await this.blockingIndex(indexes, spec) : undefined;
            if (!index) {
                throw e;
            }
            if (!replaceBlockingIndex) {
                this.logger.warn(
                    `Could not create the uniqueness constraint on ${spec.label}(${spec.properties.join(', ')}): ` +
                        `index ${index.name} is in the way of it`
                );
                return { status: 'BLOCKED_BY_INDEX', spec, index };
            }
            // Neo4j refuses for the index before it reads the data, so a key held more than once would refuse the
            // constraint once the index is gone: unless the data was read above, look first, keeping the index.
            if (sampleSize <= 0 && (await this.repeats(spec, e))) {
                return { status: 'VIOLATION', spec, sample: [] };
            }
            for (const statement of this.grammar.dropRange(rangeIndex(spec.label, spec.properties), index.name)) {
                await this.executor.run(statement);
            }
            this.logger.log(
                `Dropped index ${index.name} on ${spec.label}(${spec.properties.join(', ')}), in the way of a ` +
                    `uniqueness constraint that replaces it`
            );
            await this.create(spec);
        }
        return this.awaitBuilt(spec, sampleSize);
    }

    /** Drops the constraint, or one whose build FalkorDB marked FAILED, which `list` leaves out. */
    async drop(spec: UniquenessConstraintSpec): Promise<void> {
        if ((await this.exists(spec)) || (await this.failed(spec))) {
            await this.dropUnique(spec);
            this.changed();
        }
    }

    private async exists(spec: UniquenessConstraintSpec): Promise<boolean> {
        return (await this.list()).some((it) => it.label === spec.label && same(it.properties, spec.properties));
    }

    /** Whether the engine reports that its build of the constraint failed. */
    private async failed(spec: UniquenessConstraintSpec): Promise<boolean> {
        return this.listedBy(this.grammar.listFailedUniques, spec);
    }

    /** Whether `listing` lists the constraint; a statement already in `rows` is read from there, not run again. */
    private async listedBy(
        listing: SchemaGrammar['listFailedUniques'],
        spec: UniquenessConstraintSpec,
        rows: Map<string, Promise<any[]>> = new Map()
    ): Promise<boolean> {
        if (!listing) {
            return false;
        }
        if (!rows.has(listing.statement)) {
            rows.set(listing.statement, this.executor.run(listing.statement));
        }
        return listing
            .read(await rows.get(listing.statement)!)
            .some((it) => it.label === spec.label && same(it.properties, spec.properties));
    }

    /** Up to `sampleSize` keys held more than once, each naming up to `sampleSize` of the nodes that hold it. */
    private async conflicts(spec: UniquenessConstraintSpec, sampleSize: number): Promise<ViolatingKey[]> {
        return (await this.executor.run(this.grammar.conflicts(spec, sampleSize))) as ViolatingKey[];
    }

    /** Whether a key of the constraint's properties is held more than once; the refusal is thrown if unreadable. */
    private async repeats(spec: UniquenessConstraintSpec, refusal: unknown): Promise<boolean> {
        try {
            return (await this.conflicts(spec, 1)).length > 0;
        } catch {
            throw refusal;
        }
    }

    private async dropUnique(spec: UniquenessConstraintSpec): Promise<void> {
        for (const statement of this.grammar.dropUnique(spec)) {
            await this.executor.run(statement);
        }
    }

    private async create(spec: UniquenessConstraintSpec): Promise<void> {
        for (const statement of this.grammar.createUnique(spec)) {
            await this.executor.run(statement);
        }
    }

    /** The plain range index over the constraint's label and properties, in their order, that is in the way of it. */
    private async blockingIndex(
        indexes: IndexManager,
        spec: UniquenessConstraintSpec
    ): Promise<SchemaItem | undefined> {
        return (await indexes.list('RANGE')).find(
            (it) => it.label === spec.label && sameInOrder(it.properties, spec.properties)
        );
    }

    /**
     * CREATED once the engine reports the constraint built, which FalkorDB does in the background. A build FalkorDB
     * marks FAILED gives what `buildFailed` gives.
     */
    private async awaitBuilt(
        spec: UniquenessConstraintSpec,
        sampleSize: number
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        for (let attempt = 0; attempt < 50; attempt++) {
            // One reading per attempt, so that a build marked FAILED between two readings isn't taken for built.
            const rows = new Map<string, Promise<any[]>>();
            if (await this.listedBy(this.grammar.listFailedUniques, spec, rows)) {
                return this.buildFailed(spec, sampleSize);
            }
            // FalkorDB lists the constraint UNDER CONSTRUCTION as it builds it, and may yet mark it FAILED.
            if (
                (await this.listedBy(this.grammar.listUniques, spec, rows)) &&
                !(await this.listedBy(this.grammar.listBuildingUniques, spec, rows))
            ) {
                this.changed();
                return { status: 'CREATED', spec };
            }
            await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        }
        throw new DrivineError(
            `The uniqueness constraint on ${spec.label}(${spec.properties.join(', ')}) was not built.`
        );
    }

    /**
     * A constraint whose build FalkorDB marked FAILED is dropped: it enforces nothing, yet stays listed, and drivine4j
     * and drivine-python, reading the same store, would take it for the constraint. It is then a VIOLATION, as in
     * drivine4j, when a key is held more than once, with up to `sampleSize` of them (none at 0, though the data is
     * read to confirm it). A build that fails with no key held more than once, or data that can't be read, throws.
     */
    private async buildFailed(
        spec: UniquenessConstraintSpec,
        sampleSize: number
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        await this.dropUnique(spec);
        const failed =
            `${this.grammar.engine} could not build the uniqueness constraint on ` +
            `${spec.label}(${spec.properties.join(', ')})`;
        let sample: ViolatingKey[];
        try {
            sample = await this.conflicts(spec, Math.max(sampleSize, 1));
        } catch (e) {
            throw new DrivineError(`${failed}, and the data could not be read to see why.`, e as Error);
        }
        if (!sample.length) {
            throw new DrivineError(`${failed}, but no key it covers is held more than once.`);
        }
        return { status: 'VIOLATION', spec, sample: sample.slice(0, Math.max(sampleSize, 0)) };
    }
}
