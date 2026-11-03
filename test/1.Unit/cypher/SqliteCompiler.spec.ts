import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/** The steps a statement that writes compiles to on SQLite, as `drivine_cypher` reads them. */
function steps(cypher: string): any[] {
    const sql = new SqliteCypherCompiler('g').compile(cypher).sql;
    const literal = /drivine_cypher\('((?:[^']|'')*)', \$_cy_params\)/.exec(sql);
    expect(literal).not.toBeNull();
    return JSON.parse(literal![1].replace(/''/g, "'")).steps;
}

describe('Cypher compiled to SQLite', () => {
    it("reads a write's variables as numbered parameters, and a literal that names one as it is", () => {
        const program = steps("CREATE (n:Person {name: 'cy_row'}) RETURN n.name");
        const create = program.find((it) => it.op === 'loop');
        expect(create.record).toEqual('cy_record.item');
        const insert = create.body.find((it: any) => it.op === 'execute');
        expect(insert.variable).toEqual('cy_id');
        expect(insert.sql).toContain('RETURNING nid');
        // The procedure's variables it reads, each a parameter of its own, numbered in the order it reads them.
        insert.variables.forEach((name: string, i: number) => expect(insert.sql).toContain(`?${i + 1}`));
        expect(insert.variables).toContain('cy_value');
        // A text the statement writes that spells a variable is no variable.
        const value = create.body.find((it: any) => it.op === 'select' && it.variable === 'cy_value');
        expect(value.sql).toContain('cy_row');
        expect(value.variables).not.toContain('cy_value');
        expect(program[program.length - 1].op).toEqual('return');
    });

    it('gathers a lateral query as a JSON list, read back by its columns', () => {
        const sql = new SqliteCypherCompiler('g').compile(
            'MATCH (a:Person) OPTIONAL MATCH (a)-[:KNOWS]->(b) RETURN a.name, b.name'
        ).sql;
        expect(sql).toContain('LEFT JOIN json_each((SELECT json_group_array(json_object(');
        expect(sql).toContain("NULLIF(o4.value -> '$.v5_props', 'null')");
        expect(sql).not.toContain('LATERAL');
    });

    it('joins its sources ON TRUE, which SQLite may reorder, where Postgres keeps a CROSS JOIN (#589)', () => {
        const step = 'MATCH (n)-[r]->(m) RETURN n, r, m';
        const sql = new SqliteCypherCompiler('g').compile(step).sql;
        expect(sql).toContain('FROM g_node n1\n    JOIN g_node n2 ON TRUE\n    JOIN g_edge e3 ON TRUE');
        expect(sql).not.toContain('CROSS JOIN');
        // A lateral query, which reads the row's own node, joins alike.
        const called = new SqliteCypherCompiler('g').compile(
            'MATCH (a:P) CALL { WITH a MATCH (a)-->(b) RETURN b } RETURN a, b'
        ).sql;
        expect(called).toContain('JOIN json_each((SELECT json_group_array(');
        expect(called).toContain(')) AS c7 ON TRUE');
        expect(called).not.toContain('CROSS JOIN');
        expect(new PostgresCypherCompiler('g').compile(step).sql).toContain('CROSS JOIN g_node n2');
    });

    it("orders nulls where Cypher puts them, and pages by SQLite's LIMIT", () => {
        const sql = new SqliteCypherCompiler('g').compile(
            'MATCH (a:Person) RETURN a.name ORDER BY a.name DESC SKIP 1'
        ).sql;
        expect(sql).toContain('DESC NULLS FIRST');
        expect(sql).toContain('LIMIT -1 OFFSET 1');
    });

    it('reads a year before 1 as its calendar numbers it, with no era to rewrite nor an AD-first test (#511)', () => {
        // drivine_temporal numbers years as Cypher does, and drivine_to_char writes one before 0 with its sign: the year
        // is extracted as it is, where Postgres and Oracle add one to a year BC and test a stored text for 1000 on first.
        const sql = new SqliteCypherCompiler('g').compile(
            'MATCH (n:C) WHERE n.day < date($d) RETURN n.day.year, n.day.weekYear, toString(n.day)',
            { d: '-0044-03-15' }
        ).sql;
        expect(sql).toContain("drivine_temporal('extract', ");
        expect(sql).not.toContain('< 0 THEN 1');
        expect(sql).not.toContain('[1-9][0-9]{3}');
    });
});
