import { Injectable, NestMiddleware } from '@nestjs/common';
import { TransactionContextHolder } from '@/transaction';
import * as express from 'express';
import { DatabaseRegistry } from '@/connection';
import { inDrivineContext } from '@/context';

@Injectable()
export class TransactionContextMiddleware implements NestMiddleware {
    constructor(readonly transactionContext: TransactionContextHolder, readonly databaseRegistry: DatabaseRegistry) {}

    async use(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> {
        return inDrivineContext().run(async () => {
            this.transactionContext.databaseRegistry = this.databaseRegistry;
            return Promise.resolve(next());
        });
    }
}
