import { Injectable, NestMiddleware } from '@nestjs/common';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as express from 'express';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { inDrivineContext } from '@/context/DrivineContext';

@Injectable()
export class TransactionContextMiddleware implements NestMiddleware {
    constructor(
        readonly transactionContext: TransactionContextHolder,
        readonly databaseRegistry: DatabaseRegistry
    ) {}

    use(req: express.Request, res: express.Response, next: express.NextFunction): any {
        return inDrivineContext().run(async () => {
            this.transactionContext.databaseRegistry = this.databaseRegistry;
            res.on('close', () => {
                if (!res.finished) {
                    const transaction = this.transactionContext.currentTransaction;
                    if (transaction) {
                        transaction.markAsRollback();
                    }
                }
            });
            return Promise.resolve(next());
        });
    }
}
