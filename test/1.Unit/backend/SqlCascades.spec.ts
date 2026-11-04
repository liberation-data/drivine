import { Direction } from '@/annotation/Metadata';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { keptTargets } from '@/backend/sql/SqlCascades';
import { RelationshipModel } from '@/model/RelationshipModel';

const rel = (type: string, direction: Direction): RelationshipModel => ({ type, direction }) as RelationshipModel;

/**
 * The cascade's kept set reads a relationship of either direction both ways round where the store asks, joined on an
 * equality (#588): an OR across the two directions read every relationship at each step on Oracle and SQLite. The
 * rows are pinned by `SqlWrites.spec.ts`; this pins the shape.
 */
describe('keptTargets', () => {
    const graph = new OracleGraph('g');
    const followed = [
        rel('HAS', Direction.OUTGOING),
        rel('OF', Direction.INCOMING),
        rel('PAIRED', Direction.UNDIRECTED)
    ];

    it('should step either way round from the both-ways rows, where the store asks and a step is undirected', () => {
        const kept = keptTargets(graph, followed, 'UNION ALL', true);
        const step = kept.split('\n').pop()!;
        expect(step).toContain(`JOIN ${graph.bothWays()} e ON e.a = k.nid AND (`);
        expect(step).toContain("(e.type = 'HAS' AND e.back = 0)");
        expect(step).toContain("(e.type = 'OF' AND e.back = 1)");
        expect(step).toContain("(e.type = 'PAIRED' AND (e.back = 0 OR e.src <> e.dst))");
        expect(step).toContain('SELECT e.b FROM cascade_kept k');
        expect(step).not.toMatch(/\be\.(src|dst) = k\.nid/);
    });

    it('should keep the OR where the store does not ask, or no step is undirected', () => {
        const or = keptTargets(new PostgresGraph('g'), followed, 'UNION');
        expect(or).toContain("(e.type = 'PAIRED' AND (e.src = k.nid OR e.dst = k.nid))");
        expect(or).not.toContain('AS back');
        const directed = keptTargets(graph, followed.slice(0, 2), 'UNION ALL', true);
        expect(directed).toEqual(keptTargets(graph, followed.slice(0, 2), 'UNION ALL'));
        expect(directed).not.toContain('AS back');
    });
});
