import { Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/./drivine-module';
import {
    cypherInjections,
    fileContentInjections,
    persistenceManagerInjections,
    sqlInjections
} from '@/./drivine-injection-decorators';
import { TransactionContextHolder } from '@/transaction/transaction-context-holder';
import { TransactionContextMiddleware } from '@/transaction';
import { TransactionalPersistenceManager } from '@/manager';
import { NonTransactionalPersistenceManager } from '@/manager';
import { cypherStatement, CypherStatement, sqlStatement, SqlStatement } from '@/query/Statement';
import { Cacheable } from 'typescript-cacheable';
import { DatabaseRegistry } from '@/connection';
import { PersistenceManagerFactory } from '@/manager';
import { PersistenceManager } from '@/manager';
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
