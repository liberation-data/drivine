import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    EnsureResult,
    fullTextIndex,
    GraphObjectManagerFactory,
    inventoryKey,
    itemName,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    SchemaCatalog,
    SchemaCommands,
    SchemaItem,
    SchemaManager,
    SchemaSpec,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    uniquenessConstraint,
    vectorIndex
} from '@liberation-data/drivine';
import { inDrivineContext } from '@/context/DrivineContext';
import { DrivineLogger } from '@/logger';
import { readInventory } from '@/schema/SchemaInventory';
import { SqlStore, sqlStores } from '../support/SqlStores';

jest.setTimeout(180_000);

/** The graph the suite writes on each store: tables of its own. */
const GRAPH = 'schemaddl';

/** The SQL that takes `aliases` out of every record's details, as a library that knows no aliases writes them. */
const WITHOUT_ALIASES: Record<SqlStore['name'], string> = {
    POSTGRES: `UPDATE ${GRAPH}_schema SET details = details - 'aliases'`,
    ORACLE: `UPDATE ${GRAPH}_schema SET details = JSON_TRANSFORM(details, REMOVE '$.aliases')`,
    SQLITE: `UPDATE ${GRAPH}_schema SET details = json_remove(details, '$.aliases')`
};

/** The shape of an APOC export's schema file: fifteen statements, Drivine's own constraint and the import's among them. */
const APOC_SCHEMA = [
    'CREATE FULLTEXT INDEX Chunk_text_fulltext IF NOT EXISTS FOR (n:Chunk) ON EACH [n.`text`];',
    'CREATE RANGE INDEX IF NOT EXISTS FOR (n:ChatSession) ON (n.lastActivityAt);',
    'CREATE RANGE INDEX IF NOT EXISTS FOR (n:ContentElement) ON (n.root_document_id, n.ordinal);',
    'CREATE RANGE INDEX IF NOT EXISTS FOR (n:Message) ON (n.sessionId);',
    'CREATE RANGE INDEX IF NOT EXISTS FOR (n:Document) ON (n.uri);',
    'CREATE CONSTRAINT Attachment_attachmentId_unique IF NOT EXISTS FOR (node:Attachment) REQUIRE (node.attachmentId) IS UNIQUE;',
    'CREATE CONSTRAINT ChatSession_sessionId_unique IF NOT EXISTS FOR (node:ChatSession) REQUIRE (node.sessionId) IS UNIQUE;',
    'CREATE CONSTRAINT Chunk_id_unique IF NOT EXISTS FOR (node:Chunk) REQUIRE (node.id) IS UNIQUE;',
    'CREATE CONSTRAINT ContentElement_id_unique IF NOT EXISTS FOR (node:ContentElement) REQUIRE (node.id) IS UNIQUE;',
    'CREATE CONSTRAINT Document_id_unique IF NOT EXISTS FOR (node:Document) REQUIRE (node.id) IS UNIQUE;',
    'CREATE CONSTRAINT Message_id_unique IF NOT EXISTS FOR (node:Message) REQUIRE (node.id) IS UNIQUE;',
    'CREATE CONSTRAINT User_id_unique IF NOT EXISTS FOR (node:User) REQUIRE (node.id) IS UNIQUE;',
    'CREATE CONSTRAINT _DrivineSchema_scope_unique IF NOT EXISTS FOR (node:_DrivineSchema) REQUIRE (node.scope) IS UNIQUE;',
    'CREATE CONSTRAINT UNIQUE_IMPORT_NAME IF NOT EXISTS FOR (node:`UNIQUE IMPORT LABEL`) REQUIRE (node.`UNIQUE IMPORT ID`) IS UNIQUE;',
    'CALL db.awaitIndexes(300);'
];

/** What APOC_SCHEMA makes, as the schema API declares it. */
const APOC_SPECS: SchemaSpec[] = [
    fullTextIndex('Chunk', ['text']),
    rangeIndex('ChatSession', 'lastActivityAt'),
    rangeIndex('ContentElement', ['root_document_id', 'ordinal']),
    rangeIndex('Message', 'sessionId'),
    rangeIndex('Document', 'uri'),
    uniquenessConstraint('Attachment', 'attachmentId'),
    uniquenessConstraint('ChatSession', 'sessionId'),
    uniquenessConstraint('Chunk', 'id'),
    uniquenessConstraint('ContentElement', 'id'),
    uniquenessConstraint('Document', 'id'),
    uniquenessConstraint('Message', 'id'),
    uniquenessConstraint('User', 'id'),
    uniquenessConstraint('UNIQUE IMPORT LABEL', 'UNIQUE IMPORT ID')
];

/** Drivine's own constraints, which are kept between tests. */
const OWN = ['_DrivineSchema', 'DrivineStore'];

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

const messages = (failure: unknown): string => {
    const all: string[] = [];
    for (let cause: any = failure, depth = 0; cause && depth < 10; cause = cause.rootCause ?? cause.cause, depth++) {
        all.push(String(cause.message));
    }
    return all.join(' | ');
};

const failure = async (run: () => Promise<unknown>): Promise<string> => {
    try {
        await run();
    } catch (e) {
        return messages(e);
    }
    throw new Error('It did not fail.');
};

/**
 * Neo4j schema DDL run as Cypher on each SQL store, through a PersistenceManager: applied through the schema machinery,
 * as the schema API applies a spec, under the owner `ddl`. A PersistenceManagerFactory made again stands for the next
 * process. drivine4j's SchemaDdlCrossEngineTest is the same contract.
 */
describe.each(sqlStores())('Neo4j schema DDL on $name', (store) => {
    const database = `${store.name}_${GRAPH}`;
    let factory: PersistenceManagerFactory;
    let objects: GraphObjectManagerFactory;
    let pm: PersistenceManager;
    let warn: jest.SpyInstance;

    /** A factory and managers made anew over the graph: what the next process has. */
    const restart = (): void => {
        factory = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance());
        objects = new GraphObjectManagerFactory(factory);
        pm = factory.get(database, 'NON_TRANSACTIONAL');
    };
    const gom = (): StatelessGraphObjectManager => objects.get(database);
    const cypherSpec = (text: string): QuerySpecification<unknown> =>
        new QuerySpecification<unknown>({ text, language: 'CYPHER' });
    const ddl = async (text: string): Promise<void> => pm.execute(cypherSpec(text) as QuerySpecification<void>);
    const cypher = async (text: string): Promise<unknown[]> => pm.query(cypherSpec(text));
    const ddlKeys = async (owner: string = SchemaCommands.OWNER): Promise<string[]> =>
        readInventory(
            gom().backend.markerItems(
                await gom().persistenceManager.maybeGetOne<string | null>(
                    gom().backend.schemaMarker('items').spec({ scope: owner })
                )
            )
        )?.keys ?? [];
    const listed = async (spec: SchemaSpec): Promise<SchemaItem[]> =>
        spec.kind === 'UNIQUE' ? gom().constraints.list() : gom().indexes.list(spec.kind);
    const find = async (spec: SchemaSpec): Promise<SchemaItem | undefined> =>
        (await listed(spec)).find((it) => it.label === spec.label && sameSet(it.properties, spec.properties));
    const aliases = async (spec: SchemaSpec): Promise<string[]> => (await find(spec))?.aliases ?? [];
    const app = (specs: SchemaSpec[]): SchemaManager =>
        new SchemaManager(objects, {
            catalogs: [
                SchemaCatalog.of(...specs)
                    .named('app')
                    .forDatabase(database)
            ]
        });
    const statuses = (report: Map<string, EnsureResult<SchemaSpec>[]>): string[] =>
        [...report.values()].flat().map((it) => it.status);
    const warnings = (): string[] => warn.mock.calls.map(([it]) => String(it));
    const sorted = (keys: string[]): string[] => [...keys].sort();

    /** Drops every index and constraint but Drivine's own, and every node. */
    const tidy = async (): Promise<void> => {
        const g = gom();
        for (const it of await g.constraints.list()) {
            if (!OWN.includes(it.label)) {
                await g.constraints.drop(uniquenessConstraint(it.label, it.properties));
            }
        }
        for (const it of await g.indexes.list('VECTOR')) {
            await g.indexes.drop(vectorIndex(it.label, it.properties[0], it.dimensions ?? 1));
        }
        for (const it of await g.indexes.list('FULLTEXT')) {
            await g.indexes.drop(fullTextIndex(it.label, it.properties));
        }
        for (const it of await g.indexes.list('RANGE')) {
            await g.indexes.drop(rangeIndex(it.label, it.properties));
        }
        await cypher('MATCH (n) DETACH DELETE n');
    };

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv(store.name), defaultGraphPath: GRAPH })
            .register(database);
    });

    beforeEach(async () => {
        restart();
        await tidy();
        restart();
        warn = jest.spyOn(DrivineLogger.prototype, 'warn');
    });

    afterEach(() => warn.mockRestore());

    afterAll(async () => {
        restart();
        await tidy();
    });

    it("should apply an APOC export's schema file twice as the schema API's items, and the application's enforce should find no drift and no orphans", async () => {
        for (let i = 0; i < 2; i++) {
            for (const statement of APOC_SCHEMA) {
                await ddl(statement);
            }
        }

        for (const spec of APOC_SPECS) {
            expect((await find(spec))?.name).toEqual(itemName(spec));
        }
        expect(await aliases(uniquenessConstraint('UNIQUE IMPORT LABEL', 'UNIQUE IMPORT ID'))).toEqual([
            'UNIQUE_IMPORT_NAME'
        ]);
        expect(await find(uniquenessConstraint('_DrivineSchema', 'scope'))).toBeDefined();
        // Each item once in the ddl owner's marker, as ensured at runtime; Drivine's own constraint in none.
        const keys = sorted(APOC_SPECS.map(inventoryKey));
        expect(sorted(await ddlKeys())).toEqual(keys);

        // The application declares some of them, as its fragments would.
        const declared = [...APOC_SPECS.slice(0, 3), APOC_SPECS[5], APOC_SPECS[7]];
        const manager = app(declared);
        await manager.enforce();
        expect(statuses(await manager.enforce())).toEqual(declared.map(() => 'ALREADY_MATCHING'));
        expect(warnings().filter((it) => it.includes('no longer declares') || /drift/i.test(it))).toEqual([]);
        expect(sorted(await ddlKeys('app'))).toEqual(sorted(declared.map(inventoryKey)));
        // The ddl owner's marker is the application's to leave.
        expect(sorted(await ddlKeys())).toEqual(keys);
    });

    it('should take an item made by DDL and the same item declared through the API for one item, of one inventory key', async () => {
        await ddl('CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name)');
        await new SchemaManager(objects, { catalogs: [] }).ensure(
            SchemaCatalog.of(rangeIndex('Person', 'name')).named('app').forDatabase(database)
        );

        expect((await gom().indexes.list('RANGE')).filter((it) => it.label === 'Person').length).toEqual(1);
        expect(await ddlKeys()).toEqual([inventoryKey(rangeIndex('Person', 'name'))]);
        expect(await ddlKeys('app')).toEqual(await ddlKeys());
        expect(await aliases(rangeIndex('Person', 'name'))).toEqual(['person_name']);
    });

    it('should find the item by an alias after a restart to DROP it, after which the store no longer refuses a duplicate', async () => {
        const spec = uniquenessConstraint('UNIQUE IMPORT LABEL', 'UNIQUE IMPORT ID');
        await ddl(
            'CREATE CONSTRAINT UNIQUE_IMPORT_NAME IF NOT EXISTS FOR (node:`UNIQUE IMPORT LABEL`) REQUIRE (node.`UNIQUE IMPORT ID`) IS UNIQUE;'
        );
        await cypher('CREATE (:`UNIQUE IMPORT LABEL` {`UNIQUE IMPORT ID`: 1})');
        await failure(async () => cypher('CREATE (:`UNIQUE IMPORT LABEL` {`UNIQUE IMPORT ID`: 1})'));

        restart();
        await ddl('DROP CONSTRAINT UNIQUE_IMPORT_NAME;');

        expect(await find(spec)).toBeUndefined();
        await cypher('CREATE (:`UNIQUE IMPORT LABEL` {`UNIQUE IMPORT ID`: 1})');
        expect((await cypher('MATCH (n:`UNIQUE IMPORT LABEL`) RETURN count(n)')).map(Number)).toEqual([2]);
        expect(await ddlKeys()).toEqual([]);
        expect(await failure(async () => ddl('DROP CONSTRAINT UNIQUE_IMPORT_NAME'))).toContain(
            "no constraint named 'UNIQUE_IMPORT_NAME'"
        );
        await ddl('DROP CONSTRAINT UNIQUE_IMPORT_NAME IF EXISTS');
    });

    it('should only add an alias with IF NOT EXISTS over the item, fail without it, refuse a name another item goes by, and DROP by either name', async () => {
        const spec = rangeIndex('Person', 'name');
        await ddl('CREATE INDEX by_name FOR (p:Person) ON (p.name)');
        await ddl('CREATE INDEX by_name IF NOT EXISTS FOR (p:Person) ON (p.name)');
        expect(await failure(async () => ddl('CREATE INDEX by_name FOR (p:Person) ON (p.name)'))).toContain(
            'An equivalent index already exists'
        );
        await failure(async () => ddl('CREATE INDEX FOR (p:Person) ON (p.name)'));
        await ddl('CREATE INDEX person_by_name IF NOT EXISTS FOR (p:Person) ON (p.name)');
        expect(await aliases(spec)).toEqual(['by_name', 'person_by_name']);

        expect(await failure(async () => ddl('CREATE INDEX by_name IF NOT EXISTS FOR (p:Pet) ON (p.name)'))).toContain(
            "already a schema item named 'by_name'"
        );
        expect(
            await failure(async () =>
                ddl('CREATE CONSTRAINT Person_name_range IF NOT EXISTS FOR (p:Pet) REQUIRE p.name IS UNIQUE')
            )
        ).toContain("already a schema item named 'Person_name_range'");
        expect(await find(rangeIndex('Pet', 'name'))).toBeUndefined();

        await ddl('CREATE CONSTRAINT pet_id FOR (p:Pet) REQUIRE p.id IS UNIQUE');
        expect(await failure(async () => ddl('DROP INDEX pet_id'))).toContain('DROP INDEX does not drop it');
        await ddl('DROP CONSTRAINT pet_id');
        expect(await find(uniquenessConstraint('Pet', 'id'))).toBeUndefined();

        await ddl('DROP INDEX person_by_name');
        expect(await find(spec)).toBeUndefined();
        await failure(async () => ddl('DROP INDEX by_name'));
        await ddl('DROP INDEX by_name IF EXISTS');
        expect(await ddlKeys()).toEqual([]);
    });

    it('should keep the aliases of an item recreated, or recorded again', async () => {
        await ddl('CREATE INDEX by_name FOR (p:Person) ON (p.name)');
        await ddl('CREATE CONSTRAINT person_email FOR (p:Person) REQUIRE p.email IS UNIQUE');
        await gom().indexes.recreate(rangeIndex('Person', 'name'));
        await gom().constraints.recreate(uniquenessConstraint('Person', 'email'));
        expect(await aliases(rangeIndex('Person', 'name'))).toEqual(['by_name']);
        expect(await aliases(uniquenessConstraint('Person', 'email'))).toEqual(['person_email']);

        // On Oracle a uniqueness constraint over the one property records the range index again, as served by it.
        await gom().constraints.ensure(uniquenessConstraint('Person', 'name'));
        expect(await aliases(rangeIndex('Person', 'name'))).toEqual(['by_name']);
        await app([rangeIndex('Person', 'name')]).recreateAll();
        expect(await aliases(rangeIndex('Person', 'name'))).toEqual(['by_name']);
    });

    it("should, on a DROP of an item the application declares, forget it in the ddl owner alone and leave it in place, so the application's enforce finds it as it was", async () => {
        const index = rangeIndex('Person', 'name');
        const constraint = uniquenessConstraint('Person', 'email');
        const declared = [index, constraint];
        await app(declared).enforce();
        restart();
        await ddl('CREATE INDEX by_name IF NOT EXISTS FOR (p:Person) ON (p.name)');
        await ddl('CREATE CONSTRAINT person_email IF NOT EXISTS FOR (p:Person) REQUIRE p.email IS UNIQUE');
        expect(sorted(await ddlKeys())).toEqual(sorted(declared.map(inventoryKey)));

        await ddl('DROP INDEX by_name');
        await ddl('DROP CONSTRAINT person_email');

        expect(await find(index)).toBeDefined();
        expect(await find(constraint)).toBeDefined();
        expect(await ddlKeys()).toEqual([]);
        expect(await aliases(index)).toEqual([]);
        expect(await aliases(constraint)).toEqual([]);
        expect(warnings().filter((it) => it.includes("left in place, as 'app' declare(s) it")).length).toEqual(2);
        expect(await failure(async () => ddl('DROP INDEX by_name'))).toContain("no index named 'by_name'");

        warn.mockClear();
        restart();
        expect(statuses(await app(declared).enforce())).toEqual(['ALREADY_MATCHING', 'ALREADY_MATCHING']);
        expect(warnings()).toEqual([]);
        expect(sorted(await ddlKeys('app'))).toEqual(sorted(declared.map(inventoryKey)));
    });

    it('should leave in place, on a DROP, an item the application declares over its properties in another order, and forget it in the ddl owner', async () => {
        const declared = rangeIndex('Person', ['last', 'first']);
        await app([declared]).enforce();
        restart();

        // By an alias: the item found is the application's, of the other order.
        await ddl('CREATE INDEX by_names IF NOT EXISTS FOR (p:Person) ON (p.first, p.last)');
        // A range index is found by its properties in their order here, so the item there is the one ensured, in its order.
        expect(await ddlKeys()).toEqual([inventoryKey(declared)]);
        expect((await gom().indexes.list('RANGE')).filter((it) => it.label === 'Person').length).toEqual(1);
        await ddl('DROP INDEX by_names');
        expect(await find(declared)).toBeDefined();
        expect(await ddlKeys()).toEqual([]);

        // By the name the schema API gives the DDL's own spec.
        await ddl('CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.first, p.last)');
        await ddl('DROP INDEX Person_first_last_range');
        expect(await find(declared)).toBeDefined();
        expect(await ddlKeys()).toEqual([]);
        expect(await ddlKeys('app')).toEqual([inventoryKey(declared)]);
    });

    it("should keep the name the schema API gives the DDL's spec, over an item of its properties in another order, as an alias, so a DROP by it after a restart finds the item", async () => {
        const declared = rangeIndex('Person', ['last', 'first']);
        await new SchemaManager(objects, { catalogs: [] }).ensure(
            SchemaCatalog.of(declared).named('app').forDatabase(database)
        );
        restart();

        await ddl('CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.first, p.last)');
        await ddl('CREATE INDEX Person_first_last_range IF NOT EXISTS FOR (p:Person) ON (p.first, p.last)');
        expect(await aliases(declared)).toEqual(['Person_first_last_range']);
        expect(
            await failure(async () => ddl('CREATE INDEX Person_first_last_range IF NOT EXISTS FOR (p:Pet) ON (p.name)'))
        ).toContain("already a schema item named 'Person_first_last_range'");

        restart();
        await ddl('DROP INDEX Person_first_last_range');
        expect(await find(declared)).toBeDefined();
        expect(await aliases(declared)).toEqual([]);
        expect(await ddlKeys()).toEqual([]);
        expect(await ddlKeys('app')).toEqual([inventoryKey(declared)]);
    });

    it("should read a record whose details a library without aliases wrote over as it did but for its aliases, and the application's enforce should find no drift", async () => {
        const specs: SchemaSpec[] = [
            rangeIndex('Person', 'name'),
            // On Oracle the range index over the one property is then recorded as served by the constraint's index.
            uniquenessConstraint('Person', 'name'),
            uniquenessConstraint('Person', 'email'),
            fullTextIndex('Chunk', ['text']),
            vectorIndex('Chunk', 'embedding', 3, 'EUCLIDEAN')
        ];
        await ddl('CREATE INDEX by_name FOR (p:Person) ON (p.name)');
        await ddl('CREATE CONSTRAINT person_name FOR (p:Person) REQUIRE p.name IS UNIQUE');
        await ddl('CREATE CONSTRAINT person_email FOR (p:Person) REQUIRE p.email IS UNIQUE');
        await ddl(
            "CREATE FULLTEXT INDEX chunk_text FOR (n:Chunk) ON EACH [n.text] OPTIONS {indexConfig: {`fulltext.analyzer`: 'english'}}"
        );
        await ddl(
            "CREATE VECTOR INDEX chunk_embedding FOR (n:Chunk) ON n.embedding OPTIONS {indexConfig: {`vector.dimensions`: 3, `vector.similarity_function`: 'euclidean'}}"
        );
        const all = async (): Promise<string[]> =>
            [
                ...(await gom().indexes.list('RANGE')),
                ...(await gom().indexes.list('VECTOR')),
                ...(await gom().indexes.list('FULLTEXT')),
                ...(await gom().constraints.list())
            ]
                .map((it) => JSON.stringify({ ...it, aliases: undefined }))
                .sort();
        const before = await all();
        for (const spec of specs) {
            expect({ spec, aliases: (await aliases(spec)).length }).toEqual({ spec, aliases: 1 });
        }

        await pm.execute(new QuerySpecification(WITHOUT_ALIASES[store.name]));
        restart();

        expect(await all()).toEqual(before);
        for (const spec of specs) {
            expect({ spec, aliases: await aliases(spec) }).toEqual({ spec, aliases: [] });
        }
        warn.mockClear();
        expect(statuses(await app(specs).enforce())).toEqual(specs.map(() => 'ALREADY_MATCHING'));
        expect(warnings()).toEqual([]);
        // Only the aliases are lost: a DROP by one no longer finds the item.
        expect(await failure(async () => ddl('DROP INDEX by_name'))).toContain("no index named 'by_name'");
    });

    it("should leave an item of another shape with IF NOT EXISTS and fail without it, refuse a TEXT index, and not drop Drivine's own constraint", async () => {
        await ddl('CREATE VECTOR INDEX FOR (c:Chunk) ON c.embedding OPTIONS {indexConfig: {`vector.dimensions`: 3}}');
        await ddl(
            'CREATE VECTOR INDEX wider IF NOT EXISTS FOR (c:Chunk) ON c.embedding OPTIONS {indexConfig: {`vector.dimensions`: 4}}'
        );
        expect((await find(vectorIndex('Chunk', 'embedding', 3)))?.dimensions).toEqual(3);
        expect(await aliases(vectorIndex('Chunk', 'embedding', 3))).toEqual([]);
        expect(
            await failure(async () =>
                ddl('CREATE VECTOR INDEX FOR (c:Chunk) ON c.embedding OPTIONS {indexConfig: {`vector.dimensions`: 4}}')
            )
        ).toContain('of another shape');

        expect(await failure(async () => ddl('CREATE TEXT INDEX FOR (p:Person) ON (p.name)'))).toContain('TEXT');

        await ddl('CREATE CONSTRAINT IF NOT EXISTS FOR (m:_DrivineSchema) REQUIRE m.scope IS UNIQUE');
        const own = uniquenessConstraint('_DrivineSchema', 'scope');
        expect(await failure(async () => ddl(`DROP CONSTRAINT ${itemName(own)}`))).toContain('which Drivine keeps');
        expect(await find(own)).toBeDefined();
        // The vector index alone is the ddl owner's: neither the TEXT index refused nor Drivine's own constraint is recorded.
        expect(await ddlKeys()).toEqual([inventoryKey(vectorIndex('Chunk', 'embedding', 3))]);
    });

    it('should refuse a schema command inside an open transaction, refuse as the translator does, and do nothing for db.awaitIndexes', async () => {
        const transactional = factory.get(database, 'TRANSACTIONAL');
        const delegating = factory.get(database);
        const inTransaction = async <T>(run: () => Promise<T>): Promise<T> =>
            inDrivineContext()
                .withTransaction({ rollback: true })
                .run(async () => run());

        expect(
            await failure(async () =>
                inTransaction(async () =>
                    transactional.execute(cypherSpec('CREATE INDEX FOR (p:Person) ON (p.name)') as any)
                )
            )
        ).toContain('not run inside a transaction');
        await failure(async () =>
            inTransaction(async () => delegating.execute(cypherSpec('DROP INDEX x IF EXISTS') as any))
        );
        expect(
            await failure(async () =>
                inTransaction(async () =>
                    transactional.execute(cypherSpec('CREATE POINT INDEX FOR (p:Place) ON (p.at)') as any)
                )
            )
        ).toContain("A POINT index is Neo4j's");
        expect(await inTransaction(async () => transactional.query(cypherSpec('CALL db.awaitIndexes(300)')))).toEqual(
            []
        );
        expect(await find(rangeIndex('Person', 'name'))).toBeUndefined();

        // Outside a transaction the delegating manager runs it.
        await delegating.execute(cypherSpec('CREATE INDEX FOR (p:Person) ON (p.name)') as any);
        expect(await find(rangeIndex('Person', 'name'))).toBeDefined();
    });

    it("should drop on remove what no one else declares, leave what a startup catalog declares, and forget both in the owner's marker", async () => {
        const shared = rangeIndex('Shared', 'p');
        const own = rangeIndex('Own', 'p');
        const manager = app([shared]);
        await manager.enforce();
        await manager.ensure(SchemaCatalog.of(shared, own).named('lib').forDatabase(database));
        expect(sorted(await ddlKeys('lib'))).toEqual(sorted([inventoryKey(own), inventoryKey(shared)]));

        await manager.remove(SchemaCatalog.of(shared, own).named('lib').forDatabase(database));

        expect(await find(shared)).toBeDefined();
        expect(await find(own)).toBeUndefined();
        expect(await ddlKeys('lib')).toEqual([]);
        expect(warnings().some((it) => it.includes("left in place, as 'app' declare(s) it"))).toBe(true);
        // The item removed is no longer the owner's at runtime, so an enforce does not make it again.
        await manager.enforce();
        expect(await find(own)).toBeUndefined();
        expect(await ddlKeys('app')).toEqual([inventoryKey(shared)]);
    });
});
