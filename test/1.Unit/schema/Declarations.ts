import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { CaseInsensitive } from '@/annotation/CaseInsensitive';
import { NodeFragment } from '@/annotation/NodeFragment';
import { NodeId } from '@/annotation/NodeId';
import { FullTextIndex, RangeIndex, Unique, VectorIndex } from '@/annotation/Schema';
import { PlanRequest } from '@/schema/SchemaPlan';
import { SchemaCatalog } from '@/schema/SchemaCatalog';
import {
    falkorDbVectorOptions,
    fullTextIndex,
    neo4jVectorOptions,
    rangeIndex,
    uniquenessConstraint,
    vectorIndex
} from '@/schema/SchemaSpecs';

/**
 * The cases of the spec's declarations.yaml (liberation-data/drivine-cypher-spec#135), each declared in this library's
 * own API: what Declarations.spec checks the planner is given, and what a store's run of them declares.
 */
export interface Case {
    case: string;
    declare: string;
    catalogs: PlanRequest['catalogs'];
    runtime: PlanRequest['runtime'];
}

export const CASES: Case[] = parse(
    fs.readFileSync(path.join(__dirname, '../../cypher/declarations.yaml'), 'utf8')
).cases;

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

@NodeFragment({ labels: ['Ticket'], nodeIdIndex: false })
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
 * case is taken off this list: a full-text index takes no analyzer (#648), and there is no TEXT index (#541).
 */
export const GAPS: Record<string, string[]> = {
    'full-text': ['#648'],
    text: ['#541'],
    'fragment class items': ['#648']
};

/** What each case declares, in this library's own API: its startup catalogs, and what is ensured at runtime, by owner, before an enforce. */
export const DECLARATIONS: Record<string, { catalogs: SchemaCatalog[]; runtime?: [string, SchemaCatalog][] }> = {
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
