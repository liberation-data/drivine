# Persistence manager

The library contains a persistence manager interface:

```typescript
export interface PersistenceManager {

    query<T>(spec: QuerySpecification<T>): Promise<T[]>;

    getOne<T>(spec: QuerySpecification<T>): Promise<T>;

    maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined>;

    openCursor<T>(spec: QuerySpecification<T>): Promise<Cursor<T>>;

}
```

It is the job of the persistence manager to obtain a connection, using database details that are registered when the library is boot-strapped, or at runtime. It will use pooling if this entails a performance benefit on the given database platform. There are two implementations of the interface - a transactional version and a non-transactional version.
