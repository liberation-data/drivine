import {
    above,
    backendFor,
    caseOf,
    CascadeType,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    equalTo,
    FullTextIndex,
    fullTextIndex,
    GraphRelationship,
    GraphObjectManagerFactory,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresBackend,
    PostgresGraph,
    QuerySpecification,
    rangeIndex,
    Root,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    Transactional,
    uniquenessConstraint,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { SqlSeed, sqlPersistenceManager, SqlStore, sqlStores } from '../support/SqlStores';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['PgStore', 'Ticket'] })
class Ticket {
    @NodeId() id: string;
    title?: string;
}

@NodeFragment({ labels: ['PgStore', 'Owner'] })
class Owner {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PgStore', 'Item'] })
class Item {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PgStore', 'Tag'] })
class Tag {
    @NodeId() id: string;
}

@GraphView()
class Holding {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'HOLDS', target: () => Item }) items: Item[];
    @GraphRelationship({ type: 'TAGGED', target: () => Tag }) tags: Tag[];
}

@NodeFragment({ labels: ['PgStore', 'Doc'] })
class Doc {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
    @VectorIndex({ dimensions: 3 }) embedding?: number[];
}

@NodeFragment({ labels: ['PgStore', 'Moment'] })
class Moment {
    @NodeId() id: string;
    at?: Date;
    open?: boolean;
    flags?: boolean[];
    days?: Date[];
    count?: number;
}

const postgres: SqlStore[] = sqlStores().filter((it) => it.type === DatabaseType.POSTGRES);

describe.each(postgres)('a store on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;
    const graph = new PostgresGraph();
    const exists = async (table: string): Promise<boolean> =>
        (await pm.getOne<any>(new QuerySpecification(`SELECT to_regclass('${table}') IS NOT NULL AS made`))).made;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'PgStore');
        await seed.prepare();
        await seed.clear();
        await pm.execute(new QuerySpecification(`DELETE FROM ${graph.catalog} WHERE label LIKE 'PgStore%'`));
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it("should make a graph's tables at an object manager's first statement, and not at a connection", async () => {
        const name = 'pgstore_lazy';
        // CASCADE: the store's functions return a row of its node table.
        await pm.execute(
            new QuerySpecification(`DROP TABLE IF EXISTS ${name}_edge, ${name}_node, ${name}_schema CASCADE`)
        );
        const lazy = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.POSTGRES, name), new ModelRegistry());
        expect(await exists(`${name}_node`)).toBe(false);
        expect(await lazy.count(Ticket)).toBe(0);
        expect(await exists(`${name}_node`)).toBe(true);
        expect(await exists(`${name}_edge`)).toBe(true);
        expect(await exists(`${name}_schema`)).toBe(true);
        // drivine4j's store, as its node table's comment says: a manager on the JVM finds it made.
        const comment = await pm.getOne<any>(
            new QuerySpecification(`SELECT obj_description(to_regclass('${name}_node'), 'pg_class') AS version`)
        );
        expect(comment.version).toEqual(PostgresGraph.VERSION);
        await pm.execute(new QuerySpecification(`DROP TABLE ${name}_edge, ${name}_node, ${name}_schema CASCADE`));
    });

    it("should make a graph's tables when its manager's first statement is a batch run in a transaction of its own", async () => {
        const name = 'pgstore_batched';
        const drop = `DROP TABLE IF EXISTS ${name}_edge, ${name}_node, ${name}_schema CASCADE`;
        await pm.execute(new QuerySpecification(drop));
        const batched = new StatelessGraphObjectManager(
            pm,
            backendFor(DatabaseType.POSTGRES, name),
            new ModelRegistry()
        );
        // A fragment and a view: two statements, which the manager runs on a connection of its own.
        await batched.saveAll([
            Object.assign(new Ticket(), { id: 'batched-1' }),
            Object.assign(new Holding(), {
                owner: Object.assign(new Owner(), { id: 'batched-2' }),
                items: [],
                tags: []
            })
        ]);
        expect(await batched.count(Ticket)).toBe(1);
        await pm.execute(new QuerySpecification(drop));
    });

    it("should keep a graph's tables made at a transaction's first statement, though the transaction rolls back", async () => {
        const name = 'pgstore_rolled';
        const drop = `DROP TABLE IF EXISTS ${name}_edge, ${name}_node, ${name}_schema CASCADE`;
        await pm.execute(new QuerySpecification(drop));
        const rolled = new StatelessGraphObjectManager(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
                store.name
            ),
            backendFor(DatabaseType.POSTGRES, name),
            new ModelRegistry()
        );
        class Tickets {
            @Transactional()
            async open(): Promise<void> {
                await rolled.save(Object.assign(new Ticket(), { id: 'rolled-1' }));
                throw new Error('Changed our minds');
            }
        }
        await expect(new Tickets().open()).rejects.toThrow('Changed our minds');
        expect(await exists(`${name}_node`)).toBe(true);
        expect(await rolled.count(Ticket)).toBe(0);
        await pm.execute(new QuerySpecification(drop));
    });

    it("should make a graph's tables when its manager's first statement is a schema statement", async () => {
        const name = 'pgstore_schema_first';
        const drop = `DROP TABLE IF EXISTS ${name}_edge, ${name}_node, ${name}_schema CASCADE`;
        await pm.execute(new QuerySpecification(drop));
        const schemaFirst = new StatelessGraphObjectManager(
            pm,
            backendFor(DatabaseType.POSTGRES, name),
            new ModelRegistry()
        );
        expect((await schemaFirst.indexes.ensure(rangeIndex('Ticket', 'title'))).status).toEqual('CREATED');
        expect(await exists(`${name}_schema`)).toBe(true);
        await pm.execute(new QuerySpecification(drop));
    });

    it("should work on the graph its connection's defaultGraphPath names, and on no other", async () => {
        const name = 'pgstore_named';
        const drop = `DROP TABLE IF EXISTS ${name}_edge, ${name}_node, ${name}_schema CASCADE`;
        await pm.execute(new QuerySpecification(drop));
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv(store.name), defaultGraphPath: name })
            .register(`${store.name}_NAMED`);
        const named = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        ).get(`${store.name}_NAMED`);
        await named.save(Object.assign(new Ticket(), { id: 'named-1', title: 'named' }));
        const held = async (table: string): Promise<number> =>
            (
                await pm.getOne<any>(
                    new QuerySpecification(
                        `SELECT CAST(COUNT(*) AS integer) AS held FROM ${table} WHERE props ->> 'id' = 'named-1'`
                    )
                )
            ).held;
        expect(await held(`${name}_node`)).toEqual(1);
        expect(await held(graph.nodes)).toEqual(0);
        expect((await named.load(Ticket, 'named-1'))?.title).toEqual('named');
        expect(await gom.load(Ticket, 'named-1')).toBeUndefined();
        await pm.execute(new QuerySpecification(drop));
    });

    it('should refuse a graph name that cannot name its tables within 63 characters', () => {
        expect(new PostgresGraph(`g${'x'.repeat(48)}`).name).toHaveLength(49);
        expect(() => new PostgresGraph(`g${'x'.repeat(49)}`)).toThrow(/can't name a graph on Postgres/);
        expect(new PostgresGraph(`g${'x'.repeat(48)}`).vectors('Label', 'embedding').length + 2).toBeLessThanOrEqual(
            63
        );
    });

    it("should delete a view's root with every node it reaches, or only those left with nothing else", async () => {
        const holding = async (owner: string): Promise<void> => {
            await seed.node(['Owner'], { id: owner });
            await seed.node(['Item'], { id: `${owner}-item` });
            await seed.node(['Tag'], { id: `${owner}-tag` });
            await seed.edge(owner, 'HOLDS', `${owner}-item`);
            await seed.edge(owner, 'TAGGED', `${owner}-tag`);
        };
        await holding('all');
        await seed.edge('all-item', 'TAGGED', 'all-tag');
        await holding('orphans');
        // Another owner holds the orphans owner's tag, so a delete of orphans only leaves it: a node is an orphan when
        // it has no relationship but to the roots deleted.
        await seed.node(['Owner'], { id: 'other' });
        await seed.edge('other', 'TAGGED', 'orphans-tag');
        expect(await gom.delete(Holding, 'all', { cascade: CascadeType.DELETE_ALL })).toBe(1);
        expect(await gom.load(Item, 'all-item')).toBeUndefined();
        expect(await gom.load(Tag, 'all-tag')).toBeUndefined();
        expect(await gom.delete(Holding, 'orphans', { cascade: CascadeType.DELETE_ORPHAN })).toBe(1);
        expect(await gom.load(Item, 'orphans-item')).toBeUndefined();
        expect(await gom.load(Tag, 'orphans-tag')).toBeDefined();
        expect(await gom.load(Owner, 'other')).toBeDefined();
    });

    it('should record an index as drivine4j does, read a filter through it, and drop what it recorded', async () => {
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO ${graph.nodes} (labels, props) SELECT '["PgStore", "Ticket"]', ` +
                    `jsonb_build_object('id', 't' || i, 'title', 'title ' || i) FROM generate_series(1, 3000) i`
            )
        );
        await pm.execute(new QuerySpecification(`ANALYZE ${graph.nodes}`));
        const spec = rangeIndex('Ticket', 'title');
        expect((await gom.indexes.ensure(spec)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(spec)).status).toEqual('ALREADY_MATCHING');
        const name = graph.objectName('ix', ['Ticket', 'title']);
        const recorded = await pm.query<any>(
            new QuerySpecification(
                `SELECT kind, properties, object_name FROM ${graph.catalog} WHERE label = 'Ticket' AND kind = 'RANGE_INDEX'`
            )
        );
        expect(recorded).toEqual([{ kind: 'RANGE_INDEX', properties: '["title"]', object_name: name }]);
        const backend = new PostgresBackend(graph);
        const model = { kind: 'NODE_FRAGMENT' as const, model: gom.registry.fragment(Ticket) };
        const query = backend.renderQuery((q: any) => ({ where: q.title.eq('title 7') }), model);
        const statement = backend.loadAllFragments(model.model, query.where);
        const plan = await pm.query<any>(
            new QuerySpecification(`EXPLAIN ${statement.text}`).bind({ ...statement.bindings, ...query.bindings })
        );
        expect(JSON.stringify(plan)).toContain(name.toLowerCase());
        expect((await gom.loadAll(Ticket, (q) => ({ where: q.title.eq('title 7') }))).map((it) => it.id)).toEqual([
            't7'
        ]);
        await gom.indexes.drop(spec);
        expect(await exists(name)).toBe(false);
        expect(await gom.indexes.list('RANGE')).not.toContainEqual(expect.objectContaining({ label: 'Ticket' }));
        await gom.deleteAll(Ticket);
    });

    it('should report the values a uniqueness constraint would refuse, and refuse a second node once it is made', async () => {
        await seed.node(['Ticket'], { id: 'u1', title: 'same' });
        await seed.node(['Ticket'], { id: 'u2', title: 'same' });
        // Over the suite's own label: the suites share a graph, and another seeds tickets with one title.
        const spec = uniquenessConstraint('PgStore', 'title');
        const refused = await gom.constraints.ensure(spec);
        expect(refused).toEqual(
            expect.objectContaining({
                status: 'VIOLATION',
                sample: [{ properties: { title: 'same' }, count: 2, nodes: [expect.anything(), expect.anything()] }]
            })
        );
        await gom.delete(Ticket, 'u2');
        expect((await gom.constraints.ensure(spec)).status).toEqual('CREATED');
        await expect(seed.node(['Ticket'], { id: 'u3', title: 'same' })).rejects.toThrow();
        await gom.constraints.drop(spec);
        await gom.deleteAll(Ticket);
    });

    it('should search by vector and by text, alike with an index and without one', async () => {
        const docs: [string, string, number[]][] = [
            ['d1', 'graph databases store nodes', [1, 0, 0]],
            ['d2', 'a relational database stores rows', [0.9, 0.1, 0]],
            ['d3', 'graphs of graphs', [0, 1, 0]],
            ['d4', 'nothing at all', [0, 0, 1]]
        ];
        for (const [id, body, embedding] of docs) {
            await seed.node(['Doc'], { id, body, embedding });
        }
        // A node with an embedding of another size is not measured, as pgvector measures vectors of one size.
        await seed.node(['Doc'], { id: 'd5', body: 'graph', embedding: [1, 0] });
        const nearest = async (): Promise<string[]> =>
            (await gom.loadNearest(Doc, [1, 0, 0], { topK: 2 })).map((it) => it.value.id);
        const matching = async (text: string): Promise<[string, number][]> =>
            (await gom.loadMatching(Doc, text, { topK: 5 })).map((it) => [it.value.id, it.score]);
        const exact = await nearest();
        expect(exact).toEqual(['d1', 'd2']);
        const scored = await matching('graph -relational');
        expect(scored.map(([id]) => id)).toEqual(['d1', 'd5']);
        expect(scored[0][1]).toEqual(1);
        expect((await matching('graph*')).map(([id]) => id).sort()).toEqual(['d1', 'd3', 'd5']);
        // A search is over a class's first label, so the indexes are over it.
        const vectors = vectorIndex('PgStore', 'embedding', 3);
        const texts = fullTextIndex('PgStore', 'body');
        await gom.indexes.ensure(vectors);
        await gom.indexes.ensure(texts);
        const made = async (kind: 'VECTOR' | 'FULLTEXT', property: string): Promise<any> => {
            const statement = new PostgresBackend(graph).searchIndexTable(kind, 'PgStore', [property]);
            return pm.maybeGetOne<any>(statement.spec());
        };
        expect(await made('VECTOR', 'embedding')).toEqual('3');
        expect(await made('FULLTEXT', 'body')).toEqual(graph.objectName('t', ['PgStore', 'body']));
        expect(await nearest()).toEqual(exact);
        // A vector of another size than the index's is measured without it, against the embeddings of its own size.
        expect((await gom.loadNearest(Doc, [1, 0], { topK: 2 })).map((it) => it.value.id)).toEqual(['d5']);
        expect(await matching('graph -relational')).toEqual(scored);
        await gom.indexes.drop(vectors);
        await gom.indexes.drop(texts);
    });

    it('should compare, seek and patch a boolean and a date as a save stores them: as JSON text', async () => {
        const first = new Date('2026-01-01T00:00:00.000Z');
        const second = new Date('2026-02-01T00:00:00.000Z');
        const moment = (id: string, fields: Partial<Moment>): Moment => Object.assign(new Moment(), { id, ...fields });
        await gom.saveAll([
            moment('m1', { at: first, open: true, flags: [true], days: [first], count: 1 }),
            moment('m2', { at: second, open: false, flags: [false], days: [second], count: 2 })
        ]);
        const found = async (where: (q: any) => any): Promise<string[]> =>
            (await gom.loadAll(Moment, (q) => ({ where: where(q) }))).map((it) => it.id).sort();
        expect(await found((q) => q.at.eq(first))).toEqual(['m1']);
        expect(await found((q) => q.at.gt(first))).toEqual(['m2']);
        expect(await found((q) => q.at.in([second]))).toEqual(['m2']);
        expect(await found((q) => q.open.eq(true))).toEqual(['m1']);
        expect(await found((q) => q.open.in([false]))).toEqual(['m2']);
        expect(await found((q) => q.open.notIn([false]))).toEqual(['m1']);
        expect(await found((q) => q.flags.hasItem(true))).toEqual(['m1']);
        expect(await found((q) => q.days.hasItem(second))).toEqual(['m2']);
        const after = async (seek: (q: any) => any, order: (q: any) => any): Promise<string[]> =>
            (await gom.loadAll(Moment, (q) => ({ orderBy: order(q), seek: seek(q) }))).map((it) => it.id);
        expect(
            await after(
                (q) => q.at.after(first),
                (q) => q.at.asc()
            )
        ).toEqual(['m2']);
        expect(
            await after(
                (q) => q.open.after(false),
                (q) => q.open.asc()
            )
        ).toEqual(['m1']);
        const ordered = await gom.loadAll(Moment, (q) => ({
            orderBy: caseOf([equalTo(q.open as any, false).then(0), above(q.at, first).then(1)], 2).asc()
        }));
        expect(ordered.map((it) => it.id)).toEqual(['m2', 'm1']);
        // A patch's condition is written into the statement the write function runs, each value as a literal.
        const patched = async (where: any, bindings?: Record<string, any>): Promise<boolean> =>
            (await gom.patch(Moment, 'm1', { set: { count: 3 }, where, bindings })).applied;
        expect(await patched((q: any) => q.at.eq(first))).toBe(true);
        expect(await patched((q: any) => q.open.eq(true))).toBe(true);
        expect(await patched((q: any) => q.open.in([true]))).toBe(true);
        expect(await patched((q: any) => q.days.hasItem(first))).toBe(true);
        expect(await patched((q: any) => q.open.eq(false))).toBe(false);
        expect(await patched("(n.props ->> 'at') = $when", { when: first })).toBe(true);
        expect(await patched("(n.props ->> 'open') = $open", { open: true })).toBe(true);
    });

    it('should mint the store identity once, as a node of the graph', async () => {
        const identity = await gom.storeIdentity();
        const again = await new StatelessGraphObjectManager(
            pm,
            backendFor(store.type),
            new ModelRegistry()
        ).storeIdentity();
        expect(again.id).toEqual(identity.id);
    });
});
