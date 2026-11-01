import {
    backendFor,
    CaseInsensitive,
    count,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    GraphProperty,
    GraphRelationship,
    GraphView,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    NullPolicy,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresGraph,
    PropertyBag,
    QuerySpecification,
    RangeIndex,
    rangeIndex,
    Root,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, GraphEngine, persistenceManagerFor } from '../support/GraphEngines';
import { SqlSeed, SqlStore } from '../support/SqlStores';

// Each test makes and fills in indexes, which wait on the schema locks other suites hold as they run in parallel.
jest.setTimeout(60_000);

/** A label of this run's own: the record of copies filled in outlives a run, and a later run starts without copies. */
const run = Math.random().toString(36).slice(2, 8);
const LATE = `CiLate${run}`;
const MEMBER = `CiMember${run}`;
const MARKED = `CiMarked${run}`;

/** An account looked up by email whatever its case, its display name kept under another name, a flat bag beside them. */
@NodeFragment({ labels: ['CiAccount'] })
class CiAccount {
    @NodeId() id: string;
    @CaseInsensitive() email?: string | null;
    @CaseInsensitive() @GraphProperty('display_name') displayName?: string;
    name?: string = undefined;
    @PropertyBag({ flat: true }) extra: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

/** One saveAll writes as a row of a batch: no bag. */
@NodeFragment({ labels: ['CiPlain'] })
class CiPlain {
    @NodeId() id: string;
    @CaseInsensitive() email?: string | null;
    @NodeStamp() stamp?: string;
}

/** Saved first by a statement of the test's own, which keeps no copy. */
@NodeFragment({ labels: [LATE] })
class CiLate {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
    rank?: number;
}

@NodeFragment({ labels: [MEMBER] })
class CiMember {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
}

@NodeFragment({ labels: [MARKED] })
class CiMarked {
    @NodeId() id: string;
    @CaseInsensitive() @RangeIndex({ ignoreCase: true }) email?: string;
}

@GraphView()
class CiAccountView {
    @Root() account: CiAccount;
    @GraphRelationship({ type: 'CI_KNOWS', target: () => CiAccount }) friends: CiAccount[] = [];
}

const account = (id: string, values: Partial<CiAccount> = {}): CiAccount =>
    Object.assign(new CiAccount(), { id, ...values });

/** The test's own write of a node, as one that bypasses Drivine: no copy. */
async function bypassing(
    pm: PersistenceManager,
    engine: GraphEngine,
    label: string,
    props: Record<string, any>,
    stamp?: string
): Promise<void> {
    if (engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES) {
        await new SqlSeed(pm, engine as SqlStore, label).node([], props, stamp);
        return;
    }
    await pm.execute(
        new QuerySpecification(`CREATE (n:${label}) SET n = $props SET n.\`__drivine.stamp\` = $stamp`).bind({
            props,
            stamp: stamp ?? null
        })
    );
}

/** The properties of the node of `label` with the id, as the store holds them, copies and stamp aside or not. */
async function stored(pm: PersistenceManager, engine: GraphEngine, label: string, id: string): Promise<any> {
    if (engine.type === DatabaseType.ORACLE) {
        const row = await pm.getOne<any>(
            new QuerySpecification(
                `SELECT JSON_TRANSFORM(n.props, KEEP '$') AS "props" FROM drivine_node n ` +
                    `WHERE JSON_EXISTS(n.labels, '$?(@ == "${label}")') AND JSON_VALUE(n.props, '$.id') = $id`
            ).bind({ id })
        );
        return row.props ?? row;
    }
    if (engine.type === DatabaseType.POSTGRES) {
        const row = await pm.getOne<any>(
            new QuerySpecification(
                `SELECT n.props AS "props" FROM drivine_node n WHERE n.labels @> '["${label}"]' ` +
                    `AND n.props ->> 'id' = CAST($id AS text)`
            ).bind({ id })
        );
        return row.props ?? row;
    }
    return pm.getOne<any>(new QuerySpecification(`MATCH (n:${label} {id: $id}) RETURN properties(n)`).bind({ id }));
}

/** Takes the copy of email from the node of `label` with the id, as a write that bypasses Drivine leaves it. */
async function withoutCopy(pm: PersistenceManager, engine: GraphEngine, label: string, id: string): Promise<void> {
    const statement =
        engine.type === DatabaseType.ORACLE
            ? `UPDATE drivine_node n SET n.props = JSON_TRANSFORM(n.props, REMOVE '$."__drivine.lower.email"') ` +
              `WHERE JSON_EXISTS(n.labels, '$?(@ == "${label}")') AND JSON_VALUE(n.props, '$.id') = $id`
            : engine.type === DatabaseType.POSTGRES
            ? `UPDATE drivine_node SET props = props - '__drivine.lower.email' WHERE labels @> '["${label}"]' ` +
              `AND props ->> 'id' = CAST($id AS text)`
            : `MATCH (n:${label} {id: $id}) REMOVE n.\`__drivine.lower.email\``;
    await pm.execute(new QuerySpecification(statement).bind({ id }));
}

/** The node's stamp: a column of its own on the SQL stores. */
async function stampOf(pm: PersistenceManager, engine: GraphEngine, label: string, id: string): Promise<string> {
    if (engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES) {
        const at =
            engine.type === DatabaseType.ORACLE
                ? `JSON_EXISTS(n.labels, '$?(@ == "${label}")') AND JSON_VALUE(n.props, '$.id') = $id`
                : `n.labels @> '["${label}"]' AND n.props ->> 'id' = CAST($id AS text)`;
        const row = await pm.getOne<any>(
            new QuerySpecification(`SELECT n.stamp AS "stamp" FROM drivine_node n WHERE ${at}`).bind({ id })
        );
        return row?.stamp ?? row;
    }
    return (await stored(pm, engine, label, id))['__drivine.stamp'];
}

/** The record that every node of `label` has its copy of email, as the store keeps it: drivine4j's layout. */
async function recordOf(pm: PersistenceManager, engine: GraphEngine, label: string): Promise<any[]> {
    if (engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES) {
        const details = engine.type === DatabaseType.ORACLE ? 'JSON_SERIALIZE(details)' : 'CAST(details AS text)';
        return pm.query(
            new QuerySpecification(
                `SELECT kind AS "kind", label AS "label", properties AS "properties", name AS "name", ` +
                    `object_name AS "objectName", ${details} AS "details" FROM drivine_schema ` +
                    `WHERE kind = 'LOWER_COPY' AND label = $label`
            ).bind({ label })
        );
    }
    const lowered = await pm.getOne<string[] | null>(
        new QuerySpecification("MATCH (s:DrivineStore {key: 'singleton'}) RETURN s.lowered")
    );
    return (lowered ?? []).filter((it) => it.includes(label));
}

describe.each(allStores())('@CaseInsensitive on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const falkor = engine.type === DatabaseType.FALKORDB;
    const sql = engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, engine, 'CiAccount', 'CiPlain');
    });

    afterAll(async () => {
        if (!falkor) {
            await gom.constraints.drop(uniquenessConstraint(MEMBER, 'email', { ignoreCase: true }));
        }
        await gom.indexes.drop(rangeIndex(LATE, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(MARKED, 'email', { ignoreCase: true }));
        await clearLabels(pm, engine, 'CiAccount', 'CiPlain', LATE, MEMBER, MARKED);
        // This run's marker, and no other suite's.
        await pm.execute(
            new QuerySpecification(
                engine.type === DatabaseType.ORACLE
                    ? `DELETE FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "_DrivineSchema")') AND JSON_VALUE(n.props, '$.scope') = 'ci${run}'`
                    : engine.type === DatabaseType.POSTGRES
                    ? `DELETE FROM drivine_node n WHERE n.labels @> '["_DrivineSchema"]' AND n.props ->> 'scope' = 'ci${run}'`
                    : `MATCH (m:_DrivineSchema {scope: 'ci${run}'}) DETACH DELETE m`
            )
        );
        // The records of this run's labels.
        await pm.execute(
            new QuerySpecification(
                sql
                    ? `DELETE FROM drivine_schema WHERE kind = 'LOWER_COPY' AND label LIKE 'Ci%${run}'`
                    : `MATCH (s:DrivineStore) SET s.lowered = [e IN coalesce(s.lowered, []) WHERE NOT e CONTAINS '${run}"']`
            )
        );
        await closeGraphEngines();
    });

    it('should write the lowercased copy on a save, under the stored name, which a load and a flat bag do not see', async () => {
        await gom.save(account('a1', { email: 'Ada@X.com', displayName: 'Ada L', name: 'Ada', extra: { note: 'x' } }));
        const props = await stored(pm, engine, 'CiAccount', 'a1');
        expect(props['__drivine.lower.email']).toEqual('ada@x.com');
        expect(props['__drivine.lower.display_name']).toEqual('ada l');
        const loaded = (await gom.load(CiAccount, 'a1'))!;
        expect(loaded.extra).toEqual({ note: 'x' });
        expect(loaded.email).toEqual('Ada@X.com');
        expect(Object.keys(loaded).some((it) => it.startsWith('__drivine'))).toBe(false);
    });

    it('should keep the copy in step with the property, and remove it with the property', async () => {
        await gom.save(account('a1', { email: 'Ada@X.com' }));
        await gom.save(account('a1', { email: 'GRACE@X.com' }));
        expect((await stored(pm, engine, 'CiAccount', 'a1'))['__drivine.lower.email']).toEqual('grace@x.com');
        await gom.save(account('a1', { email: null }), { nullPolicy: NullPolicy.CLEAR });
        const props = await stored(pm, engine, 'CiAccount', 'a1');
        expect(props.email).toBeUndefined();
        expect(props['__drivine.lower.email']).toBeUndefined();
    });

    it('should keep the copy on saveAll, create, patch and patchAll, a cleared value removing it', async () => {
        const plain = (id: string, email: string | null): CiPlain => Object.assign(new CiPlain(), { id, email });
        await gom.saveAll([plain('p1', 'One@X.com'), plain('p2', 'Two@X.com')]);
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toEqual('one@x.com');
        await gom.create(plain('p3', 'Three@X.com'));
        expect((await stored(pm, engine, 'CiPlain', 'p3'))['__drivine.lower.email']).toEqual('three@x.com');
        await gom.patch(CiPlain, 'p1', { set: { email: 'UNO@X.com' } });
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toEqual('uno@x.com');
        await gom.patch(CiPlain, 'p1', { clear: ['email'] });
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toBeUndefined();
        await gom.patchAll([plain('p2', 'DOS@X.com'), plain('p3', null)], {
            only: ['email'],
            nullPolicy: NullPolicy.CLEAR
        });
        expect((await stored(pm, engine, 'CiPlain', 'p2'))['__drivine.lower.email']).toEqual('dos@x.com');
        expect((await stored(pm, engine, 'CiPlain', 'p3'))['__drivine.lower.email']).toBeUndefined();
    });

    it('should give no new stamp to a save that only fills in a missing copy', async () => {
        const stamp = 'aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb';
        await bypassing(pm, engine, 'CiPlain', { id: 'p1', email: 'Ada@X.com' }, stamp);
        await gom.save(Object.assign(new CiPlain(), { id: 'p1', email: 'Ada@X.com' }));
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toEqual('ada@x.com');
        expect(await stampOf(pm, engine, 'CiPlain', 'p1')).toEqual(stamp);
    });

    it('should write the copy on a patch only to a node it changed', async () => {
        await gom.save(Object.assign(new CiPlain(), { id: 'p1', email: 'Ann@X.com' }));
        await withoutCopy(pm, engine, 'CiPlain', 'p1');
        const stamp = await stampOf(pm, engine, 'CiPlain', 'p1');
        expect((await gom.patch(CiPlain, 'p1', { set: { email: 'Ann@X.com' } })).changed).toBe(false);
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toBeUndefined();
        expect(await stampOf(pm, engine, 'CiPlain', 'p1')).toEqual(stamp);
        expect((await gom.patch(CiPlain, 'p1', { set: { email: 'Anne@X.com' } })).changed).toBe(true);
        expect((await stored(pm, engine, 'CiPlain', 'p1'))['__drivine.lower.email']).toEqual('anne@x.com');
    });

    it('should update past the copy, and write the copies of the nodes a view saves', async () => {
        await gom.save(account('a1', { email: 'Ada@X.com', name: 'Ada' }));
        const updated = await gom.update(CiAccount, 'a1', (it) => {
            it.name = 'Ada L';
        });
        expect(updated?.name).toEqual('Ada L');
        await gom.save(
            Object.assign(new CiAccountView(), {
                account: account('a2', { email: 'Bo@X.com' }),
                friends: [account('a3', { email: 'Cy@X.com' })]
            })
        );
        expect((await stored(pm, engine, 'CiAccount', 'a2'))['__drivine.lower.email']).toEqual('bo@x.com');
        expect((await stored(pm, engine, 'CiAccount', 'a3'))['__drivine.lower.email']).toEqual('cy@x.com');
    });

    it('should compare with the property until ensure fills the copies in and records it, and with the copy after', async () => {
        await bypassing(pm, engine, LATE, { id: 'l1', email: 'Ann@X.com', rank: 1 });
        await bypassing(pm, engine, LATE, { id: 'l2', email: 'bob@x.com', rank: 2 });
        await bypassing(pm, engine, LATE, { id: 'l3', email: 'ANNA@x.com', rank: 3 });
        const ann = async (): Promise<string[]> =>
            (await gom.loadAll(CiLate, (q) => ({ where: q.email.eqIgnoreCase('ann@x.COM') }))).map((it) => it.id);
        // No copies yet: the property is lowercased, and the answer is right.
        expect(await ann()).toEqual(['l1']);
        expect((await stored(pm, engine, LATE, 'l1'))['__drivine.lower.email']).toBeUndefined();

        const index = rangeIndex(LATE, 'email', { ignoreCase: true });
        expect((await gom.indexes.ensure(index)).status).toEqual('CREATED');
        expect((await stored(pm, engine, LATE, 'l1'))['__drivine.lower.email']).toEqual('ann@x.com');
        expect((await stored(pm, engine, LATE, 'l3'))['__drivine.lower.email']).toEqual('anna@x.com');
        expect(await recordOf(pm, engine, LATE)).toEqual(
            sql
                ? [
                      {
                          kind: 'LOWER_COPY',
                          label: LATE,
                          properties: '["email"]',
                          name: null,
                          objectName: null,
                          details: '{}'
                      }
                  ]
                : [`["${LATE}","email"]`]
        );
        expect((await gom.indexes.ensure(index)).status).toEqual('ALREADY_MATCHING');
        expect((await gom.indexes.list()).some((it) => it.properties.includes('__drivine.lower.email'))).toBe(true);

        // With the copies: the same answers, from the copy.
        expect(await ann()).toEqual(['l1']);
        expect(
            (await gom.loadAll(CiLate, (q) => ({ where: q.email.containsIgnoreCase('ANN'), orderBy: q.id.asc() }))).map(
                (it) => it.id
            )
        ).toEqual(['l1', 'l3']);
        expect(await gom.count(CiLate, (q) => ({ where: q.email.eqIgnoreCase('BOB@X.COM') }))).toEqual(1);
        expect(await gom.count(CiLate, (q) => ({ where: q.email.eqIgnoreCase('') }))).toEqual(0);
        const groups = await gom.groups.load(CiLate, (q: any) => ({
            where: q.email.containsIgnoreCase('ann'),
            keys: { rank: key('rank') },
            aggregates: { nodes: count() }
        }));
        expect(groups.length).toEqual(2);
        const patched = await gom.patch(CiLate, 'l2', {
            set: { rank: 20 },
            where: (q) => q.email.eqIgnoreCase('BOB@x.com')
        });
        expect(patched.applied).toBe(true);
        expect(await gom.deleteAll(CiLate, (q) => ({ where: q.email.eqIgnoreCase('Anna@X.com') }))).toEqual(1);
        expect(await ann()).toEqual(['l1']);
    });

    it('should refuse two emails that differ only in case under a constraint that ignores case', async () => {
        const constraint = uniquenessConstraint(MEMBER, 'email', { ignoreCase: true });
        if (falkor) {
            await expect(gom.constraints.ensure(constraint)).rejects.toThrow(/FalkorDB\/FalkorDB\/issues\/551/);
            return;
        }
        const member = (id: string, email: string): CiMember => Object.assign(new CiMember(), { id, email });
        await gom.save(member('m1', 'a@x.com'));
        await gom.save(member('m2', 'A@X.com'));
        expect((await gom.constraints.ensure(constraint)).status).toEqual('VIOLATION');
        await gom.delete(CiMember, 'm2');
        expect((await gom.constraints.ensure(constraint)).status).toEqual('CREATED');
        await expect(gom.save(member('m3', 'A@X.COM'))).rejects.toThrow();
        expect((await gom.constraints.ensure(constraint)).status).toEqual('ALREADY_MATCHING');
    });

    it("should record an item that ignores case in its owner's inventory as drivine4j does: over the copy, by its own name", async () => {
        persistenceManagerFor(engine);
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, CiMarked).named(`ci${run}`).forDatabase(engine.name)]
        }).enforce();
        const managed = factory.get(engine.name);
        const items = managed.backend.markerItems(
            await managed.persistenceManager.maybeGetOne<string>(
                managed.backend.schemaMarker('items').spec({ scope: `ci${run}` })
            )
        );
        expect(items).toEqual([`RANGE_INDEX:${MARKED}:__drivine.lower.email:${MARKED}_email_ci_range`]);
        expect(await recordOf(pm, engine, MARKED)).toHaveLength(1);
    });
});
