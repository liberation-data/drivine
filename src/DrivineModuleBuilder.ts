import { Logger, Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/DrivineModule';
import {
    cypherInjections,
    fileContentInjections,
    persistenceManagerInjections,
    sqlInjections
} from '@/DrivineInjectionDecorators';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMiddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { cypherStatement, CypherStatement, sqlStatement, SqlStatement } from '@/query/Statement';
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
            TransactionContextMiddleware,
            TransactionalPersistenceManager,
            NonTransactionalPersistenceManager
        ];
    }

    persistenceManagers(): Provider[] {
        return persistenceManagerInjections.map((database) => {
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

    @Cacheable()
    private fileContents(path: string): string {
        return fs.readFileSync(path, { encoding: 'UTF8' });
    }
}
