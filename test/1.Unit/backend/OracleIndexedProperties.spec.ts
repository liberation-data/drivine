import { OracleIndexedProperties } from '@/backend/oracle/OracleIndexedProperties';
import { storeStatements } from '@/backend/StoreStatements';

/** A connection that answers the catalog's query with `rows`, or fails with `error`, and counts what it's asked. */
const catalog = (rows: () => unknown[], error?: () => unknown) => {
    const asked: string[] = [];
    return {
        asked,
        execute: async (sql: string): Promise<{ rows: unknown[] }> => {
            asked.push(sql);
            return error ? Promise.reject(error()) : Promise.resolve({ rows: rows() });
        }
    };
};

const row = (label: string, properties: string[], kind = 'RANGE_INDEX') => ({
    ROW: { kind, label, properties }
});

describe('OracleIndexedProperties (#753)', () => {
    let now = 0;
    const realClock = OracleIndexedProperties.clock;
    // Each test its own graph, as what is read is remembered for the process.
    let graph = 0;
    const next = (): string => `ix_${++graph}`;

    beforeEach(() => {
        now = 0;
        OracleIndexedProperties.clock = () => now;
    });

    afterAll(() => {
        OracleIndexedProperties.clock = realClock;
    });

    it("reads each index's label and leading property with the module's labelled query", async () => {
        const g = next();
        const connection = catalog(() => [
            row('Person', ['email']),
            row('Order', ['ref', 'line'], 'UNIQUENESS_CONSTRAINT'),
            // A JSON column read as text.
            { ROW: JSON.stringify({ kind: 'RANGE_INDEX', label: 'City', properties: ['name'] }) },
            // Read as an array row too.
            [{ kind: 'RANGE_INDEX', label: 'Tag', properties: ['slug'] }]
        ]);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([
            ['Person', 'email'],
            ['Order', 'ref'],
            ['City', 'name'],
            ['Tag', 'slug']
        ]);
        expect(connection.asked).toEqual([storeStatements('oracle', g).labelled]);
        expect(connection.asked[0]).toContain(`FROM ${g}_schema`);
    });

    it('reads once for the database, user and graph until it lapses, then again', async () => {
        const g = next();
        let listed = [row('A', ['x'])];
        const connection = catalog(() => listed);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        listed = [row('B', ['y'])];
        now = OracleIndexedProperties.FRESH_FOR_MS - 1;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        expect(connection.asked).toHaveLength(1);
        // Another database or user reads its own.
        expect(await OracleIndexedProperties.of(connection, 'other', g)).toEqual([['B', 'y']]);
        now = OracleIndexedProperties.FRESH_FOR_MS;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['B', 'y']]);
        expect(connection.asked).toHaveLength(3);
    });

    it("reads again once an index of the graph is made or dropped, and only that graph's", async () => {
        const [g, other] = [next(), next()];
        let listed = [row('A', ['x'])];
        const connection = catalog(() => listed);
        await OracleIndexedProperties.of(connection, 'db', g);
        await OracleIndexedProperties.of(connection, 'db', other);
        listed = [];
        OracleIndexedProperties.changed(g);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([]);
        expect(await OracleIndexedProperties.of(connection, 'db', other)).toEqual([['A', 'x']]);
        expect(connection.asked).toHaveLength(3);
    });

    it("gives none, and keeps nothing, where the graph's schema table isn't there", async () => {
        const g = next();
        let missing = true;
        const connection = {
            asked: 0,
            execute: async (): Promise<{ rows: unknown[] }> => {
                connection.asked++;
                return missing
                    ? Promise.reject(
                          Object.assign(new Error('ORA-00942: table or view does not exist'), { errorNum: 942 })
                      )
                    : Promise.resolve({ rows: [row('A', ['x'])] });
            }
        };
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([]);
        missing = false;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        expect(connection.asked).toEqual(2);
    });

    it('fails as the read fails for any other reason, and reads again next time', async () => {
        const g = next();
        const refused = catalog(
            () => [],
            () => Object.assign(new Error('ORA-01031: insufficient privileges'), { errorNum: 1031 })
        );
        await expect(OracleIndexedProperties.of(refused, 'db', g)).rejects.toThrow('ORA-01031');
        const healthy = catalog(() => [row('A', ['x'])]);
        expect(await OracleIndexedProperties.of(healthy, 'db', g)).toEqual([['A', 'x']]);
    });
});
