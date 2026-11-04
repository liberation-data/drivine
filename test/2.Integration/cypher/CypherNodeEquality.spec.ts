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
 * The spec's labels as this suite writes them: its own, so no suite that runs beside it on the same store, the spec's
 * own included, reads or clears its nodes. Each person keeps two labels, `:CyNePerson:CyNe`, as the spec's do.
 */
const LABELS: [RegExp, string][] = [
    [/:Person\b/g, ':CyNePerson'],
    [/:Movie\b/g, ':CyNeMovie'],
    [/:Code\b/g, ':CyNeCode'],
    [/:CyTest\b/g, ':CyNe']
];

function relabelled(cypher: string): string {
    return LABELS.reduce((text, [label, own]) => text.replace(label, own), cypher);
}

/**
 * A node with a label compared to a node matched before it, by the forms beside the spec's "A node equal to one matched
 * before it" that compare the two nodes' keys too: through the store's comparison of two keys, which on Oracle keeps the
 * later node's join, so a node with more than one label is found (#598, liberation-data/drivine4j#576). These are
 * drivine4j's `CypherQueryContract` cases, not in the spec yet.
 */
describe.each(stores())('A node compared to a node on $type', (store) => {
    let pm: PersistenceManager;

    const rows = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: relabelled(cypher), language: 'CYPHER' }));

    const clear = async (): Promise<void> => clearLabels(pm, store, 'CyNe');

    beforeAll(async () => {
        pm = persistenceManagerFor(store);
        await clear();
        await rows(trimIndent(loadSpec('queries.yaml').graph!));
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('keeps the rows Cypher keeps, compared other than by =', async () => {
        const q = "MATCH (p:CyTest {name: 'Keanu'})-[:KNOWS]->(q)";
        expect(await rows(`${q} MATCH (c:Person) WHERE c <> q RETURN c.name ORDER BY c.name`)).toEqual([
            'Hugo',
            'Keanu',
            'Laurence'
        ]);
        for (const test of [
            'c = q',
            'NOT c <> q',
            'c IN [q]',
            '[c] = [q]',
            '{x: c} = {x: q}',
            'CASE c WHEN q THEN true ELSE false END'
        ]) {
            expect([test, await rows(`${q} MATCH (c:Person) WHERE ${test} RETURN c.name`)]).toEqual([test, ['Carrie']]);
        }
        expect(await rows(`${q} OPTIONAL MATCH (c:Person) WHERE c = q RETURN c.name`)).toEqual(['Carrie']);
        expect(await rows(`${q} WHERE EXISTS { MATCH (c:Person) WHERE c = q } RETURN q.name`)).toEqual(['Carrie']);
        expect(await rows(`${q} RETURN COUNT { MATCH (c:Person) WHERE c = q }`)).toEqual([1]);
    });

    it('is null where OPTIONAL MATCH finds no node, as a value and as a test', async () => {
        // Oracle's comparison of two keys, both ways round, is null where either key is. A map or a list that holds the
        // nodes compares them by the same keys, entry by entry: null where no entry differs but one is null.
        const q = "MATCH (q:Person {name: 'Carrie'}) OPTIONAL MATCH (x:CyNeNope)";
        expect(
            await rows(
                `${q} RETURN [x = q, q = x, x <> q, NOT x = q, x = x, x IN [q], (x = q) IS NULL, coalesce(x = q, true)]`
            )
        ).toEqual([[null, null, null, null, null, null, true, true]]);
        expect(
            await rows(
                `${q} RETURN [{x: x} = {x: q}, {x: q, y: null} = {x: q, y: null}, {x: q} = {x: q, y: 1}, ` +
                    '{x: x, y: 1} = {x: q, y: 2}, [x, 1] = [q, 1]]'
            )
        ).toEqual([[null, null, false, false, null]]);
        expect(await rows(`${q} WITH q, x WHERE x = q OR NOT x = q RETURN q.name`)).toEqual([]);
        expect(await rows(`${q} WITH q, x WHERE (x = q) IS NULL RETURN q.name`)).toEqual(['Carrie']);
        expect(
            await rows(
                'MATCH (a:Person), (b:Person) RETURN [count(CASE WHEN a = b THEN 1 END), count(CASE WHEN NOT a = b THEN 1 END)]'
            )
        ).toEqual([[4, 12]]);
    });
});

/**
 * A node with a label set equal to a node found before it, by each form that finds the earlier node: on Oracle the later
 * node's labels are tested by their text, for it to be read by its key (#606, liberation-data/drivine4j#578), and the
 * rows are those Cypher keeps. drivine4j's `CypherQueryContract` case, not in the spec yet.
 */
describe.each(stores())('A node with a label set equal to a node found before it on $type', (store) => {
    let pm: PersistenceManager;

    const rows = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

    const count = async (cypher: string): Promise<number> => Number((await rows(cypher))[0]);

    const clear = async (): Promise<void> => clearLabels(pm, store, 'CyKey', 'CyOther');

    beforeAll(async () => {
        pm = persistenceManagerFor(store);
        await clear();
        await rows(
            'CREATE (a:CyKey:CyOther {k: 1}), (b:CyKey:CyOther {k: 2}), (c:CyKey {k: 3}), (d:CyOther {k: 4}), ' +
                '(d)-[:CY_KEY]->(a), (d)-[:CY_KEY]->(c)'
        );
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('keeps the rows Cypher keeps, in each form', async () => {
        const m = 'MATCH (a:CyKey) MATCH (b:CyKey)';
        for (const test of ['a = b', 'b = a', 'id(b) = id(a)', 'id(a) = id(b)', 'a = b AND b.k > 0']) {
            expect([test, await count(`${m} WHERE ${test} RETURN count(*)`)]).toEqual([test, 3]);
        }
        expect(await count('MATCH (a:CyKey), (b:CyKey) WHERE a = b RETURN count(*)')).toEqual(3);
        expect(await rows('MATCH (a:CyKey) WHERE a.k = 1 MATCH (b:CyKey) WHERE a = b RETURN b.k')).toEqual([1]);
        expect(await rows('MATCH (a:CyKey {k: 1}) MATCH (b:CyKey) WHERE a = b RETURN b.k')).toEqual([1]);
        expect(await count(`${m} WHERE a = b AND b.k > 1 RETURN count(*)`)).toEqual(2);
        // A label the other node doesn't carry, one of two, and two.
        expect(await count('MATCH (a:CyKey) MATCH (b:CyOther) WHERE a = b RETURN count(*)')).toEqual(2);
        expect(await count('MATCH (a:CyKey) MATCH (b:CyKey:CyOther) WHERE b = a RETURN count(*)')).toEqual(2);
        expect(await count('MATCH (a:CyKey:CyOther) MATCH (b:CyKey:CyOther) WHERE a = b RETURN count(*)')).toEqual(2);
        expect(await count('MATCH (a:CyKey) MATCH (b:CyNone) WHERE a = b RETURN count(*)')).toEqual(0);
        expect(await count('MATCH (x)-[:CY_KEY]->(a) MATCH (b:CyKey) WHERE a = b RETURN count(*)')).toEqual(2);
        expect(await count('MATCH (x)-[:CY_KEY]->(a) MATCH (b:CyOther) WHERE a = b RETURN count(*)')).toEqual(1);
        // The other node found by its properties or its id alone, before or after the node with the label.
        expect(await rows('MATCH (a {k: 1}) MATCH (b:CyKey) WHERE a = b RETURN b.k')).toEqual([1]);
        expect(await count('MATCH (b:CyOther) MATCH (a {k: 3}) WHERE a = b RETURN count(*)')).toEqual(0);
        expect(await rows('MATCH (b:CyOther) MATCH (a {k: 4}) WHERE b = a RETURN b.k')).toEqual([4]);
        const [one] = await rows('MATCH (n:CyKey {k: 1}) RETURN id(n)');
        const [four] = await rows('MATCH (n:CyOther {k: 4}) RETURN id(n)');
        const byId = 'MATCH (a) WHERE id(a) = $id MATCH (b:CyKey) WHERE a = b RETURN b.k';
        expect(await rows(byId, { id: one })).toEqual([1]);
        expect(await rows(byId, { id: four })).toEqual([]);
        expect(
            await rows('MATCH (a), (b:CyKey) WHERE id(a) IN $ids AND id(b) = id(a) RETURN b.k', { ids: [one, four] })
        ).toEqual([1]);
        expect(
            await rows('MATCH (a:CyKey) RETURN [a.k, [(x)-[:CY_KEY]->(b:CyKey) WHERE b = a | x.k]] ORDER BY a.k')
        ).toEqual([
            [1, [4]],
            [2, []],
            [3, [4]]
        ]);
        expect(
            await rows('MATCH (a:CyKey) OPTIONAL MATCH (b:CyOther) WHERE a = b RETURN [a.k, b.k] ORDER BY a.k')
        ).toEqual([
            [1, 1],
            [2, 2],
            [3, null]
        ]);
        expect(await count('MATCH (a:CyKey) WHERE EXISTS { MATCH (b:CyOther) WHERE a = b } RETURN count(*)')).toEqual(
            2
        );
        expect(
            await rows('MATCH (a:CyKey) RETURN [a.k, COUNT { MATCH (b:CyOther) WHERE b = a }] ORDER BY a.k')
        ).toEqual([
            [1, 1],
            [2, 1],
            [3, 0]
        ]);
        // Under NOT, beside an OR, or to a node found by nothing else: the test stands as it was.
        expect(await count(`${m} WHERE NOT a = b RETURN count(*)`)).toEqual(6);
        expect(await count(`${m} WHERE a = b OR b.k = 1 RETURN count(*)`)).toEqual(5);
        expect(await count('MATCH (a) MATCH (b:CyKey) WHERE a = b RETURN count(*)')).toEqual(3);
    });
});
