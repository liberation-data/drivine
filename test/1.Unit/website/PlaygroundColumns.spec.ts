import { returnedColumns } from '../../../website/src/playground/columns';

// The playground names a result's columns from the query's last RETURN (website/src/playground/columns.ts).
describe("the playground's column names", () => {
    it.each([
        ['MATCH (p) RETURN p.name AS actor, r.roles AS roles ORDER BY actor', ['actor', 'roles']],
        ['MATCH (n) RETURN DISTINCT coalesce(n.name, n.title) AS reached, labels(n) AS labels', ['reached', 'labels']],
        ['MATCH (p) RETURN p.name, count(*)', ['p.name', 'count(*)']],
        ["RETURN {a: 1, b: [1, 2]} AS m, 'x, AS y' AS `odd name`", ['m', 'odd name']],
        ['CALL { MATCH (n) RETURN n AS inner } RETURN inner.name AS name LIMIT 3', ['name']],
        ['RETURN 1 AS a UNION RETURN 2 AS a', ['a']],
        ['MATCH (n) WHERE n.note = "RETURN x" RETURN n.id AS id SKIP 1', ['id']]
    ])('reads %s', (cypher, columns) => {
        expect(returnedColumns(cypher)).toEqual(columns);
    });

    it('reads none from a statement that returns nothing', () => {
        expect(returnedColumns('MATCH (n) DETACH DELETE n')).toBeUndefined();
    });
});
