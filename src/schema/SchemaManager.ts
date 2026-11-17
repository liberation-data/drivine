import { CATALOG_KINDS } from '@/backend/sql/SqlCatalog';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { DEFAULT_SCOPE, SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import { VectorAnnotationCheck } from '@/schema/VectorAnnotationCheck';
import { EnsureResult, itemName, madeAs } from '@/schema/SchemaSpecs';
import {
    DEFAULT_BUILD_TIMEOUT,
    DEFAULT_VIOLATION_SAMPLE,
    ensureResult,
    moduleSpec,
    planRequest,
    PlanReport,
    PlanRequest,
    planSpec,
    RuntimeCatalog,
    SchemaPlan
} from '@/schema/SchemaPlan';

export interface SchemaOptions {
    catalogs: SchemaCatalog[];
    /**
     * FAIL_FAST (default) throws on drift, a violation, an index in the way, or an index whose build failed or did not
     * end within `indexBuildTimeout`; WARN logs it and carries on.
     */
    mode?: 'FAIL_FAST' | 'WARN';
    /**
     * How long, in milliseconds, an index that Neo4j or FalkorDB builds in the background is waited on to be built.
     * Defaults to 60 s.
     */
    indexBuildTimeout?: number;
    /** Destructive: replace an item whose shape drifted, rather than reporting it. */
    recreateOnDrift?: boolean;
    /** Destructive: drop and make every declared item on every enforce. */
    recreateOnStartup?: boolean;
    /**
     * Destructive: drop a plain index in the way of a uniqueness constraint and make the constraint, whose own index
     * takes its place (Neo4j), rather than reporting it as BLOCKED_BY_INDEX.
     */
    replaceBlockingIndex?: boolean;
    /**
     * How many keys held more than once a constraint violation reports, and how many of the nodes that hold each it
     * names; 0 reports none, though the data is still read to confirm a violation. Defaults to 10.
     */
    violationSampleSize?: number;
    /** Whether DrivineModule enforces the schema at startup. Defaults to true. */
    enabled?: boolean;
}

const GRAPH_TYPES = [
    DatabaseType.NEO4J,
    DatabaseType.MEMGRAPH,
    DatabaseType.FALKORDB,
    DatabaseType.ORACLE,
    DatabaseType.POSTGRES,
    DatabaseType.SQLITE
];

/**
 * An item's identity in an owner's inventory, drivine4j's `inventoryKey`: kind, label, properties and name, so a renamed
 * item shows as an orphan rather than coexisting unattributed. Of the item as it is made (see `madeAs`): one that ignores
 * case names the lowercased copies and its own name, `RANGE_INDEX:Account:__drivine.lower.email:Account_email_ci_range`.
 */
export function inventoryKey(declared: SchemaSpec): string {
    const spec = madeAs(declared);
    return `${CATALOG_KINDS[spec.kind]}:${spec.label}:${spec.properties.join(',')}:${itemName(spec)}`;
}

/** An owner as the planner names one: the unnamed owner, 'schema', is null, as drivine4j's unnamed catalog is. */
const ownerOf = (name: string): string | null => (name === DEFAULT_SCOPE ? null : name);

/** An owner as a catalog names one. */
const nameOf = (owner: string | null): string => owner ?? DEFAULT_SCOPE;

/** A runtime catalog as a request's catalog, wherever it applies: what the store-independent check reads. */
const asCatalog = (it: RuntimeCatalog): PlanRequest['runtime'][number] => ({
    owner: it.owner,
    version: null,
    items: it.items
});

/** The planner of no store's statements, which validates what every store's would: drivine4j's `VALIDATOR`. */
const VALIDATOR = new SchemaPlan('neo4j', undefined);

/**
 * Holds catalogs of indexes and constraints on the databases they apply to. `enforce` is idempotent: it makes what is
 * missing, and recreates a catalog's items when its version changed. `recreateAll` drops and makes everything. Schema
 * known only later is given to `ensure`, under an owner.
 *
 * What each database is told to make, drop, recreate and record is the shared module's schema plan (SchemaPlan), as
 * drivine4j's and drivine-python's schema managers are: each owner's items, its version and inventory in its marker,
 * drift, violations and indexes not built, and what is logged. `plans.yaml` in the spec pins every decision.
 *
 * The catalogs are read once, when the manager is built: one made later is never seen, and `enforce` applies the same
 * list again. With nothing to apply (no catalog, or only empty ones, and nothing given to `ensure`) it says so, naming
 * the empty ones.
 *
 * Before anything is applied, by `enforce`, `recreateAll` or `ensure`, a vector index over a property that a fragment
 * class stores in a field without @VectorIndex is refused, naming the class, the field and the spec; a fragment class
 * built later is checked against the specs applied here. See VectorAnnotationCheck.
 */
export class SchemaManager {
    private readonly logger = new DrivineLogger(SchemaManager.name);

    /** What `ensure` was given, by owner and target, as the planner keeps it. */
    private runtime: RuntimeCatalog[] = [];

    /** Serializes `enforce`, `recreateAll`, `ensure` and `remove`, which read and write the runtime items and the markers. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly factory: GraphObjectManagerFactory,
        private readonly options: SchemaOptions
    ) {}

    /**
     * Ensures every catalog on its databases, and every item given to `ensure`: indexes before constraints. Returns the
     * results, by database.
     */
    async enforce(): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        return this.serialized(async () => this.apply({ type: 'enforce', owners: { all: true } }));
    }

    /** Drops and makes every declared item, and every item given to `ensure`. Destructive. */
    async recreateAll(): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        return this.serialized(async () => this.apply({ type: 'recreateAll', owners: { all: true } }));
    }

    /**
     * Ensures schema known only at runtime, such as a vector index whose dimensions arrive with the embedding model or
     * an index for each label a tenant declares, under `owner` (a catalog's `named`; 'schema' is the unnamed owner) on
     * every graph database. To target databases, give a catalog that names its owner and databases.
     *
     * The items are added to what the owner declared at startup, for the life of this manager, and applied as `enforce`
     * applies the owner's: `mode`, `recreateOnDrift` and `violationSampleSize` apply, and only the items given are
     * applied. Ensuring an item again with the same kind, label and properties replaces it. From then on `enforce` and
     * `recreateAll` apply them with the rest. A declaration that conflicts with another owner's, or with the owner's
     * own, fails, and nothing is kept or applied on any database; one identical to another owner's is co-owned. A
     * vector index over a fragment field that has no @VectorIndex fails the same way, as in a catalog.
     *
     * The owner's marker records them as ensured at runtime (drivine4j's `runtime:` entries), so an `enforce` by a
     * manager built later keeps them in the inventory without calling them orphans. When that enforce recreates the
     * owner, it marks them (`runtime-stale:`), and the next `ensure` of one recreates it. `ensure` leaves a change of
     * the owner's version to `enforce`, and `recreateOnStartup` does not apply to it.
     */
    async ensure(owner: string, ...specs: SchemaSpec[]): Promise<Map<string, EnsureResult<SchemaSpec>[]>>;
    async ensure(catalog: SchemaCatalog): Promise<Map<string, EnsureResult<SchemaSpec>[]>>;
    async ensure(
        target: string | SchemaCatalog,
        ...specs: SchemaSpec[]
    ): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        const catalog = typeof target === 'string' ? SchemaCatalog.of(...specs).named(target) : target;
        if (catalog.version !== undefined) {
            throw new DrivineError(
                `Schema ensured at runtime cannot carry a version (${catalog.version}): an owner's version is declared ` +
                    `by its startup catalogs, with SchemaCatalog.withVersion.`
            );
        }
        if (!catalog.items.length) {
            this.logger.log(`Nothing to ensure for owner '${catalog.name}': no items given`);
            return new Map();
        }
        return this.serialized(async () => {
            const operation = { type: 'ensure', owner: ownerOf(catalog.name), items: catalog.items.map(moduleSpec) };
            const candidate = VALIDATOR.runtimeAfter(operation, this.runtime, catalog.databases);
            // Two items given at once that conflict are refused before any database is spoken to, with none registered too.
            const conflict = VALIDATOR.validate(planRequest('default', operation, {}, [], candidate.map(asCatalog)));
            if (conflict) {
                throw new DrivineError(conflict);
            }
            // As is a vector index over a fragment field without @VectorIndex.
            VectorAnnotationCheck.register([catalog]);
            // Every database is checked before anything is kept or applied, so a conflict leaves both as they were.
            const planned = this.databases([catalog]).map((database) => {
                const planning = this.factory.get(database).schemaPlanning();
                const request = this.request(database, operation, candidate);
                const refusal = planning.plan.validate(request);
                if (refusal) {
                    throw new DrivineError(refusal);
                }
                return { database, planning, request };
            });
            this.runtime = candidate;
            const results = new Map<string, EnsureResult<SchemaSpec>[]>();
            for (const { database, planning, request } of planned) {
                results.set(database, this.results(await planning.plan.run(request, planning.host)));
            }
            return results;
        });
    }

    /**
     * Takes items back from what `owner` declares, on every graph database: the counterpart of `ensure`. To target
     * databases, give a catalog that names its owner and databases. Each item is found by its kind, label and
     * properties, whatever its name.
     *
     * An item `ensure` gave the owner is forgotten, so a later `enforce` does not make it again. On each database the
     * item is then dropped, unless a startup catalog (of any owner) or another owner's runtime items declare it, or
     * another owner's marker there records it (declared or ensured at runtime, by whichever manager or process): it is
     * then left in place, with a warning naming who declares it. Either way the owner's marker no longer records it. An
     * item that is not there is forgotten all the same. The catalog must not carry a version.
     */
    async remove(owner: string, ...specs: SchemaSpec[]): Promise<void>;
    async remove(catalog: SchemaCatalog): Promise<void>;
    async remove(target: string | SchemaCatalog, ...specs: SchemaSpec[]): Promise<void> {
        const catalog = typeof target === 'string' ? SchemaCatalog.of(...specs).named(target) : target;
        if (catalog.version !== undefined) {
            throw new DrivineError(
                `Schema removed at runtime cannot carry a version (${catalog.version}): an owner's version is ` +
                    `declared by its startup catalogs.`
            );
        }
        if (!catalog.items.length) {
            return;
        }
        await this.serialized(async () => {
            const operation = { type: 'remove', owner: ownerOf(catalog.name), items: catalog.items.map(moduleSpec) };
            const refusal = VALIDATOR.validate(planRequest('default', operation));
            if (refusal) {
                throw new DrivineError(refusal);
            }
            // The items are forgotten before the databases are resolved: a target refused then leaves them forgotten.
            this.runtime = VALIDATOR.runtimeAfter(operation, this.runtime, catalog.databases);
            for (const database of this.databases([catalog])) {
                const planning = this.factory.get(database).schemaPlanning();
                await planning.plan.run(this.request(database, operation, this.runtime), planning.host);
            }
        });
    }

    /** What `ensure` has given the owner, on any database. */
    ensured(owner: string): SchemaSpec[] {
        return this.runtime
            .filter((it) => it.owner === ownerOf(owner))
            .flatMap((it) => it.items.map((spec) => planSpec(spec) as SchemaSpec));
    }

    private async serialized<T>(run: () => Promise<T>): Promise<T> {
        const next = this.queue.then(run);
        this.queue = next.catch(() => undefined);
        return next;
    }

    private async apply(operation: Record<string, any>): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        const report = new Map<string, EnsureResult<SchemaSpec>[]>();
        const runtime = this.runtime.map((it) => {
            const catalog = SchemaCatalog.of(...it.items.map((spec) => planSpec(spec) as SchemaSpec)).named(
                nameOf(it.owner)
            );
            return it.databases ? catalog.forDatabases(...it.databases) : catalog;
        });
        const all = [...this.options.catalogs, ...runtime];
        if (!all.some((it) => it.items.length)) {
            this.logNothingToApply();
            return report;
        }
        VectorAnnotationCheck.register(all);
        for (const database of this.databases(all)) {
            const planning = this.factory.get(database).schemaPlanning();
            report.set(
                database,
                this.results(await planning.plan.run(this.request(database, operation, this.runtime), planning.host))
            );
        }
        return report;
    }

    /** The plan request of `operation` on `database`: the startup catalogs for it, and the runtime items there. */
    private request(database: string, operation: Record<string, any>, runtime: RuntimeCatalog[]): PlanRequest {
        const catalogs = this.options.catalogs
            .filter((it) => this.databases([it]).includes(database))
            .map((it) => ({ owner: ownerOf(it.name), version: it.version ?? null, items: it.items.map(moduleSpec) }));
        return planRequest(
            database,
            operation,
            {
                mode: this.options.mode,
                violationSampleSize: this.options.violationSampleSize ?? DEFAULT_VIOLATION_SAMPLE,
                replaceBlockingIndex: this.options.replaceBlockingIndex === true,
                buildTimeoutMillis: this.options.indexBuildTimeout ?? DEFAULT_BUILD_TIMEOUT
            },
            catalogs,
            VALIDATOR.runtimeOn(database, runtime),
            { onDrift: this.options.recreateOnDrift === true, onStartup: this.options.recreateOnStartup === true }
        );
    }

    /** What each item of each owner the plan applied gave, in order. */
    private results(report: PlanReport): EnsureResult<SchemaSpec>[] {
        return report.owners.flatMap((owner) =>
            owner.results.map((it) => ensureResult(it.result, planSpec(it.spec) as SchemaSpec))
        );
    }

    /**
     * The graph databases the catalogs apply to, in order of name, as drivine4j applies them. A named database that is
     * unknown or not a graph fails.
     */
    private databases(catalogs: SchemaCatalog[]): string[] {
        const registry = DatabaseRegistry.getInstance();
        const graphs = registry.providers.filter((it) => GRAPH_TYPES.includes(it.type)).map((it) => it.name);
        const result = new Set<string>();
        for (const catalog of catalogs) {
            const targets =
                catalog.databases?.map((name) => {
                    const provider = registry.connectionProvider(name);
                    if (!provider || !GRAPH_TYPES.includes(provider.type)) {
                        throw new DrivineError(
                            `A schema catalog names ${name}, which is not a registered graph database.`
                        );
                    }
                    return provider.name;
                }) ?? graphs;
            targets.forEach((name) => result.add(name));
        }
        return [...result].sort();
    }

    /**
     * Says why there is nothing to apply, so that a catalog never passed and one that came out empty can be told from an
     * application with no schema to manage. Both say the catalogs are read once: one made after the manager is not seen,
     * and schema known later is given to `ensure`. Runtime items count, so a manager given only those applies them.
     */
    private logNothingToApply(): void {
        const once =
            'Catalogs are read once, when the SchemaManager is built; schema known later is given to SchemaManager.ensure.';
        const catalogs = this.options.catalogs;
        if (!catalogs.length) {
            this.logger.log(`Schema management found no SchemaCatalog; nothing to apply. ${once}`);
            return;
        }
        const counts = new Map<string, number>();
        catalogs
            .map((it) => (it.name === DEFAULT_SCOPE ? 'unnamed' : `'${it.name}'`))
            .forEach((owner) => counts.set(owner, (counts.get(owner) ?? 0) + 1));
        const owners = [...counts].map(([owner, count]) => (count === 1 ? owner : `${owner} (${count})`));
        this.logger.log(
            `Schema management found ${catalogs.length} SchemaCatalog(s), all empty: ${owners.join(', ')}; ` +
                `nothing to apply. ${once}`
        );
    }
}
