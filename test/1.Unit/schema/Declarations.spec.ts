import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
    ConnectionProvider,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory
} from '@liberation-data/drivine';
import { CaseInsensitive } from '@/annotation/CaseInsensitive';
import { NodeFragment } from '@/annotation/NodeFragment';
import { NodeId } from '@/annotation/NodeId';
import { FullTextIndex, RangeIndex, Unique, VectorIndex } from '@/annotation/Schema';
import { moduleSpec, PlanRequest } from '@/schema/SchemaPlan';
import { SchemaCatalog } from '@/schema/SchemaCatalog';
import { SchemaManager } from '@/schema/SchemaManager';
import {
    falkorDbVectorOptions,
    fullTextIndex,
    neo4jVectorOptions,
    rangeIndex,
    uniquenessConstraint,
    vectorIndex
} from '@/schema/SchemaSpecs';

/**
 * What this library's schema declarations give the module's schema planner, as the spec's declarations.yaml pins it
 * (liberation-data/drivine-cypher-spec#135): each case declared in this library's own API, and the request's `catalogs`
 * and `runtime` compared, as JSON, with the case's. A store one library indexed is up to date for the others only where
 * each library's declarations give the same catalogs. drivine4j's DeclarationsGoldenTest.
 */

interface Case {
    case: string;
    declare: string;
    catalogs: PlanRequest['catalogs'];
    runtime: PlanRequest['runtime'];
}

const CASES: Case[] = parse(fs.readFileSync(path.join(__dirname, '../../cypher/declarations.yaml'), 'utf8')).cases;

@NodeFragment({ labels: ['Article'] })
class Article {
    @NodeId() id: string;
    @Unique() slug: string;
    @RangeIndex() title: string;
    @VectorIndex() embedding: number[];
    @FullTextIndex() body: string;
}

@NodeFragment({ labels: ['Account'] })
class Account {
    @NodeId() @Unique() id: string;
    name: string;
}

@NodeFragment({ labels: ['Ticket'] })
class Ticket {
    @NodeId() id: string;
}

@Unique({ properties: ['sessionId', 'sequence'] })
@FullTextIndex({ properties: ['subject', 'body'] })
@NodeFragment({ labels: ['Message'] })
class Message {
    @NodeId() id: string;
    sessionId: string;
    sequence: number;
    subject: string;
    body: string;
}

@NodeFragment({ labels: ['Customer'] })
class Customer {
    @NodeId() id: string;
    @RangeIndex() email: string;
}

@NodeFragment({ labels: ['Customer'] })
class PreferredCustomer {
    @NodeId() id: string;
    @RangeIndex() email: string;
}

@NodeFragment({ labels: ['Member'] })
class Member {
    @NodeId() id: string;
    @CaseInsensitive() @Unique({ ignoreCase: true }) email: string;
}

const dimensions = (): number => 384;

/**
 * The cases this library can't yet declare as drivine4j does, each with the issue that adds what it needs. Each is still
 * declared, as near as this library's API comes, and expected to fail until its issue lands, when the test fails and the
 * case is taken off this list: a fragment's @NodeId is given no range index by default and none can be turned off (#800),
 * a full-text index takes no analyzer (#648), and there is no TEXT index (#541).
 */
const GAPS: Record<string, string> = {
    'full-text': '#648',
    text: '#541',
    fragment: '#800',
    "fragment without its id's index": '#800',
    'fragment class items': '#800, #648',
    'fragments merged': '#800',
    'fragment ignoring case': '#800'
};

/** What each case declares: its startup catalogs, and what is ensured at runtime, by owner, before an enforce. */
const DECLARATIONS: Record<string, { catalogs: SchemaCatalog[]; runtime?: [string, SchemaCatalog][] }> = {
    range: { catalogs: [SchemaCatalog.of(rangeIndex('Person', 'name'))] },
    'range named': {
        catalogs: [SchemaCatalog.of({ ...rangeIndex('Person', 'name'), name: 'person_name_idx' } as any)]
    },
    'range composite': { catalogs: [SchemaCatalog.of(rangeIndex('Person', ['last', 'first']))] },
    'range long name': {
        catalogs: [
            SchemaCatalog.of(
                rangeIndex('AVeryLongLabelNameThatGoesOnAndOnForTheSakeOfAnIdentifierLimit', [
                    'aPropertyWithALongName',
                    'anotherPropertyWithALongName'
                ])
            )
        ]
    },
    unique: { catalogs: [SchemaCatalog.of(uniquenessConstraint('Person', 'email'))] },
    'unique composite': { catalogs: [SchemaCatalog.of(uniquenessConstraint('Person', ['email', 'tenant']))] },
    'unique named': {
        catalogs: [SchemaCatalog.of({ ...uniquenessConstraint('Person', 'email'), name: 'person_email_unique' } as any)]
    },
    'ignore case': {
        catalogs: [
            SchemaCatalog.of(
                rangeIndex('Person', 'name', { ignoreCase: true }),
                uniquenessConstraint('Person', 'email', { ignoreCase: true })
            )
        ]
    },
    vector: { catalogs: [SchemaCatalog.of(vectorIndex('Chunk', 'embedding', 384, 'EUCLIDEAN'))] },
    'vector dimensions only': { catalogs: [SchemaCatalog.of(vectorIndex('Chunk', 'embedding', 384))] },
    'vector tuned': {
        catalogs: [
            SchemaCatalog.of(
                vectorIndex('Chunk', 'embedding', 384, 'COSINE', {
                    hnswM: 16,
                    hnswEfConstruction: 200,
                    engineOptions: [
                        neo4jVectorOptions({ quantizationEnabled: false }),
                        falkorDbVectorOptions({ efRuntime: 10 })
                    ]
                })
            )
        ]
    },
    'full-text': {
        catalogs: [SchemaCatalog.of({ ...fullTextIndex('Article', ['title', 'body']), analyzer: 'english' } as any)]
    },
    'full-text default analyzer': { catalogs: [SchemaCatalog.of(fullTextIndex('Article', 'body'))] },
    text: { catalogs: [SchemaCatalog.of({ kind: 'TEXT', label: 'Person', properties: ['name'] } as any)] },
    fragment: { catalogs: [SchemaCatalog.fromFragments(dimensions, Article)] },
    'fragment id served by a constraint': { catalogs: [SchemaCatalog.fromFragments(undefined, Account)] },
    "fragment without its id's index": { catalogs: [SchemaCatalog.fromFragments(undefined, Ticket)] },
    'fragment class items': { catalogs: [SchemaCatalog.fromFragments(undefined, Message)] },
    'fragments merged': { catalogs: [SchemaCatalog.fromFragments(undefined, Customer, PreferredCustomer)] },
    'fragment ignoring case': { catalogs: [SchemaCatalog.fromFragments(undefined, Member)] },
    'owner and version': { catalogs: [SchemaCatalog.of(rangeIndex('Person', 'name')).named('rag').withVersion('v2')] },
    'versions combined': {
        catalogs: [
            SchemaCatalog.of(rangeIndex('Person', 'name')).named('rag').withVersion('v2'),
            SchemaCatalog.of(uniquenessConstraint('Person', 'email')).named('rag').withVersion('a1')
        ]
    },
    'co-owned': {
        catalogs: [
            SchemaCatalog.of(rangeIndex('Person', 'name')).named('a'),
            SchemaCatalog.of(rangeIndex('Person', 'name')).named('b')
        ]
    },
    'ensured at runtime': {
        catalogs: [],
        runtime: [['dice', SchemaCatalog.of(vectorIndex('Chunk', 'embedding', 768), rangeIndex('Tenant', 'code'))]]
    }
};

/** The request each plan run is given, by a manager over one graph database whose planning only records it. */
async function requested(declared: (typeof DECLARATIONS)[string]): Promise<PlanRequest> {
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
    for (const [owner, catalog] of declared.runtime ?? []) {
        await manager.ensure(catalog.named(owner));
    }
    await manager.enforce();
    return requests[requests.length - 1];
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

    it.failing.each(CASES.filter((it) => it.case in GAPS).map((it) => [it.case, GAPS[it.case], it] as const))(
        'gives the planner the catalogs of %s, once %s lands',
        async (_, __, pinned) => gives(pinned)
    );

    it('lists only cases the spec pins as waiting on an issue', () => {
        expect(Object.keys(GAPS).filter((it) => !CASES.some((c) => c.case === it))).toEqual([]);
    });

    // Until a fragment's @NodeId gets its range index by default (#800), the rest of a fragment's items are the pin's, in
    // the order drivine4j gives them: the default is the one item missing.
    it.each(['fragment', 'fragments merged', 'fragment ignoring case', "fragment without its id's index"])(
        'gives the planner the items of %s in the pin, but for the default index over the @NodeId',
        async (name) => {
            const pinned = CASES.find((it) => it.case === name)!;
            const items = pinned.catalogs[0].items.filter(
                (it) => !(it.kind === 'RANGE_INDEX' && JSON.stringify(it.properties) === '["id"]')
            );
            const catalog = DECLARATIONS[name].catalogs[0];
            expect(JSON.parse(JSON.stringify(catalog.items.map(moduleSpec)))).toEqual(items);
        }
    );
});
