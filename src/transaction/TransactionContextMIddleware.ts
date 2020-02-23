import { Injectable, NestMiddleware } from '@nestjs/common';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as express from 'express';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

@Injectable()
export class TransactionContextMiddleware implements NestMiddleware {
    constructor(
        readonly transactionContextHolder: TransactionContextHolder,
        readonly databaseRegistry: DatabaseRegistry
    ) {}

    use(req: express.Request, res: express.Response, next: express.NextFunction): any {
        this.transactionContextHolder.namespace.bindEmitter(req);
        this.transactionContextHolder.namespace.bindEmitter(res);
        this.transactionContextHolder.namespace.bind(next);
        return this.transactionContextHolder.namespace.run(() => {
            this.transactionContextHolder.databaseRegistry = this.databaseRegistry;
            res.on('close', () => {
                if (!res.finished) {
                    const transaction = <Transaction>(
                        this.transactionContextHolder.namespace.get(TransactionContextKeys.TRANSACTION)
                    );
                    transaction.markAsRollback();
                }
            });

            return next();
        });
    }
}
