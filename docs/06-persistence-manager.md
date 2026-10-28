## PersistenceManager

The low-level API: you write the statement, Drivine runs it, maps the rows and manages the transaction.

```typescript
const people = await pm.query(new QuerySpecification<Person>('MATCH (p:Person) RETURN properties(p)').transform(Person));
const person = await pm.getOne(spec);         // exactly one, or it throws
const maybe = await pm.maybeGetOne(spec);     // one or undefined
await pm.execute(spec);                       // no results
```

### QuerySpecification

```typescript
new QuerySpecification<Person>()
    .withStatement('MATCH (p:Person {city: $city}) RETURN properties(p)')
    .bind({ city: 'Sydney' })   // named parameters, or a list for $1, $2, …
    .transform(Person)          // map each row to a class
    .filter((it) => it.age >= 18)
    .map((it) => it.firstName)
    .skip(10)
    .limit(10);
```

### Transactions

```typescript
@Injectable()
export class UserService {
    @Transactional()   // join the current transaction, or start one; commit on success, roll back on a throw
    async register(person: Person): Promise<void> {
        await this.people.create(person);
        await this.audit.record(person);
    }
}
```

A transaction spans every database the method touches. A method called outside a request (a job, `onModuleInit`, a
script) starts its own. To run a block in one transaction without a decorator, use
`inDrivineContext().withTransaction().run(async () => …)`; `withTransaction({ rollback: true })` rolls it back
at the end, as tests do.

### Cursors

Stream a large result without holding it in memory:

```typescript
const cursor = await pm.openCursor(new CursorSpecification<Route>().withStatement(statement).batchSize(100).transform(Route));
for await (const route of cursor) {
    // …
}
cursor.asStream().pipe(destination);   // or as a Node stream
```

### Statements in Files

Keep statements in files beside your code, and inject them (Nest), or read them with `cypherStatement(readFileSync(path, 'utf8'))`:

```typescript
constructor(
    @InjectCypher(__dirname, 'routesBetween') readonly routesBetween: CypherStatement,
    @InjectSql(__dirname, 'report') readonly report: SqlStatement
) {}
```
