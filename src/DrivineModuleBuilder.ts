import { Logger, Provider } from '@nestjs/common';
import { DrivineModuleOptions } from '@/DrivineModule';
import { cypherInjections, fileContentInjections, sqlInjections } from '@/DrivineInjectionDecorators';
import * as assert from 'assert';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMIddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { Statement } from '@/query/Statement';
import { QueryLanguage } from '@/query/QueryLanguage';
import { Cacheable } from 'typescript-cacheable';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

const fs = require('fs');

export class DrivineModuleBuilder {
    private logger = new Logger(DrivineModuleBuilder.name);
    private _providers: Provider[];

    constructor(readonly options: DrivineModuleOptions) {
        assert(
            options && options.connectionProviders && options.connectionProviders.length > 0,
            `At least one ConnectionProvider is required. Consult documentation for advice on creation`
        );
        if (this.options.connectionProviders.length > 1) {
            this.logger.warn(`This version of Drivine supports only a single database. 
                Additional connection providers will be ignored`);
        }
    }

    get providers(): Provider[] {
        if (!this._providers) {
            this._providers = [
                ...this.providerAssembly(),
                ...this.cypherStatementProviders(),
                ...this.sqlStatementProviders(),
                ...this.fileResourceProviders()
            ];
        }
        return this._providers;
    }

    providerAssembly(): Provider[] {
        return [
            <Provider>{
                provide: 'ConnectionProvider',
                useFactory: () => this.options.connectionProviders[0]
            },
            <Provider>{
                provide: DatabaseRegistry,
                useFactory: () => DatabaseRegistry.getInstance()
            },
            TransactionContextHolder,
            TransactionContextMiddleware,
            TransactionalPersistenceManager,
            NonTransactionalPersistenceManager
        ];
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
