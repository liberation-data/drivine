import { Logger, Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/DrivineModule';
import {
    cypherInjections,
    fileContentInjections,
    nonTransactionalPersistenceManagerInjections,
    sqlInjections,
    transactionalPersistenceManagerInjections
} from '@/DrivineInjectionDecorators';
import * as assert from 'assert';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMIddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { Statement } from '@/query/Statement';
import { QueryLanguage } from '@/query/QueryLanguage';
import { Cacheable } from 'typescript-cacheable';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';

const fs = require('fs');

export class DrivineModuleBuilder {
    private logger = new Logger(DrivineModuleBuilder.name);
    private _providers: Provider[];

    constructor(readonly options: DrivineModuleOptions) {
        assert(
            options && options.connectionProviders && options.connectionProviders.length > 0,
            `At least one ConnectionProvider is required. Consult documentation for advice on creation`
        );
    }

    get providers(): Provider[] {
        if (!this._providers) {
            this._providers = [
                ...this.infrastructureProviders(),
                ...this.transactionalPersistenceManagers(),
                ...this.nonTransactionalPersistenceManagers(),
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
            TransactionContextHolder,
            TransactionContextMiddleware,
            TransactionalPersistenceManager,
            NonTransactionalPersistenceManager
        ];
    }

    transactionalPersistenceManagers(): Provider[] {
        return transactionalPersistenceManagerInjections.map(database => {
            const token = `TransactionalPersistenceManager:${database}`;
            return <Provider>{
                provide: token,
                inject: [PersistenceManagerFactory],
                useFactory: (persistenceManagerFactory): PersistenceManager => {
                    return persistenceManagerFactory.buildOrResolve(PersistenceManagerType.TRANSACTIONAL, database);
                }
            };
        });
    }

    nonTransactionalPersistenceManagers(): Provider[] {
        return nonTransactionalPersistenceManagerInjections.map(database => {
            const token = `NonTransactionalPersistenceManager:${database}`;
            return <Provider>{
                provide: token,
                inject: [PersistenceManagerFactory],
                useFactory: (persistenceManagerFactory): PersistenceManager => {
                    return persistenceManagerFactory.buildOrResolve(PersistenceManagerType.NON_TRANSACTIONAL, database);
                }
            };
        });
    }

    fileResourceProviders(): Provider[] {
        return fileContentInjections.map(path => {
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
        return cypherInjections.map(path => {
            const token = `CYPHER:${path}`;
            return <Provider>{
                provide: token,
                useFactory: (): any => {
                    return <Statement>{
                        text: this.fileContents(path),
                        language: QueryLanguage.CYPHER
                    };
                }
            };
        });
    }

    sqlStatementProviders(): Provider[] {
        return sqlInjections.map(path => {
            const token = `SQL:${path}`;
            return <Provider>{
                provide: token,
                useFactory: (): any => {
                    return <Statement>{
                        text: this.fileContents(path),
                        language: QueryLanguage.SQL
                    };
                }
            };
        });
    }

    @Cacheable()
    private fileContents(path: string): string {
        return fs.readFileSync(path, { encoding: 'UTF8' });
    }
}
