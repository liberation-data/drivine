import { Logger, MiddlewareConsumer, NestModule, Provider } from '@nestjs/common';
import { DrivineModule, DrivineModuleOptions } from '@/DrivineModule';
import { Cacheable } from 'typescript-cacheable';
import { fileContentInjections } from '@/DrivineInjectionDecorators';
import * as assert from 'assert';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextMiddleware } from '@/transaction/TransactionContextMIddleware';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';

const fs = require('fs');

export class DrivineModuleBuilder implements NestModule {

    private logger = new Logger(DrivineModuleBuilder.name);
    private _providers: Provider[];

    public constructor(public readonly options: DrivineModuleOptions) {
        assert(options && options.connectionProviders && options.connectionProviders.length > 0,
            `At least one ConnectionProvider is required. Consult documentation for advice on creation`);
        if (this.options.connectionProviders.length > 1) {
            this.logger.warn(`This version of Drivine supports only a single database. 
                Additional connection providers will be ignored`);
        }
    }

    public configure(consumer: MiddlewareConsumer): MiddlewareConsumer | void {
        consumer.apply(TransactionContextMiddleware).forRoutes('**/**');
    }

    public build(): DrivineModule {
        return Object.assign(new DrivineModule(), {
            module: DrivineModule,
            providers: this.providers,
            exports: this.providers
        });
    }

    public get providers(): Provider[] {
        if (!this._providers) {
            this._providers = [...this.providerAssembly(), ...this.fileResourceProviders()]
        }
        return this._providers;
    }

    public providerAssembly(): Provider[] {
        return [
            <Provider>{
                provide: 'ConnectionProvider',
                useFactory: () => this.options.connectionProviders[0]
            },
            TransactionContextHolder,
            TransactionContextMiddleware,
            TransactionalPersistenceManager,
            NonTransactionalPersistenceManager
        ];
    }

    public fileResourceProviders(): Provider[] {
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

    @Cacheable()
    private fileContents(path: string): string {
        return fs.readFileSync(path, { encoding: 'UTF8' });
    }

}
