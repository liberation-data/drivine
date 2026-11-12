import { types } from 'pg';
import { nonFiniteOf, nonFiniteTypes, readNonFiniteJson } from '@/connection/postgres/PostgresNonFinite';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { CompiledSpecification } from '@/cypher/CompiledSpecification';
import { compiledAs } from '../../CompiledAs';

/** The numbers drivine4j's compiler writes on Postgres for NaN and the infinities, as `jsonb` writes them. */
const NAN = `2${'0'.repeat(309)}.5`;
const INFINITY = `1${'0'.repeat(309)}.5`;
const NEGATIVE_INFINITY = `-${INFINITY}`;

/**
 * How the rows of a statement given NaN or an infinity are read on Postgres, as drivine4j's
 * `PostgresCypherCompiler.read` reads them (liberation-data/drivine#673).
 */
describe('Postgres NaN and the infinities', () => {
    it.each([
        [NAN, NaN],
        [`${NAN}0`, NaN],
        [`${NAN}e0`, NaN],
        [`0.2${'0'.repeat(309)}5e310`, NaN],
        [INFINITY, Infinity],
        [NEGATIVE_INFINITY, -Infinity],
        ['1e309', Infinity],
        ['2e309', Infinity],
        [`2${'0'.repeat(309)}.4`, Infinity],
        [`2${'0'.repeat(309)}.6`, Infinity],
        ['-2e309', -Infinity],
        [`-${NAN}`, -Infinity],
        ['1e400', Infinity]
    ])('should read %s as %s', (text, number) => {
        expect(nonFiniteOf(text)).toBe(number);
    });

    it.each([
        '1e308',
        '-1e308',
        '1.7976931348623157e308',
        `9${'9'.repeat(307)}.9`,
        '0',
        '-0.0',
        '2.5',
        '0.0000000000000000000000000000000000000000000000000001'
    ])('should read %s as the number it is', (text) => {
        expect(nonFiniteOf(text)).toBeUndefined();
        expect(readNonFiniteJson(text)).toBe(JSON.parse(text));
    });

    it('should read the stand-ins nested in lists and maps, and leave the rest', () => {
        const text = `{"a": [1, ${NAN}, {"b": ${INFINITY}}], "c": ${NEGATIVE_INFINITY}, "d": "${NAN}", "e": 2e309, "f": 1e308}`;
        expect(readNonFiniteJson(text)).toEqual({
            a: [1, NaN, { b: Infinity }],
            c: -Infinity,
            d: NAN,
            e: Infinity,
            f: 1e308
        });
        expect(Object.is(readNonFiniteJson(`[${NAN}]`)[0], NaN)).toBe(true);
    });

    it('should read the stand-in for NaN as JSON.parse does, an infinity, where not asked to', () => {
        expect(JSON.parse(NAN)).toBe(Infinity);
    });

    it('should parse json and jsonb for NaN, and each other type as the client does', () => {
        const client = { getTypeParser: jest.fn(() => 'theirs') };
        const parsers = nonFiniteTypes(client);
        expect(parsers.getTypeParser(114, 'text')(`[${NAN}]`)).toEqual([NaN]);
        expect(parsers.getTypeParser(3802, 'text')(`[${NAN}]`)).toEqual([NaN]);
        expect(parsers.getTypeParser(3802)(`[${NAN}]`)).toEqual([NaN]);
        expect(parsers.getTypeParser(25, 'text')).toBe('theirs');
        expect(client.getTypeParser).toHaveBeenCalledWith(25, 'text');
        // jsonb read as binary is the client's to read, not text's.
        expect(parsers.getTypeParser(3802, 'binary')).toBe('theirs');
        expect(client.getTypeParser).toHaveBeenCalledWith(3802, 'binary');
        // Nothing is set for the process.
        expect(types.getTypeParser(3802, 'text')(`[${NAN}]`)).toEqual([Infinity]);
    });

    it('should fail, before a statement runs, where JSON.parse gives a reviver no source text', () => {
        const parse = JSON.parse;
        JSON.parse = (text: string, reviver?: (key: string, value: any) => any) =>
            parse(text, reviver && ((key, value) => reviver.call(undefined, key, value)));
        try {
            jest.isolateModules(() => {
                const isolated: typeof import('@/connection/postgres/PostgresNonFinite') = require('@/connection/postgres/PostgresNonFinite');
                expect(() => isolated.nonFiniteTypes({ getTypeParser: () => undefined })).toThrow(
                    /needs a JSON.parse .* from Node 21/
                );
                expect(() => isolated.readNonFiniteJson(`[${NAN}]`)).toThrow(/from Node 21/);
            });
        } finally {
            JSON.parse = parse;
        }
    });
});

/** A client whose every statement gives the row `{ result: 1 }`. */
function client(): { query: jest.Mock; getTypeParser: jest.Mock; sessionId: string } {
    return {
        query: jest.fn(async () => Promise.resolve({ rows: [{ result: 1 }] })),
        getTypeParser: jest.fn(() => (it: string) => it),
        sessionId: 'pg.1'
    };
}

const compiled = (nonFinite: boolean): CompiledSpecification<unknown> => ({
    spec: new QuerySpecification({ text: 'SELECT $1 AS result', language: 'SQL' }).bind([2]),
    setup: ['SELECT 0'],
    rows: 'one',
    nonFinite
});

/**
 * Which statements a Postgres connection reads for NaN: those that say they were given one, alone. Every compiled
 * statement's JSON is read with its whole numbers past 2^53 kept (liberation-data/drivine#735).
 */
describe('A Postgres connection reading NaN', () => {
    it('should run a statement not given NaN with types that keep its whole numbers, and read no NaN', async () => {
        const it = client();
        const rows = await compiledAs(new PostgresConnection(it as any, new PostgresResultMapper()), compiled(false));
        expect(rows).toEqual([1]);
        expect(it.query.mock.calls[0]).toEqual(['SELECT 0']);
        const [config] = it.query.mock.calls[1];
        expect(config).toMatchObject({ text: 'SELECT $1 AS result', values: [2] });
        const read = config.types.getTypeParser(3802, 'text');
        expect(read('[9007199254740993, 2.5, 100000000000000000000]')).toEqual([BigInt('9007199254740993'), 2.5, 1e20]);
        expect(read(`${NAN}`)).not.toBeNaN();
        expect(config.types.getTypeParser(25, 'text')).toBe(it.getTypeParser.mock.results[0].value);
    });

    it('should run a statement given NaN with the types that read it, after its setup', async () => {
        const it = client();
        const rows = await compiledAs(new PostgresConnection(it as any, new PostgresResultMapper()), compiled(true));
        expect(rows).toEqual([1]);
        expect(it.query.mock.calls[0]).toEqual(['SELECT 0']);
        const [config] = it.query.mock.calls[1];
        expect(config).toMatchObject({ text: 'SELECT $1 AS result', values: [2] });
        expect(config.types.getTypeParser(3802, 'text')(`${NAN}`)).toBeNaN();
    });

    it('should run SQL as it runs any, with no types of its own', async () => {
        const it = client();
        const connection = new PostgresConnection(it as any, new PostgresResultMapper());
        await connection.query(new QuerySpecification('SELECT 1'));
        for (const call of it.query.mock.calls) {
            expect(typeof call[0]).toBe('string');
            expect(call).toHaveLength(2);
        }
    });
});
