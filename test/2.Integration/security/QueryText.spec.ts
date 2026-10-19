import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { quoteName, quoteString } from '@/backend/Cypher';
import { hasLabels } from '@/backend/oracle/OracleGraph';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

/** Names and strings Drivine quotes, as each engine reads them. */
describe.each(graphEngines())('quoted names and strings on $type', (engine) => {
    let pm: PersistenceManager;

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
    });

    afterAll(async () => closeGraphEngines());

    it('should read a quoted string as that string, whatever quotes, backslashes and escapes it holds', async () => {
        for (const text of [
            "it's",
            "x\\', 42 AS injected //",
            'x\\u0027, 42 AS injected //',
            "x\\u005C', 1 //",
            'back\\slash'
        ]) {
            const [row] = await pm.query<any>(new QuerySpecification(`RETURN ${quoteString(text)} AS s`));
            expect(row).toEqual(text);
        }
    });

    it('should read a quoted name with a backtick in it, in either spelling, as one name, or refuse it', async () => {
        for (const name of ['a` , 42 AS injected //', 'a\\u0060 , 42 AS injected //']) {
            const statement = new QuerySpecification(`RETURN 1 AS ${quoteName(name)}`);
            if (engine.type === DatabaseType.FALKORDB) {
                // FalkorDB takes no doubled backtick: such a name fails, and injects nothing.
                await expect(pm.query(statement)).rejects.toThrow();
                continue;
            }
            // One column: a second, injected one would make the row an object.
            expect(await pm.query<any>(statement)).toEqual([1]);
        }
    });

    it('should read a name with a backslash that escapes nothing', async () => {
        expect(await pm.query<any>(new QuerySpecification(`RETURN 1 AS ${quoteName('back\\slash')}`))).toEqual([1]);
    });
});

describeOnOracle('a label test with a backslash on Oracle', () => {
    it('should look for that label, and not fail on the JSON path', async () => {
        const pm = oraclePersistenceManager();
        const [count] = await pm.query<number>(
            new QuerySpecification(`SELECT COUNT(*) FROM drivine_node n WHERE ${hasLabels('n', ['x\\', 'a\\nb'])}`)
        );
        expect(Number(count)).toEqual(0);
        await closeGraphEngines();
    });
});
