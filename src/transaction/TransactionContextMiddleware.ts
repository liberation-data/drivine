import { Injectable, NestMiddleware } from '@nestjs/common';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as express from 'express';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { inDrivineContext } from '@/context/DrivineContext';

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
