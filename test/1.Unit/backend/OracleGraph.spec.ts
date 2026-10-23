import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GRAPH, OracleGraph } from '@/backend/oracle';

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
});
