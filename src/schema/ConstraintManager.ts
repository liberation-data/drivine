import { DrivineError } from '@/DrivineError';
import type { SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';
import { IndexBuildOptions } from '@/schema/IndexManager';
import {
    DEFAULT_BUILD_TIMEOUT,
    DEFAULT_VIOLATION_SAMPLE,
    ensureResult,
    listed,
    planItem,
    SchemaPlanning,
    schemaItem
} from '@/schema/SchemaPlan';

/** How many conflicting values a constraint violation reports. */
export const VIOLATION_SAMPLE = DEFAULT_VIOLATION_SAMPLE;

/** How often, in milliseconds, a constraint being built is looked at again, while `inForce` waits on it. */
const BUILD_POLL = 200;

/**
 * Uniqueness constraints, made idempotently. Before making one, the data is checked: if two nodes already hold the same
 * values, nothing is made and the result is a VIOLATION with a sample of the keys, each naming the nodes that hold it.
 * On Neo4j a plain range index over the same label and properties is in the way of a constraint: the result is then
 * BLOCKED_BY_INDEX, naming it, unless replacing it is asked for.
 *
 * What each call makes, drops and waits on is the shared module's schema plan (SchemaPlan), as drivine4j's and
 * drivine-python's are; `plans.yaml` in the spec pins each call's decisions.
 */
export class ConstraintManager {
    /** @param build how the range index FalkorDB needs first is waited on to be built (see IndexManager's `ensure`). */
    constructor(
        private readonly planning: SchemaPlanning,
        private readonly build: IndexBuildOptions = {},
        private readonly sleep: (millis: number) => Promise<void> = async (millis) =>
            new Promise((resolve) => setTimeout(resolve, millis))
    ) {}

    /** This manager, waiting on a build as `build` says. */
    withBuild(build: IndexBuildOptions): ConstraintManager {
        return new ConstraintManager(this.planning, build, this.sleep);
    }

    /** The constraints the engine holds and enforces, each with the aliases its catalog record keeps. */
    async list(): Promise<SchemaItem[]> {
        return (await this.listed()).filter((it) => !it.buildFailed).map(schemaItem);
    }

    /**
     * Makes the constraint unless it is there. The data is checked first, and up to `sampleSize` keys held more than
     * once are reported, each with up to `sampleSize` of the nodes that hold it; 0 skips the check, leaving the engine
     * to refuse a constraint the data breaks. FalkorDB builds one in the background and marks a build the data breaks
     * FAILED: the failed constraint is then dropped, and the result is a VIOLATION.
     *
     * @param replaceBlockingIndex drop a plain index in the way of the constraint and make the constraint, whose own
     * index takes its place, rather than returning BLOCKED_BY_INDEX (Neo4j). A key held more than once keeps the index
     * and is a VIOLATION.
     *
     * A constraint that ignores case (see UniquenessConstraintSpec) is made over the lowercased copies, and first fills
     * them in, as IndexManager's `ensure` does. FalkorDB can't make one, and refuses it before that.
     */
    async ensure(
        spec: UniquenessConstraintSpec,
        sampleSize: number = VIOLATION_SAMPLE,
        replaceBlockingIndex: boolean = false
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        return this.result('ENSURE', spec, sampleSize, replaceBlockingIndex);
    }

    /**
     * Whether the constraint is there and built, so that the engine enforces it, as one another process made. One still
     * being built is waited on, up to the build's timeout; one whose build failed (FalkorDB) is not in force, and is left
     * as it is. A read: no schema plan.
     */
    async inForce(spec: UniquenessConstraintSpec): Promise<boolean> {
        const until = Date.now() + (this.build.timeout ?? DEFAULT_BUILD_TIMEOUT);
        for (;;) {
            const found = (await this.listed(spec))[0];
            if (!found || found.buildFailed) {
                return false;
            }
            if (!found.buildInProgress) {
                return true;
            }
            if (Date.now() >= until) {
                return false;
            }
            await this.sleep(BUILD_POLL);
        }
    }

    /** Drops the constraint, or one whose build FalkorDB marked FAILED, which `list` leaves out. */
    async drop(declared: UniquenessConstraintSpec): Promise<void> {
        await planItem(this.planning, 'DROP', declared);
    }

    /**
     * Drops the constraint, whatever its state, and makes it again, as `ensure` does: the data is checked first, and a
     * key held more than once is a VIOLATION. A constraint that ignores case fills the lowercased copies in again on
     * every node of its label. The constraint made again keeps the aliases its record kept (see SchemaItem's `aliases`).
     */
    async recreate(
        spec: UniquenessConstraintSpec,
        sampleSize: number = VIOLATION_SAMPLE,
        replaceBlockingIndex: boolean = false
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        return this.result('RECREATE', spec, sampleSize, replaceBlockingIndex);
    }

    private async listed(spec?: UniquenessConstraintSpec): ReturnType<typeof listed> {
        return listed(this.planning, 'constraints', this.planning.plan.listings().constraints, spec);
    }

    private async result(
        call: 'ENSURE' | 'RECREATE',
        spec: UniquenessConstraintSpec,
        sampleSize: number,
        replaceBlockingIndex: boolean
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        const item = await planItem(this.planning, call, spec, {
            mode: this.build.mode,
            buildTimeoutMillis: this.build.timeout,
            violationSampleSize: sampleSize,
            replaceBlockingIndex
        });
        if (!item.result) {
            throw new DrivineError(`The plan of ${call} of the constraint on ${spec.label} gave no result.`);
        }
        return ensureResult(item.result, spec);
    }
}
