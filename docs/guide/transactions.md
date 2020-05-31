# Transactions

Just as repositories can be composed using a PersistenceManager, so services can be composed using repositories. But what about transactions? When analyzing the functional and non-functional requirements of a system, transactions fall under what is known as a cross-cutting concern. They are called as such because they’re required in many places. In other words, they cut across many modules.

Such requirements don’t fit well with pure object-oriented programming because they can compromise efforts to adhere to SRP. Imagine implementing a service method that is all about transferring funds, and then adding transaction behaviors. Now add security. And then audit. Before too long, the class that neatly represented a single role has become a mess.

Fortunately, transactional concerns can easily be modularized in TypeScript using Decorators, a kind of higher-order function that wraps the original function, in our case with transactional concerns applied.

In the context of a web application we register a middleware that tracks transaction information for a given request:

```typescript
export class AppModule implements NestModule {
    public configure(consumer: MiddlewareConsumer): any {
        consumer.apply(TransactionContextMiddleware).forRoutes('**/**');
    }
}
```

And then simply apply the Transactional() decorator to any transactional methods.

```typescript
@Injectable()
export class RouteRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'routesBetween') readonly routesBetween: string
    ) {}

    @Transactional()
    async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }
}
```

By default the decorator will start a new transaction if one does not exist. Otherwise it will participate in an existing transaction. When the outermost transactional method completes, the entire stack will be committed. Meanwhile, if an error is thrown, the transaction is rolled back.

We can now compose transactional services from one or more repositories as follows:

```typescript
export class TransferService {
    constructor(readonly accountRepo: AccountRepository) {}

    @Transactional()
    async transfer(sourceId: string, targetId: string, amount: number): Promise<void> {
        const sourceAccount = await this.accountRepo.findById(sourceId);
        sourceAccount.deductFunds(amount);
        await this.accountRepo.update(sourceAccount);

        // Throws Error! Invalid Id!
        const targetAccount = await this.accountRepo.findById(targetId);
        targetAccount.depositFunds(amount);
        await this.accountRepo.update(targetRepo);
    }
}
```

In the above example, if the targetId is invalid, all data operations are rolled back. Otherwise a commit is performed when the outermost transactional method completes. Note that we used normal error handling - implementing boiler-plate code was not required and code clearly represented a single task.
