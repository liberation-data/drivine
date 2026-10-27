import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    QuerySpecification
} from '@liberation-data/drivine';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

const GRAPH = 'drivine_long_property';

/**
 * Oracle crashed the session (ORA-03113; ORA-00600 [17114] or ORA-07445 in the alert log) where a statement took a text
 * past 32 KB from the properties with JSON_QUERY as JSON, and fed it on into further SQL, for each of two rows
 * (liberation-data/drivine#320). The compiler reads a property a RETURN or a WITH gives through its text to work round
 * it: see `OracleCypherCompiler.itemProperty`. drivine4j's `CypherWriteOracleTest` "a property past 32 KB read on two
 * nodes leaves the session open". The Cypher spec's case "A property past 32 KB read on two nodes" (test/cypher/
 * writes.yaml) covers a node's property returned and passed on; this one asks the session again after each statement,
 * and covers a relationship's and the sorts Oracle refuses too. A text past 32 KB a write takes from an unwound
 * parameter's item crashed it alike (liberation-data/drivine#356): see `OracleCypherCompiler.rowValue`.
 */
describeOnOracle('a property past 32 KB read on two nodes on Oracle', () => {
    let connection: Connection;
    const cypher = async (text: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        connection.query(new QuerySpecification({ text, language: 'CYPHER' }).bind(parameters));

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_LONG_PROPERTY');
        connection = await registry.connectionProvider('ORACLE_LONG_PROPERTY')!.connect();
    });

    afterAll(async () => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]) {
            await connection.query(new QuerySpecification(statement));
        }
        await connection.release();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it('leaves the session open, returned, sorted by another property and passed on by a WITH', async () => {
        // The crash could come after the rows did, so the session is asked again after each statement; and a block
        // parsed before rarely crashed, so each statement is new.
        await cypher('MATCH (n:CyWrite) DETACH DELETE n');
        const texts = ['x', 'y', 'z'].map((it) => it.repeat(40_000));
        await cypher('UNWIND range(1, 3) AS id CREATE (:CyWrite {id: id})');
        // Each set by a statement of its own: a write that reads a long text from an unwound parameter, for each of two
        // rows, is not what this test is about.
        for (const [i, a] of texts.entries()) {
            await cypher('MATCH (n:CyWrite {id: $id}) SET n.a = $a', { id: i + 1, a });
        }
        await cypher(
            'MATCH (a:CyWrite {id: 1}), (b:CyWrite {id: 2}) CREATE (a)-[:CY_LONG {a: $a}]->(b), (b)-[:CY_LONG {a: $a}]->(a)',
            { a: texts[0] }
        );
        for (let i = 0; i < 3; i++) {
            expect((await cypher(`MATCH (n:CyWrite) WHERE n.id > -${i} RETURN n.a`)).sort()).toEqual(texts);
            expect(await cypher(`MATCH (n:CyWrite) WHERE n.id > -${i} RETURN n.a ORDER BY n.id`)).toEqual(texts);
            // Not worked around: Oracle sorts and groups JSON only up to about 32 KB. It refuses the statement
            // (ORA-40180), and the session stays open for the statements after it.
            for (const rest of ['RETURN n.a ORDER BY n.a', 'RETURN DISTINCT n.a']) {
                await expect(cypher(`MATCH (n:CyWrite) WHERE n.id > -${i} ${rest}`)).rejects.toThrow(/ORA-40180/);
            }
            expect(
                await cypher(`MATCH (n:CyWrite) WITH n.id AS id, n.a AS a WHERE id > -${i} RETURN [id, a] ORDER BY id`)
            ).toEqual(texts.map((a, j) => [j + 1, a]));
            expect(await cypher(`MATCH ()-[r:CY_LONG]->() RETURN r.a AS a${i}`)).toEqual([texts[0], texts[0]]);
            expect(await cypher(`MATCH (n:CyWrite) RETURN count(n) AS c${i}`)).toEqual([3]);
        }
    });

    it('leaves the session open where a text past 32 KB is set from an unwound parameter on two nodes', async () => {
        // Oracle crashed the session where the block took a text past 32 KB from an item of an unwound parameter, as
        // JSON, for each of two rows (liberation-data/drivine#356). The compiler reads a text a write takes from its row
        // through the row's text to work round it: see OracleCypherCompiler.rowValue. drivine4j's `CypherWriteOracleTest`
        // "a text past 32 KB set from an unwound parameter on two nodes leaves the session open". As above, each
        // statement is new, and the session is asked again after it.
        for (const label of ['CyWrite', 'CyMade', 'CyBare']) {
            await cypher(`MATCH (n:${label}) DETACH DELETE n`);
        }
        const texts = ['x', 'y', 'z'].map((it) => it.repeat(40_000));
        const items = { items: texts.map((a, i) => ({ id: i + 1, a, f: 5 })) };
        await cypher('UNWIND range(1, 3) AS id CREATE (:CyWrite {id: id})');
        const written: string[] = [];
        for (let i = 0; i < 3; i++) {
            await cypher(`UNWIND $items AS t MATCH (n:CyWrite {id: t.id}) SET n.a${i} = t.a`, items);
            await cypher(`UNWIND $items AS t MERGE (n:CyWrite {id: t.id}) SET n.m${i} = t.a`, items);
            await cypher(`UNWIND $items AS t CREATE (:CyMade {id: t.id, a: t.a, i: ${i}})`, items);
            await cypher(`UNWIND $texts AS t CREATE (:CyBare {a: t, i: ${i}})`, { texts });
            written.push(`a${i}`, `m${i}`);
            expect(await cypher(`MATCH (n:CyWrite) WHERE n.id > -${i} RETURN properties(n) ORDER BY n.id`)).toEqual(
                texts.map((a, j) => ({ id: j + 1, ...Object.fromEntries(written.map((it) => [it, a])) }))
            );
            // Each read as an item of its own: one inside a list isn't worked around (see itemProperty).
            expect(await cypher(`MATCH (n:CyMade {i: ${i}}) RETURN n.a ORDER BY n.id`)).toEqual(texts);
            expect((await cypher(`MATCH (n:CyBare {i: ${i}}) RETURN n.a`)).sort()).toEqual(texts);
            expect(await cypher(`MATCH (n:CyWrite) RETURN count(n) AS c${i}`)).toEqual([3]);
        }
        // A map item that holds the long text, set whole.
        await cypher('UNWIND $items AS t MATCH (n:CyWrite {id: t.id}) SET n += t', items);
        expect(await cypher('MATCH (n:CyWrite) RETURN n.a ORDER BY n.id')).toEqual(texts);
        expect(await cypher('MATCH (n:CyWrite) RETURN n.f ORDER BY n.id')).toEqual([5, 5, 5]);
    });

    it('writes a map an unwound item holds, with a key as extended JSON names one, as the map it is', async () => {
        // Only a text a write takes from its row is read through the row's text (liberation-data/drivine#356): a map is
        // read as JSON, as before, and not from extended JSON, which would read {"$numberLong": "5"} as the number 5.
        await cypher('MATCH (n:CyWrite) DETACH DELETE n');
        const items = [
            { id: 1, m: { $numberLong: '5' } },
            { id: 2, m: { $numberDouble: '2.0' } }
        ];
        await cypher('UNWIND $items AS t CREATE (:CyWrite {id: t.id, m: t.m})', { items });
        expect(await cypher('MATCH (n:CyWrite) RETURN properties(n) ORDER BY n.id')).toEqual(items);
    });
});
