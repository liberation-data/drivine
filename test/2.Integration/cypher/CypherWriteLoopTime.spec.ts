import { PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { closeGraphEngines } from '../support/GraphEngines';
import { cypherSqlStores, sqlPersistenceManager } from '../support/SqlStores';

// Ten times the rows took a hundred times as long before #624: minutes for each write over the large run.
jest.setTimeout(3_600_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'cy_loop';

const SMALL = 2_000;
const LARGE = 20_000;

/** Linear is about 10, and was 50 to 100 when each row copied the list. */
const RATIO = 30;

/** Where the small run is short, its fixed costs, and a runner's jitter, are much of it: the large one gets this at least. */
const FLOOR_MS = 3_000;

/** A write timed, what it gives for `n` rows where it gives any, and the read that counts what it left. */
interface Write {
    name: string;
    cypher: string;
    gives?: (n: number) => any[];
    check: string;
    left: (n: number) => number;
}

const WRITES: Write[] = [
    {
        name: 'CREATE',
        cypher: 'UNWIND range(1, $n) AS i CREATE (:CyLoop {i: i})',
        check: 'MATCH (n:CyLoop) RETURN count(n)',
        left: (n) => n
    },
    {
        name: 'SET',
        cypher: 'MATCH (n:CyLoop) SET n.x = n.i',
        check: 'MATCH (n:CyLoop) WHERE n.x IS NOT NULL RETURN count(n)',
        left: (n) => n
    },
    {
        name: 'REMOVE',
        cypher: 'MATCH (n:CyLoop) REMOVE n.x',
        check: 'MATCH (n:CyLoop) WHERE n.x IS NOT NULL RETURN count(n)',
        left: () => 0
    },
    {
        name: 'MERGE',
        cypher: 'MATCH (n:CyLoop) MERGE (n)-[:CY_SELF]->(n)',
        check: 'MATCH (:CyLoop)-[r:CY_SELF]->(:CyLoop) RETURN count(r)',
        left: (n) => n
    },
    {
        name: 'CALL…RETURN',
        cypher: 'MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN n.i AS j } RETURN count(j)',
        gives: (n) => [n],
        check: 'MATCH (n:CyLoop) WHERE n.y = n.i RETURN count(n)',
        left: (n) => n
    }
];

/**
 * A compiled write that loops over its rows takes time in proportion to them (#624, liberation-data/drivine4j#588). Each
 * row the loop kept was appended to a JSON list of the rows it leaves, which copied the list, so ten times the rows took
 * about a hundred times as long. Each write is timed over {@link SMALL} rows and {@link LARGE}, ten times as many, and
 * the large run must take less than {@link RATIO} times the small one, or {@link FLOOR_MS} where that is more: a ratio,
 * so a slower runner, which is slower at both, passes alike. drivine4j's `CompiledWriteLoopTimeTest`.
 */
describe.each(cypherSqlStores())('A compiled write loop on $type', (store) => {
    let pm: PersistenceManager;

    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

    const clear = async (): Promise<void> => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
    };

    /** The milliseconds each write took over `n` rows, each checked by what it gave and what it left. */
    const timed = async (n: number): Promise<number[]> => {
        await clear();
        const times: number[] = [];
        for (const write of WRITES) {
            const start = process.hrtime.bigint();
            const rows = await query(write.cypher, { n });
            times.push(Number((process.hrtime.bigint() - start) / BigInt(1_000_000)));
            if (write.gives) {
                expect([write.name, n, rows]).toEqual([write.name, n, write.gives(n)]);
            }
            expect([write.name, n, await query(write.check)]).toEqual([write.name, n, [write.left(n)]]);
        }
        return times;
    };

    beforeAll(() => {
        pm = sqlPersistenceManager(store, GRAPH);
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('should take about ten times as long over ten times the rows, not a hundred', async () => {
        const small = await timed(SMALL);
        const large = await timed(LARGE);
        const report = WRITES.map(
            (it, i) => `${it.name} ${small[i]} ms over ${SMALL} rows, ${large[i]} ms over ${LARGE}`
        ).join('; ');
        process.stdout.write(`CypherWriteLoopTime ${store.type}: ${report}\n`);
        const slow = WRITES.filter((_, i) => large[i] > Math.max(RATIO * small[i], FLOOR_MS)).map((it) => it.name);
        expect([slow, report]).toEqual([[], report]);
    });
});
