# Testing

Drivine supports the creation of integration and end-to-end tests that run inside a roll-back transaction. This is useful when testing against shared data and/or when testing transactional database operations in parallel. Within the test it is possible to read and make assertions upon uncommitted data, after which it is rolled back, restoring the database to a clean state. Here's how:

```typescript
it('should return the fastest route between start and dest ', async () => {
    return inDrivineContext().withTransaction({rollback: true}).run(async () => {
        const result = await request(app.getHttpServer())
            .get('/routes/between/Pigalle/NYC')
            .expect(HttpStatus.OK);

        expect(result.body[0].travelTime).toEqual(8.5);
    });
});
```

In the event of trouble-shooting, if we would like to explore what actually happened in the database, we can use:

```typescript
return inDrivineContext().withTransaction({rollback: false}).run(async () => {
    // Now the transaction will be committed.
});
```
                
# Bootstrapping All Tests

Avoid repetition. It is possible to run all tests for a given spec with Drivine, by adding RunWithDrivine() at the top of the spec:

```typescript 
RunWithDrivine();
describe('RouteRepository', () => {
    let repo: RouteRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
            providers: [RouteRepository],
            controllers: []
        }).compile();
        repo = app.get(RouteRepository);
    });

    it('should find routes between two cities, ordered by most expedient', async () => {
        const results = await repo.findRoutesBetween('Cavite Island', 'NYC');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].travelTime).toEqual(26);
    });

});
```

