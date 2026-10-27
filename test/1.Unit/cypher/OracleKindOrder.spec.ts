import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, an order term whose kind the statement leaves open is sorted first by where its kind comes, as Cypher orders
 * kinds, then by its value (#355): two terms, each carried out of a query as its own column. One the statement makes of a
 * single kind is sorted by its value alone. Postgres sorts by one term (liberation-data/drivine4j#307).
 */
describe('An order term of a kind the statement leaves open in compiled Cypher', () => {
    const rank = "DECODE(JSON_VALUE(p2.s1, '$.type()'), 'object', 1, 'array', 2, 'string', 3, 'boolean', 4";
    const oracle = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher).sql;

    it('should be sorted on Oracle by where its kind comes, then by its value', () => {
        expect(oracle('UNWIND [1, true] AS t RETURN t ORDER BY t DESC')).toContain(`ORDER BY ${rank}`);
        expect(oracle('MATCH (n:Doc) RETURN n.a ORDER BY n.a')).toContain(rank);
    });

    it('should be carried out of a WITH on Oracle as two columns, the rank named for the term with a number after it', () => {
        const sql = oracle('UNWIND [1, true] AS t WITH t ORDER BY t LIMIT 1 RETURN t');
        expect(sql).toContain(`${rank}, 'number', 5, 'double', 5, 'float', 5) AS s1_1, p2.s1 AS s1`);
        expect(sql).toContain('w3.s1_1 AS o1');
        expect(sql).toContain('w3.s1 AS o2');
    });

    it('should be sorted on Oracle by its value alone where the statement makes it a text, a truth value, a temporal value, a list or a node', () => {
        [
            'UNWIND [1, true] AS t RETURN t ORDER BY toString(t)',
            'UNWIND [1, true] AS t RETURN t ORDER BY t = 1',
            'UNWIND [1, true] AS t RETURN t ORDER BY date()',
            'UNWIND [1, true] AS t RETURN t ORDER BY [t]',
            'MATCH (n:Doc) RETURN n.a ORDER BY n'
        ].forEach((cypher) => expect(oracle(cypher)).not.toContain("'object', 1"));
    });

    it('should be sorted on Postgres by one term', () => {
        expect(
            new PostgresCypherCompiler('g').compile('UNWIND [1, true] AS t WITH t ORDER BY t LIMIT 1 RETURN t').sql
        ).not.toContain('s1_1');
    });
});
