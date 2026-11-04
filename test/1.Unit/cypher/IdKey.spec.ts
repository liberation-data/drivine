import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

const GRAPH = 'idkey';

/**
 * An id compared by `=` or `IN`, where the row must pass the comparison, has a test of the node's or the relationship's
 * key beside it, so the store reads the row by its primary key (#596, liberation-data/drivine4j#575). Under `NOT`,
 * beside an `OR`, in a `CASE` or as a value, the comparison stands alone. The rows and plans are pinned by
 * `CypherIdKey.spec.ts` and `CypherIdKeyPlan.spec.ts`; this pins the shape on each store.
 */
describe('An id compared, compiled', () => {
    const stores = [
        ['Postgres', new PostgresCypherCompiler(GRAPH), /\bn1\.nid = \(CASE WHEN jsonb_typeof\(/],
        ['Oracle', new OracleCypherCompiler(GRAPH), /\bn1\.nid = JSON_VALUE\(/],
        ['SQLite', new SqliteCypherCompiler(GRAPH), /\bn1\.nid = \(CASE WHEN json_type\(/]
    ] as const;

    const sql = (
        compiler: { compile: (cypher: string, parameters: any) => { sql: string } },
        cypher: string,
        parameters = {}
    ) => compiler.compile(cypher, parameters).sql;

    it.each(stores)(
        'reads the key beside an id equal to a value, where the row must pass it, on %s',
        (_, compiler, keyed) => {
            [
                'MATCH (n) WHERE id(n) = $id RETURN n',
                'MATCH (n) WHERE $id = id(n) RETURN n',
                'MATCH (n) WHERE elementId(n) = $id RETURN n',
                'MATCH (n) WHERE n.k >= 0 AND id(n) = $id AND n.k < 100 RETURN n'
            ].forEach((cypher) =>
                expect([cypher, sql(compiler, cypher, { id: 5 })]).toEqual([cypher, expect.stringMatching(keyed)])
            );
        }
    );

    it.each(stores)('reads the key of each item of a list given or written, on %s', (_, compiler) => {
        const cypher = 'MATCH (n) WHERE id(n) IN $ids RETURN n';
        expect(sql(compiler, cypher, { ids: [1, 2] })).toMatch(/\bn1\.nid IN \(SELECT /);
        expect(sql(compiler, 'MATCH (n) WHERE id(n) IN [$a, null] RETURN n', { a: 1 })).toMatch(
            /\bn1\.nid IN \(SELECT /
        );
        // A list worked out, or read from the store, may be no list: no key is read beside it.
        expect(sql(compiler, 'MATCH (n) WHERE id(n) IN n.ids RETURN n')).not.toMatch(/\bn1\.nid IN \(SELECT /);
    });

    it('compares two keys plainly, and on Oracle with + 0 on one side, both ways round', () => {
        const cypher = 'MATCH (a) MATCH (b) WHERE id(b) = id(a) RETURN b';
        expect(sql(new PostgresCypherCompiler(GRAPH), cypher)).toContain('n2.nid = n1.nid AND');
        expect(sql(new SqliteCypherCompiler(GRAPH), cypher)).toContain('n2.nid = n1.nid AND');
        expect(sql(new OracleCypherCompiler(GRAPH), cypher)).toContain('(n2.nid = n1.nid + 0 AND n1.nid = n2.nid + 0) AND');
    });

    it.each(stores)('reads a relationship by its key, on %s', (_, compiler) => {
        expect(sql(compiler, 'MATCH ()-[r]->() WHERE id(r) = $id RETURN r', { id: 3 })).toMatch(/\be\d+\.eid = /);
    });

    it.each(stores)(
        'leaves the comparison alone under NOT, beside an OR, in a CASE or as a value, on %s',
        (_, compiler) => {
            [
                'MATCH (n) WHERE NOT id(n) = $id RETURN n',
                'MATCH (n) WHERE NOT id(n) IN $ids RETURN n',
                'MATCH (n) WHERE id(n) = $id OR n.k = 7 RETURN n',
                'MATCH (n) WHERE (id(n) = $id) = false RETURN n',
                'MATCH (n) WHERE CASE WHEN id(n) IN $ids THEN true ELSE false END RETURN n',
                'MATCH (n) RETURN id(n) = $id'
            ].forEach((cypher) => {
                const compiled = sql(compiler, cypher, { id: 5, ids: [5] });
                expect([cypher, compiled]).toEqual([cypher, expect.not.stringMatching(/\bn1\.nid (=|IN) /)]);
            });
        }
    );

    it.each(stores)(
        'reads no key beside an id compared with a temporal value, a list of them, or a parameter that is no list, on %s',
        (_, compiler) => {
            // A temporal value compares by its kind, not as its JSON: no number it holds is a key.
            [
                "MATCH (n) WHERE id(n) = date('2020-01-01') RETURN n",
                "MATCH (n) WHERE id(n) IN [date('2020-01-01'), 1] RETURN n",
                "MATCH (n) WHERE id(n) IN [date('2020-01-01'), null] RETURN n",
                'MATCH (n) WHERE id(n) IN $ids RETURN n'
            ].forEach((cypher) => {
                const compiled = sql(compiler, cypher, { ids: null });
                expect([cypher, compiled]).toEqual([cypher, expect.not.stringMatching(/\bn1\.nid (=|IN) /)]);
            });
        }
    );

    it.each(stores)('compiles a statement with no id compared as it did, on %s', (_, compiler) => {
        // No key test where nothing is an id: an equality of properties, and an IN of a property.
        ['MATCH (n) WHERE n.k = $k RETURN n', 'MATCH (n) WHERE n.k IN $ks RETURN n'].forEach((cypher) =>
            expect(sql(compiler, cypher, { k: 1, ks: [1] })).not.toMatch(/\.nid (=|IN) /)
        );
    });
});
