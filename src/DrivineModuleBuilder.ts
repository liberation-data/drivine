import { Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/DrivineModule';
import { cypherInjections, fileContentInjections, sqlInjections } from '@/DrivineInjectionDecorators';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMiddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { cypherStatement, CypherStatement, sqlStatement, SqlStatement } from '@/query/Statement';
import { Cacheable } from 'typescript-cacheable';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineLogger } from '@/logger';

const fs = require('fs');

export class DrivineModuleBuilder {
    private logger = new DrivineLogger(DrivineModuleBuilder.name);
    private _providers: Provider[];

    constructor(readonly options: DrivineModuleOptions) {}

    get providers(): Provider[] {
        if (!this._providers) {
            this._providers = [
                ...this.infrastructureProviders(),
                ...this.persistenceManagers(),
                ...this.graphObjectManagers(),
                ...this.cypherStatementProviders(),
                ...this.sqlStatementProviders(),
                ...this.fileResourceProviders()
            ];
        }
        return this._providers;
    }

    infrastructureProviders(): Provider[] {
        return [
            <Provider>{ provide: DatabaseRegistry, useFactory: () => DatabaseRegistry.getInstance() },
            <Provider>{ provide: TransactionContextHolder, useFactory: () => TransactionContextHolder.getInstance() },
            PersistenceManagerFactory,
            GraphObjectManagerFactory,
            TransactionContextMiddleware,
            TransactionalPersistenceManager,
            NonTransactionalPersistenceManager
        ];
    }

    persistenceManagers(): Provider[] {
        const providers = DatabaseRegistry.getInstance().providers.map((provider) => provider.name);
        return providers.map((database) => {
            return <Provider>{
                provide: `PersistenceManager:${database}`,
                inject: [PersistenceManagerFactory],
                useFactory: (persistenceManagerFactory): PersistenceManager => {
                    return persistenceManagerFactory.get(database);
                }
            };
        });
    }

    /**
     * An object manager for each graph database. Postgres is plain SQL, and has none.
     */
    graphObjectManagers(): Provider[] {
        const graphTypes = [DatabaseType.NEO4J, DatabaseType.MEMGRAPH, DatabaseType.FALKORDB];
        const registry = DatabaseRegistry.getInstance();
        const names = registry.providers.filter((it) => graphTypes.includes(it.type)).map((it) => it.name);
        const defaultProvider = registry.connectionProvider();
        if (defaultProvider && graphTypes.includes(defaultProvider.type) && !names.includes('default')) {
            names.push('default');
        }
        return names.map((database) => {
            return <Provider>{
                provide: `GraphObjectManager:${database}`,
                inject: [GraphObjectManagerFactory],
                useFactory: (factory: GraphObjectManagerFactory): StatelessGraphObjectManager => factory.get(database)
            };
        });
    }

    fileResourceProviders(): Provider[] {
        return fileContentInjections.map((path) => {
            const token = `FileContents:${path}`;
            return <Provider>{
                provide: token,
                useFactory: (): string => {
                    return this.fileContents(path);
                }
            };
        });
    }

    cypherStatementProviders(): Provider[] {
        return cypherInjections.map((path) => {
            const token = `CYPHER:${path}`;
            return <Provider>{
                provide: token,
                useFactory: (): CypherStatement => cypherStatement(this.fileContents(path))
            };
        });
    }

    sqlStatementProviders(): Provider[] {
        return sqlInjections.map((path) => {
            const token = `SQL:${path}`;
            return <Provider>{
                provide: token,
                useFactory: (): SqlStatement => sqlStatement(this.fileContents(path))
            };
        });
    }

    private fileContents(path: string): string {
        return fs.readFileSync(path, { encoding: 'UTF8' });
    }
}
