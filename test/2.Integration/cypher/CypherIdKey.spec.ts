import neo4j from 'neo4j-driver';
import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { cypherSqlStores } from '../support/SqlStores';
import { loadSpec, trimIndent } from '../../cypher/CypherSpec';

jest.setTimeout(120_000);

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/**
 * The spec's labels, and the relationship type of the graph of either direction, as this suite writes them: its own, so
 * no suite that runs beside it on the same store, the spec's own included, reads or clears its nodes.
 */
const LABELS: [RegExp, string][] = [
    [/:Person\b/g, ':CyIkPerson'],
    [/:Movie\b/g, ':CyIkMovie'],
    [/:Code\b/g, ':CyIkCode'],
    [/:CyTest\b/g, ':CyIk']
];

function relabelled(cypher: string): string {
    return LABELS.reduce((text, [label, own]) => text.replace(label, own), cypher);
}

/**
 * An id compared by `=` or `IN`, where the row must pass the comparison, has a test of the node's or the relationship's
 * key beside it, so a SQL store reads the row by its primary key (#596, liberation-data/drivine4j#575). The rows are
 * those the comparison alone keeps, under `NOT` and `OR` too, where no test of the key stands. These are drivine4j's
 * `CypherQueryContract` cases, not in the spec yet: a node's id is the store's own, so each is read from the store.
 */
describe.each(stores())('An id compared on $type', (store) => {
    let pm: PersistenceManager;
    const neo4jStore = store.type === DatabaseType.NEO4J;

    /**
     * A whole number as drivine4j sends a Long: Neo4j keeps it apart from a float, and the driver sends a JavaScript
     * number as a float. A SQL store binds every parameter as JSON, where it is the number it is.
     */
    const whole = (value: number): any => (neo4jStore ? neo4j.int(value) : value);

    /** `Long.MAX_VALUE`, a number past any key: on a SQL store, 2^63, the JavaScript number nearest it. */
    const longMax = neo4jStore ? neo4j.int('9223372036854775807') : 2 ** 63;

    const rows = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: relabelled(cypher), language: 'CYPHER' }).bind(parameters));

    const clear = async (): Promise<void> => clearLabels(pm, store, 'CyIk', 'CyIkUn');

    /** The spec's movie graph, its labels this suite's own. */
    const seedMovies = async (): Promise<void> => {
        await clear();
        await rows(trimIndent(loadSpec('queries.yaml').graph!));
    };

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('keeps the rows Cypher keeps with a float, a text, null, a list or an item, under NOT and OR too', async () => {
        await seedMovies();
        const ids = new Map<string, number>(
            (await rows('MATCH (p:Person) RETURN [p.name, id(p)]')).map(([name, id]) => [name, id])
        );
        const [keanu, carrie, laurence] = ['Keanu', 'Carrie', 'Laurence'].map((it) => ids.get(it)!);
        const [role] = await rows("MATCH (:Person {name: 'Laurence'})-[r:ACTED_IN]->() RETURN id(r)");
        const mixed = [keanu, 'x', null, whole(carrie), [whole(laurence)], { id: whole(laurence) }, laurence + 0.5];
        const names = 'RETURN p.name ORDER BY p.name';
        expect(await rows(`MATCH (p:Person) WHERE id(p) = $id ${names}`, { id: keanu })).toEqual(['Keanu']);
        expect(await rows(`MATCH (p:Person) WHERE $id = id(p) AND p.born > 0 ${names}`, { id: whole(keanu) })).toEqual([
            'Keanu'
        ]);
        for (const id of [String(keanu), null, [whole(keanu)], keanu + 0.5]) {
            expect([id, await rows(`MATCH (p:Person) WHERE id(p) = $id ${names}`, { id })]).toEqual([id, []]);
        }
        expect(await rows(`MATCH (p:Person) WHERE id(p) IN $ids ${names}`, { ids: mixed })).toEqual([
            'Carrie',
            'Keanu'
        ]);
        expect(
            await rows(`MATCH (p:Person) WHERE id(p) IN [$a, null, 'x', $b] ${names}`, { a: keanu, b: whole(carrie) })
        ).toEqual(['Carrie', 'Keanu']);
        expect(await rows(`UNWIND $ids AS i MATCH (p:Person) WHERE id(p) = i ${names}`, { ids: mixed })).toEqual([
            'Carrie',
            'Keanu'
        ]);
        expect(await rows(`MATCH (p:Person) WHERE NOT id(p) = $id ${names}`, { id: keanu })).toEqual([
            'Carrie',
            'Hugo',
            'Laurence'
        ]);
        // Null for every other person, as the list holds a null: NOT keeps none.
        expect(await rows(`MATCH (p:Person) WHERE NOT id(p) IN $ids ${names}`, { ids: mixed })).toEqual([]);
        expect(
            await rows(`MATCH (p:Person) WHERE NOT id(p) IN $ids ${names}`, {
                ids: [whole(keanu), whole(carrie), 'x']
            })
        ).toEqual(['Hugo', 'Laurence']);
        expect(
            await rows(`MATCH (p:Person) WHERE id(p) = $id OR p.name = 'Carrie' ${names}`, { id: whole(keanu) })
        ).toEqual(['Carrie', 'Keanu']);
        expect(
            await rows(`MATCH (p:Person) WHERE id(p) = $id OR id(p) IN $ids ${names}`, { id: 'x', ids: mixed })
        ).toEqual(['Carrie', 'Keanu']);
        expect(await rows('MATCH (p:Person)-[r:ACTED_IN]->(m) WHERE id(r) = $id RETURN m.title', { id: role })).toEqual(
            ['The Matrix']
        );
        expect(
            await rows('MATCH (p:Person)-[:ACTED_IN]->(m) WHERE id(p) = $id RETURN m.title ORDER BY m.title', {
                id: whole(keanu)
            })
        ).toEqual(['Johnny Mnemonic', 'The Matrix', 'The Matrix Reloaded']);
        expect(
            await rows(
                "MATCH (p:Person {name: 'Keanu'})-[:KNOWS]->(q) MATCH (c:Person) WHERE id(c) = id(q) RETURN c.name"
            )
        ).toEqual(['Carrie']);
        expect(
            await rows(
                "MATCH (p:Person {name: 'Keanu'})-[:KNOWS]->(q) MATCH (c:Person) WHERE id(q) = id(c) RETURN c.name"
            )
        ).toEqual(['Carrie']);
        expect(
            await rows(
                'MATCH (:Person)-[r:ACTED_IN]->() MATCH (p:Person)-[s:ACTED_IN]->(m) WHERE id(r) = $id AND id(s) = id(r) RETURN m.title',
                { id: whole(role) }
            )
        ).toEqual(['The Matrix']);
        // Written in the statement, as a whole number, a float or one with an exponent.
        for (const id of [`${keanu}`, `${keanu}.0`, `${keanu}e0`, `${keanu * 10}e-1`]) {
            expect([id, await rows(`MATCH (p:Person) WHERE id(p) = ${id} ${names}`)]).toEqual([id, ['Keanu']]);
        }
        expect(await rows(`MATCH (p:Person) WHERE id(p) IN [${keanu}e0, ${carrie}, 'x'] ${names}`)).toEqual([
            'Carrie',
            'Keanu'
        ]);
        // As a value, the comparison is Cypher's: true, false or null.
        expect(
            await rows('MATCH (p:Person) RETURN [p.name, id(p) = $id, id(p) IN $ids] ORDER BY p.name', {
                id: keanu,
                ids: mixed
            })
        ).toEqual([
            ['Carrie', false, true],
            ['Hugo', false, null],
            ['Keanu', true, true],
            ['Laurence', false, null]
        ]);
    });

    it('keeps the rows Cypher keeps where a WHERE nests, or with a value worked out', async () => {
        await seedMovies();
        const [keanu] = await rows("MATCH (p:Person {name: 'Keanu'}) RETURN id(p)");
        const withNull = [whole(keanu), null];
        const names = 'RETURN p.name ORDER BY p.name';
        // OPTIONAL MATCH keeps the row, with a null, where the key is no node's.
        expect(
            await rows(
                'MATCH (p:Person) OPTIONAL MATCH (q:Person) WHERE id(q) = $id AND q.name <> p.name RETURN [p.name, q.name] ORDER BY p.name',
                { id: whole(keanu) }
            )
        ).toEqual([
            ['Carrie', 'Keanu'],
            ['Hugo', 'Keanu'],
            ['Keanu', null],
            ['Laurence', 'Keanu']
        ]);
        expect(
            await rows(`MATCH (a:Person {name: 'Keanu'}) MATCH (p:Person) WHERE id(p) = id(a) + 0 ${names}`)
        ).toEqual(['Keanu']);
        expect(
            await rows(`WITH $id AS x MATCH (p:Person) WHERE id(p) = toInteger(x) ${names}`, { id: String(keanu) })
        ).toEqual(['Keanu']);
        expect(
            await rows('MATCH (p:Person) WITH min(id(p)) AS lo MATCH (q:Person) WHERE id(q) = lo RETURN count(q)')
        ).toEqual([1]);
        expect(
            await rows(`MATCH (p:Person) WITH p, count(*) AS c WHERE id(p) = $id AND c = 1 ${names}`, {
                id: whole(keanu)
            })
        ).toEqual(['Keanu']);
        // A list predicate's WHERE is read as a value: none() is null, and keeps no row, where the comparison is null.
        expect(
            await rows(`MATCH (p:Person) WHERE none(x IN $ids WHERE id(p) = x) ${names}`, { ids: withNull })
        ).toEqual([]);
        expect(await rows(`MATCH (p:Person) WHERE any(x IN $ids WHERE id(p) = x) ${names}`, { ids: withNull })).toEqual(
            ['Keanu']
        );
        expect(
            await rows('MATCH (p:Person) RETURN size([x IN $ids WHERE id(p) = x]) ORDER BY p.name DESC', {
                ids: withNull
            })
        ).toEqual([0, 1, 0, 0]);
        expect(
            await rows(
                `MATCH (p:Person) WHERE NOT EXISTS { MATCH (q:Person) WHERE id(q) = id(p) AND id(q) IN $ids } ${names}`,
                { ids: [whole(keanu)] }
            )
        ).toEqual(['Carrie', 'Hugo', 'Laurence']);
        expect(
            await rows(`MATCH (p:Person) WHERE CASE WHEN id(p) IN $ids THEN true ELSE p.name = 'Hugo' END ${names}`, {
                ids: withNull
            })
        ).toEqual(['Hugo', 'Keanu']);
        // A subquery of the row's own on the other side, alone or in the list: Keanu's count is 1, and 0 is no node's id.
        const knowsCarrie = "COUNT { (p)-[:KNOWS]->(:Person {name: 'Carrie'}) } * $id";
        for (const cypher of [
            `MATCH (p:Person) WHERE id(p) = ${knowsCarrie} ${names}`,
            `MATCH (p:Person) WHERE id(p) IN [${knowsCarrie}, null] ${names}`,
            `MATCH (p:Person) WHERE id(p) IN [${knowsCarrie}, 'x'] ${names}`
        ]) {
            expect([cypher, await rows(cypher, { id: whole(keanu) })]).toEqual([cypher, ['Keanu']]);
        }
        // Each row once, however often the list holds its id.
        expect(await rows(`MATCH (p:Person) WHERE id(p) IN [$a, $a, $a] ${names}`, { a: whole(keanu) })).toEqual([
            'Keanu'
        ]);
        expect(
            await rows(`MATCH (p:Person) WHERE id(p) IN $ids ${names}`, { ids: [whole(keanu), whole(keanu), keanu] })
        ).toEqual(['Keanu']);
        for (const id of [whole(-1), -(keanu + 1), longMax, Number.MAX_SAFE_INTEGER, 1e30, true]) {
            const shown = String(id);
            expect([shown, await rows(`MATCH (p:Person) WHERE id(p) = $id ${names}`, { id })]).toEqual([shown, []]);
            expect([shown, await rows(`MATCH (p:Person) WHERE id(p) IN $ids ${names}`, { ids: [id] })]).toEqual([
                shown,
                []
            ]);
        }
    });

    it('keeps the rows Cypher keeps across a relationship of either direction, one from a node to itself once', async () => {
        // drivine4j#575's test of the key beside an id read from #588's relationships both ways round.
        await clear();
        await rows(
            'CREATE (a:CyIkUn {k: 1}), (b:CyIkUn {k: 2}), (c:CyIkUn {k: 3}), ' +
                '(a)-[:CY_IK_UN {i: 1}]->(b), (b)-[:CY_IK_UN {i: 2}]->(a), (a)-[:CY_IK_UN {i: 3}]->(a), (b)-[:CY_IK_UN {i: 4}]->(c)'
        );
        const node = new Map<number, number>(
            (await rows('MATCH (n:CyIkUn) RETURN [n.k, id(n)]')).map(([k, id]) => [k, id])
        );
        const edge = new Map<number, number>(
            (await rows('MATCH (:CyIkUn)-[r:CY_IK_UN]->() RETURN [r.i, id(r)]')).map(([i, id]) => [i, id])
        );
        const step = 'MATCH (n:CyIkUn)-[r:CY_IK_UN]-(m)';
        expect(await rows(`${step} WHERE id(n) = $id RETURN [r.i, m.k] ORDER BY r.i`, { id: node.get(1) })).toEqual([
            [1, 2],
            [2, 2],
            [3, 1]
        ]);
        expect(
            await rows(`${step} WHERE id(m) IN $ids RETURN [r.i, n.k]`, { ids: [whole(node.get(3)!), 'x', null] })
        ).toEqual([[4, 2]]);
        expect(
            await rows(`${step} WHERE id(r) = $id RETURN [n.k, m.k] ORDER BY n.k`, { id: whole(edge.get(1)!) })
        ).toEqual([
            [1, 2],
            [2, 1]
        ]);
        expect(await rows(`${step} WHERE id(r) = $id RETURN [n.k, m.k]`, { id: whole(edge.get(3)!) })).toEqual([
            [1, 1]
        ]);
        expect(await rows(`${step} WHERE id(n) = id(m) RETURN r.i`)).toEqual([3]);
        expect(
            await rows(`${step} WHERE id(m) = id(n) AND id(n) = $id RETURN r.i`, { id: whole(node.get(1)!) })
        ).toEqual([3]);
        expect(
            await rows(
                'MATCH (:CyIkUn {k: 2})-[r:CY_IK_UN]-(m) MATCH (x:CyIkUn) WHERE id(x) = id(m) RETURN [r.i, x.k] ORDER BY r.i'
            )
        ).toEqual([
            [1, 1],
            [2, 1],
            [4, 3]
        ]);
        expect(
            await rows(
                'MATCH (:CyIkUn)-[r:CY_IK_UN]-() MATCH ()-[s:CY_IK_UN]-() WHERE id(r) = $id AND id(s) = id(r) RETURN count(*)',
                { id: whole(edge.get(1)!) }
            )
        ).toEqual([4]);
        expect(
            await rows('MATCH (n:CyIkUn)-[:CY_IK_UN*1..2]-(m) WHERE id(n) = $id RETURN m.k ORDER BY m.k', {
                id: whole(node.get(3)!)
            })
        ).toEqual([1, 1, 2]);
    });
});
