import { backendFor } from '@/backend/Backends';
import { ModelRegistry } from '@/model/ModelRegistry';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { IndexAdvicePolicy } from '@/dsl/QueryIndexAdvisor';

/** How the managers a factory makes treat queries: DrivineModuleOptions' `query`. */
export interface QueryOptions {
    /** What an ordered query with no range index to seek into does, on every manager. Defaults to WARN. */
    indexAdvice?: IndexAdvicePolicy;
}

/**
 * Makes one object manager per database. Each runs through the database's delegating persistence manager, so it
 * takes part in a `@Transactional` method's transaction when there is one.
 */
export class GraphObjectManagerFactory {
    readonly registry = new ModelRegistry();
    private readonly managers = new Map<string, StatelessGraphObjectManager>();

    constructor(
        readonly persistenceManagerFactory: PersistenceManagerFactory,
        readonly options: QueryOptions = {}
    ) {}

    get(database: string = 'default'): StatelessGraphObjectManager {
        let manager = this.managers.get(database);
        if (!manager) {
            const persistenceManager = this.persistenceManagerFactory.get(database);
            manager = new StatelessGraphObjectManager(
                persistenceManager,
                backendFor(
                    persistenceManager.type,
                    this.persistenceManagerFactory.registry.connectionProvider(database)?.graphName
                ),
                this.registry
            );
            manager.indexAdvice = this.options.indexAdvice ?? manager.indexAdvice;
            this.managers.set(database, manager);
        }
        return manager;
    }
}
