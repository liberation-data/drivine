import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/** The statement compiled for Postgres: the function it makes, and the statement that calls it. */
function compiled(cypher: string): string {
    const it = new PostgresCypherCompiler('g').compile(cypher);
    return [...it.setup, it.sql].join('\n');
}

const OFF =
    "PERFORM set_config('enable_seqscan', 'off', true), set_config('enable_hashjoin', 'off', true), " +
    "set_config('enable_mergejoin', 'off', true);";
const SAVED =
    "cy_planner := ARRAY[current_setting('enable_seqscan'), current_setting('enable_hashjoin'), " +
    "current_setting('enable_mergejoin')];";
const RESTORED =
    "PERFORM set_config('enable_seqscan', cy_planner[1], true), set_config('enable_hashjoin', cy_planner[2], true), " +
    "set_config('enable_mergejoin', cy_planner[3], true);";

/**
 * On Postgres, a loop whose statements for each row read a table by its key where the loop adds to it, or join a table
 * to a JSON list of rows, is planned as nested loops over the indexes, and the planner's settings are put back after it
 * (#628, liberation-data/drivine4j#609): see `PostgresCypherCompiler.plannedAsNestedLoops`. Their times are
 * `CypherWriteLoopTime.spec.ts`'s. drivine4j's `PostgresNestedLoopPlanTest`.
 */
describe('A Postgres write loop that reads a table for each row', () => {
    it("is planned with seq scans and hash and merge joins off, for a MERGE's loop, and the settings are put back after it", () => {
        const text = compiled('MATCH (n:CyLoop) MERGE (n)-[:CY_SELF]->(n)');
        const lines = text.split('\n');
        expect([lines.includes('    cy_planner text[];'), text]).toEqual([true, text]);
        const loop = lines.findIndex((it) => it.startsWith('    FOR cy_record IN '));
        const end = lines.indexOf('    END LOOP;');
        expect([lines.slice(loop - 2, loop), text]).toEqual([[`    ${SAVED}`, `    ${OFF}`], text]);
        expect([lines[end + 1], text]).toEqual([`    ${RESTORED}`, text]);
        // Once each: the MERGE's own read of its pattern, in the loop, is planned with it.
        expect(lines.filter((it) => it.trim() === OFF)).toHaveLength(1);
        expect(lines.slice(loop, end).some((it) => it.trim().startsWith('FOR cy_matched IN ('))).toBe(true);
    });

    it('saves the settings before each of two loops that qualify, and puts them back after it', () => {
        const lines = compiled('MATCH (n:CyLoop) MERGE (n)-[:CY_A]->(n) WITH n MERGE (n)-[:CY_B]->(n)')
            .split('\n')
            .map((it) => it.trim());
        const text = lines.join('\n');
        const loops = lines.flatMap((it, i) => (it.startsWith('FOR cy_record IN ') ? [i] : []));
        const ends = lines.flatMap((it, i) => (it === RESTORED ? [i] : []));
        expect([loops.length, text]).toEqual([2, text]);
        expect([loops.map((it) => lines.slice(it - 2, it)), text]).toEqual([loops.map(() => [SAVED, OFF]), text]);
        expect([ends.length, text]).toEqual([2, text]);
        expect([loops[0] < ends[0] && ends[0] < loops[1] - 2 && loops[1] < ends[1], text]).toEqual([true, text]);
    });

    it.each([
        'MATCH (n:CyLoop) MERGE (n)-[r:CY_SELF]->(n) ON CREATE SET r.w = n.i',
        'MATCH (n:CyLoop) CALL (n) { MERGE (n)-[:CY_SELF]->(n) } RETURN count(n)',
        'MATCH (n:CyLoop) CALL (n) { CREATE (n)-[r:CY_SELF]->(n) SET r.w = n.i } RETURN count(n)',
        'MATCH (n:CyLoop) FOREACH (x IN [1] | CREATE (n)-[r:CY_SELF]->(n) SET r.w = x)',
        'UNWIND range(1, 3) AS i CALL (i) { CREATE (a:CyLoop {i: i}) SET a.y = i } RETURN count(i)',
        'MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN n.i AS j } RETURN count(j)',
        'MATCH (n:CyLoop) CALL (n) { CREATE (m:CyMade) DETACH DELETE m } RETURN count(n)'
    ])("is planned so where it reads by key what it makes, or joins a table to a row's list: %s", (cypher) => {
        const text = compiled(cypher);
        expect([text.includes(OFF), text]).toEqual([true, text]);
    });

    it.each([
        'UNWIND range(1, 3) AS i CREATE (:CyLoop {i: i})',
        'MATCH (n:CyLoop) SET n.x = n.i',
        'MATCH (n:CyLoop) REMOVE n.x',
        'MATCH (n:CyLoop) CREATE (n)-[r:CY_SELF]->(n) SET r.w = n.i',
        'MATCH (n:CyLoop) DETACH DELETE n',
        'MATCH (n:CyLoop) RETURN n.i'
    ])('is compiled as it was where it has neither read, as a statement with no loop is: %s', (cypher) => {
        const text = compiled(cypher);
        expect([text.includes('enable_seqscan') || text.includes('cy_planner'), text]).toEqual([false, text]);
    });

    it('is planned on Oracle and SQLite as it was', () => {
        const cypher = 'MATCH (n:CyLoop) MERGE (n)-[:CY_SELF]->(n)';
        for (const it of [
            new OracleCypherCompiler('g').compile(cypher),
            new SqliteCypherCompiler('g').compile(cypher)
        ]) {
            expect([...it.setup, it.sql].join('\n')).not.toContain('enable_seqscan');
        }
    });
});
