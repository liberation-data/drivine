import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/**
 * A `DELETE` compiles to one statement for each table it deletes from, over all its rows at once, and not to a loop of a
 * statement for each row (#612, liberation-data/drivine4j#587): `MATCH (n) DETACH DELETE n` over 1.1M nodes ran 1.1M
 * single-row deletes, 17 minutes on Postgres. One that ends the statement and deletes from one table reads its ids from
 * the match itself, so the match's rows are not gathered into a list first. The rows are pinned by
 * `CypherSetBasedDelete.spec.ts`. drivine4j's `SetBasedDeleteTest`.
 */
describe('A DELETE, compiled', () => {
    const compilers: SqlCypherCompiler[] = [
        new OracleCypherCompiler('g'),
        new PostgresCypherCompiler('g'),
        new SqliteCypherCompiler('g')
    ];

    /** The rows gathered into the procedure's list of them: the step that sets it, in PL/pgSQL and PL/SQL, or in SQLite's steps. */
    const gathered = /INTO cy_rows\b|"variable":"cy_rows"/g;

    /** A loop over the rows, in PL/pgSQL and PL/SQL, or in SQLite's steps. */
    const loop = /FOR cy_record IN|"op":"loop"/;

    /** `cypher` as `compiler` compiles it: on Postgres, the function made before the statement too. */
    const compiled = (compiler: SqlCypherCompiler, cypher: string): string => {
        const it = compiler.compile(cypher);
        return [...it.setup, it.sql].join('\n');
    };

    const count = (sql: string, pattern: RegExp): number => (sql.match(pattern) ?? []).length;

    /** How often `table`'s rows are deleted in `cypher` as `compiler` compiles it, whether it loops over rows, and whether it gathers them. */
    const shape = (compiler: SqlCypherCompiler, cypher: string, table: string): [number, boolean, boolean] => {
        const sql = compiled(compiler, cypher);
        return [count(sql, new RegExp(`DELETE FROM ${table}\\b`, 'g')), loop.test(sql), count(sql, gathered) > 0];
    };

    const named = (compiler: SqlCypherCompiler, cypher?: string): string =>
        `${compiler.constructor.name}${cypher ? `: ${cypher}` : ''}`;

    it('deletes the nodes a DETACH DELETE that ends the statement reads from its match in one statement, with no rows gathered', () => {
        for (const cypher of [
            'MATCH (n) DETACH DELETE n',
            'MATCH (n:X)-[:R]->() WHERE n.k > 1 DETACH DELETE n',
            'MATCH (n:X) WITH n ORDER BY n.k LIMIT 2 DETACH DELETE n'
        ]) {
            compilers.forEach((compiler) => {
                expect([named(compiler, cypher), shape(compiler, cypher, 'g_node')]).toEqual([
                    named(compiler, cypher),
                    [1, false, false]
                ]);
            });
        }
    });

    it('deletes the relationships a DELETE that ends the statement reads in one statement, with no rows gathered', () => {
        for (const cypher of ['MATCH ()-[r:R]->() DELETE r', 'MATCH ()-[r:R]->() DETACH DELETE r']) {
            compilers.forEach((compiler) => {
                expect([named(compiler, cypher), shape(compiler, cypher, 'g_edge')]).toEqual([
                    named(compiler, cypher),
                    [1, false, false]
                ]);
            });
        }
    });

    it('gathers the rows of a DELETE that ends the statement after a WITH that binds a value, and deletes them in one statement', () => {
        const cypher = 'MATCH (n) WITH n, n.k AS k DETACH DELETE n';
        compilers.forEach((compiler) => {
            expect([named(compiler), shape(compiler, cypher, 'g_node')]).toEqual([named(compiler), [1, false, true]]);
        });
    });

    it('gathers the rows of a DELETE of nodes without DETACH once, so its test for relationships reads the nodes it deletes', () => {
        // Read from the match twice, a match that makes a value anew for each row would test some nodes and delete others.
        compilers.forEach((compiler) => {
            const sql = compiled(compiler, "MATCH (n) WHERE randomUUID() < '8' DELETE n");
            expect([
                named(compiler),
                count(sql, gathered),
                count(sql, /DELETE FROM g_node\b/g),
                loop.test(sql)
            ]).toEqual([named(compiler), 1, 1, false]);
        });
    });

    it('reads the key with + 0 on Oracle, where a DELETE reads its match, which Oracle does not unnest into a wrong answer', () => {
        const oracle = new OracleCypherCompiler('g');
        expect(compiled(oracle, 'MATCH (g:Gone) DETACH DELETE g')).toMatch(
            /DELETE FROM g_node WHERE nid IN \(SELECT \/\*\+ NO_ADAPTIVE_PLAN \*\/ n\d+\.nid \+ 0 AS id/
        );
        expect(compiled(oracle, 'MATCH ()-[r:R]->() DELETE r')).toMatch(
            /DELETE FROM g_edge WHERE eid IN \(SELECT \/\*\+ NO_JSON_TABLE_TRANSFORM NO_ADAPTIVE_PLAN \*\/ e\d+\.eid \+ 0 AS id/
        );
        for (const compiler of [new PostgresCypherCompiler('g'), new SqliteCypherCompiler('g')]) {
            expect(compiled(compiler, 'MATCH (g:Gone) DETACH DELETE g')).toMatch(
                /DELETE FROM g_node WHERE nid IN \(SELECT n\d+\.nid AS id/
            );
        }
    });

    it('refuses in a DELETE that ends the statement what a DELETE over the rows refuses', () => {
        compilers.forEach((compiler) => {
            expect(() => compiler.compile('MATCH (n) DETACH DELETE m')).toThrow(
                'm is not defined: a variable is bound by a pattern, a WITH or an UNWIND before it is used.'
            );
            expect(() => compiler.compile('MATCH (n) DETACH DELETE n.x')).toThrow(
                'A DELETE of anything but a variable is Cypher, and is not compiled to SQL yet.'
            );
        });
    });

    it("deletes each table's ids in one statement over the rows, with no loop, where rows follow or nodes and relationships go together", () => {
        const cases: [string, number[]][] = [
            ['MATCH (n) DETACH DELETE n RETURN count(*)', [0, 1]],
            ['MATCH (n) DELETE n', [0, 1]],
            ['MATCH (a)-[r]->(b) DELETE r, a', [1, 1]],
            ['MATCH (a)-[r]->(b) DETACH DELETE r, a, b', [1, 1]],
            ['MATCH (a)-[r]->(b) DETACH DELETE a DELETE r', [1, 1]],
            ['MATCH (n) WITH n, n.k AS k DETACH DELETE n RETURN sum(k)', [0, 1]]
        ];
        for (const [cypher, tables] of cases) {
            compilers.forEach((compiler) => {
                expect([
                    named(compiler, cypher),
                    ['g_edge', 'g_node'].map((table) => shape(compiler, cypher, table)[0]),
                    shape(compiler, cypher, 'g_node')[1]
                ]).toEqual([named(compiler, cypher), tables, false]);
            });
        }
    });

    it('deletes in one statement for each pass of a FOREACH and of a CALL { … } that writes, each pass a row', () => {
        for (const cypher of [
            'MATCH (n) WITH collect(n) AS ns FOREACH (n IN ns | DETACH DELETE n)',
            'MATCH (n) CALL (n) { DETACH DELETE n } RETURN count(*)'
        ]) {
            compilers.forEach((compiler) => {
                expect([named(compiler, cypher), shape(compiler, cypher, 'g_node')[0]]).toEqual([
                    named(compiler, cypher),
                    1
                ]);
            });
        }
    });
});
