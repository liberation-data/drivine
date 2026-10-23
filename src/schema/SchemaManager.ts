import { CATALOG_KINDS } from '@/backend/sql/SqlCatalog';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { DEFAULT_SCOPE, SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import { inventoryEntries, readInventory, RecordedInventory } from '@/schema/SchemaInventory';
import { VectorAnnotationCheck } from '@/schema/VectorAnnotationCheck';
import {
    EnsureResult,
    IndexSpec,
    itemName,
    uniquenessConstraint,
    UniquenessConstraintSpec
} from '@/schema/SchemaSpecs';

export interface SchemaOptions {
    catalogs: SchemaCatalog[];
    /** FAIL_FAST (default) throws on drift, a violation or an index in the way; WARN logs it and carries on. */
    mode?: 'FAIL_FAST' | 'WARN';
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
     * names; 0 skips the check. Defaults to 10.
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
    DatabaseType.POSTGRES
];

const keyOf = (spec: SchemaSpec): string => `${spec.kind}:${spec.label}:${[...spec.properties].sort().join(',')}`;

/** The label of the schema markers: drivine4j's, so both read one. */
const MARKER_LABEL = '_DrivineSchema';

/**
 * An item's identity in an owner's inventory, drivine4j's `inventoryKey`: kind, label, properties and name, so a renamed
 * item shows as an orphan rather than coexisting unattributed.
 */
export function inventoryKey(spec: SchemaSpec): string {
    return `${CATALOG_KINDS[spec.kind]}:${spec.label}:${spec.properties.join(',')}:${itemName(spec)}`;
}

/** The inventory keys more than one owner declares. */
function coOwnedKeys(owners: Map<string, SchemaCatalog[]>): Set<string> {
    const counts = new Map<string, number>();
    for (const catalogs of owners.values()) {
        new Set(catalogs.flatMap((it) => it.items.map(inventoryKey))).forEach((key) =>
            counts.set(key, (counts.get(key) ?? 0) + 1)
        );
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

/** Each owner's items on one database, merged, and which of them are co-owned or only ensured at runtime. */
interface Plan {
    items: [SchemaSpec, SchemaCatalog][];
    owners: Map<string, SchemaCatalog[]>;
    coOwned: Set<string>;
    /** Per owner, the inventory keys of the items only `ensure` gave it, none of its startup catalogs. */
    runtimeOnly: Map<string, Set<string>>;
}

/** An owner's version, what its marker holds, and whether an apply recreates the owner's items. */
interface MarkerState {
    version?: string;
    stored?: string | null;
    recreateOwner: boolean;
    recorded?: RecordedInventory;
}

/** What `ensure` was given under one owner and target: each item by its identity, so a later one replaces it. */
interface RuntimeItems {
    owner: string;
    databases?: string[];
    items: Map<string, SchemaSpec>;
}

/** An inventory key without its name: what a renamed item shares with the key it had. */
const identityOf = (spec: SchemaSpec): string => inventoryKey(spec).slice(0, -itemName(spec).length);

/**
 * The items an earlier manager ensured at runtime that this one has not been given: kept in the inventory, not
 * orphans, since they arrive later; unless an item declared now has the same identity under another name.
 */
function carriedItems(recorded: RecordedInventory | undefined, own: SchemaSpec[]): string[] {
    const declared = own.map(inventoryKey);
    const identities = own.map(identityOf);
    return (recorded?.keys ?? []).filter(
        (key) => recorded!.runtime.has(key) && !declared.includes(key) && !identities.some((it) => key.startsWith(it))
    );
}

/**
 * The runtime items to record as waiting to be recreated. A carried item misses a recreate of its owner, having no
 * spec here, so it is marked, to be recreated when next ensured; a version change spares one another owner declares,
 * as it spares a co-owned item. A runtime item not applied this time keeps its mark; one applied loses it.
 */
function staleAfter(
    stale: Set<string>,
    carried: string[],
    runtimeOnly: Set<string>,
    applied: Set<string>,
    owner: { forced: boolean; recreateOwner: boolean; declaredByOthers: Set<string> }
): Set<string> {
    return new Set([
        ...[...stale].filter((key) => runtimeOnly.has(key) && !applied.has(key)),
        ...carried.filter(
            (key) => stale.has(key) || owner.forced || (owner.recreateOwner && !owner.declaredByOthers.has(key))
        )
    ]);
}

/**
 * Holds catalogs of indexes and constraints on the databases they apply to. `enforce` is idempotent: it makes what is
 * missing, and recreates a catalog's items when its version changed. `recreateAll` drops and makes everything. Schema
 * known only later is given to `ensure`, under an owner.
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

    /** What `ensure` was given, by owner and target. */
    private runtime = new Map<string, RuntimeItems>();

    /** Serializes `enforce`, `recreateAll` and `ensure`, which read and write the runtime items and the markers. */
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
        return this.serialized(async () => this.apply(false));
    }

    /** Drops and makes every declared item, and every item given to `ensure`. Destructive. */
    async recreateAll(): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        return this.serialized(async () => this.apply(true));
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
            const databases = [...this.catalogsByDatabase([catalog]).keys()];
            // The items given are merged as a catalog's are, so two of one identity that differ fail, on no database too;
            // such a conflict is on every database they are for, so names one only when there is one.
            const only = databases.length === 1 ? databases[0] : undefined;
            const items = this.merged(only, [catalog]).map(([spec]) => spec);
            const candidate = this.withRuntime(catalog, items);
            const runtime = this.runtimeCatalogs(candidate);
            const byDatabase = this.catalogsByDatabase([...this.options.catalogs, ...runtime]);
            // Plan every database before anything is kept or applied, so a conflict leaves both as they were.
            const plans = databases.map(
                (database) => [database, this.plan(database, byDatabase.get(database)!, runtime)] as const
            );
            VectorAnnotationCheck.register([catalog]);
            this.runtime = candidate;
            const given = new Set(catalog.items.map(inventoryKey));
            const report = new Map<string, EnsureResult<SchemaSpec>[]>();
            for (const [database, plan] of plans) {
                const gom = this.factory.get(database);
                const own = plan.owners.get(catalog.name)!;
                report.set(database, await this.applyOwner(gom, database, catalog.name, own, plan, false, given));
            }
            return report;
        });
    }

    private async serialized<T>(run: () => Promise<T>): Promise<T> {
        const next = this.queue.then(run);
        this.queue = next.catch(() => undefined);
        return next;
    }

    /**
     * The runtime items with the catalog's added, each replacing an item of its identity, owner and target. A target is
     * its set of databases, as drivine4j's is, whatever the order they are named in.
     */
    private withRuntime(catalog: SchemaCatalog, items: SchemaSpec[]): Map<string, RuntimeItems> {
        const copy = new Map([...this.runtime].map(([key, it]) => [key, { ...it, items: new Map(it.items) }]));
        const key = JSON.stringify([catalog.name, catalog.databases ? [...new Set(catalog.databases)].sort() : null]);
        const entry = copy.get(key) ?? { owner: catalog.name, databases: catalog.databases, items: new Map() };
        items.forEach((spec) => entry.items.set(keyOf(spec), spec));
        copy.set(key, entry);
        return copy;
    }

    private runtimeCatalogs(runtime: Map<string, RuntimeItems>): SchemaCatalog[] {
        return [...runtime.values()].map((it) => {
            const catalog = SchemaCatalog.of(...it.items.values()).named(it.owner);
            return it.databases ? catalog.forDatabases(...it.databases) : catalog;
        });
    }

    private async apply(recreate: boolean): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        const runtime = this.runtimeCatalogs(this.runtime);
        const report = new Map<string, EnsureResult<SchemaSpec>[]>();
        const all = [...this.options.catalogs, ...runtime];
        if (!all.some((it) => it.items.length)) {
            this.logNothingToApply();
            return report;
        }
        VectorAnnotationCheck.register(all);
        for (const [database, catalogs] of this.catalogsByDatabase(all)) {
            const gom = this.factory.get(database);
            const plan = this.plan(database, catalogs, runtime);
            const results: EnsureResult<SchemaSpec>[] = [];
            for (const [owner, own] of plan.owners) {
                results.push(...(await this.applyOwner(gom, database, owner, own, plan, recreate)));
            }
            report.set(database, results);
        }
        return report;
    }

    /** Merges what each owner declares on the database, startup and runtime alike; a conflict fails. */
    private plan(database: string, catalogs: SchemaCatalog[], runtime: SchemaCatalog[]): Plan {
        const items = this.merged(database, catalogs);
        const owners = new Map<string, SchemaCatalog[]>();
        catalogs.forEach((it) => owners.set(it.name, [...(owners.get(it.name) ?? []), it]));
        const keysOf = (it: SchemaCatalog[]): Set<string> => new Set(it.flatMap((c) => c.items.map(inventoryKey)));
        const runtimeOnly = new Map<string, Set<string>>();
        for (const [owner, own] of owners) {
            const atStartup = keysOf(own.filter((it) => !runtime.includes(it)));
            const ensured = keysOf(own.filter((it) => runtime.includes(it)));
            runtimeOnly.set(owner, new Set([...ensured].filter((it) => !atStartup.has(it))));
        }
        return { items, owners, coOwned: coOwnedKeys(owners), runtimeOnly };
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

    /**
     * Applies one owner's items: recreated when forced, when `recreateOnStartup`, or when the owner's version changed
     * since it last applied (a first version is adopted, not acted on); an item another owner declares too is never
     * recreated by one owner's version. Items the owner applied before and no longer declares (orphans) are reported,
     * never dropped. The owner's version and inventory are recorded only when the apply succeeds, so a failed one is
     * tried again on the next enforce. `only`, from `ensure`, is the keys of the items it was given: just those are
     * applied, the version is recorded as it was found, and `recreateOnStartup` does not apply.
     */
    private async applyOwner(
        gom: StatelessGraphObjectManager,
        database: string,
        owner: string,
        catalogs: SchemaCatalog[],
        plan: Plan,
        forced: boolean,
        only?: Set<string>
    ): Promise<EnsureResult<SchemaSpec>[]> {
        const ensuring = only !== undefined;
        const { version, stored, recreateOwner, recorded }: MarkerState = await this.marker(
            gom,
            owner,
            catalogs,
            ensuring
        );
        // Every item the owner declares, as the catalogs together declare it: one another owner declares too is the
        // owner's as much as the other's.
        const byKey = new Map(plan.items.map(([spec]) => [keyOf(spec), spec]));
        const own = [...new Set(catalogs.flatMap((it) => it.items.map(keyOf)))].map((key) => byKey.get(key)!);
        const declared = own.map(inventoryKey);
        const carried = carriedItems(recorded, own);
        const stale = recorded?.stale ?? new Set<string>();
        this.reportOrphans(database, owner, recorded?.keys, new Set([...declared, ...carried]), plan.coOwned);
        const given = ensuring ? own.filter((it) => only.has(inventoryKey(it))) : own;
        if (ensuring) {
            this.logger.log(
                `Ensuring schema for owner '${owner}' on ${database}: ${given.length} runtime items, ` +
                    `${own.length} declared in all`
            );
        }
        const ordered = [...given.filter((it) => it.kind !== 'UNIQUE'), ...given.filter((it) => it.kind === 'UNIQUE')];
        const results: EnsureResult<SchemaSpec>[] = [];
        for (const spec of ordered) {
            // A runtime item marked stale missed its owner's recreate, and is recreated now.
            const key = inventoryKey(spec);
            const recreate = forced || ((recreateOwner || stale.has(key)) && !plan.coOwned.has(key));
            results.push(await this.ensureItem(gom, spec, recreate));
        }
        const runtimeOnly = plan.runtimeOnly.get(owner) ?? new Set<string>();
        const marked = staleAfter(stale, carried, runtimeOnly, new Set(given.map(inventoryKey)), {
            forced,
            recreateOwner,
            declaredByOthers: new Set(
                [...plan.owners]
                    .filter(([other]) => other !== owner)
                    .flatMap(([, it]) => it.flatMap((c) => c.items.map(inventoryKey)))
            )
        });
        await gom.persistenceManager.execute(
            gom.backend.recordSchemaMarker().spec({
                scope: owner,
                version: (ensuring ? stored : version) ?? null,
                items: inventoryEntries([...declared, ...carried], new Set([...runtimeOnly, ...carried]), marked)
            })
        );
        return results;
    }

    /**
     * The owner's version, what its marker recorded, and whether its items are recreated: on a version change since it
     * last applied (a first version is adopted, not acted on), or on `recreateOnStartup`; never while `ensuring`, which
     * reads the version only to record it as it found it.
     */
    private async marker(
        gom: StatelessGraphObjectManager,
        owner: string,
        catalogs: SchemaCatalog[],
        ensuring: boolean
    ): Promise<MarkerState> {
        const versions = [...new Set(catalogs.map((it) => it.version).filter((it): it is string => it !== undefined))];
        const version = versions.length ? versions.sort().join('|') : undefined;
        const pm = gom.persistenceManager;
        if (version !== undefined) {
            await this.ensureSingleton(gom, owner);
        }
        const stored =
            version !== undefined || ensuring
                ? await pm.maybeGetOne<string>(gom.backend.schemaMarker('version').spec({ scope: owner }))
                : undefined;
        const versionChanged = !ensuring && version !== undefined && stored != null && stored !== version;
        const recorded = readInventory(
            gom.backend.markerItems(
                await pm.maybeGetOne<string | null>(gom.backend.schemaMarker('items').spec({ scope: owner }))
            )
        );
        return {
            version,
            stored,
            recreateOwner: versionChanged || (!ensuring && this.options.recreateOnStartup === true),
            recorded
        };
    }

    /**
     * Keeps one marker per owner: drops all but the newest a race left, and backs the marker's key with a uniqueness
     * constraint, so two processes enforcing at once can't each make one.
     */
    private async ensureSingleton(gom: StatelessGraphObjectManager, owner: string): Promise<void> {
        await gom.persistenceManager.execute(gom.backend.pruneSchemaMarkers().spec({ scope: owner }));
        // The label is Drivine's, so a plain index on the key (made by hand, on Neo4j) is replaced by the constraint.
        await gom.constraints.ensure(uniquenessConstraint(MARKER_LABEL, 'scope'), undefined, true);
    }

    /** Warns of what the owner's marker recorded that is not `kept` and no other owner declares. */
    private reportOrphans(
        database: string,
        owner: string,
        stored: string[] | undefined,
        kept: Set<string>,
        coOwned: Set<string>
    ): void {
        const orphans = (stored ?? []).filter((it) => !kept.has(it) && !coOwned.has(it));
        if (orphans.length) {
            this.logger.warn(
                `Owner '${owner}' on ${database} applied ${orphans.length} item(s) it no longer declares: ` +
                    `${orphans.join(', ')}. They are left in place; drop them, or recreate, if unwanted.`
            );
        }
    }

    private async ensureItem(
        gom: StatelessGraphObjectManager,
        spec: SchemaSpec,
        recreate: boolean
    ): Promise<EnsureResult<SchemaSpec>> {
        if (spec.kind === 'UNIQUE') {
            if (recreate) {
                await gom.constraints.drop(spec);
            }
            return this.judge(
                await gom.constraints.ensure(
                    spec as UniquenessConstraintSpec,
                    this.options.violationSampleSize,
                    this.options.replaceBlockingIndex === true
                )
            );
        }
        if (recreate) {
            return gom.indexes.recreate(spec as IndexSpec);
        }
        const result = await gom.indexes.ensure(spec as IndexSpec);
        if (result.status === 'DRIFT' && this.options.recreateOnDrift) {
            return gom.indexes.recreate(spec as IndexSpec);
        }
        return this.judge(result);
    }

    private judge<S extends SchemaSpec>(result: EnsureResult<S>): EnsureResult<S> {
        if (result.status === 'DRIFT' || result.status === 'VIOLATION' || result.status === 'BLOCKED_BY_INDEX') {
            const message =
                `${result.status} for the ${result.spec.kind} on ${result.spec.label}(${result.spec.properties.join(
                    ', '
                )})` +
                (result.sample?.length ? `: keys held more than once include ${JSON.stringify(result.sample)}` : '') +
                (result.found ? `: the engine holds ${JSON.stringify(result.found)}` : '') +
                (result.index
                    ? `: index ${result.index.name} is in the way of it. Drop the index, or set replaceBlockingIndex ` +
                      `to replace it with the constraint`
                    : '');
            if (this.options.mode === 'WARN') {
                this.logger.warn(message);
            } else {
                throw new DrivineError(message);
            }
        }
        return result;
    }

    /** The catalogs that apply to each graph database. A named database that is unknown or not a graph fails. */
    private catalogsByDatabase(catalogs: SchemaCatalog[]): Map<string, SchemaCatalog[]> {
        const registry = DatabaseRegistry.getInstance();
        const graphs = registry.providers.filter((it) => GRAPH_TYPES.includes(it.type)).map((it) => it.name);
        const result = new Map<string, SchemaCatalog[]>();
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
            targets.forEach((name) => result.set(name, [...(result.get(name) ?? []), catalog]));
        }
        return result;
    }

    /**
     * The items of a database's catalogs, each once. Two declarations of one item must agree on everything portable;
     * where one of them carries engine options it wins whole (a vector index tuned in a catalog spec beside the
     * @VectorIndex that drives queries), and two that both carry different engine options conflict. A constraint's
     * `nodeIdProperty` is no part of the item: one read from a fragment, which knows it, wins over one by hand. With no
     * `database`, the conflict names none.
     */
    private merged(database: string | undefined, catalogs: SchemaCatalog[]): [SchemaSpec, SchemaCatalog][] {
        const items = new Map<string, [SchemaSpec, SchemaCatalog]>();
        for (const catalog of catalogs) {
            for (const spec of catalog.items) {
                const held = items.get(keyOf(spec));
                const chosen = held ? this.reconciled(database, held, [spec, catalog]) : spec;
                items.set(keyOf(spec), [chosen, chosen === spec ? catalog : held![1]]);
            }
        }
        return [...items.values()];
    }

    private reconciled(
        database: string | undefined,
        [held, heldBy]: [SchemaSpec, SchemaCatalog],
        [spec, by]: [SchemaSpec, SchemaCatalog]
    ): SchemaSpec {
        const optionsOf = (it: SchemaSpec): unknown[] => (it.kind === 'VECTOR' ? it.engineOptions ?? [] : []);
        const portable = (it: SchemaSpec): string =>
            JSON.stringify({ ...it, engineOptions: undefined, nodeIdProperty: undefined });
        const [a, b] = [optionsOf(held), optionsOf(spec)];
        if (portable(held) === portable(spec)) {
            if (held.kind === 'UNIQUE' && spec.kind === 'UNIQUE' && held.nodeIdProperty !== spec.nodeIdProperty) {
                return held.nodeIdProperty !== undefined ? held : spec;
            }
            if (!b.length || JSON.stringify(a) === JSON.stringify(b)) {
                return held;
            }
            if (!a.length) {
                return spec;
            }
        }
        throw new DrivineError(
            `Two schema catalogs declare the ${spec.kind} on ${spec.label}(${spec.properties.join(', ')}) ` +
                (database ? `on ${database} ` : '') +
                `differently, ` +
                (heldBy.name === by.name
                    ? `both owned by '${by.name}'.`
                    : `owned by '${heldBy.name}' and '${by.name}'.`)
        );
    }
}
