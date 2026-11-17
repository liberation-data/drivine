import { openSqlite, SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { SqliteGraph } from '@/backend/sqlite/SqliteGraph';

/**
 * The functions compiled Cypher calls on SQLite that Drivine implements itself, each asked directly in SQL: what each
 * gives, and what it gives of null, as drivine4j's `SqliteCypherFunctionsTest` asks them. The shared compiler's own,
 * which Drivine registers too, are the spec's host.yaml's: see HostSpec and SqliteHostFunctions. A whole number is read as a bigint, so one SQLite holds as an
 * integer is told from one it holds as a real.
 */
describe('SqliteCypherFunctions', () => {
    let db: SqliteDatabase;

    beforeEach(() => {
        db = openSqlite(':memory:');
        SqliteFunctions.register(db);
    });

    afterEach(() => db.close());

    const row = (sql: string): SqliteValue[] => {
        const statement = db.prepare(sql);
        statement.setReadBigInts(true);
        statement.setReturnArrays(true);
        return statement.get() as unknown as SqliteValue[];
    };
    const one = (sql: string): SqliteValue => row(`SELECT ${sql}`)[0];
    const n = BigInt;

    it('exports each function by drivine4j SQL name', () => {
        expect(SqliteFunctions).toMatchObject({
            CYPHER: 'drivine_cypher',
            UPPER: 'drivine_upper',
            SPLIT: 'drivine_split',
            REVERSE: 'drivine_reverse',
            UUID: 'drivine_uuid',
            MATH: 'drivine_math',
            FAIL: 'drivine_fail'
        });
    });

    it('reads a real number given as text as SQLite writes one, to 15 digits', () => {
        expect(
            row(
                `SELECT drivine_upper(2.0), drivine_upper(1.0 / 3), drivine_upper(1e20), drivine_upper(1e-7), ` +
                    `drivine_upper(855.4482850851075), drivine_upper(12)`
            )
        ).toEqual(['2.0', '0.333333333333333', '1.0E+20', '1.0E-07', '855.448285085108', '12']);
    });

    describe('the text functions', () => {
        it('raise, split, reverse and make a UUID', () => {
            expect(
                row(
                    `SELECT drivine_upper('école'), drivine_split('a,,b,', ','), drivine_split('a😀', ''), drivine_split('', ','), ` +
                        `drivine_reverse('ab😀'), drivine_split(NULL, ','), drivine_upper('straße'), drivine_upper(NULL)`
                )
            ).toEqual(['ÉCOLE', '["a","","b",""]', '["a","😀"]', '[""]', '😀ba', null, 'STRASSE', null]);
            expect(one('drivine_uuid()')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(one('drivine_uuid() <> drivine_uuid()')).toEqual(n(1));
        });

        it('lowers as Unicode does', () => {
            expect(row(`SELECT drivine_lower('ÉCOLE'), drivine_lower(NULL)`)).toEqual(['école', null]);
        });
    });

    it('drivine_regexp_count counts matches as an integer', () => {
        expect(row(`SELECT drivine_regexp_count('aXa', 'a'), drivine_regexp_count(NULL, 'a')`)).toEqual([n(2), n(0)]);
    });

    describe('drivine_math', () => {
        it("works out openCypher's functions of numbers as Java's Math does", () => {
            expect(
                row(
                    `SELECT drivine_math('exp', 0), drivine_math('log10', 1000), drivine_math('sqrt', 16), drivine_math('atan2', 1, 1), ` +
                        `drivine_math('degrees', pi()), drivine_math('radians', 180), drivine_math('haversin', 0), ` +
                        `drivine_math('cot', 1), drivine_math('sin', NULL)`
                )
            ).toEqual([1, 3, 4, Math.PI / 4, 180, Math.PI, 0, 1 / Math.tan(1), null]);
            expect(one(`typeof(drivine_math('sqrt', 16))`)).toEqual('real');
        });

        it('fails where Java gives NaN or an infinity, which JSON holds no value for', () => {
            expect(() => one(`drivine_math('log', 0)`)).toThrow('log() of 0.0 is -Infinity, which JSON holds no value');
            expect(() => one(`drivine_math('sqrt', -1)`)).toThrow('sqrt() of -1.0 is NaN');
            expect(() => one(`drivine_math('nope', 1)`)).toThrow('drivine_math has no function nope.');
        });
    });

    it('drivine_fail fails the statement with its text', () => {
        expect(() => one(`drivine_fail('round() of a precision below 0')`)).toThrow('round() of a precision below 0');
        expect(one(`CASE WHEN 1 = 0 THEN drivine_fail('never') ELSE 'fine' END`)).toEqual('fine');
    });

    describe('drivine_cypher', () => {
        const graph = new SqliteGraph('cyfunctions');
        const steps = (...given: object[]): string => JSON.stringify({ steps: given }).replace(/'/g, "''");
        const set = { op: 'select', sql: `SELECT '{"n":1}'`, variables: [], variable: 'cy_value' };
        const insert = {
            op: 'execute',
            sql: `INSERT INTO cyfunctions_node (labels, props) VALUES ('[]', ?1) RETURNING nid`,
            variables: ['cy_value'],
            variable: 'cy_id'
        };
        const returned = { op: 'return', sql: 'SELECT json_quote(?1) AS result', variables: ['cy_id'] };
        const count = (): SqliteValue => one('count(*) FROM cyfunctions_node');

        beforeEach(() => graph.ddl.forEach((it) => db.exec(it)));

        it('carries out its steps, and gives the rows it returns as a JSON list', () => {
            expect(one(`drivine_cypher('${steps(set, insert, returned)}', '{}')`)).toEqual('[1]');
            expect(one(`props FROM cyfunctions_node`)).toEqual('{"n":1}');
        });

        it('binds a variable that holds a number as one, and not as its text', () => {
            const real = { op: 'select', sql: 'SELECT 1.5', variables: [], variable: 'cy_value' };
            const big = { op: 'select', sql: 'SELECT 9007199254740993', variables: [], variable: 'cy_id' };
            const typed = {
                op: 'return',
                sql: 'SELECT json_quote(?1) AS result UNION ALL SELECT json_quote(?2) UNION ALL SELECT ?1',
                variables: ['cy_value', 'cy_id']
            };
            expect(one(`drivine_cypher('${steps(real, big, typed)}', '{}')`)).toEqual('[1.5,9007199254740993,1.5]');
        });

        it('binds the parameters, loops over rows read before the loop writes, and runs a body where its condition holds', () => {
            const program = steps(
                {
                    op: 'loop',
                    sql: `SELECT value FROM json_each(?1 ->> '$.names')`,
                    variables: ['cy_params'],
                    record: 'cy_record.item',
                    body: [
                        {
                            op: 'execute',
                            sql: `INSERT INTO cyfunctions_node (labels, props) VALUES ('[]', json_object('name', ?1))`,
                            variables: ['cy_record.item'],
                            variable: null
                        },
                        {
                            op: 'if',
                            sql: `SELECT CASE WHEN ?1 = 'b' THEN 1 ELSE 0 END`,
                            variables: ['cy_record.item'],
                            body: [{ op: 'return', sql: `SELECT json_quote(?1)`, variables: ['cy_record.item'] }]
                        }
                    ]
                },
                { op: 'return', sql: 'SELECT count(*) FROM cyfunctions_node', variables: [] }
            );
            expect(one(`drivine_cypher('${program}', '{"names":["a","b","c"]}')`)).toEqual('["b",3]');
        });

        it('undoes the steps before one that fails', () => {
            expect(() => one(`drivine_cypher('${steps(set, insert, { op: 'raise', message: 'no' })}', '{}')`)).toThrow(
                'no'
            );
            expect(count()).toEqual(n(0));
            expect(() => one(`drivine_cypher('${steps(set, insert, { op: 'jump' })}', '{}')`)).toThrow('no step jump');
            expect(count()).toEqual(n(0));
            expect(one(`drivine_cypher('${steps(set, insert, returned)}', '{}')`)).toEqual('[1]');
            expect(count()).toEqual(n(1));
        });
    });
});
