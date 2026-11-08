import { DatabaseRegistry, QuerySpecification } from '@liberation-data/drivine';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { compiledAs } from '../../CompiledAs';
import { closeGraphEngines } from '../support/GraphEngines';

jest.setTimeout(60_000);

/** The numbers drivine4j's compiler writes for NaN and the infinities, and two that stand for neither. */
const NUMBERS = 'to_jsonb(2e309 + 0.5), to_jsonb(1e309 + 0.5), to_jsonb(-1e309 - 0.5), to_jsonb(1e308), to_jsonb(2.5)';

/** As JSON.parse reads them. */
const AS_TODAY = [Infinity, Infinity, -Infinity, 1e308, 2.5];

const describeOnPostgres = process.env.POSTGRES_DATABASE_TYPE === 'POSTGRES' ? describe : describe.skip;

/**
 * The numbers that stand for NaN and the infinities in the rows of a statement given one, as drivine4j's compiler
 * writes them on Postgres, read back as the doubles they are where the statement says so, and as today where it doesn't
 * (liberation-data/drivine#673).
 */
describeOnPostgres('Postgres NaN and the infinities', () => {
    let connection: PostgresConnection;

    beforeAll(async () => {
        DatabaseRegistry.buildOrResolveFromEnv('POSTGRES');
        connection = (await DatabaseRegistry.getInstance()
            .connectionProvider('POSTGRES')!
            .connect()) as PostgresConnection;
        expect(connection).toBeInstanceOf(PostgresConnection);
    });

    afterAll(async () => {
        await connection?.release();
        await closeGraphEngines();
    });

    const run = async (sql: string, nonFinite: boolean): Promise<any[]> =>
        compiledAs(connection, {
            spec: new QuerySpecification({ text: sql, language: 'SQL' }),
            setup: [],
            rows: 'one',
            nonFinite
        });

    it('should read them as NaN and the infinities in jsonb and json, nested too', async () => {
        expect(await run(`SELECT jsonb_build_array(${NUMBERS}) AS result`, true)).toEqual([
            [NaN, Infinity, -Infinity, 1e308, 2.5]
        ]);
        expect(
            await run(
                `SELECT jsonb_build_object('a', jsonb_build_array(to_jsonb(2e309 + 0.5)), 'b', 1) AS result`,
                true
            )
        ).toEqual([{ a: [NaN], b: 1 }]);
        const json = await run(`SELECT json_build_array(${NUMBERS}) AS result`, true);
        expect(json).toEqual([[NaN, Infinity, -Infinity, 1e308, 2.5]]);
    });

    it('should read them as today where the statement was given neither', async () => {
        expect(await run(`SELECT jsonb_build_array(${NUMBERS}) AS result`, false)).toEqual([AS_TODAY]);
        expect(await run(`SELECT json_build_array(${NUMBERS}) AS result`, false)).toEqual([AS_TODAY]);
    });

    it('should read the next statement on the session as today', async () => {
        await run(`SELECT jsonb_build_array(${NUMBERS}) AS result`, true);
        expect(await connection.query(new QuerySpecification(`SELECT jsonb_build_array(${NUMBERS}) AS "v"`))).toEqual([
            { v: AS_TODAY }
        ]);
    });
});
