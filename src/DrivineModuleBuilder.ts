import { Logger, Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/DrivineModule';
import {
    persistenceManagerInjections,
    cypherInjections,
    fileContentInjections,
    sqlInjections
} from '@/DrivineInjectionDecorators';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMiddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { Statement } from '@/query/Statement';
import { QueryLanguage } from '@/query/QueryLanguage';
import { Cacheable } from 'typescript-cacheable';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { PersistenceManager } from '@/manager/PersistenceManager';

const fs = require('fs');

export class DrivineModuleBuilder {
    private logger = new Logger(DrivineModuleBuilder.name);
    private _providers: Provider[];

    constructor(readonly options: DrivineModuleOptions) {}

    get providers(): Provider[] {
        if (!this._providers) {
            this._providers = [
                ...this.infrastructureProviders(),
                ...this.persistenceManagers(),
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

    persistenceManagers(): Provider[] {
        return persistenceManagerInjections.map(database => {
            return <Provider>{
                provide: `PersistenceManager:${database}`,
                inject: [PersistenceManagerFactory],
                useFactory: (persistenceManagerFactory): PersistenceManager => {
                    return persistenceManagerFactory.buildOrResolve(database);
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
