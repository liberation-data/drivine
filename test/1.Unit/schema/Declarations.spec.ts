import {
    ConnectionProvider,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory
} from '@liberation-data/drivine';
import { moduleSpec, PlanRequest } from '@/schema/SchemaPlan';
import { SchemaManager } from '@/schema/SchemaManager';
import { SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import { rangeIndex, uniquenessConstraint } from '@/schema/SchemaSpecs';
import { Case, CASES, DECLARATIONS, GAPS } from './Declarations';

/**
 * What this library's schema declarations give the module's schema planner, as the spec's declarations.yaml pins it
 * (liberation-data/drivine-cypher-spec#135): each case declared in this library's own API, and the request's `catalogs`
 * and `runtime` compared, as JSON, with the case's. A store one library indexed is up to date for the others only where
 * each library's declarations give the same catalogs. drivine4j's DeclarationsGoldenTest.
 */

/**
 * The request each plan run is given, by a manager over one graph database whose planning only records it. Items ensured
 * at runtime as a list are given to `ensure(owner, ...specs)`, a catalog to `ensure(catalog)`.
 */
async function requested(declared: {
    catalogs: SchemaCatalog[];
    runtime?: [string, SchemaCatalog | SchemaSpec[]][];
}): Promise<PlanRequest> {
    const requests: PlanRequest[] = [];
    const planning = {
        plan: {
            run: async (request: PlanRequest) => {
                requests.push(request);
                return Promise.resolve({ owners: [] });
            },
            validate: () => undefined
        },
        database: 'graph',
        host: {}
    };
    const factory = { get: () => ({ schemaPlanning: () => planning }) } as unknown as GraphObjectManagerFactory;
    const manager = new SchemaManager(factory, { catalogs: declared.catalogs });
    for (const [owner, ensured] of declared.runtime ?? []) {
        await (Array.isArray(ensured) ? manager.ensure(owner, ...ensured) : manager.ensure(ensured.named(owner)));
    }
    await manager.enforce();
    // An enforce with nothing to apply plans nothing, as drivine4j's does: the request is then read as the planner would
    // be given it, as drivine4j's DeclarationsGoldenTest reads each.
    return (
        requests[requests.length - 1] ??
        (manager as any).request('graph', { type: 'enforce', owners: { all: true } }, (manager as any).runtime)
    );
}

describe("The schema declarations, as the spec's declarations.yaml pins what they give the planner", () => {
    beforeAll(() => {
        DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
    });

    afterAll(() => DatabaseRegistry.tearDown());

    it('declares every case the spec pins', () => {
        // A case the spec adds is never passed over: each has a declaration here.
        expect(CASES.map((it) => it.case).filter((it) => !(it in DECLARATIONS))).toEqual([]);
        expect(Object.keys(DECLARATIONS).filter((it) => !CASES.some((c) => c.case === it))).toEqual([]);
    });

    const gives = async (pinned: Case): Promise<void> => {
        const declared = DECLARATIONS[pinned.case];
        if (!declared) {
            throw new Error(`No declaration for the spec's case '${pinned.case}': ${pinned.declare}`);
        }
        const request = await requested(declared);
        expect(JSON.parse(JSON.stringify({ catalogs: request?.catalogs, runtime: request?.runtime }))).toEqual({
            catalogs: pinned.catalogs,
            runtime: pinned.runtime
        });
    };

    it.each(CASES.filter((it) => !(it.case in GAPS)).map((it) => [it.case, it] as const))(
        'gives the planner the catalogs of %s',
        async (_, pinned) => gives(pinned)
    );

    it.failing.each(
        CASES.filter((it) => it.case in GAPS).map((it) => [it.case, GAPS[it.case].join(', '), it] as const)
    )('gives the planner the catalogs of %s, once %s lands', async (_, __, pinned) => gives(pinned));

    it("gives the planner an ensure's items as a catalog of them, the indexes before the constraints", async () => {
        // As drivine4j's ensure(owner, specs) builds SchemaCatalog.of(specs): not caught by the pinned runtime case, which
        // ensures two indexes as a catalog.
        const request = await requested({
            catalogs: [],
            runtime: [
                [
                    'dice',
                    [
                        uniquenessConstraint('Tenant', 'code'),
                        rangeIndex('Tenant', 'name'),
                        uniquenessConstraint('Tenant', 'code')
                    ]
                ]
            ]
        });
        expect(JSON.parse(JSON.stringify(request.runtime))).toEqual([
            {
                owner: 'dice',
                version: null,
                items: [
                    { kind: 'RANGE_INDEX', label: 'Tenant', properties: ['name'], name: null, ignoreCase: false },
                    {
                        kind: 'UNIQUENESS_CONSTRAINT',
                        label: 'Tenant',
                        properties: ['code'],
                        name: null,
                        ignoreCase: false,
                        nodeIdProperty: null
                    }
                ]
            }
        ]);
    });

    it('lists only cases the spec pins as waiting on an issue', () => {
        expect(Object.keys(GAPS).filter((it) => !CASES.some((c) => c.case === it))).toEqual([]);
    });

    // Until a fragment's @NodeId gets its range index by default (#800), the rest of a fragment's items are the pin's, in
    // the order drivine4j gives them: the default is the one item missing.
    it.each(['fragment', 'fragments merged', 'fragment ignoring case', "fragment without its id's index"])(
        'gives the planner the items of %s in the pin, but for the default index over the @NodeId',
        (name) => {
            const pinned = CASES.find((it) => it.case === name)!;
            const items = pinned.catalogs[0].items.filter(
                (it) => !(it.kind === 'RANGE_INDEX' && JSON.stringify(it.properties) === '["id"]')
            );
            const catalog = DECLARATIONS[name].catalogs[0];
            expect(JSON.parse(JSON.stringify(catalog.items.map(moduleSpec)))).toEqual(items);
        }
    );

    // And until a full-text index takes an analyzer (#648), a fragment's own items are the pin's, in its order, but for
    // the analyzer and the default index.
    it("gives the planner the items of fragment class items in the pin, but for the analyzer and the @NodeId's index", () => {
        const pinned = CASES.find((it) => it.case === 'fragment class items')!;
        const items = pinned.catalogs[0].items
            .filter((it) => !(it.kind === 'RANGE_INDEX' && JSON.stringify(it.properties) === '["id"]'))
            .map((it) => (it.kind === 'FULLTEXT_INDEX' ? { ...it, analyzer: null } : it));
        const catalog = DECLARATIONS['fragment class items'].catalogs[0];
        expect(JSON.parse(JSON.stringify(catalog.items.map(moduleSpec)))).toEqual(items);
    });

    // And full-text's request is the pin's but for the analyzer (#648), so that nothing else hides behind its gap.
    it('gives the planner the catalogs of full-text in the pin, but for the analyzer', async () => {
        const pinned = CASES.find((it) => it.case === 'full-text')!;
        const request = await requested(DECLARATIONS['full-text']);
        expect(JSON.parse(JSON.stringify({ catalogs: request.catalogs, runtime: request.runtime }))).toEqual({
            catalogs: pinned.catalogs.map((it) => ({
                ...it,
                items: it.items.map((item) => ({ ...item, analyzer: null }))
            })),
            runtime: pinned.runtime
        });
    });
});
