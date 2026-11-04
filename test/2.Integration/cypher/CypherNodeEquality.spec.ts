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
