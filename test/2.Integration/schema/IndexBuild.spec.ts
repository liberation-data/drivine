import {
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    SchemaManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { clearLabels, closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Seeding the label and building its index take a while, and schema DDL waits on locks other suites hold.
jest.setTimeout(180_000);

const SEEDED = 'IbSeeded';
const NODES = 20_000;

/**
 * Neo4j makes an index POPULATING and returns, and checks no key's size while it is: a write of a key too large for the
 * index, committed as it comes ONLINE, fails once it is in the log and stops the database. So `ensure` returns only once
 * what it made is ONLINE. The label is seeded first, so that the build takes long enough to be seen.
 */
describe.each(graphEngines().filter((it) => it.type === DatabaseType.NEO4J))(
    'An index ensured on $type over a seeded label',
    (engine) => {
        let factory: GraphObjectManagerFactory;
        const gom = () => factory.get(engine.name);
        const index = rangeIndex(SEEDED, 'text');

        const tidy = async (): Promise<void> => {
            await gom().indexes.drop(index);
            await clearLabels(gom().persistenceManager, engine, SEEDED, '_DrivineSchema');
        };

        beforeAll(async () => {
            persistenceManagerFor(engine);
            factory = new GraphObjectManagerFactory(
                new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
            );
            await tidy();
            // Each text some 200 characters, written in batches.
            for (let from = 1; from <= NODES; from += 5000) {
                await gom().persistenceManager.execute(
                    new QuerySpecification(
                        `UNWIND range(${from}, ${from + 4999}) AS i CREATE (:${SEEDED} {id: i, text: toString(i) + ` +
                            `reduce(s = '', k IN range(1, 40) | s + '-' + toString(i * k))})`
                    )
                );
            }
        });

        afterAll(async () => {
            await tidy();
            await closeGraphEngines();
        });

        it('should return from SchemaManager.ensure only once the index it made is ONLINE', async () => {
            const report = await new SchemaManager(factory, { catalogs: [] }).ensure('build', index);

            const states = await gom().persistenceManager.query<string>(
                new QuerySpecification<string>(
                    `SHOW INDEXES YIELD name, state WHERE name = '${SEEDED}_text_range' RETURN state`
                )
            );
            expect([...report.values()].flat().map((it) => it.status)).toEqual(['CREATED']);
            expect(states).toEqual(['ONLINE']);
        });
    }
);
