import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { judgeLayout, layoutVerdict, StoreLayoutError } from '@/backend/sql/StoreLayout';
import { ModuleStore, restampParameters, stampParameters, storeStatements } from '@/backend/StoreStatements';
import * as drivine from '@liberation-data/drivine';

/** The spec's marker.yaml (test/cypher), whose `storeLayout` cases pin the verdict on a graph by its layout. */
const MARKER = parse(fs.readFileSync(path.join(__dirname, '../../cypher/marker.yaml'), 'utf8'));

interface LayoutCase {
    name: string;
    store: ModuleStore;
    stamps: { layout: number | string | null }[];
    foreignNodes: boolean;
    objects?: { name: string; type: string }[];
    verdict:
        | 'current'
        | { refuse: string; from?: number; inProgress?: boolean }
        | { stamp: { drops: string[]; assign?: boolean } };
}

const CASES: LayoutCase[] = MARKER.storeLayout.cases;

describe("The spec's marker.yaml storeLayout cases", () => {
    it('holds cases of each verdict', () => {
        expect(CASES.some((it) => it.verdict === 'current')).toBe(true);
        expect(CASES.some((it) => typeof it.verdict === 'object' && 'refuse' in it.verdict)).toBe(true);
        expect(CASES.some((it) => typeof it.verdict === 'object' && 'stamp' in it.verdict)).toBe(true);
    });

    it.each(CASES.map((it) => [it.name, it]))('%s', (_, it) => {
        const verdict = layoutVerdict(storeStatements(it.store, MARKER.graph).engine, MARKER.graph, {
            stamps: it.stamps,
            foreignNodes: it.foreignNodes,
            objects: it.objects ?? []
        });
        if (it.verdict === 'current') {
            expect(verdict).toEqual({ verdict: 'current' });
        } else if ('refuse' in it.verdict) {
            // An earlier layout's graph that holds values says which (`from`), and one part way through a migration so.
            expect(verdict).toEqual({
                verdict: 'refuse',
                message: it.verdict.refuse,
                ...(it.verdict.from !== undefined ? { from: it.verdict.from } : {}),
                ...(it.verdict.inProgress !== undefined ? { inProgress: it.verdict.inProgress } : {})
            });
        } else {
            expect(verdict).toMatchObject({
                verdict: 'stamp',
                drops: it.verdict.stamp.drops,
                assign: it.verdict.stamp.assign ?? false
            });
        }
    });
});

/** A store as judgeLayout runs statements on it: each statement's rows, by what it opens with, and what it was given. */
function store(rows: (statement: string) => any[]): { run: jest.Mock; ran: string[] } {
    const ran: string[] = [];
    const run = jest.fn(async (statement: string) => {
        ran.push(statement);
        return Promise.resolve(rows(statement));
    });
    return { run, ran };
}

describe('judgeLayout', () => {
    const graph = 'g';
    const stamp = storeStatements('sqlite', graph).stamp;
    const MADE = 'SELECT made';

    it('asks nothing of a graph whose table of nodes is not there yet', async () => {
        const it = store(() => [{ made: 0 }]);
        await judgeLayout('sqlite', graph, MADE, it.run);
        expect(it.ran).toEqual([MADE]);
    });

    it('uses a graph of this layout', async () => {
        const it = store((statement) =>
            statement === MADE
                ? [{ made: 1 }]
                : statement === stamp.readStamps
                ? [{ stamp: '{"id":"a","assignedAt":"t","layout":2}' }]
                : statement === stamp.foreignNodes
                ? [{ one: 1 }]
                : []
        );
        await judgeLayout('sqlite', graph, MADE, it.run);
        expect(it.ran).toEqual([MADE, stamp.readStamps, stamp.foreignNodes, stamp.layoutObjects]);
    });

    it("refuses an earlier layout's graph that holds values, with the module's message, and makes nothing", async () => {
        const it = store((statement) =>
            statement === MADE ? [{ made: 1 }] : statement === stamp.foreignNodes ? [{ one: 1 }] : []
        );
        const refusal = judgeLayout('sqlite', graph, MADE, it.run);
        await expect(refusal).rejects.toThrow(StoreLayoutError);
        await expect(refusal).rejects.toThrow(/was written in store layout 1/);
        // An application catches it by its class, as the package exports it.
        expect(drivine.StoreLayoutError).toBe(StoreLayoutError);
        expect(it.ran).not.toContain(stamp.restampLayout);
        // It says the layout it was written in, which a migration moves from, and that none is under way.
        await expect(refusal).rejects.toMatchObject({ graph, from: 1, inProgress: false });
    });

    it('refuses a graph part way through a migration, saying so, whatever its stamp says', async () => {
        const it = store((statement) =>
            statement === MADE
                ? [{ made: 1 }]
                : statement === stamp.readStamps
                ? [{ stamp: '{"id":"a","assignedAt":"t","layout":2}' }]
                : statement === stamp.foreignNodes
                ? [{ one: 1 }]
                : statement === stamp.layoutObjects
                ? [
                      { object: `{"name":"${graph}_lock2","type":"TABLE"}` },
                      { object: `{"name":"${graph}_migrate2","type":"TABLE"}` }
                  ]
                : []
        );
        const refusal = judgeLayout('sqlite', graph, MADE, it.run);
        await expect(refusal).rejects.toThrow(/part way through a migration to store layout 2/);
        await expect(refusal).rejects.toMatchObject({ graph, inProgress: true });
        expect(it.ran).not.toContain(stamp.restampLayout);
    });

    it("restamps an earlier layout's empty graph, its old objects dropped first, and asks again", async () => {
        let restamped = false;
        const it = store((statement) => {
            if (statement === stamp.restampLayout) {
                restamped = true;
            }
            return statement === MADE
                ? [{ made: 1 }]
                : statement === stamp.readStamps
                ? [{ stamp: { id: 'a', assignedAt: 't', layout: restamped ? 2 : null } }]
                : statement === stamp.layoutObjects && !restamped
                ? [{ object: { name: 'g_uq_Personemail_8e5a9c3b', type: 'INDEX' } }]
                : [];
        });
        await judgeLayout('sqlite', graph, MADE, it.run);
        const drop = it.ran.indexOf('DROP INDEX IF EXISTS g_uq_Personemail_8e5a9c3b');
        expect(drop).toBeGreaterThan(0);
        expect(it.ran.indexOf(stamp.restampLayout!)).toBeGreaterThan(drop);
        expect(it.run).toHaveBeenCalledWith(stamp.restampLayout, restampParameters('sqlite', graph));
        // Asked again of the stamps read back, and found current.
        expect(it.ran.filter((s) => s === stamp.readStamps)).toHaveLength(2);
    });

    it('stamps again a graph of this layout whose stamp a clear deleted, as a stamp is first made', async () => {
        const cleared = storeStatements('sqlite', 'drivine').stamp;
        let stamped = false;
        const it = store((statement) => {
            if (statement === cleared.assignIfAbsent) {
                stamped = true;
            }
            return statement === MADE
                ? [{ made: 1 }]
                : statement === cleared.readStamps
                ? stamped
                    ? [{ stamp: { id: 'a', assignedAt: 't', layout: 2 } }]
                    : []
                : statement === cleared.foreignNodes
                ? [{ one: 1 }]
                : statement === cleared.layoutObjects
                ? [{ object: { name: 'drivine_lock2', type: 'TABLE' } }]
                : [];
        });
        await judgeLayout('sqlite', 'drivine', MADE, it.run);
        expect(it.ran).not.toContain(cleared.restampLayout);
        const assigned = it.run.mock.calls.find(([statement]) => statement === cleared.assignIfAbsent);
        const expected = stampParameters('sqlite', 'drivine', 'id', 'at', 'SQLITE');
        expect(Object.keys(assigned![1]).sort()).toEqual(Object.keys(expected).sort());
        expect(it.ran.filter((s) => s === cleared.readStamps)).toHaveLength(2);
    });

    it('refuses a graph whose stamp reads back in an earlier layout after it was restamped', async () => {
        const it = store((statement) =>
            statement === MADE
                ? [{ made: 1 }]
                : statement === stamp.readStamps
                ? [{ stamp: { id: 'a', assignedAt: 't', layout: null } }]
                : []
        );
        await expect(judgeLayout('sqlite', graph, MADE, it.run)).rejects.toThrow(
            "The graph 'g' was given store layout 2, and its stamps read back otherwise"
        );
    });
});
