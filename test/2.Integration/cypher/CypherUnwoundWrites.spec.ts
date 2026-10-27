import neo4j from 'neo4j-driver';
import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { CypherFloat } from '@/cypher/ast/Expression';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

const LABELS = ['CyUnwound', 'CyUnwoundOther', 'CyUnwoundDecoy', 'CyUnwoundNope', 'CyUnwoundMade'];

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...sqlStores()];
}

/**
 * A value as the store takes it. Neo4j keeps a whole number apart from a float, and its driver sends a JavaScript number
 * as a float, so a whole number is sent as an integer and a {@link CypherFloat} as the number it is. A SQL store binds
 * every value as JSON, where a {@link CypherFloat} is written with its fraction.
 */
function given(store: GraphEngine, value: any): any {
    if (value instanceof CypherFloat) {
        return store.type === DatabaseType.NEO4J ? value.value : value;
    }
    if (typeof value === 'number' && Number.isInteger(value) && store.type === DatabaseType.NEO4J) {
        return neo4j.int(value);
    }
    if (Array.isArray(value)) {
        return value.map((it) => given(store, it));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, given(store, v)]));
    }
    return value;
}

const float = (value: number): CypherFloat => new CypherFloat(value);

/**
 * A write that takes a value from an item of an unwound parameter writes it as it is given, on every store. On Oracle
 * such a value is read through the row's text where it is a text (liberation-data/drivine#356): see
 * `OracleCypherCompiler.rowValue`. So is one a `RETURN` or a `WITH` gives (liberation-data/drivine#366): see
 * `OracleCypherCompiler.itemValue`. drivine4j's `CypherWriteContract`.
 */
describe.each(stores())('A write from an unwound parameter on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(given(store, parameters)));

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await clearLabels(pm, store, ...LABELS);
    });

    afterAll(async () => {
        await clearLabels(pm, store, ...LABELS);
        await closeGraphEngines();
    });

    it("should write an unwound item's text, short or past 32 KB, only to the nodes a labelled pattern matches", async () => {
        // On Oracle such a text is read in a CASE on its type, and such a CASE in a read made Oracle drop a label test
        // (see OracleCypherCompiler.itemProperty): each node a label rules out, on either end of the pattern, is left alone.
        for (const text of ['s', 'x'.repeat(40_000)]) {
            await clearLabels(pm, store, ...LABELS);
            await query(
                "UNWIND [1, 2, 3] AS id CREATE (:CyUnwound {id: id, o: id * 2})-[:R]->(:CyUnwoundOther {name: 'k'}), " +
                    "(:CyUnwound {id: id, o: id * 2 + 1})-[:R]->(:CyUnwoundDecoy {name: 'k'}), " +
                    "(:CyUnwoundNope {id: id})-[:R]->(:CyUnwoundOther {name: 'k'})"
            );
            const texts = { texts: [1, 2, 3].map((id) => ({ id, a: text, s: 's', k: 'k' })) };
            await query(
                'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id})-[r]->(k:CyUnwoundOther) SET n.a = t.a',
                texts
            );
            // A value of the item's worked out beside the node the pattern reached. The `+` is of the short text: on
            // Oracle a `+` of a text past 4,000 bytes leaves that text out (liberation-data/drivine4j#314).
            await query(
                'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id})-[r]->(k:CyUnwoundOther) ' +
                    "SET n.b = CASE k.name WHEN 'k' THEN t.a END, n.e = t.s + k.name",
                texts
            );
            await query('UNWIND $texts AS t MERGE (n:CyUnwound {id: t.id, o: t.id * 2}) SET n.c = t.a', texts);
            // A labelled pattern in a subquery of the statement that works the value out.
            await query(
                'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id}) SET n.f = COUNT { (n)-->(:CyUnwoundOther {name: t.k}) }',
                texts
            );
            const matched = (value: any): any[] => [1, 2, 3].flatMap(() => [value, null]);
            expect(await query('MATCH (n:CyUnwound) RETURN n.a ORDER BY n.o')).toEqual(matched(text));
            expect(await query('MATCH (n:CyUnwound) RETURN n.b ORDER BY n.o')).toEqual(matched(text));
            expect(await query('MATCH (n:CyUnwound) RETURN n.e ORDER BY n.o')).toEqual(matched('sk'));
            expect(await query('MATCH (n:CyUnwound) RETURN n.c ORDER BY n.o')).toEqual(matched(text));
            expect(await query('MATCH (n:CyUnwound) RETURN n.f ORDER BY n.o')).toEqual([1, 2, 3].flatMap(() => [1, 0]));
            expect(await query('MATCH (n:CyUnwound) RETURN count(n)')).toEqual([6]);
            expect(
                await query(
                    'MATCH (n:CyUnwoundNope) WHERE n.a IS NOT NULL OR n.b IS NOT NULL OR n.c IS NOT NULL OR n.e IS NOT NULL ' +
                        'RETURN count(n)'
                )
            ).toEqual([0]);
        }
    });

    it("should return or pass on an unwound parameter's values by a RETURN or a WITH as they are given", async () => {
        // On Oracle such a value is read through the item's text where it is a text (liberation-data/drivine#366): a
        // list, a map, an empty text, a null and a missing key come back as they were, returned, passed on, or after a
        // write.
        const items = {
            items: [
                {
                    id: 1,
                    s: 'short',
                    f: float(5),
                    i: 5,
                    l: [1, 2],
                    fl: [float(1), float(2.5)],
                    m: { k: float(2) },
                    z: null,
                    e: ''
                },
                { id: 2, s: 'x\'"y', f: float(-0.5), i: 0, l: [], fl: [float(3)], m: { k: 'v' }, e: 'e' }
            ]
        };
        await query('CREATE (:CyUnwound {id: 1}), (:CyUnwound {id: 2})');
        const expected: Record<string, any[]> = {
            s: ['short', 'x\'"y'],
            f: [5, -0.5],
            i: [5, 0],
            l: [[1, 2], []],
            fl: [[1, 2.5], [3]],
            m: [{ k: 2 }, { k: 'v' }],
            z: [null, null],
            nothing: [null, null],
            e: ['', 'e']
        };
        for (const [key, values] of Object.entries(expected)) {
            for (const cypher of [
                `UNWIND $items AS t RETURN t.${key}`,
                `UNWIND $items AS t WITH t.${key} AS v RETURN v`,
                `UNWIND $items AS t WITH t RETURN t.${key}`,
                `UNWIND $items AS t MATCH (n:CyUnwound {id: t.id}) SET n.seen = true RETURN t.${key} ORDER BY t.id`,
                `CALL { UNWIND $items AS t RETURN t } RETURN t.${key}`
            ]) {
                expect([cypher, await query(cypher, items)]).toEqual([cypher, values]);
            }
        }
        // An OPTIONAL CALL that unwinds nothing gives a null item, and its value is null.
        expect(await query('UNWIND [1] AS x OPTIONAL CALL { WITH x UNWIND [] AS t RETURN t } RETURN t.s')).toEqual([
            null
        ]);
        await query(
            'UNWIND $items AS t WITH t.id AS id, t.s AS s, t.f AS f, t.l AS l, t.m.k AS k CREATE (:CyUnwoundMade {id: id, s: s, f: f, l: l, k: k})',
            items
        );
        expect(await query('MATCH (n:CyUnwoundMade) RETURN properties(n) ORDER BY n.id')).toEqual([
            { id: 1, s: 'short', f: 5, l: [1, 2], k: 2 },
            { id: 2, s: 'x\'"y', f: -0.5, l: [], k: 'v' }
        ]);
        // A JavaScript number does not tell 5.0 from 5, so the store's text of each tells whether it is still a float:
        // as the store reads the same float given as a parameter of its own (see the test of writes below).
        const [five] = await query('RETURN toString($f)', { f: float(5) });
        expect(await query('UNWIND $items AS t WITH t.f AS f RETURN toString(f)', items)).toEqual([five, '-0.5']);
        expect(await query('MATCH (n:CyUnwoundMade) RETURN toString(n.f) ORDER BY n.id')).toEqual([five, '-0.5']);
        // Oracle reads that parameter as the number 5, so the checks above can't fail there: a float the statement makes
        // itself stays one on every store, and so must its value of an unwound item.
        expect(await query('UNWIND [{f: 5.0}, {f: -0.5}] AS t WITH t.f AS f RETURN toString(f)')).toEqual([
            '5.0',
            '-0.5'
        ]);
        // A map with a key as extended JSON's comes back the map it is, and not the number extended JSON writes.
        const keyed = { items: [{ d: { $numberLong: '5' } }, { d: { $numberDouble: '2.0' } }] };
        const maps = keyed.items.map((it) => it.d);
        expect(await query('UNWIND $items AS t RETURN t.d', keyed)).toEqual(maps);
        expect(await query('UNWIND $items AS t WITH t RETURN t.d', keyed)).toEqual(maps);
    });

    it("should return an unwound item's text, short or past 32 KB, only for the nodes a labelled pattern matches", async () => {
        // On Oracle such a text is read in a CASE on its type (liberation-data/drivine#366), and such a CASE on a node's
        // properties made Oracle drop a label test (see OracleCypherCompiler.itemProperty): each node a label rules out,
        // on either end of the pattern, is left out.
        await query(
            "UNWIND [1, 2, 3] AS id CREATE (:CyUnwound {id: id, o: id * 2})-[:R]->(:CyUnwoundOther {name: 'k'}), " +
                "(:CyUnwound {id: id, o: id * 2 + 1})-[:R]->(:CyUnwoundDecoy {name: 'k'}), " +
                "(:CyUnwoundNope {id: id})-[:R]->(:CyUnwoundOther {name: 'k'})"
        );
        for (const text of ['s', 'x'.repeat(40_000)]) {
            const given = { texts: [1, 2, 3].map((id) => ({ id, a: `${text}${id}`, k: 'k' })) };
            const texts = [1, 2, 3].map((id) => `${text}${id}`);
            expect(
                await query(
                    'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id})-[r]->(k:CyUnwoundOther) RETURN t.a ORDER BY n.o',
                    given
                )
            ).toEqual(texts);
            expect(
                await query(
                    'UNWIND $texts AS t MATCH (k:CyUnwoundOther {name: t.k})<-[r]-(n:CyUnwound {id: t.id}) RETURN t.a ORDER BY n.o',
                    given
                )
            ).toEqual(texts);
            expect(
                await query(
                    'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id}) WHERE (n)-->(:CyUnwoundOther) ' +
                        'WITH t.a AS a, n RETURN [a, n.o] ORDER BY n.o',
                    given
                )
            ).toEqual([1, 2, 3].map((id) => [`${text}${id}`, id * 2]));
            expect(
                await query(
                    'UNWIND $texts AS t MATCH (n:CyUnwound {id: t.id})-[r]->(k:CyUnwoundOther) SET n.seen = true RETURN t.a ORDER BY n.o',
                    given
                )
            ).toEqual(texts);
            expect(
                await query(
                    'UNWIND $texts AS t MATCH (k:CyUnwoundOther)<--(n {id: t.id}) RETURN t.a ORDER BY t.id',
                    given
                )
            ).toEqual(texts.flatMap((it) => [it, it]));
        }
        // So is a value of an item of a list made of a node's properties, unwound beside the labelled pattern.
        expect(
            await query('MATCH (n:CyUnwound)-[r]->(k:CyUnwoundOther) UNWIND [n {.o}] AS m RETURN m.o ORDER BY m.o')
        ).toEqual([2, 4, 6]);
        expect(
            await query(
                'MATCH (n) WHERE n.seen AND (n:CyUnwoundNope OR n:CyUnwoundOther OR n:CyUnwoundDecoy OR ' +
                    'n:CyUnwound AND n.o % 2 = 1) RETURN count(n)'
            )
        ).toEqual([0]);
    });

    /**
     * Sets `property` of the node with id 1 to the `COUNT { }` of `subquery`, over an unwound item `t` whose `a` and `m.a`
     * are a node's `k` and whose `l.a` is none's, and gives what it set.
     */
    const counted = async (property: string, subquery: string): Promise<any> => {
        await query("CREATE (:CyUnwound {id: 1}), (:CyUnwoundOther {k: 'm'}), (:CyUnwoundOther {k: 'l'})");
        await query(`UNWIND $ts AS t MATCH (n:CyUnwound {id: t.id}) SET n.${property} = COUNT { ${subquery} }`, {
            ts: [{ id: 1, a: 'm', m: { a: 'm' }, l: { a: 'none' } }]
        });
        return (await query(`MATCH (n:CyUnwound {id: 1}) RETURN n.${property}`))[0];
    };

    // A value a write's subquery gives that isn't the row's value there has its property read from what the subquery
    // gives, not from the write's row (liberation-data/drivine4j#336).

    it("should read a property of a value a UNION in a write's subquery takes from different keys of its row from each query's", async () => {
        const subquery =
            'CALL { WITH t RETURN t.m AS x UNION ALL WITH t RETURN t.l AS x } MATCH (y:CyUnwoundOther) WHERE y.k = x.a RETURN y';
        expect(await counted('u', subquery)).toEqual(1);
    });

    // On Oracle an OPTIONAL CALL in a write's subquery was refused (ORA-06550, ORA-00907) until it was joined on 1 = 1
    // (#377). Its SQL is pinned in OracleItemProperty.spec.ts and OracleOptionalJoin.spec.ts.
    it("should read a property of a value an OPTIONAL CALL in a write's subquery returns from its row as null where it finds nothing", async () => {
        const subquery =
            'OPTIONAL CALL { WITH t MATCH (z:CyUnwoundNope) RETURN t AS u } MATCH (y:CyUnwoundOther) WHERE y.k = u.a RETURN y';
        expect(await counted('o', subquery)).toEqual(0);
        await clearLabels(pm, store, ...LABELS);
        expect(
            await counted(
                'f',
                'OPTIONAL CALL { WITH t RETURN t.m AS u } MATCH (y:CyUnwoundOther) WHERE y.k = u.a RETURN y'
            )
        ).toEqual(1);
        // With no WHERE … AND … after the join, it closed the session there.
        await clearLabels(pm, store, ...LABELS);
        expect(await counted('b', 'OPTIONAL CALL { WITH t MATCH (z:CyUnwoundNope) RETURN t AS u } RETURN u')).toEqual(
            1
        );
    });

    it("should read a property of a value a WITH in a write's subquery names as the value it names", async () => {
        // Renamed, it is the row's value still; a CASE over two of its keys gives the one it picks.
        expect(
            await counted('w', 'WITH t AS x WITH x.l AS w MATCH (y:CyUnwoundOther) WHERE y.k = w.a RETURN y')
        ).toEqual(0);
        await clearLabels(pm, store, ...LABELS);
        expect(
            await counted(
                'c',
                'WITH CASE WHEN t.id > 0 THEN t.m ELSE t.l END AS x MATCH (y:CyUnwoundOther) WHERE y.k = x.a RETURN y'
            )
        ).toEqual(1);
    });

    it("should write an unwound parameter's items as they are given, by SET, CREATE, MERGE and SET +=", async () => {
        // On Oracle such a value is read through its text where it is a text: a whole float is written as a float
        // parameter of the store's own is, a null or a missing key writes no property, and a list, a key of a map in the
        // item and a short text are written as they were.
        const items = {
            items: [
                {
                    id: 1,
                    s: 'short',
                    f: float(5),
                    i: 5,
                    l: [1, 2],
                    fl: [float(1), float(2.5)],
                    m: { k: float(2) },
                    z: null
                },
                { id: 2, s: 'x\'"y', f: float(-0.5), i: 0, l: [], fl: [float(3)], m: { k: 'v' } }
            ]
        };
        await query(
            'UNWIND $items AS t CREATE (:CyUnwound {id: t.id, s: t.s, f: t.f, i: t.i, l: t.l, fl: t.fl, k: t.m.k, z: t.z, w: t.nothing})',
            items
        );
        await query(
            'UNWIND $items AS t MATCH (n:CyUnwound {id: t.id}) SET n.s2 = t.s, n.f2 = t.f, n.z2 = t.z, n.w2 = t.nothing',
            items
        );
        await query('UNWIND $items AS t MERGE (n:CyUnwound {id: t.id}) SET n.f3 = t.f', items);
        await query(
            'UNWIND $items AS t MERGE (n:CyUnwound {id: t.id + 10}) ON CREATE SET n.f = t.f, n.m = t.m.k',
            items
        );
        await query('UNWIND $added AS t MATCH (n:CyUnwound {id: t.id}) SET n += t', {
            added: [
                { id: 1, g: float(7), s: null },
                { id: 2, g: 8 }
            ]
        });
        await query('UNWIND $floats AS f CREATE (:CyUnwound {id: 20, f: f})', { floats: [float(6)] });
        expect(await query('MATCH (n:CyUnwound) RETURN properties(n) ORDER BY n.id')).toEqual([
            { id: 1, f: 5, i: 5, l: [1, 2], fl: [1, 2.5], k: 2, s2: 'short', f2: 5, f3: 5, g: 7 },
            { id: 2, s: 'x\'"y', f: -0.5, i: 0, l: [], fl: [3], k: 'v', s2: 'x\'"y', f2: -0.5, f3: -0.5, g: 8 },
            { id: 11, f: 5, m: 2 },
            { id: 12, f: -0.5, m: 'v' },
            { id: 20, f: 6 }
        ]);
        // A JavaScript number does not tell 5.0 from 5, so the store's text of each tells whether it is still a float:
        // as the store writes the same float given as a parameter of its own. Oracle reads a whole float bound as JSON
        // text as a number, `5`, an unwound item's as any other parameter's.
        await query('CREATE (:CyUnwound {id: 30, f: $f})', { f: float(5) });
        const [five] = await query('MATCH (n:CyUnwound {id: 30}) RETURN toString(n.f)');
        expect(five).toEqual(store.type === DatabaseType.ORACLE ? '5' : '5.0');
        const whole = (text: string): string => (five === '5' ? text.replace('.0', '') : text);
        expect(
            await query(
                'MATCH (n:CyUnwound) WHERE n.id IN [1, 11, 20] RETURN [toString(n.f), toString(n.f2), toString(n.g)] ORDER BY n.id'
            )
        ).toEqual([
            [whole('5.0'), whole('5.0'), whole('7.0')],
            [whole('5.0'), null, null],
            [whole('6.0'), null, null]
        ]);
    });
});
