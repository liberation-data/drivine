import { holdsLabel, labelledValue } from '@/backend/oracle/OracleGraph';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler, TRAILING_ZEROS } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/**
 * A node matched by a property, the value an unwound row's (#636, liberation-data/drivine4j#617): compared as JSON
 * inside a `CASE` alone, which no index answers, so a batch of relationships read every node of the label for each
 * row. On Postgres, beside it now stands a test the index answers, `(props ->> key) = ANY(…)`, where the rows are known
 * to hold no list or map at the key. On Oracle the labelled index's expression stands beside it, for the properties
 * `indexedProperties` names: with none, as the connection compiles, the SQL is as it was. The rows each gives are
 * pinned by `CypherPropertyKeyIndex.spec.ts`.
 */
describe('A property a pattern compares with a row, compiled', () => {
    const ROW = 'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k';
    const WHERE = 'UNWIND $rows AS row MATCH (a:Person) WHERE a.id = row.s RETURN a.k';
    const rows = (...values: unknown[]): Record<string, unknown> => ({ rows: values.map((s) => ({ s })) });

    describe('on Postgres', () => {
        const postgres = (cypher: string, parameters: Record<string, unknown> = {}): string =>
            new PostgresCypherCompiler('g').compile(cypher, parameters).sql;
        const ANY = /\(n\d+\.props ->> 'id'\) = ANY\(/;

        it("reads the property through its index for a row's text, number or truth value, in a pattern or a WHERE", () => {
            for (const statement of [ROW, WHERE]) {
                const sql = postgres(statement, rows('p1', 7, 7.5, true));
                expect([statement, ANY.test(sql)]).toEqual([statement, true]);
                // Each count of trailing zeros, up to TRAILING_ZEROS, for a whole number and for one with a fraction.
                expect(sql).toContain(`|| '.${'0'.repeat(TRAILING_ZEROS)}'`);
                expect(sql).toContain(`|| '${'0'.repeat(TRAILING_ZEROS)}'`);
                expect(sql).not.toContain(`'.${'0'.repeat(TRAILING_ZEROS + 1)}'`);
            }
            expect(postgres(ROW, { rows: [{ s: 'p1' }, {}] })).toMatch(ANY);
            // A null in the rows has them compared as values that may hold one, as before.
            expect(postgres(ROW, rows('p1', null))).not.toMatch(ANY);
        });

        it('compares as JSON alone where a row may hold a list or a map at the key', () => {
            for (const value of [[1, 2], [], { a: 1 }]) {
                expect([value, ANY.test(postgres(ROW, rows('p1', value)))]).toEqual([value, false]);
                expect([value, ANY.test(postgres(WHERE, rows('p1', value)))]).toEqual([value, false]);
            }
        });

        it('reads an unwound item, a written list, and a key of a map at a row, for what they hold', () => {
            const ids = 'UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k';
            expect(postgres(ids, { ids: ['p1', 7, true] })).toMatch(ANY);
            expect(postgres(ids, { ids: ['p1', [1]] })).not.toMatch(ANY);
            expect(postgres("UNWIND ['', 'p5'] AS s MATCH (a:Person {id: s}) RETURN a.k")).toMatch(ANY);
            expect(postgres('UNWIND [[1, 2], 9] AS s MATCH (a:Person {id: s}) RETURN a.k')).not.toMatch(ANY);
            expect(
                postgres('UNWIND [{s: $a}, {s: 1}] AS row MATCH (a:Person {id: row.s}) RETURN a.k', { a: 'x' })
            ).toMatch(ANY);
            expect(
                postgres('UNWIND [{s: $a}, {s: 1}] AS row MATCH (a:Person {id: row.s}) RETURN a.k', { a: [1] })
            ).not.toMatch(ANY);
            // A function's value is no list the statement gives, so it may be one.
            expect(postgres('UNWIND [{s: range(1, 2)}] AS row MATCH (a:Person {id: row.s}) RETURN a.k')).not.toMatch(
                ANY
            );
            expect(
                postgres('UNWIND $rows AS row MATCH (a:Person {id: toString(row.s)}) RETURN a.k', rows('p1'))
            ).not.toMatch(ANY);
            const nested = 'UNWIND $rows AS row MATCH (a:Person {id: row.a.b}) RETURN a.k';
            expect(postgres(nested, { rows: [{ a: { b: 'p5' } }, {}, { a: { c: [1] } }] })).toMatch(ANY);
            expect(postgres(nested, { rows: [{ a: { b: 'p5' } }, { a: { b: [1, 2] } }] })).not.toMatch(ANY);
            // A key read through a list, which Neo4j refuses and Oracle's path reads of each item.
            expect(postgres(nested, { rows: [{ a: [{ b: 'p5' }] }] })).not.toMatch(ANY);
        });

        it("reads APOC's export batch through the index on a key of spaces", () => {
            const sql = postgres(
                'UNWIND [{start: {_id: 1}, end: {_id: 2}, properties: {}}] AS row ' +
                    'MATCH (start:`UNIQUE IMPORT LABEL` {`UNIQUE IMPORT ID`: row.start._id}) ' +
                    'MATCH (finish:`UNIQUE IMPORT LABEL` {`UNIQUE IMPORT ID`: row.end._id}) RETURN start, finish'
            );
            expect(sql.match(/->> 'UNIQUE IMPORT ID'\) = ANY\(/g)).toHaveLength(2);
        });

        it('compiles the same statement for the rows it is given each time: a list among them drops the index test', () => {
            // No compiled statement is kept by its text: the SQL depends on the parameters' values.
            const compiler = new PostgresCypherCompiler('g');
            expect(compiler.compile(ROW, rows('p5')).sql).toMatch(ANY);
            expect(compiler.compile(ROW, rows('p5', [1, 2])).sql).not.toMatch(ANY);
            expect(compiler.compile(ROW, rows('p5')).sql).toMatch(ANY);
        });

        it('writes no such test after a WITH that groups, nor for a WHERE with the row on the left', () => {
            expect(
                postgres('UNWIND $rows AS row WITH DISTINCT row MATCH (a:Person {id: row.s}) RETURN a.k', rows('p1'))
            ).not.toMatch(ANY);
            expect(
                postgres('UNWIND $rows AS row MATCH (a:Person) WHERE row.s = a.id RETURN a.k', rows('p1'))
            ).not.toMatch(ANY);
        });

        it("keeps the text test for a parameter's or a written text, and adds none for a number given", () => {
            expect(postgres('MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p1' })).toMatch(
                /\(n\d+\.props ->> 'id'\) = \(CAST\(\$_cy_s AS jsonb\) #>> '\{\}'\)/
            );
            expect(postgres('MATCH (a:Person {id: $s}) RETURN a.k', { s: 7 })).not.toContain("->> 'id'");
        });
    });

    describe('on Oracle', () => {
        const indexed: [string, string][] = [
            ['Person', 'id'],
            ['UNIQUE IMPORT LABEL', 'UNIQUE IMPORT ID']
        ];
        const oracle = (cypher: string, parameters: Record<string, unknown> = {}): string =>
            new OracleCypherCompiler('g', true, true, indexed).compile(cypher, parameters).sql;
        const bare = (cypher: string, parameters: Record<string, unknown> = {}): string =>
            new OracleCypherCompiler('g').compile(cypher, parameters).sql;
        const labelled = (alias: string): string => `${labelledValue(alias, 'Person', 'id')} = JSON_VALUE(`;
        const alias = (sql: string): string =>
            /CROSS JOIN g_node (n\d+)|FROM g_node (n\d+)/.exec(sql)!.slice(1).find(Boolean)!;

        it('compiles as before where it is told of no index, as the connection compiles', () => {
            for (const [statement, parameters] of [
                [ROW, rows('p1')],
                [WHERE, rows('p1')],
                ['MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p1' }]
            ] as const) {
                const sql = bare(statement, parameters);
                expect([statement, sql.includes('RETURNING VARCHAR2(4000) NULL ON ERROR) END =')]).toEqual([
                    statement,
                    false
                ]);
                expect(sql).toContain(`JSON_EXISTS(${alias(sql)}.labels, '$[*]?(@ == "Person")')`);
                expect(sql).not.toContain('CARDINALITY');
            }
        });

        it("reads a row's value through the labelled index, its labels tested by their text, and lets a list through", () => {
            const scalar = oracle(ROW, rows('p1', 7));
            const n = alias(scalar);
            expect(scalar).toContain(labelled(n));
            expect(scalar).toContain(holdsLabel(`${n}.labels`, 'Person'));
            expect(scalar).not.toContain(`JSON_EXISTS(${n}.labels, '$[*]?(@ == "Person")')`);
            expect(scalar).not.toMatch(/OR JSON_VALUE\([^)]*\) IS NULL\)/);
            // The unwound list planned as a few rows, which Oracle took for 8,168 and hashed every node of the label to.
            expect(scalar).toContain('CARDINALITY(u1 10)');
            const list = oracle(ROW, rows('p1', [1, 2]));
            expect(list).toContain(labelled(n));
            expect(list).toMatch(/OR JSON_VALUE\(.*, '\$'\) IS NULL\)/);
        });

        it("plans each unwound list as a few rows in the query that reads it: a UNION's, one after a subquery, one past a text with a bracket", () => {
            /** Each hinted alias, and the alias of the first list the query its hint opens reads: they are to be the same. */
            const placed = (sql: string): [string, string][] =>
                [
                    ...sql.matchAll(
                        /SELECT \/\*\+ CARDINALITY\((u\d+) 10\) \*\/ (?:(?!SELECT )[\s\S])*?'\$\[\*\]' COLUMNS \(item_no FOR ORDINALITY, item JSON PATH '\$'\)\) (u\d+)\b/g
                    )
                ].map((it) => [it[1], it[2]]);
            const union = oracle(
                'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k UNION ' +
                    'UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k',
                { ...rows('p1'), ids: ['p2'] }
            );
            expect(placed(union)).toEqual([
                ['u1', 'u1'],
                ['u4', 'u4']
            ]);
            // The outermost query reads no list: a hint there is one Oracle doesn't apply.
            expect(union).not.toMatch(/^SELECT \/\*\+[^*]*CARDINALITY/);
            // A subquery read before the list: the hint is the query's that reads both.
            const after = oracle(
                'MATCH (b:Person {id: $s}) WITH b UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k',
                { s: 'p1', ids: ['p2'] }
            );
            expect(after.match(/CARDINALITY\((u\d+) 10\)/)?.[1]).toBe(/\) (u\d+)\n/.exec(after)?.[1]);
            expect(after).toMatch(
                /SELECT \/\*\+ CARDINALITY\(u\d+ 10\) \*\/ JSON\(JSON_QUERY\(JSON_SERIALIZE\(JSON_TRANSFORM\(n\d+\.props, KEEP '\$\.k'\)/
            );
            expect(
                placed(oracle("UNWIND [{s: 'a)('}, {s: 'p2'}] AS row MATCH (a:Person {id: row.s}) RETURN a.k"))
            ).toEqual([['u1', 'u1']]);
        });

        it('lets through an empty text or one past 4,000 bytes, which the index holds no text for', () => {
            for (const value of ['', 'x'.repeat(5000)]) {
                expect(oracle(ROW, rows('p1', value))).toMatch(/OR JSON_VALUE\(.*, '\$'\) IS NULL\)/);
                expect(oracle('MATCH (a:Person {id: $s}) RETURN a.k', { s: value })).not.toContain(labelled('n1'));
            }
            // Bytes are bound as their base64 text: none, or past 4,000 bytes of it, is such a text.
            for (const value of [Buffer.alloc(0), Buffer.alloc(3001), new Int8Array(0)]) {
                expect(oracle(ROW, rows('p1', value))).toMatch(/OR JSON_VALUE\(.*, '\$'\) IS NULL\)/);
            }
            expect(oracle(ROW, rows('p1', Buffer.alloc(3)))).not.toMatch(/OR JSON_VALUE\([^)]*\) IS NULL\)/);
        });

        it("reads a parameter's text through the labelled index, which no test of Oracle's did", () => {
            const sql = oracle('MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p1' });
            expect(sql).toContain(`${labelledValue('n1', 'Person', 'id')} = JSON_VALUE(JSON($_cy_s), '$')`);
            expect(sql).toContain(holdsLabel('n1.labels', 'Person'));
        });

        it("reads a parameter's text through the labelled index where a walk sets out from the node, or a quantified path's node is found", () => {
            // The walk's seed, a variable-length relationship's ends.
            const walk = oracle('MATCH (a:Person)-[:FOLLOWS*1..2]->(b:Person {id: $s}) RETURN a.k', { s: 'p1' });
            expect(walk).toMatch(
                /WITH w\d+ \(src, nid, depth, nids, eids\) AS \(\s*SELECT [^\n]*\n\s*FROM g_node (p\d+_n) WHERE [^\n]*/
            );
            const seed = /FROM g_node (p\d+_n) WHERE [^\n]*/.exec(walk)!;
            expect(seed[0]).toContain(`${labelledValue(seed[1], 'Person', 'id')} = JSON_VALUE(JSON($_cy_s), '$')`);
            expect(bare('MATCH (a:Person)-[:FOLLOWS*1..2]->(b:Person {id: $s}) RETURN a.k', { s: 'p1' })).not.toContain(
                'NULL ON ERROR) END ='
            );
            // A node of a quantified path, tested on each step of the walk.
            const quantified = oracle('MATCH p = ((x:Person {id: $s})-[:FOLLOWS]->(:Person)){1,2} RETURN length(p)', {
                s: 'p1'
            });
            const step = /JOIN g_node (n\d+) ON n\d+\.nid = w\d+\.nid/.exec(quantified)!;
            expect(quantified).toContain(`${labelledValue(step[1], 'Person', 'id')} = JSON_VALUE(JSON($_cy_s), '$')`);
        });

        it('writes no such test for a label or property it is told of no index over, after a grouping WITH, or for a WHERE', () => {
            expect(oracle('UNWIND $rows AS row MATCH (a:Movie {id: row.s}) RETURN a.k', rows('p1'))).not.toContain(
                'NULL ON ERROR) END ='
            );
            expect(oracle('UNWIND $rows AS row MATCH (a:Person {name: row.s}) RETURN a.k', rows('p1'))).not.toContain(
                'NULL ON ERROR) END ='
            );
            expect(
                oracle('UNWIND $rows AS row WITH DISTINCT row MATCH (a:Person {id: row.s}) RETURN a.k', rows('p1'))
            ).not.toContain('NULL ON ERROR) END =');
            // A WHERE names no label to write the labelled index's expression for.
            expect(oracle(WHERE, rows('p1'))).not.toContain('NULL ON ERROR) END =');
        });
    });

    it('on SQLite, compiles as before: its index test stands beside a text or a truth value given alone', () => {
        const sqlite = (cypher: string, parameters: Record<string, unknown> = {}): string =>
            new SqliteCypherCompiler('g').compile(cypher, parameters).sql;
        expect(sqlite(ROW, rows('p1'))).not.toContain('= (CASE json_type(');
        expect(sqlite('MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p1' })).toContain('= (CASE json_type(');
    });
});
