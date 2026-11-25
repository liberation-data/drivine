import { DrivineError } from '@/DrivineError';
import { NodeIdIndexCheck } from '@/schema/NodeIdIndexCheck';
import type { SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';
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
 * Uniqueness constraints, made idempotently. Where the engine refuses one for the data, and the data shows two nodes that
 * hold the same values, nothing is made and the result is a VIOLATION with a sample of the keys, each naming the nodes
 * that hold it.
 * On Neo4j a plain range index over the same label and properties is in the way of a constraint: the result is then
 * BLOCKED_BY_INDEX, naming it, unless replacing it is asked for.
 *
 * What each call makes, drops and waits on is the shared module's schema plan (SchemaPlan), as drivine4j's and
 * drivine-python's are; `plans.yaml` in the spec pins each call's decisions.
 */
export class ConstraintManager {
    constructor(
        private readonly planning: SchemaPlanning,
        private readonly sleep: (millis: number) => Promise<void> = async (millis) =>
            new Promise((resolve) => setTimeout(resolve, millis))
    ) {}

    /** The constraints the engine holds and enforces, each with the aliases its catalog record keeps. */
    async list(): Promise<SchemaItem[]> {
        return (await this.listed()).filter((it) => !it.buildFailed).map(schemaItem);
    }

    /**
     * Makes the constraint unless it is there. Where the engine refuses it for the data, the data is read, and a key
     * held more than once makes the result a VIOLATION, reporting up to `sampleSize` such keys, each with up to
     * `sampleSize` of the nodes that hold it (none at 0, though the data is still read to confirm it); a refusal no
     * repeated key bears out is thrown. FalkorDB builds one in the background and marks a build the data breaks FAILED:
     * the failed constraint is then dropped, and the result is a VIOLATION.
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
     * being built is waited on, up to INDEX_BUILD_TIMEOUT; one whose build failed (FalkorDB) is not in force, and is left
     * as it is. A read: no schema plan.
     */
    async inForce(spec: UniquenessConstraintSpec): Promise<boolean> {
        const until = Date.now() + DEFAULT_BUILD_TIMEOUT;
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
     * Drops the constraint, whatever its state, and makes it again, as `ensure` does: a key held more than once is a
     * VIOLATION. On Oracle, Postgres and SQLite the constraint's unique index is built anew beside the old one, which is
     * dropped only once the new one is built, so a VIOLATION keeps the old one; the graph engines drop it first. Where
     * something other than an index stands under the name Drivine gives its index (a table, say), it is left as it is,
     * and the result is DRIFT. A constraint that ignores case fills the lowercased copies in again on every node of its
     * label. The constraint made again keeps the aliases its record kept (see SchemaItem's `aliases`).
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
            violationSampleSize: sampleSize,
            replaceBlockingIndex
        });
        if (!item.result) {
            throw new DrivineError(`The plan of ${call} of the constraint on ${spec.label} gave no result.`);
        }
        const result = ensureResult(item.result, spec);
        // Kept for the check of an unindexed @NodeId: what an enforce listed, or, with none, what was ensured by hand.
        NodeIdIndexCheck.ensured(this.planning.database, spec, result);
        return result;
    }
}
