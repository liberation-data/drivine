import { CATALOG_KINDS } from '@/backend/sql/SqlCatalog';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import {
    EnsureResult,
    IndexSpec,
    itemName,
    uniquenessConstraint,
    UniquenessConstraintSpec
} from '@/schema/SchemaSpecs';

export interface SchemaOptions {
    catalogs: SchemaCatalog[];
    /** FAIL_FAST (default) throws on drift or a violation; WARN logs it and carries on. */
    mode?: 'FAIL_FAST' | 'WARN';
    /** Destructive: replace an item whose shape drifted, rather than reporting it. */
    recreateOnDrift?: boolean;
    /** Destructive: drop and make every declared item on every enforce. */
    recreateOnStartup?: boolean;
    /** How many values held more than once a constraint violation reports; 0 skips the check. Defaults to 10. */
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

/**
 * Holds catalogs of indexes and constraints on the databases they apply to. `enforce` is idempotent: it makes what is
 * missing, and recreates a catalog's items when its version changed. `recreateAll` drops and makes everything.
 */
export class SchemaManager {
    private readonly logger = new DrivineLogger(SchemaManager.name);

    constructor(
        private readonly factory: GraphObjectManagerFactory,
        private readonly options: SchemaOptions
    ) {}

    /** Ensures every catalog on its databases: indexes before constraints. Returns the results, by database. */
    async enforce(): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        return this.apply(false);
    }

    /** Drops and makes every declared item. Destructive. */
    async recreateAll(): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        return this.apply(true);
    }

    private async apply(recreate: boolean): Promise<Map<string, EnsureResult<SchemaSpec>[]>> {
        const report = new Map<string, EnsureResult<SchemaSpec>[]>();
        for (const [database, catalogs] of this.catalogsByDatabase()) {
            const gom = this.factory.get(database);
            const items = this.merged(database, catalogs);
            const owners = new Map<string, SchemaCatalog[]>();
            catalogs.forEach((it) => owners.set(it.name, [...(owners.get(it.name) ?? []), it]));
            const coOwned = coOwnedKeys(owners);
            const results: EnsureResult<SchemaSpec>[] = [];
            for (const [owner, own] of owners) {
                results.push(...(await this.applyOwner(gom, database, owner, own, items, coOwned, recreate)));
            }
            report.set(database, results);
        }
        return report;
    }

    /**
     * Applies one owner's items: recreated when forced, when `recreateOnStartup`, or when the owner's version changed
     * since it last applied (a first version is adopted, not acted on); an item another owner declares too is never
     * recreated by one owner's version. Items the owner applied before and no longer declares (orphans) are reported,
     * never dropped. The owner's version and inventory are recorded only when the apply succeeds, so a failed one is
     * tried again on the next enforce.
     */
    private async applyOwner(
        gom: StatelessGraphObjectManager,
        database: string,
        owner: string,
        catalogs: SchemaCatalog[],
        items: [SchemaSpec, SchemaCatalog][],
        coOwned: Set<string>,
        forced: boolean
    ): Promise<EnsureResult<SchemaSpec>[]> {
        const versions = [...new Set(catalogs.map((it) => it.version).filter((it): it is string => it !== undefined))];
        const version = versions.length ? versions.sort().join('|') : undefined;
        const pm = gom.persistenceManager;
        if (version !== undefined) {
            await this.ensureSingleton(gom, owner);
        }
        const stored =
            version !== undefined
                ? await pm.maybeGetOne<string>(gom.backend.schemaMarker('version').spec({ scope: owner }))
                : undefined;
        const versionChanged = version !== undefined && stored != null && stored !== version;
        // Every item the owner declares, as the catalogs together declare it: one another owner declares too is the
        // owner's as much as the other's.
        const byKey = new Map(items.map(([spec]) => [keyOf(spec), spec]));
        const own = [...new Set(catalogs.flatMap((it) => it.items.map(keyOf)))].map((key) => byKey.get(key)!);
        const declared = own.map(inventoryKey);
        await this.reportOrphans(gom, database, owner, declared, coOwned);
        const ordered = [...own.filter((it) => it.kind !== 'UNIQUE'), ...own.filter((it) => it.kind === 'UNIQUE')];
        const results: EnsureResult<SchemaSpec>[] = [];
        for (const spec of ordered) {
            const recreate =
                forced ||
                ((this.options.recreateOnStartup === true || versionChanged) && !coOwned.has(inventoryKey(spec)));
            results.push(await this.ensure(gom, spec, recreate));
        }
        await pm.execute(
            gom.backend
                .recordSchemaMarker()
                .spec({ scope: owner, version: version ?? null, items: declared.join('\n') })
        );
        return results;
    }

    /**
     * Keeps one marker per owner: drops all but the newest a race left, and backs the marker's key with a uniqueness
     * constraint, so two processes enforcing at once can't each make one.
     */
    private async ensureSingleton(gom: StatelessGraphObjectManager, owner: string): Promise<void> {
        await gom.persistenceManager.execute(gom.backend.pruneSchemaMarkers().spec({ scope: owner }));
        await gom.constraints.ensure(uniquenessConstraint(MARKER_LABEL, 'scope'));
    }

    private async reportOrphans(
        gom: StatelessGraphObjectManager,
        database: string,
        owner: string,
        declared: string[],
        coOwned: Set<string>
    ): Promise<void> {
        const stored = gom.backend.markerItems(
            await gom.persistenceManager.maybeGetOne<string | null>(
                gom.backend.schemaMarker('items').spec({ scope: owner })
            )
        );
        if (stored === undefined) {
            return;
        }
        const orphans = stored.filter((it) => !declared.includes(it) && !coOwned.has(it));
        if (orphans.length) {
            this.logger.warn(
                `Owner '${owner}' on ${database} applied ${orphans.length} item(s) it no longer declares: ` +
                    `${orphans.join(', ')}. They are left in place; drop them, or recreate, if unwanted.`
            );
        }
    }

    private async ensure(
        gom: StatelessGraphObjectManager,
        spec: SchemaSpec,
        recreate: boolean
    ): Promise<EnsureResult<SchemaSpec>> {
        if (spec.kind === 'UNIQUE') {
            if (recreate) {
                await gom.constraints.drop(spec);
            }
            return this.judge(
                await gom.constraints.ensure(spec as UniquenessConstraintSpec, this.options.violationSampleSize)
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
        if (result.status === 'DRIFT' || result.status === 'VIOLATION') {
            const message =
                `${result.status} for the ${result.spec.kind} on ${result.spec.label}(${result.spec.properties.join(
                    ', '
                )})` +
                (result.sample ? `: values held more than once include ${JSON.stringify(result.sample)}` : '') +
                (result.found ? `: the engine holds ${JSON.stringify(result.found)}` : '');
            if (this.options.mode === 'WARN') {
                this.logger.warn(message);
            } else {
                throw new DrivineError(message);
            }
        }
        return result;
    }

    /** The catalogs that apply to each graph database. A named database that is unknown or not a graph fails. */
    private catalogsByDatabase(): Map<string, SchemaCatalog[]> {
        const registry = DatabaseRegistry.getInstance();
        const graphs = registry.providers.filter((it) => GRAPH_TYPES.includes(it.type)).map((it) => it.name);
        const result = new Map<string, SchemaCatalog[]>();
        for (const catalog of this.options.catalogs) {
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
     * @VectorIndex that drives queries), and two that both carry different engine options conflict.
     */
    private merged(database: string, catalogs: SchemaCatalog[]): [SchemaSpec, SchemaCatalog][] {
        const items = new Map<string, [SchemaSpec, SchemaCatalog]>();
        for (const catalog of catalogs) {
            for (const spec of catalog.items) {
                const held = items.get(keyOf(spec));
                const chosen = held ? this.reconciled(database, held[0], spec) : spec;
                items.set(keyOf(spec), [chosen, chosen === spec ? catalog : held![1]]);
            }
        }
        return [...items.values()];
    }

    private reconciled(database: string, held: SchemaSpec, spec: SchemaSpec): SchemaSpec {
        const optionsOf = (it: SchemaSpec): unknown[] => (it.kind === 'VECTOR' ? it.engineOptions ?? [] : []);
        const portable = (it: SchemaSpec): string => JSON.stringify({ ...it, engineOptions: undefined });
        const [a, b] = [optionsOf(held), optionsOf(spec)];
        if (portable(held) === portable(spec)) {
            if (!b.length || JSON.stringify(a) === JSON.stringify(b)) {
                return held;
            }
            if (!a.length) {
                return spec;
            }
        }
        throw new DrivineError(
            `Two schema catalogs declare the ${spec.kind} on ${spec.label}(${spec.properties.join(', ')}) on ` +
                `${database} differently.`
        );
    }
}
