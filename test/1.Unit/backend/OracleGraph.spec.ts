import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GRAPH, OracleGraph } from '@/backend/oracle';
import { hasLabels, holdsLabel, serializedLabel } from '@/backend/oracle/OracleGraph';

/** The start of the test of a later label, up to its needle. */
const HELD = `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n.labels), ']'), '[') || ',"',`;

/** What drivine4j wrote of a store's schema on Oracle, and the names it gives objects (see its `source`). */
const DRIVINE4J = JSON.parse(fs.readFileSync(path.join(__dirname, '../golden/drivine4j-oracle-schema.json'), 'utf8'));

describe('OracleGraph', () => {
    it("should name its tables after the graph, drivine's unless named", () => {
        expect(new OracleGraph().name).toEqual(DEFAULT_GRAPH);
        const graph = new OracleGraph('tenant_a');
        expect([graph.nodes, graph.edges, graph.catalog]).toEqual([
            'tenant_a_node',
            'tenant_a_edge',
            'tenant_a_schema'
        ]);
    });

    it('should take a name of letters, digits and underscores, beginning with a letter, of at most 114', () => {
        expect(new OracleGraph(`g${'x'.repeat(113)}`).name).toHaveLength(114);
        for (const name of [`g${'x'.repeat(114)}`, '1graph', 'my-graph', 'my graph', '']) {
            expect(() => new OracleGraph(name)).toThrow(/can't name a graph on Oracle/);
        }
    });

    it('should give the longest name objects that fit within Oracle 128, with room for one beside them', () => {
        const graph = new OracleGraph(`g${'x'.repeat(113)}`);
        expect(graph.vectors('Label', 'embedding').length + 2).toBeLessThanOrEqual(128);
        expect(graph.texts('Label', ['a', 'b']).length + 2).toBeLessThanOrEqual(128);
    });

    it("should name objects as drivine4j names them, to the hash: Java's String.hashCode of the parts", () => {
        const names: { graph: string; kind: string; parts: string[]; name: string }[] = DRIVINE4J.objectNames;
        expect(names.length).toBeGreaterThan(10);
        for (const it of names) {
            expect(new OracleGraph(it.graph).objectName(it.kind, it.parts)).toEqual(it.name);
        }
    });

    it('should test the first label through the index over labels, and the rest by their text, as drivine4j does', () => {
        expect(hasLabels('n', ['A'])).toEqual(`JSON_EXISTS(n.labels, '$?(@ == "A")')`);
        expect(hasLabels('n', ['A', 'B', `it's "q"`])).toEqual(
            `JSON_EXISTS(n.labels, '$?(@ == "A")') AND ${HELD} ',"B","') > 0 AND ` + `${HELD} ',"it''s \\"q\\"","') > 0`
        );
    });

    it('should look for a later label as one whole label, among the labels made commas at each end', () => {
        expect(holdsLabel('c.labels', 'x","Dog')).toEqual(
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(c.labels), ']'), '[') || ',"', ',"x\\",\\"Dog","') > 0`
        );
        expect(hasLabels('n', ['A', 'Dog'])).toEqual(
            `JSON_EXISTS(n.labels, '$?(@ == "A")') AND ${holdsLabel('n.labels', 'Dog')}`
        );
    });

    it("should write a label as Oracle's JSON_SERIALIZE writes it, control characters and line separators escaped", () => {
        expect(serializedLabel(`plain é 😀 / '`)).toEqual(`"plain é 😀 / '"`);
        expect(serializedLabel('"\\')).toEqual('"\\"\\\\"');
        expect(serializedLabel('\b\t\n\f\r')).toEqual('"\\b\\t\\n\\f\\r"');
        expect(serializedLabel('\u0000\u0001\u000b\u001f\u007f')).toEqual('"\\u0000\\u0001\\u000B\\u001F\\u007F"');
        expect(serializedLabel('\u2028\u2029\u0080\u2027\u202a')).toEqual('"\\u2028\\u2029\u0080\u2027\u202a"');
    });
});
