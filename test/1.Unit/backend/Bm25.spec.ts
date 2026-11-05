import * as vm from 'vm';
import {
    FullTextIndex,
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph
} from '@liberation-data/drivine';
import { bm25Ranked, bm25Score, Bm25Dialect } from '@/backend/sql/Bm25';
import { TextQuery } from '@/backend/sql/TextQuery';

@NodeFragment({ labels: ['Shelf'] })
class Shelf {
    @NodeId() id: string;
    @FullTextIndex() title?: string;
}

/** Writes each call as itself, so the statement shows what was asked of the store. */
const dialect: Bm25Dialect = {
    count: (text, term) => `COUNT(${text}, ${term})`,
    holds: (text, term) => `HOLDS(${text}, ${term})`,
    ln: (value) => `LN(${value})`,
    real: (value) => `REAL(${value})`
};

const squashed = (sql: string): string => sql.replace(/\s+/g, ' ');

// drivine4j's BM25 assertions in OracleSelectTest and SqliteObjectManagerTest (drivine4j#604), ported.
describe('bm25Ranked', () => {
    it('should count each term, hold the candidates to the scoring terms, and filter required and excluded after', () => {
        const query = TextQuery.parse('graph +data -noise');
        const [graph, data] = query.scored;
        const [noise] = query.excluded;
        const sql = bm25Ranked('CANDIDATES', 'LABEL', query, dialect);
        expect(sql).toContain(
            `SELECT s.nid, s.len, COUNT(s.text, ${graph}) AS tf1, COUNT(s.text, ${data}) AS tf2, ` +
                `COUNT(s.text, ${data}) AS r1, COUNT(s.text, ${noise}) AS x1 FROM (CANDIDATES) s ` +
                `WHERE (HOLDS(s.text, ${graph}) OR HOLDS(s.text, ${data}))`
        );
        // The label's figures are read with no term matched, and each term's rarity is a window over the candidates.
        expect(sql).toContain(
            'SELECT h.*, (SELECT REAL(COUNT(*)) FROM (LABEL) l) AS n, (SELECT REAL(AVG(l.len)) FROM (LABEL) l) AS avglen, ' +
                'SUM(CASE WHEN h.tf1 > 0 THEN 1 ELSE 0 END) OVER () AS df1, SUM(CASE WHEN h.tf2 > 0 THEN 1 ELSE 0 END) OVER () AS df2'
        );
        expect(sql).toContain(
            'LN(1 + (w.n - w.df1 + 0.5) / (w.df1 + 0.5)) * w.tf1 * 2.2 / (w.tf1 + 1.2 * (0.25 + 0.75 * w.len / NULLIF(w.avglen, 0)))'
        );
        expect(sql).toContain(') w WHERE w.r1 > 0 AND w.x1 = 0) b WHERE b.score > 0');
        expect(sql.startsWith('SELECT b.nid, b.score / MAX(b.score) OVER () AS score FROM (')).toBe(true);
    });

    it('should filter nothing after the window when no term is required or excluded', () => {
        const sql = bm25Ranked('CANDIDATES', 'LABEL', TextQuery.parse('graph'), dialect);
        expect(sql).not.toContain(' w WHERE');
        expect(sql).toContain(') w) b WHERE b.score > 0');
    });

    it("should score as Lucene does, with k1 1.2 and b 0.75: drivine4j's figures", () => {
        // The score, as SQL, worked out in JavaScript: its arithmetic is the same in both.
        const score = (count: number, holding: number, nodes: number, length: number, average: number): number =>
            vm.runInNewContext(
                bm25Score(
                    [[`${count}`, `${holding}`]],
                    `${nodes}`,
                    `${length}`,
                    `${average}`,
                    (it) => `Math.log(${it})`
                ),
                { Math }
            );
        // a1 holds the word twice in 32 characters, a2 once in 23, the average 67 / 3; two of the three hold it.
        expect(score(1, 2, 3, 23, 67 / 3) / score(2, 2, 3, 32, 67 / 3)).toBeCloseTo(0.8059651474530831, 12);
        // A term every node holds weighs ln(1 + 0.5 / (N + 0.5)): more than nothing, never less.
        expect(score(1, 3, 3, 10, 10)).toBeGreaterThan(0);
    });

    it('should bind each term on its own on Oracle, once for its count and once more for whether a node holds it', () => {
        const backend = new OracleBackend(new OracleGraph());
        const statement = backend.matching(
            { kind: 'NODE_FRAGMENT', model: new ModelRegistry().fragment(Shelf) },
            { label: 'Shelf', properties: ['title'], text: 'graph +data -noise', limit: 10 }
        );
        const sql = squashed(statement.text);
        const query = TextQuery.parse('graph +data -noise');
        expect(Object.keys(statement.bindings)).toEqual(['_term0', '_term1', '_term2', '_term3', '_term4', '_term5']);
        expect(Object.values(statement.bindings)).toEqual([
            ...query.scored,
            ...query.required,
            ...query.excluded,
            ...query.scored
        ]);
        // The text is lowered to match a term in, and measured as it is.
        expect(sql).toContain(
            `SELECT c.nid, LOWER(NVL(JSON_VALUE(c.props, '$."title"' RETURNING CLOB), '')) AS text, ` +
                `NVL(LENGTH(NVL(JSON_VALUE(c.props, '$."title"' RETURNING CLOB), '')), 0) AS len`
        );
        expect(sql).toContain(
            'REGEXP_COUNT(s.text, $_term0) AS tf1, REGEXP_COUNT(s.text, $_term1) AS tf2, ' +
                'REGEXP_COUNT(s.text, $_term2) AS r1, REGEXP_COUNT(s.text, $_term3) AS x1'
        );
        expect(sql).toContain('WHERE (REGEXP_LIKE(s.text, $_term4) OR REGEXP_LIKE(s.text, $_term5))');
    });
});
