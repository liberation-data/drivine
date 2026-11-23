// Writes a graph with Drivine for TypeScript 5.0.0, the last release of store layout 1: the graph a layout-1 to layout-2
// migration is tested on (drivine-cypher-spec#256, drivine#765). Run against 5.0.0 alone, installed here
// (`npm ci` in this folder), as StoreLayoutMigrationStores.spec does before it runs it.
// Usage: node fixture.js sqlite <path of the file to write> [graph]
//        node fixture.js postgres|oracle <host> <port> <user> <password> <database> <graph>
require('reflect-metadata');
const {
    DatabaseRegistry,
    DatabaseType,
    PersistenceManagerFactory,
    TransactionContextHolder,
    QuerySpecification
} = require('@liberation-data/drivine');

const [store, ...args] = process.argv.slice(2);
const properties = () => {
    if (store === 'sqlite') {
        return {
            databaseType: DatabaseType.SQLITE,
            host: '',
            databaseName: args[0],
            defaultGraphPath: args[1] ?? 'drivine'
        };
    }
    if (store === 'postgres' || store === 'oracle') {
        const [host, port, userName, password, databaseName, defaultGraphPath] = args;
        const databaseType = store === 'postgres' ? DatabaseType.POSTGRES : DatabaseType.ORACLE;
        return { databaseType, host, port: Number(port), userName, password, databaseName, defaultGraphPath };
    }
    throw new Error(`No store '${store}': sqlite, postgres or oracle.`);
};

(async () => {
    const written = properties();
    DatabaseRegistry.getInstance().builder().withProperties(written).register('fixture');
    const pm = new PersistenceManagerFactory(
        DatabaseRegistry.getInstance(),
        TransactionContextHolder.getInstance()
    ).get('fixture', 'NON_TRANSACTIONAL');
    const cypher = (text) => pm.execute(new QuerySpecification({ text, language: 'CYPHER' }));
    await cypher('CREATE CONSTRAINT person_name IF NOT EXISTS FOR (n:Person) REQUIRE n.name IS UNIQUE');
    await cypher('CREATE CONSTRAINT event_at IF NOT EXISTS FOR (n:Event) REQUIRE n.at IS UNIQUE');
    await cypher("CREATE (:Person {name: 'Ada', born: date('1815-12-10'), height: 1.65, visits: 3})");
    await cypher("CREATE (:Person {name: 'Charles', born: date('1791-12-26'), height: 2.0})");
    await cypher("CREATE (:Person {name: 'Mary', nick: '2024-03-15'})");
    await cypher("CREATE (a:Person {name: 'Bob'})-[:KNOWS {since: date('2020-01-01')}]->(b:Person {name: 'Cy'})");
    await cypher("CREATE (:Robot {`$t`: 1, `$x`: 'y', name: 'R2'})");
    await cypher("CREATE (:Event {at: '2024-03-15T10:30:00.5Z'})");
    // Two spellings of one moment: distinct texts in layout 1, so its unique index takes both; one value in layout 2.
    await cypher("CREATE (:Event {at: '2024-03-15T10:30:00.500Z'})");
    await Promise.all(DatabaseRegistry.getInstance().providers.map((it) => it.end()));
    console.log('wrote ' + written.defaultGraphPath);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
