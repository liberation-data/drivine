import {
    DatabaseRegistry,
    DatabaseType,
    fullTextIndex,
    GraphObjectManagerFactory,
    IndexSpec,
    itemName,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    SchemaManager,
    TransactionContextHolder,
    vectorIndex
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';

// Seeding the label and building its index take a while, and schema DDL waits on locks other suites hold.
jest.setTimeout(180_000);

const SEEDED = 'IbSeeded';
const FAILED = 'IbFailed';
const NODES = 20_000;

/** A factory of object managers over the registered databases. */
function managers(engine: GraphEngine): GraphObjectManagerFactory {
    persistenceManagerFor(engine);
    return new GraphObjectManagerFactory(
        new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
    );
}

/**
 * Seeds NODES nodes of the label, each with a number `k`, a text `text`, and an embedding `e` of four dimensions, in
 * batches. On Neo4j each text is some 200 characters, so that a build takes long enough to be seen.
 */
async function seed(factory: GraphObjectManagerFactory, engine: GraphEngine, label: string): Promise<void> {
    const text =
        engine.type === DatabaseType.NEO4J
            ? "toString(i) + reduce(s = '', k IN range(1, 40) | s + '-' + toString(i * k))"
            : "'text of node ' + toString(i)";
    for (let from = 1; from <= NODES; from += 5000) {
        await factory
            .get(engine.name)
            .persistenceManager.execute(
                new QuerySpecification(
                    `UNWIND range(${from}, ${from + 4999}) AS i CREATE (:${label} {k: i, text: ${text}, ` +
                        `e: [toFloat(i), 1.0, 2.0, 3.0]})`
                )
            );
    }
}

/**
 * Neo4j makes an index POPULATING and returns, and checks no key's size while it is: a write of a key too large for the
 * index, committed as it comes ONLINE, fails once it is in the log and stops the database. So `ensure` returns only once
 * what it made, or found, is ONLINE, and a build that failed, or did not end in time, throws, or is logged under WARN.
 */
describe.each(graphEngines().filter((it) => it.type === DatabaseType.NEO4J))(
    'An index ensured on $type over a seeded label',
    (engine) => {
        let factory: GraphObjectManagerFactory;
        const gom = () => factory.get(engine.name);
        const index = rangeIndex(SEEDED, 'text');
        const failing = rangeIndex(FAILED, 's');
        const all: IndexSpec[] = [
            index,
            rangeIndex(SEEDED, 'k'),
            fullTextIndex(SEEDED, 'text'),
            vectorIndex(SEEDED, 'e', 4)
        ];

        const state = async (name: string): Promise<string[]> =>
            gom().persistenceManager.query<string>(
                new QuerySpecification<string>(`SHOW INDEXES YIELD name, state WHERE name = $name RETURN state`).bind({
                    name
                })
            );

        const tidy = async (): Promise<void> => {
            for (const spec of [...all, failing]) {
                await gom().indexes.drop(spec);
            }
            await clearLabels(gom().persistenceManager, engine, SEEDED, FAILED, '_DrivineSchema');
        };

        let warn: jest.SpyInstance;

        beforeAll(async () => {
            factory = managers(engine);
            await tidy();
            await seed(factory, engine, SEEDED);
        });

        beforeEach(() => {
            warn = jest.spyOn(DrivineLogger.prototype, 'warn');
        });

        afterEach(() => warn.mockRestore());

        afterAll(async () => {
            await tidy();
            await closeGraphEngines();
        });

        it('should return from SchemaManager.ensure only once the index it made is ONLINE', async () => {
            const report = await new SchemaManager(factory, { catalogs: [] }).ensure('build', index);

            expect([...report.values()].flat().map((it) => it.status)).toEqual(['CREATED']);
            expect(await state(`${SEEDED}_text_range`)).toEqual(['ONLINE']);
        });

        it('should return once the range, full-text and vector indexes it made are ONLINE', async () => {
            for (const spec of all.slice(1)) {
                expect((await gom().indexes.ensure(spec)).status).toEqual('CREATED');
                expect(await state(itemName(spec))).toEqual(['ONLINE']);
            }
        });

        it('should return from recreate once the index it made again is ONLINE', async () => {
            expect((await gom().indexes.recreate(index)).status).toEqual('RECREATED');
            expect(await state(`${SEEDED}_text_range`)).toEqual(['ONLINE']);
        });

        it('should return ALREADY_MATCHING only once an index another process made, of another name, is ONLINE', async () => {
            await gom().indexes.drop(index);
            const other = `${SEEDED}_text_theirs`;
            await gom().persistenceManager.execute(
                new QuerySpecification(`CREATE INDEX ${other} FOR (n:${SEEDED}) ON (n.text)`)
            );

            const result = await gom().indexes.ensure(index);

            expect(result.status).toEqual('ALREADY_MATCHING');
            expect(await state(other)).toEqual(['ONLINE']);
            // `drop` drops a range index by the name Drivine gives it, so one of another name is dropped by its own.
            await gom().persistenceManager.execute(new QuerySpecification(`DROP INDEX ${other}`));
        });

        it('should log an index not built within the timeout under WARN, and raise it under FAIL_FAST', async () => {
            await gom().indexes.drop(index);
            const warned = new SchemaManager(factory, { catalogs: [], mode: 'WARN', indexBuildTimeout: 5 });
            const report = await warned.ensure('build', index);
            expect([...report.values()].flat().map((it) => it.status)).toEqual(['CREATED']);
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`had not built the RANGE index ${SEEDED}_text_range .*after 5 ms`))
            );

            await gom().indexes.drop(index);
            const strict = new SchemaManager(factory, { catalogs: [], indexBuildTimeout: 5 });
            await expect(strict.ensure('build', index)).rejects.toThrow(
                new RegExp(`had not built the RANGE index ${SEEDED}_text_range .*after 5 ms`)
            );
        });

        it("should raise a build that failed, naming the index and giving Neo4j's reason, and log it under WARN", async () => {
            // A text too large for a range index, there before the index is: its build fails, and it stays FAILED.
            await gom().persistenceManager.execute(
                new QuerySpecification(`CREATE (:${FAILED} {s: $s})`).bind({ s: 'x'.repeat(40_000) })
            );
            const named = new RegExp(`${FAILED}_s_range.*too large`, 'i');

            await expect(new SchemaManager(factory, { catalogs: [] }).ensure('build', failing)).rejects.toThrow(named);
            expect(await state(`${FAILED}_s_range`)).toEqual(['FAILED']);
            // Found again, it is not taken for an index that serves.
            await expect(gom().indexes.ensure(failing)).rejects.toThrow(named);

            const report = await new SchemaManager(factory, { catalogs: [], mode: 'WARN' }).ensure('build', failing);
            expect([...report.values()].flat().map((it) => it.status)).toEqual(['ALREADY_MATCHING']);
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(named));
        });
    }
);

/**
 * FalkorDB builds an index in the background, `CALL db.indexes()` giving its label UNDER CONSTRUCTION meanwhile, and a
 * query answers from what the half-built index holds (FalkorDB/FalkorDB#3382). `ensure` waits until it is OPERATIONAL.
 */
describe.each(graphEngines().filter((it) => it.type === DatabaseType.FALKORDB))(
    'An index ensured on $type over a seeded label',
    (engine) => {
        let factory: GraphObjectManagerFactory;
        const gom = () => factory.get(engine.name);
        const specs: IndexSpec[] = [
            rangeIndex('IbFalkorRange', 'k'),
            fullTextIndex('IbFalkorText', 'text'),
            vectorIndex('IbFalkorVector', 'e', 4)
        ];

        const status = async (label: string): Promise<string[]> =>
            gom().persistenceManager.query<string>(
                new QuerySpecification<string>(
                    'CALL db.indexes() YIELD label, status WHERE label = $label RETURN status'
                ).bind({ label })
            );

        const tidy = async (): Promise<void> => {
            for (const spec of specs) {
                await gom().indexes.drop(spec);
            }
            await clearLabels(gom().persistenceManager, engine, ...specs.map((it) => it.label));
        };

        beforeAll(async () => {
            factory = managers(engine);
            await tidy();
        });

        afterAll(async () => {
            await tidy();
            await closeGraphEngines();
        });

        it('should return once the range, full-text and vector indexes it made are OPERATIONAL', async () => {
            for (const spec of specs) {
                await seed(factory, engine, spec.label);
                expect((await gom().indexes.ensure(spec)).status).toEqual('CREATED');
                expect(await status(spec.label)).toEqual(['OPERATIONAL']);
            }
        });

        it('should return from recreate once the index it made again is OPERATIONAL', async () => {
            expect((await gom().indexes.recreate(specs[0])).status).toEqual('RECREATED');
            expect(await status(specs[0].label)).toEqual(['OPERATIONAL']);
        });
    }
);
