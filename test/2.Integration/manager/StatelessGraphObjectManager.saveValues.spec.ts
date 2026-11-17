import {
    backendFor,
    CypherFloat,
    cypherFloat,
    DatabaseType,
    DrivineError,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    NodeStamp,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    Root,
    SqliteGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { isSqlStore, sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['SavedValue'] })
class SavedValue {
    @NodeId() id: string;
    d?: number | CypherFloat;
    l?: (number | CypherFloat)[];
    m?: Record<string, any>;
    b?: Uint8Array;
    at?: Date;
}

/** A node whose id is a float, which Oracle holds as a binary double. */
@NodeFragment({ labels: ['SavedValue', 'SavedGauge'] })
class SavedGauge {
    @NodeId() id: number;
    name: string;
}

/** A node and the gauges it reads, which a save with `replace` unlinks by the text the store holds each id as. */
@GraphView()
class SavedReadings {
    @Root() reading: SavedValue;
    @GraphRelationship({ type: 'READS', target: () => SavedGauge }) gauges: SavedGauge[];
}

/** A node that carries its stamp, which a save that changes nothing leaves as it was. */
@NodeFragment({ labels: ['SavedValue', 'SavedReading'] })
class SavedReading {
    @NodeId() id: string;
    d?: number;
    @NodeStamp() stamp?: string;
}

const value = (id: string, fields: Partial<SavedValue> = {}): SavedValue =>
    Object.assign(new SavedValue(), { id, ...fields });

const NON_FINITE = [NaN, Infinity, -Infinity];

/** Of NaN and the infinities, those the store's JSON holds as no number, which a save and a `CREATE` refuse. */
function refusedOn(store: GraphEngine): number[] {
    switch (store.type) {
        case DatabaseType.POSTGRES:
            return NON_FINITE;
        case DatabaseType.SQLITE:
            return [NaN];
        default:
            return [];
    }
}

const refused = (store: GraphEngine, d: number): boolean => refusedOn(store).some((it) => Object.is(it, d));

/** Neo4j, the default connection, where it is configured, and the SQL stores. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...sqlStores()];
}

/**
 * A value a save writes is held as a `CREATE` given it holds it, and read back by Cypher as the same value
 * (drivine-cypher-spec#329, drivine4j's SaveValuesCrossEngineTest): NaN and the infinities as the store's float, or
 * refused with the `CREATE`'s message where its JSON holds them as no number; a whole float as a float, not an integer;
 * bytes as the list of their signed values; a map with the key `$numberDouble` as that map. On Neo4j, which holds its own
 * values, the floats alone: it holds no map as a property, and bytes as a byte array.
 */
describe.each(stores())('values a save writes on $type', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const sql = isSqlStore(store.type);
    const onSql = sql ? it : it.skip;

    const cypher = async (statement: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: statement, language: 'CYPHER' }).bind(parameters));
    const read = async (id: string, expression: string): Promise<any> =>
        (await cypher(`MATCH (n:SavedValue) WHERE n.id = $id RETURN ${expression}`, { id }))[0];

    beforeAll(async () => {
        pm = persistenceManagerFor(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        if (store.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        if (store.type === DatabaseType.SQLITE) {
            await pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, store, 'SavedValue');
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'SavedValue');
        await closeGraphEngines();
    });

    it('reads NaN and the infinities saved back as floats, or refuses them with the message a CREATE given them is', async () => {
        for (const d of NON_FINITE) {
            for (const saved of [
                value(`alone-${d}`, { d }),
                // Beside a date, which Drivine saves on Neo4j as no property.
                ...(sql ? [value(`at-${d}`, { d, at: new Date('2024-01-01T10:00:00Z') })] : [])
            ]) {
                if (refused(store, d)) {
                    const save = await gom.save(saved).catch((e) => e);
                    expect(save).toBeInstanceOf(DrivineError);
                    const create = await cypher('CREATE (n:SavedValue {id: $id}) SET n += $props', {
                        id: `c-${saved.id}`,
                        props: { d, ...(saved.at ? { at: saved.at } : {}) }
                    }).catch((e) => e);
                    expect([saved.id, save.message]).toEqual([saved.id, create.message]);
                    expect(await gom.count(SavedValue)).toEqual(0);
                } else {
                    await gom.save(saved);
                    expect([saved.id, await read(saved.id, 'toString(n.d)')]).toEqual([saved.id, String(d)]);
                    expect(Object.is(await read(saved.id, 'n.d'), d)).toBe(true);
                    const loaded = await gom.load(SavedValue, saved.id);
                    expect(Object.is(loaded?.d, d)).toBe(true);
                    expect(loaded?.at && new Date(loaded.at).getTime()).toEqual(saved.at?.getTime());
                }
            }
        }
    });

    it('reads a whole float saved, alone or in a list, back by Cypher as a float, as a CREATE given it writes it', async () => {
        await gom.save(value('f', { d: cypherFloat(2), l: [1.5, cypherFloat(2)] }));
        await gom.save(value('big', { d: cypherFloat(1e16) }));

        expect(await read('f', '[n.d, n.l[1], toString(n.d), toString(n.l[1])]')).toEqual([2, 2, '2.0', '2.0']);
        expect(await read('big', 'toString(n.d)')).toEqual('1.0E16');
        await cypher('CREATE (n:SavedValue {id: $id}) SET n += $props', {
            id: 'c',
            props: { d: cypherFloat(2), l: [1.5, cypherFloat(2)] }
        });
        expect(
            (
                await cypher(
                    "MATCH (s:SavedValue {id: 'f'}), (c:SavedValue {id: 'c'}) RETURN [s.d = c.d AND toString(s.d) = toString(c.d), s.l = c.l]"
                )
            )[0]
        ).toEqual([true, true]);
    });

    it('writes -0 as a CREATE given it writes it', async () => {
        await gom.save(value('z', { d: -0 }));
        await cypher('CREATE (n:SavedValue {id: $id, d: $d})', { id: 'c', d: cypherFloat(-0) });
        const [saved, made] = (
            await cypher("MATCH (n:SavedValue) WHERE n.id IN ['z', 'c'] RETURN toString(n.d) ORDER BY n.id DESC")
        ).map(String);
        expect(saved).toEqual(made);
        expect(saved).toMatch(/^-?0\.0$/);
    });

    it('holds a node saved again with a whole float in place of another float as a float', async () => {
        const at = sql ? new Date('2024-01-01T00:00:00Z') : undefined;
        await gom.save(value('f', { d: 2.5, l: [1.5], at }));
        await gom.save(value('f', { d: cypherFloat(3), l: [1.5], at }));

        expect(await read('f', '[toString(n.d), n.l[0]]')).toEqual(['3.0', 1.5]);
    });

    onSql('reads bytes saved back by Cypher as the list of their signed values', async () => {
        await gom.save(value('b', { b: new Uint8Array([1, 2, 255]) }));

        expect(await read('b', 'n.b')).toEqual([1, 2, -1]);
        expect((await gom.load(SavedValue, 'b'))?.b).toEqual([1, 2, -1]);
    });

    onSql('reads a date saved back as the same instant, and as one a CREATE given it writes', async () => {
        const at = new Date('2024-03-15T10:30:00.500Z');
        await gom.save(value('t', { at }));
        await cypher('CREATE (n:SavedValue {id: $id, at: $at})', { id: 'c', at });

        expect(new Date((await gom.load(SavedValue, 't'))!.at!).getTime()).toEqual(at.getTime());
        expect(
            (
                await cypher(
                    "MATCH (s:SavedValue {id: 't'}), (c:SavedValue {id: 'c'}) RETURN [s.at = c.at, toString(s.at)]"
                )
            )[0]
        ).toEqual([true, '2024-03-15T10:30:00.500Z']);
    });

    onSql('reads a map with the key $numberDouble saved back as that map, not as a float', async () => {
        await gom.save(value('m', { m: { $numberDouble: 'NaN', n: cypherFloat(2) } }));

        expect(await read('m', 'n.m')).toEqual({ $numberDouble: 'NaN', n: 2 });
        expect(await read('m', 'toString(n.m.n)')).toEqual('2.0');
        expect((await gom.load(SavedValue, 'm'))?.m).toEqual({ $numberDouble: 'NaN', n: 2 });
    });

    it("writes a relationship's float properties as a node's, and relates again to the one relationship", async () => {
        await gom.saveAll([value('a'), value('b')]);
        const relate = async (): Promise<boolean> =>
            gom.edges.relate(nodeRef(SavedValue, 'a'), nodeRef(SavedValue, 'b'), 'WEIGHS', {
                w: cypherFloat(2),
                ws: [1.5, cypherFloat(2)]
            });
        expect(await relate()).toBe(true);
        expect(await relate()).toBe(true);

        expect(
            (
                await cypher(
                    "MATCH (:SavedValue {id: 'a'})-[r:WEIGHS]->(:SavedValue {id: 'b'}) RETURN [toString(r.w), toString(r.ws[1])]"
                )
            )[0]
        ).toEqual(['2.0', '2.0']);
        expect(await cypher("MATCH (:SavedValue {id: 'a'})-[r:WEIGHS]->() RETURN count(r)")).toEqual([1]);
    });

    it('relates again, with the same non-finite float, to the one relationship', async () => {
        await gom.saveAll([value('a'), value('b')]);
        for (const w of NON_FINITE.filter((it) => !refused(store, it))) {
            for (let i = 0; i < 2; i++) {
                expect(
                    await gom.edges.relate(nodeRef(SavedValue, 'a'), nodeRef(SavedValue, 'b'), 'WEIGHS', { w })
                ).toBe(true);
            }
            expect(await cypher("MATCH (:SavedValue {id: 'a'})-[r:WEIGHS]->() RETURN toString(r.w)")).toEqual([
                String(w)
            ]);
        }
    });

    it('finds a node whose id is a float again by its save, its load, Cypher, a relate and a delete', async () => {
        await gom.save(value('a'));
        const ids = [4.5, 0.1, 123456.789];
        const found: any[] = [];
        for (const id of ids) {
            await gom.save(Object.assign(new SavedGauge(), { id, name: 'one' }));
            await gom.save(Object.assign(new SavedGauge(), { id, name: 'two' }));
            found.push([
                id,
                (await gom.load(SavedGauge, id))?.name,
                await cypher('MATCH (n:SavedGauge) WHERE n.id = $id RETURN count(n)', { id }),
                await gom.edges.relate(nodeRef(SavedGauge, id), nodeRef(SavedValue, 'a'), 'POINTS'),
                (await gom.edges.loadRelated(nodeRef(SavedGauge, id), 'POINTS', undefined, SavedValue)).map(
                    (it) => it.id
                )
            ]);
        }
        expect(found).toEqual(ids.map((id) => [id, 'two', [1], true, ['a']]));
        // One whose shortest text has an exponent, which the store spells otherwise than JavaScript's (1e-7): SQLite
        // 1.0E-7, Postgres's jsonb 0.00000010. A save, a load, a relate, loadRelated and a delete each find it by the
        // text the store holds it as (storedKey).
        const exponent = 1e-7;
        await gom.save(Object.assign(new SavedGauge(), { id: exponent, name: 'one' }));
        await gom.save(Object.assign(new SavedGauge(), { id: exponent, name: 'two' }));
        expect(
            await cypher('MATCH (n:SavedGauge) WHERE n.id = $id RETURN [count(n), collect(n.name)]', { id: exponent })
        ).toEqual([[1, ['two']]]);
        expect([
            (await gom.load(SavedGauge, exponent))?.name,
            await gom.edges.relate(nodeRef(SavedGauge, exponent), nodeRef(SavedValue, 'a'), 'POINTS'),
            (await gom.edges.loadRelated(nodeRef(SavedGauge, exponent), 'POINTS', undefined, SavedValue)).map(
                (it) => it.id
            )
        ]).toEqual(['two', true, ['a']]);
        expect(await gom.count(SavedGauge)).toEqual(4);
        expect(await gom.delete(SavedGauge, 4.5)).toEqual(1);
        expect(await gom.delete(SavedGauge, exponent)).toEqual(1);
        expect(await gom.count(SavedGauge)).toEqual(2);
    });

    // drivine4j's "a target whose id is a float with an exponent or a fraction is kept by a save that holds it": the
    // write function compares each target's id, as the store reads it back, with the save's (storedKey).
    it('keeps a target whose id is a float with an exponent or a fraction by a save that holds it, and drops one it does not', async () => {
        const ids = [1e20, 0.1, 1e-7, 123456.789, 1 / 3, 0.1 + 0.2];
        const gauges = ids.map((id) => Object.assign(new SavedGauge(), { id, name: `g${id}` }));
        await gom.save(Object.assign(new SavedReadings(), { reading: value('r'), gauges }));
        const held = async (): Promise<any[]> =>
            cypher("MATCH (:SavedValue {id: 'r'})-[:READS]->(g:SavedGauge) RETURN g.id ORDER BY g.id");

        await gom.save((await gom.load(SavedReadings, 'r'))!, { replace: ['gauges'] });
        expect(await held()).toEqual([...ids].sort((a, b) => a - b));
        const loaded = (await gom.load(SavedReadings, 'r'))!;
        loaded.gauges = loaded.gauges.filter((it) => it.id !== 1e-7);
        await gom.save(loaded, { replace: ['gauges'] });
        expect(await held()).toEqual(ids.filter((it) => it !== 1e-7).sort((a, b) => a - b));
        expect(await gom.count(SavedGauge)).toEqual(6);
    });

    // patchAll matches its results to its objects: on Oracle by the row's position, as the id the block gives back is
    // its plain JSON text of the binary double held, which need not read back as the number given.
    onSql('hands each node whose id is a float its result from a patchAll, and patches each', async () => {
        const ids = [0.1 + 0.2, 1e-7, 123456.789, 4.5];
        await gom.saveAll(ids.map((id) => Object.assign(new SavedGauge(), { id, name: 'one' })));
        const results = await gom.patchAll(
            ids.map((id) => Object.assign(new SavedGauge(), { id, name: `two ${id}` })),
            { only: ['name'] }
        );
        expect(results).toEqual(ids.map(() => ({ found: true, applied: true, changed: true })));
        const names: any[] = [];
        for (const id of ids) {
            names.push((await gom.load(SavedGauge, id))?.name);
        }
        expect(names).toEqual(ids.map((id) => `two ${id}`));
    });

    it('patches a float in as a float, and NaN and the infinities as the store holds them, or refuses them as a save', async () => {
        await gom.saveAll([value('p', { d: 1.5 }), value('q', { d: 1.5 })]);
        await gom.patchAll([value('p', { d: cypherFloat(3), l: [cypherFloat(2)] })], { only: ['d', 'l'] });
        expect(await read('p', '[toString(n.d), toString(n.l[0])]')).toEqual(['3.0', '2.0']);
        await gom.patch(SavedValue, 'q', { set: { d: cypherFloat(4) } });
        expect(await read('q', 'toString(n.d)')).toEqual('4.0');

        for (const d of NON_FINITE) {
            if (refused(store, d)) {
                await expect(gom.patchAll([value('q', { d })], { only: ['d'] })).rejects.toThrow(DrivineError);
                await expect(gom.patch(SavedValue, 'q', { set: { d } })).rejects.toThrow(DrivineError);
            } else {
                await gom.patchAll([value('q', { d })], { only: ['d'] });
                expect(await read('q', 'toString(n.d)')).toEqual(String(d));
                await gom.patch(SavedValue, 'p', { set: { d } });
                expect(await read('p', 'toString(n.d)')).toEqual(String(d));
            }
        }
    });

    it('sorts an infinity saved past every number, and finds it by a comparison with it', async () => {
        const infinities = [-Infinity, Infinity].filter((it) => !refused(store, it));
        // 1e100, as Oracle sorts a double past NUMBER's range out of place (drivine-cypher-spec#309).
        await gom.saveAll([
            value('one', { d: cypherFloat(1) }),
            value('big', { d: cypherFloat(1e100) }),
            ...infinities.map((d) => value(`i${d}`, { d }))
        ]);

        expect(await cypher('MATCH (n:SavedValue) RETURN n.id ORDER BY n.d')).toEqual([
            ...infinities.filter((it) => it < 0).map((it) => `i${it}`),
            'one',
            'big',
            ...infinities.filter((it) => it > 0).map((it) => `i${it}`)
        ]);
        for (const d of infinities) {
            expect(await cypher('MATCH (n:SavedValue) WHERE n.d = $d RETURN n.id', { d })).toEqual([`i${d}`]);
        }
    });

    // On Neo4j a save compares a property with the value given, so NaN, equal to nothing, is a change.
    onSql('leaves a node saved again with the same non-finite float, or float, unchanged, with its stamp', async () => {
        for (const d of [...NON_FINITE, 2.5].filter((it) => !refused(store, it))) {
            const saved = await gom.save(Object.assign(new SavedReading(), { id: `s-${d}`, d }));
            const loaded = (await gom.load(SavedReading, `s-${d}`))!;
            expect([d, (await gom.save(loaded)).stamp]).toEqual([d, saved.stamp]);
        }
    });
});
