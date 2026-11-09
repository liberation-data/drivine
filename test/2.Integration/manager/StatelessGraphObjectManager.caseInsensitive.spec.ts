import {
    backendFor,
    CaseInsensitive,
    count,
    cypherStatement,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    GraphProperty,
    GraphRelationship,
    GraphView,
    key,
    LowerCopies,
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
import { isSqlStore, SqlSeed, SqlStore } from '../support/SqlStores';

// Each test makes and fills in indexes, which wait on the schema locks other suites hold as they run in parallel.
jest.setTimeout(60_000);

/** A label of this run's own: the record of copies filled in outlives a run, and a later run starts without copies. */
const run = Math.random().toString(36).slice(2, 8);
const LATE = `CiLate${run}`;
const MEMBER = `CiMember${run}`;
const MARKED = `CiMarked${run}`;
const ANEW = `CiAnew${run}`;
const RACE = `CiRace${run}`;
const REDONE = `CiRedone${run}`;
const LONG = `CiLong${run}`;
const LONG_LATE = `CiLongLate${run}`;

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

/** Its items that ignore case are dropped and made anew. */
@NodeFragment({ labels: [ANEW] })
class CiAnew {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
}

/** Written by Cypher of the test's own, which keeps no copy unless it sets one. */
@NodeFragment({ labels: [REDONE] })
class CiRedone {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
}

/** Saved with a text past what Oracle reads a text as, through a save of Drivine's. */
@NodeFragment({ labels: [LONG] })
class CiLong {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
}

/** Saved with a long text before there were copies, by a statement of the test's own. */
@NodeFragment({ labels: [LONG_LATE] })
class CiLongLate {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
}

@GraphView()
class CiAccountView {
    @Root() account: CiAccount;
    @GraphRelationship({ type: 'CI_KNOWS', target: () => CiAccount }) friends: CiAccount[] = [];
}

const account = (id: string, values: Partial<CiAccount> = {}): CiAccount =>
    Object.assign(new CiAccount(), { id, ...values });

/** The test's own write of a node, as Cypher or SQL of your own: no copy. */
async function bypassing(
    pm: PersistenceManager,
    engine: GraphEngine,
    label: string,
    props: Record<string, any>,
    stamp?: string
): Promise<void> {
    if (isSqlStore(engine.type)) {
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
    if (engine.type === DatabaseType.SQLITE) {
        const row = await pm.getOne<any>(
            new QuerySpecification(
                `/* drivine:json */ SELECT n.props AS "props" FROM drivine_node n WHERE instr(n.labels, '"${label}"') > 0 ` +
                    `AND n.props ->> 'id' = $id`
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

/** Takes the copy of email from the node of `label` with the id, as Cypher or SQL of your own leaves it. */
async function withoutCopy(pm: PersistenceManager, engine: GraphEngine, label: string, id: string): Promise<void> {
    const statement =
        engine.type === DatabaseType.ORACLE
            ? `UPDATE drivine_node n SET n.props = JSON_TRANSFORM(n.props, REMOVE '$."__drivine.lower.email"') ` +
              `WHERE JSON_EXISTS(n.labels, '$?(@ == "${label}")') AND JSON_VALUE(n.props, '$.id') = $id`
            : engine.type === DatabaseType.POSTGRES
            ? `UPDATE drivine_node SET props = props - '__drivine.lower.email' WHERE labels @> '["${label}"]' ` +
              `AND props ->> 'id' = CAST($id AS text)`
            : engine.type === DatabaseType.SQLITE
            ? `UPDATE drivine_node SET props = json_remove(props, '$."__drivine.lower.email"') ` +
              `WHERE instr(labels, '"${label}"') > 0 AND props ->> 'id' = $id`
            : `MATCH (n:${label} {id: $id}) REMOVE n.\`__drivine.lower.email\``;
    await pm.execute(new QuerySpecification(statement).bind({ id }));
}

/** The node's stamp: a column of its own on the SQL stores. */
async function stampOf(pm: PersistenceManager, engine: GraphEngine, label: string, id: string): Promise<string> {
    if (isSqlStore(engine.type)) {
        const at =
            engine.type === DatabaseType.ORACLE
                ? `JSON_EXISTS(n.labels, '$?(@ == "${label}")') AND JSON_VALUE(n.props, '$.id') = $id`
                : engine.type === DatabaseType.SQLITE
                ? `instr(n.labels, '"${label}"') > 0 AND n.props ->> 'id' = $id`
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
    if (isSqlStore(engine.type)) {
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
    const sql = isSqlStore(engine.type);

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
            await gom.constraints.drop(uniquenessConstraint(ANEW, 'email', { ignoreCase: true }));
        }
        await gom.indexes.drop(rangeIndex(ANEW, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(LATE, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(MARKED, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(REDONE, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(LONG, 'email', { ignoreCase: true }));
        await gom.indexes.drop(rangeIndex(LONG_LATE, 'email', { ignoreCase: true }));
        await clearLabels(pm, engine, 'CiAccount', 'CiPlain', LATE, MEMBER, MARKED, ANEW, REDONE, LONG, LONG_LATE);
        // This run's marker, and no other suite's.
        await pm.execute(
            new QuerySpecification(
                engine.type === DatabaseType.ORACLE
                    ? `DELETE FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "_DrivineSchema")') AND JSON_VALUE(n.props, '$.scope') = 'ci${run}'`
                    : engine.type === DatabaseType.POSTGRES
                    ? `DELETE FROM drivine_node n WHERE n.labels @> '["_DrivineSchema"]' AND n.props ->> 'scope' = 'ci${run}'`
                    : engine.type === DatabaseType.SQLITE
                    ? `DELETE FROM drivine_node WHERE instr(labels, '"_DrivineSchema"') > 0 AND props ->> 'scope' = 'ci${run}'`
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

        // With the copies: the same answers, from the copy. A node written by a statement of its own afterwards has no copy, so a
        // load, count, grouped read, patch and deleteAll that read the copy pass it by.
        await bypassing(pm, engine, LATE, { id: 'l4', email: 'ann@X.com', rank: 4 });
        expect(await ann()).toEqual(['l1']);
        expect(
            (await gom.loadAll(CiLate, (q) => ({ where: q.email.containsIgnoreCase('ANN'), orderBy: q.id.asc() }))).map(
                (it) => it.id
            )
        ).toEqual(['l1', 'l3']);
        expect(await gom.count(CiLate, (q) => ({ where: q.email.eqIgnoreCase('BOB@X.COM') }))).toEqual(1);
        expect(await gom.count(CiLate, (q) => ({ where: q.email.eqIgnoreCase('ANN@X.COM') }))).toEqual(1);
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
        expect(
            (await gom.patch(CiLate, 'l4', { set: { rank: 40 }, where: (q) => q.email.eqIgnoreCase('ANN@x.com') }))
                .applied
        ).toBe(false);
        expect(await gom.deleteAll(CiLate, (q) => ({ where: q.email.eqIgnoreCase('Anna@X.com') }))).toEqual(1);
        expect(await ann()).toEqual(['l1']);
        expect(await gom.deleteAll(CiLate, (q) => ({ where: q.email.eqIgnoreCase('ANN@x.com') }))).toEqual(1);
        expect(await gom.count(CiLate)).toEqual(2);
    });

    it('should fill the copies in again where an item that ignores case is made anew, though they are recorded', async () => {
        await gom.save(Object.assign(new CiAnew(), { id: 'n1', email: 'Ann@X.com' }));
        const index = rangeIndex(ANEW, 'email', { ignoreCase: true });
        await gom.indexes.ensure(index);
        await gom.indexes.drop(index);
        // Out of step while the index was gone, as a write made while the field was not @CaseInsensitive leaves it.
        await withoutCopy(pm, engine, ANEW, 'n1');
        expect((await gom.indexes.ensure(index)).status).toEqual('CREATED');
        expect((await stored(pm, engine, ANEW, 'n1'))['__drivine.lower.email']).toEqual('ann@x.com');
        if (falkor) {
            return;
        }
        // The index aside, which Neo4j would take for one in the constraint's way.
        await gom.indexes.drop(index);
        await withoutCopy(pm, engine, ANEW, 'n1');
        const constraint = uniquenessConstraint(ANEW, 'email', { ignoreCase: true });
        expect((await gom.constraints.ensure(constraint)).status).toEqual('CREATED');
        expect((await stored(pm, engine, ANEW, 'n1'))['__drivine.lower.email']).toEqual('ann@x.com');
    });

    it('should keep no copy for Cypher of your own, and find a node whose Cypher sets the copy too, or after a recreate', async () => {
        const index = rangeIndex(REDONE, 'email', { ignoreCase: true });
        await gom.save(Object.assign(new CiRedone(), { id: 'c1', email: 'Ann@X.com' }));
        await gom.indexes.ensure(index);
        const cypher = async (text: string): Promise<void> => pm.execute(new QuerySpecification(cypherStatement(text)));
        const found = async (email: string): Promise<string[]> =>
            (await gom.loadAll(CiRedone, (q) => ({ where: q.email.eqIgnoreCase(email), orderBy: q.id.asc() }))).map(
                (it) => it.id
            );
        const copy = async (id: string): Promise<string | undefined> =>
            (await stored(pm, engine, REDONE, id))['__drivine.lower.email'];

        // Run as written, or compiled to SQL, a write adds nothing: the copy is stale, or missing.
        await cypher(`MATCH (n:${REDONE} {id: 'c1'}) SET n.email = 'Anne@X.com'`);
        await cypher(`CREATE (:${REDONE} {id: 'c2', email: 'Bob@X.com'})`);
        expect(await found('ANNE@x.com')).toEqual([]);
        expect(await found('ann@x.com')).toEqual(['c1']);
        expect(await found('bob@x.com')).toEqual([]);

        // The documented way: the copy set in the same statement, in a SET of its own.
        await cypher(
            `MATCH (n:${REDONE} {id: 'c1'}) SET n.email = 'Cat@X.com' SET ${LowerCopies.setClause('n', 'email')}`
        );
        await cypher(`CREATE (n:${REDONE} {id: 'c3', email: 'Dan@X.com'}) SET ${LowerCopies.setClause('n', 'email')}`);
        expect(await found('CAT@x.com')).toEqual(['c1']);
        expect(await found('dan@X.COM')).toEqual(['c3']);

        // A REMOVE of the property leaves the copy, so the node is found by its old value; the same SET after it
        // removes the copy.
        await cypher(`MATCH (n:${REDONE} {id: 'c1'}) REMOVE n.email`);
        expect(await copy('c1')).toEqual('cat@x.com');
        expect(await found('cat@x.com')).toEqual(['c1']);
        await cypher(`MATCH (n:${REDONE} {id: 'c3'}) REMOVE n.email SET ${LowerCopies.setClause('n', 'email')}`);
        expect(await copy('c3')).toBeUndefined();
        expect(await found('dan@x.com')).toEqual([]);

        // Or a recreate after the writes, which fills every copy of the label in again.
        await gom.indexes.recreate(index);
        expect(await found('BOB@x.com')).toEqual(['c2']);
        expect(await copy('c1')).toBeUndefined();
        expect(await found('cat@x.com')).toEqual([]);
    });

    it('should save a text of 40,001 characters with its copy, and find it by eqIgnoreCase once the index is there', async () => {
        if (falkor) {
            // FalkorDB finds no node by eqIgnoreCase on a text this long, as drivine4j's contract notes.
            return;
        }
        const index = rangeIndex(LONG, 'email', { ignoreCase: true });
        await gom.indexes.drop(index);
        const long = 'Ab'.repeat(20_000) + 'C';
        const node = (id: string, email: string): CiLong => Object.assign(new CiLong(), { id, email });
        await gom.saveAll([node('g1', long), node('g2', 'Ann@X.com'), node('g3', long + 'd'), node('g4', 'Ab')]);
        const copy = async (id: string): Promise<string | undefined> =>
            (await stored(pm, engine, LONG, id))['__drivine.lower.email'];
        expect(await copy('g1')).toEqual(long.toLowerCase());
        // Saved again as an empty text, the copy goes on Oracle, which keeps an empty text as null; elsewhere it is empty.
        await gom.save(node('g4', ''));
        if (engine.type === DatabaseType.ORACLE) {
            expect(await copy('g4')).toBeUndefined();
        } else {
            expect(await copy('g4')).toBeFalsy();
        }

        // Neo4j cannot hold a text this long in a range index: the index fails, and the lookup reads the label's nodes.
        await gom.indexes.ensure(index).catch(() => undefined);
        try {
            const found = async (email: string): Promise<string[]> =>
                (await gom.loadAll(CiLong, (q) => ({ where: q.email.eqIgnoreCase(email) }))).map((it) => it.id);
            expect(await found(long.toUpperCase())).toEqual(['g1']);
            expect(await found('ann@x.COM')).toEqual(['g2']);
            expect(await found(long.slice(0, -1))).toEqual([]);
            expect((await gom.load(CiLong, 'g1'))!.email).toEqual(long);
        } finally {
            // Dropped, so that a failed index on Neo4j is not waited for by a test after this one.
            await gom.indexes.drop(index);
        }
    });

    it('should fill in the copy of a node saved before with a text of 5,000 bytes on ensure, and find it', async () => {
        if (falkor) {
            // FalkorDB finds no node by eqIgnoreCase on a text this long, as drivine4j's contract notes.
            return;
        }
        const index = rangeIndex(LONG_LATE, 'email', { ignoreCase: true });
        await gom.indexes.drop(index);
        const long = 'Ab'.repeat(2_500);
        // 2,800 characters of 4,200 bytes: past what Oracle reads a text as, though fewer than 4,000 characters.
        // Only its ASCII is lowercased, as Memgraph's toLower lowercases nothing else.
        const wide = 'éA'.repeat(1_400);
        await bypassing(pm, engine, LONG_LATE, { id: 'l1', email: long });
        await bypassing(pm, engine, LONG_LATE, { id: 'l2', email: 'Bob@X.com' });
        await bypassing(pm, engine, LONG_LATE, { id: 'l3', email: '' });
        await bypassing(pm, engine, LONG_LATE, { id: 'l4', email: '', '__drivine.lower.email': 'stale' });
        await bypassing(pm, engine, LONG_LATE, { id: 'l5', email: wide });
        const copy = async (id: string): Promise<string | undefined> =>
            (await stored(pm, engine, LONG_LATE, id))['__drivine.lower.email'];
        expect(await copy('l1')).toBeUndefined();

        await gom.indexes.ensure(index);
        expect(await copy('l1')).toEqual(long.toLowerCase());
        expect(await copy('l2')).toEqual('bob@x.com');
        // The copy of an empty text is empty, or on Oracle, which keeps an empty text as null, there is none.
        expect(await copy('l3')).toBeFalsy();
        expect(await copy('l4')).toBeFalsy();
        if (engine.type === DatabaseType.ORACLE) {
            expect(await copy('l4')).toBeUndefined();
        }
        expect(await copy('l5')).toEqual(wide.toLowerCase());
        expect(await recordOf(pm, engine, LONG_LATE)).toHaveLength(1);
        const found = async (email: string): Promise<string[]> =>
            (await gom.loadAll(CiLongLate, (q) => ({ where: q.email.eqIgnoreCase(email) }))).map((it) => it.id);
        expect(await found(long.toUpperCase())).toEqual(['l1']);
        expect(await found('BOB@x.com')).toEqual(['l2']);
        expect(await found(wide)).toEqual(['l5']);
        // Filled in again, the copies stay as the properties are.
        await (gom as any).lowerCopies().fillIn(LONG_LATE, ['email'], true);
        expect(await copy('l1')).toEqual(long.toLowerCase());
        expect(await copy('l4')).toBeFalsy();
        expect(await copy('l5')).toEqual(wide.toLowerCase());
    });

    it('should have Neo4j refuse to save a text of 40,001 characters under the index over the copy', async () => {
        if (engine.type !== DatabaseType.NEO4J) {
            return;
        }
        const index = rangeIndex(LONG, 'email', { ignoreCase: true });
        await gom.indexes.drop(index);
        await clearLabels(pm, engine, LONG);
        await gom.indexes.ensure(index);
        try {
            await expect(
                gom.save(Object.assign(new CiLong(), { id: 'g1', email: 'Ab'.repeat(20_000) + 'C' }))
            ).rejects.toThrow(/is too large for the index/);
        } finally {
            await gom.indexes.drop(index);
        }
    });

    it('should keep the record of each of managers recording at once, and record each once', async () => {
        const properties = ['p1', 'p2', 'p3', 'p4'];
        // Each property twice: two record the same copy at once, and others different ones beside them.
        await Promise.all(
            [...properties, ...properties].map((property) =>
                (new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry()) as any)
                    .lowerCopies()
                    .fillIn(RACE, [property], true)
            )
        );
        const recorded = (await recordOf(pm, engine, RACE)).map((it) =>
            sql ? JSON.parse(it.properties)[0] : JSON.parse(it)[1]
        );
        expect(recorded.sort()).toEqual(properties);
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
