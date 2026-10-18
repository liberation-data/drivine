import { Injectable } from '@nestjs/common';
import { CypherBackend } from '@/backend/CypherBackend';
import { cypherGrammarFor } from '@/backend/CypherGrammar';
import { ModelRegistry } from '@/model/ModelRegistry';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';

/**
 * Makes one object manager per database. Each runs through the database's delegating persistence manager, so it
 * takes part in a `@Transactional` method's transaction when there is one.
 */
@Injectable()
export class GraphObjectManagerFactory {
    readonly registry = new ModelRegistry();
    private readonly managers = new Map<string, StatelessGraphObjectManager>();

    constructor(readonly persistenceManagerFactory: PersistenceManagerFactory) {}

    get(database: string = 'default'): StatelessGraphObjectManager {
        let manager = this.managers.get(database);
        if (!manager) {
            const persistenceManager = this.persistenceManagerFactory.get(database);
            manager = new StatelessGraphObjectManager(
                persistenceManager,
                new CypherBackend(cypherGrammarFor(persistenceManager.type)),
                this.registry
            );
            this.managers.set(database, manager);
        }
        return manager;
    }
}
