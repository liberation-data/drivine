import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import { EnsureResult, IndexSpec, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';

export interface SchemaOptions {
    catalogs: SchemaCatalog[];
    /** FAIL_FAST (default) throws on drift or a violation; WARN logs it and carries on. */
    mode?: 'FAIL_FAST' | 'WARN';
    /** Destructive: replace an item whose shape drifted, rather than reporting it. */
    recreateOnDrift?: boolean;
    /** Whether DrivineModule enforces the schema at startup. Defaults to true. */
    enabled?: boolean;
}

const GRAPH_TYPES = [DatabaseType.NEO4J, DatabaseType.MEMGRAPH, DatabaseType.FALKORDB];

const keyOf = (spec: SchemaSpec): string => `${spec.kind}:${spec.label}:${[...spec.properties].sort().join(',')}`;

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
            const stale = recreate ? new Set(catalogs) : await this.versionChanged(gom, catalogs);
            const results: EnsureResult<SchemaSpec>[] = [];
            const items = this.merged(database, catalogs);
            const ordered = [
                ...items.filter(([spec]) => spec.kind !== 'UNIQUE'),
                ...items.filter(([spec]) => spec.kind === 'UNIQUE')
            ];
            for (const [spec, catalog] of ordered) {
                results.push(await this.ensure(gom, spec, stale.has(catalog)));
            }
            await this.recordVersions(gom, catalogs);
            report.set(database, results);
        }
        return report;
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
            return this.judge(await gom.constraints.ensure(spec as UniquenessConstraintSpec));
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

    /** The items of a database's catalogs, identical ones once. Two that differ over the same item fail. */
    private merged(database: string, catalogs: SchemaCatalog[]): [SchemaSpec, SchemaCatalog][] {
        const items = new Map<string, [SchemaSpec, SchemaCatalog]>();
        for (const catalog of catalogs) {
            for (const spec of catalog.items) {
                const held = items.get(keyOf(spec));
                if (held && JSON.stringify(held[0]) !== JSON.stringify(spec)) {
                    throw new DrivineError(
                        `Two schema catalogs declare the ${spec.kind} on ${spec.label}(${spec.properties.join(
                            ', '
                        )}) on ` + `${database} differently.`
                    );
                }
                items.set(keyOf(spec), held ?? [spec, catalog]);
            }
        }
        return [...items.values()];
    }

    /** The versioned catalogs whose recorded version differs from theirs. A first version is adopted, not acted on. */
    private async versionChanged(
        gom: StatelessGraphObjectManager,
        catalogs: SchemaCatalog[]
    ): Promise<Set<SchemaCatalog>> {
        const changed = new Set<SchemaCatalog>();
        for (const catalog of catalogs.filter((it) => it.version !== undefined)) {
            const recorded = await gom.persistenceManager.maybeGetOne<string>(
                gom.backend.schemaVersion().spec({ name: catalog.name })
            );
            if (recorded != null && recorded !== catalog.version) {
                changed.add(catalog);
            }
        }
        return changed;
    }

    private async recordVersions(gom: StatelessGraphObjectManager, catalogs: SchemaCatalog[]): Promise<void> {
        for (const catalog of catalogs.filter((it) => it.version !== undefined)) {
            await gom.persistenceManager.execute(
                gom.backend.recordSchemaVersion().spec({ name: catalog.name, version: catalog.version! })
            );
        }
    }
}
