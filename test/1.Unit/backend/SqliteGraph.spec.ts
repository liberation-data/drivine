import { ReusedIdsError, SqliteBackend, SqliteGraph } from '@liberation-data/drivine';
import {
    DATABASE_FILE,
    ENSURING_MARK,
    ensuringGraph,
    ensuringStatements,
    hasLabels,
    numberOf,
    textOf
} from '@/backend/sqlite/SqliteGraph';
import { byCodePoints, ExactJson, ExactNumber } from '@/backend/sqlite/ExactJson';

describe('SqliteGraph', () => {
    it("should make drivine4j's tables, named for the graph", () => {
        const graph = new SqliteGraph('contracts');
        expect(graph.ddl[0]).toEqual(
            [
                'CREATE TABLE IF NOT EXISTS contracts_node (',
                '    nid    INTEGER PRIMARY KEY AUTOINCREMENT,',
                '    labels TEXT NOT NULL,',
                '    props  TEXT NOT NULL,',
                '    stamp  TEXT',
                ')'
            ].join('\n')
        );
        expect(graph.ddl[1]).toContain('src   INTEGER NOT NULL REFERENCES contracts_node (nid) ON DELETE CASCADE');
        // Keys that never give a deleted row's id again (liberation-data/drivine4j#713).
        expect(graph.ddl[1]).toContain('    eid   INTEGER PRIMARY KEY AUTOINCREMENT,\n');
        expect(graph.ddl[2]).toContain('PRIMARY KEY (kind, label, properties)');
        expect(graph.ddl.slice(3)).toEqual([
            'CREATE INDEX IF NOT EXISTS contracts_edge_src ON contracts_edge (src, type)',
            'CREATE INDEX IF NOT EXISTS contracts_edge_dst ON contracts_edge (dst, type)'
        ]);
    });

    it('should look for each table and index in any case before it makes them', () => {
        // drivine4j's look, which gives -1 for tables an earlier Drivine made, whose ids could be reused (#713), but for
        // the KEY before AUTOINCREMENT, as drivine-python's, so a graph whose name holds the word is not taken for new.
        expect(new SqliteGraph('Contracts').made).toEqual(
            `SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND lower(name) IN ` +
                `('contracts_node', 'contracts_edge') AND sql NOT LIKE '%KEY AUTOINCREMENT%') THEN -1 ELSE COUNT(*) END ` +
                `AS "made" FROM sqlite_master WHERE lower(name) IN ('contracts_node', 'contracts_edge', ` +
                `'contracts_schema', 'contracts_edge_src', 'contracts_edge_dst')`
        );
    });

    it('should mark its ensuring text, which a connection reads back as its statements', () => {
        const graph = new SqliteGraph();
        expect(ensuringStatements(graph.ensuring)).toEqual(graph.ddl);
        expect(ensuringStatements('SELECT 1')).toBeUndefined();
    });

    it('should read back the graph whose making an ensuring text is, in the case it was named', () => {
        expect(ensuringGraph(new SqliteGraph('Contracts').ensuring)?.nodes).toEqual('Contracts_node');
        expect(ensuringGraph(new SqliteGraph('My_Graph').ensuring)?.name).toEqual('My_Graph');
        expect(ensuringGraph(new SqliteGraph('g_node').ensuring)?.name).toEqual('g_node');
        expect(ensuringGraph('SELECT 1')).toBeUndefined();
        expect(() => ensuringGraph(`${ENSURING_MARK} CREATE INDEX IF NOT EXISTS g_edge_src ON g_edge (src)`)).toThrow(
            /open with the making of its table of nodes/
        );
    });

    it('should make the store only where the look finds it not all there, and refuse one whose ids could be reused', () => {
        const graph = new SqliteGraph('Contracts');
        const ensured = (found: number, file = '/data/graph.db'): string[] => {
            const sent: string[] = [];
            graph.ensure(
                (statement) => {
                    sent.push(statement);
                    return statement === DATABASE_FILE ? file : found;
                },
                (ddl) => sent.push(...ddl)
            );
            return sent;
        };
        expect(ensured(5)).toEqual([graph.made]);
        expect(ensured(2)).toEqual([graph.made, ...graph.ddl]);
        expect(() => ensured(-1)).toThrow(new ReusedIdsError('Contracts', '/data/graph.db'));
        expect(() => ensured(-1)).toThrow(
            "The SQLite graph 'Contracts' in /data/graph.db was made by an earlier Drivine, whose node and relationship " +
                'ids could be reused after a delete. Make a new file and save the graph into it again.'
        );
        expect(() => ensured(-1, '')).toThrow("The SQLite graph 'Contracts' in an in-memory database was made by");
    });

    it('should refuse a name that cannot name its tables', () => {
        expect(() => new SqliteGraph('1st')).toThrow(/can't name a graph on SQLite/);
        expect(() => new SqliteGraph(`g${'x'.repeat(49)}`)).toThrow(/at most 49/);
    });

    it('should find a label by its text, and read a property as Postgres reads it', () => {
        expect(hasLabels('n', ['Person', 'Ca"fé'])).toEqual(
            `instr(n.labels, '"Person"') > 0 AND instr(n.labels, '"Ca\\"fé"') > 0`
        );
        expect(textOf('n', 'a.b')).toEqual(
            `(CASE json_type(n.props, '$."a.b"') WHEN 'text' THEN n.props ->> '$."a.b"' WHEN 'null' THEN NULL ELSE n.props -> '$."a.b"' END)`
        );
        expect(textOf('n', '__drivine.stamp')).toEqual('n.stamp');
        expect(numberOf('', 'age')).toEqual(
            `(CASE WHEN json_type(props, '$."age"') IN ('integer', 'real') THEN props ->> '$."age"' END)`
        );
        expect(() => textOf('n', '')).toThrow(/property name is empty/);
    });
});

describe('SqliteBackend', () => {
    const backend = new SqliteBackend();
    const failure = (errcode: number, message = 'failed'): Error => Object.assign(new Error(message), { errcode });

    it('should take a locked file or table as contention, however deep it is wrapped, or by its words alone', () => {
        expect(backend.contended(failure(5))).toBe(true);
        expect(backend.contended(failure(517))).toBe(true);
        expect(backend.contended(failure(6))).toBe(true);
        expect(backend.contended({ rootCause: { cause: failure(5) } })).toBe(true);
        expect(backend.contended(new Error('database is locked'))).toBe(true);
    });

    it('should not take any other failure as contention', () => {
        expect(backend.contended(failure(2067, 'UNIQUE constraint failed'))).toBe(false);
        expect(backend.contended(undefined)).toBe(false);
    });

    it('should keep an empty inventory apart from none', () => {
        expect(backend.markerItems(null)).toBeUndefined();
        expect(backend.markerItems('')).toEqual([]);
        expect(backend.markerItems('a\nb')).toEqual(['a', 'b']);
    });

    it('should read a property written as Cypher writes it as the text the store reads', () => {
        expect(backend.written("n.title = 'x'")).toEqual(`${textOf('n', 'title')} = 'x'`);
    });
});

describe('ExactJson', () => {
    it('should keep the text of each number it reads and writes', () => {
        const text = '{"a":1.50,"b":[1e3,12345678901234567890],"c":"x"}';
        expect(ExactJson.stringify(ExactJson.parse(text))).toEqual(text);
    });

    it('should take two numbers of one value as the same, however written', () => {
        expect(ExactJson.same(ExactJson.parse('{"a":1.5}'), ExactJson.parse('{"a":1.50}'))).toBe(true);
        expect(ExactJson.same(ExactJson.parse('[100]'), ExactJson.parse('[1e2]'))).toBe(true);
        expect(ExactJson.same(ExactJson.parse('[0.0]'), ExactJson.parse('[0]'))).toBe(true);
        expect(ExactJson.same(ExactJson.parse('{"a":1}'), ExactJson.parse('{"a":"1"}'))).toBe(false);
        expect(ExactJson.same(ExactJson.parse('{"a":1}'), ExactJson.parse('{"a":1,"b":2}'))).toBe(false);
        expect(new ExactNumber('-0.250').canonical).toEqual('-25e-2');
    });

    it('should order text by code point, as drivine4j orders labels', () => {
        expect(['￿', '\u{1f600}', 'a'].sort(byCodePoints)).toEqual(['a', '￿', '\u{1f600}']);
    });
});
