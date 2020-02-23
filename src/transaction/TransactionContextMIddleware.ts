import { Injectable, NestMiddleware } from '@nestjs/common';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as express from 'express';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { InjectConnectionProvider } from '@/DrivineInjectionDecorators';

@Injectable()
export class TransactionContextMiddleware implements NestMiddleware {
    constructor(
        readonly localStorage: TransactionContextHolder,
        @InjectConnectionProvider() readonly connectionProvider: ConnectionProvider
    ) {}

    use(req: express.Request, res: express.Response, next: express.NextFunction): any {
        TransactionContextHolder.instance.bindEmitter(req);
        TransactionContextHolder.instance.bindEmitter(res);
        TransactionContextHolder.instance.bind(next);
        return TransactionContextHolder.instance.run(() => {
            this.localStorage.connectionProvider = this.connectionProvider;
            res.on('close', () => {
                if (!res.finished) {
                    const transaction = <Transaction>(
                        TransactionContextHolder.instance.get(TransactionContextKeys.TRANSACTION)
                    );
                    transaction.markAsRollback();
                }
            });

            return next();
        });
    }
}
