import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/** A quantified path pattern's walk, as the SQL it compiles to: what the spec's rows don't show of it. */
describe('A quantified path pattern', () => {
    /** The node rows the SQL of `cypher` reads but joins nowhere. */
    const unjoined = (cypher: string): string[] => {
        const sql = new PostgresCypherCompiler('g').compile(cypher).sql;
        const read = new Set([...sql.matchAll(/\b(n\d+)\./g)].map((it) => it[1]));
        const joined = new Set([...sql.matchAll(/\bg_node (n\d+)\b/g)].map((it) => it[1]));
        return [...read].filter((it) => !joined.has(it));
    };

    it("joins to its walk's step a node read only by a subquery in a quantified path pattern's WHERE in its own", () => {
        // variablesIn names none of a subquery's variables, so y is joined only because the subquery is found.
        expect(
            unjoined(
                'MATCH ((x)-[:R]->(y) WHERE EXISTS { () ((p)-[:S]->(q) WHERE COUNT { (q)-->(y) } > 0){1} () })+ RETURN 1'
            )
        ).toEqual([]);
    });

    it("joins to its walk's step a node read only by the WHERE of a quantified path pattern in an EXISTS pattern in its own", () => {
        // No subquery: y is joined only because the variables of the EXISTS pattern's own group's WHERE are named.
        expect(
            unjoined('MATCH ((x)-[:R]->(y) WHERE EXISTS { () ((p)-[:S]->(q) WHERE q.v = y.v){1} () })+ RETURN 1')
        ).toEqual([]);
    });

    it.each([
        ['postgres', new PostgresCypherCompiler('g')],
        ['oracle', new OracleCypherCompiler('g')]
    ])("matches a node's properties in its walk's step, the node joined to it, on %s", (_, compiler) => {
        // Not in the spec, whose quantified path patterns' nodes have labels and none have properties.
        const sql = compiler.compile('MATCH (a) ((x {v: 1})-[:R]->(y))+ (b) RETURN b').sql;
        expect(sql).toMatch(/JOIN g_node (n\d+) ON \1\.nid = w\d+\.nid\n(?:.*JOIN .*\n)*.*WHERE .*\1\.props.*'1'/);
    });

    it("keeps its relationships from another part's of a type one of them may be", () => {
        // A relationship of no type of its own may be any: the group's relationships are then of any type.
        const sql = (group: string) =>
            new PostgresCypherCompiler('g').compile(`MATCH (a)-[:S]->(k) (${group}){1} (c) RETURN c`).sql;
        expect(sql('(x)-[:R]->(y)-[:R]->(z)')).not.toContain('NOT (');
        expect(sql('(x)-[:R]->(y)-->(z)')).toContain('NOT (');
    });
});
