import type { SchemaItem } from '@/schema/SchemaGrammar';
import { DrivineError } from '@/DrivineError';
import { EnsureResult, IndexSpec } from '@/schema/SchemaSpecs';
import type { SchemaSpec } from '@/schema/SchemaCatalog';
import {
    DEFAULT_BUILD_TIMEOUT,
    ensureResult,
    listed,
    moduleKind,
    planItem,
    SchemaPlanning,
    schemaItem
} from '@/schema/SchemaPlan';

/** How long, in milliseconds, an index is waited on to be built, unless IndexBuildOptions says otherwise. */
export const INDEX_BUILD_TIMEOUT = DEFAULT_BUILD_TIMEOUT;

/** How an index the engine builds in the background is waited on (see IndexManager's `ensure`). */
export interface IndexBuildOptions {
    /** How long, in milliseconds, to wait for the build. Defaults to INDEX_BUILD_TIMEOUT, 60 s. */
    timeout?: number;
    /**
     * FAIL_FAST (default) throws for a build that failed or did not end in time; WARN logs it, naming the index and the
     * engine's reason, and carries on, as SchemaManager's mode says.
     */
    mode?: 'FAIL_FAST' | 'WARN';
}

/** An index made or found that is not built: its build failed, or it is `stillBuilding` when the wait ran out. */
export interface UnbuiltIndex {
    spec: IndexSpec;
    stillBuilding: boolean;
    /** Names the index and gives the engine's reason. */
    message: string;
}

/**
 * Range, vector and full-text indexes, made idempotently: `ensure` makes one only when the engine holds none over the
 * label and properties, and reports DRIFT, changing nothing, when it holds one of another shape. `recreate` replaces.
 *
 * What each call makes, drops and waits on is the shared module's schema plan (SchemaPlan), so an index is made, found and
 * dropped as drivine4j and drivine-python make, find and drop it, by the same statements, on every store. `plans.yaml` in
 * the spec pins each call's decisions.
 */
export class IndexManager {
    /** @param build how an index the engine builds in the background is waited on. */
    constructor(
        private readonly planning: SchemaPlanning,
        private readonly build: IndexBuildOptions = {}
    ) {}

    /** This manager, waiting on a build as `build` says. */
    withBuild(build: IndexBuildOptions): IndexManager {
        return new IndexManager(this.planning, build);
    }

    /** The indexes of a kind the engine holds, each with the aliases its catalog record keeps. */
    async list(kind: IndexSpec['kind'] = 'RANGE'): Promise<SchemaItem[]> {
        const name = moduleKind(kind);
        const statement = this.planning.plan.listings().indexes[name];
        return (await listed(this.planning, 'indexes', statement)).filter((it) => it.kind === name).map(schemaItem);
    }

    /**
     * Makes the index unless the engine holds one over its label and properties. An index that ignores case (see
     * RangeIndexSpec) is made over the lowercased copies, and first fills them in on the nodes of its label that have
     * none, recording that they all have them; where the index isn't there yet, the copies are filled in again even
     * where recorded, as by `recreate`.
     *
     * On an engine that builds an index in the background (Neo4j, FalkorDB), returns once the index, made here or found
     * there, is built, waiting at most the build's `timeout`. A build that failed, or did not end in time, throws a
     * DrivineError naming the index and giving the engine's reason, unless the build's mode is WARN, which logs it. The
     * index is left as it is.
     */
    async ensure<S extends IndexSpec>(spec: S): Promise<EnsureResult<S>> {
        return this.result('ENSURE', spec);
    }

    /**
     * Drops the index over the label and properties, whatever its shape, and makes it as the spec says. Destructive. An
     * index that ignores case fills the lowercased copies in again on every node of its label, recorded or not. The
     * index made again keeps the aliases its record kept (see SchemaItem's `aliases`).
     */
    async recreate<S extends IndexSpec>(spec: S): Promise<EnsureResult<S>> {
        return this.result('RECREATE', spec);
    }

    /**
     * Records `aliases` as all the aliases of the index or constraint of `kind` that is there (see SchemaItem's
     * `aliases`): nothing, on a store that keeps none.
     */
    async alias(
        kind: SchemaSpec['kind'],
        item: Pick<SchemaItem, 'label' | 'properties' | 'name'>,
        aliases: string[]
    ): Promise<void> {
        const statement = this.planning.plan.aliased(
            { kind, label: item.label, properties: item.properties } as SchemaSpec,
            item as SchemaItem,
            aliases
        );
        if (statement) {
            await this.planning.host.run(statement, {});
        }
    }

    /** Drops the index over the label and properties, where there is one. */
    async drop(declared: IndexSpec): Promise<void> {
        await planItem(this.planning, 'DROP', declared);
    }

    private async result<S extends IndexSpec>(call: 'ENSURE' | 'RECREATE', spec: S): Promise<EnsureResult<S>> {
        const item = await planItem(this.planning, call, spec, {
            mode: this.build.mode,
            buildTimeoutMillis: this.build.timeout
        });
        if (!item.result) {
            throw new DrivineError(`The plan of ${call} of the ${spec.kind} on ${spec.label} gave no result.`);
        }
        return ensureResult(item.result, spec);
    }
}
