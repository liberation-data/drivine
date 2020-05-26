# Repositories

Repositories are a common pattern of structuring object-oriented code, in order to adhere to single responsibility principle (SRP). They logically group database operations for a particular type of entity.

Simply by using composition, the PersistenceManager can be used to implement repositories. Here is an example:

```typescript
@Injectable()
export class HealthRepository {

    constructor(@InjectPersistenceManager() readonly persistenceManager: NonTransactionalPersistenceManager) {}

    async countAllVertices(): Promise<number> {

        return this.persistenceManager.getOne<number>(
            new QuerySpecification(`match (n) return count(n) as count`)
                .map((it) => it.count);
        );
    }
}
```