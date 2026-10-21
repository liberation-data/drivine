import * as fs from 'fs';
import * as path from 'path';
import {
    FALKORDB_SCHEMA,
    falkorDbVectorOptions,
    fullTextIndex,
    MEMGRAPH_SCHEMA,
    NEO4J_SCHEMA,
    neo4jVectorOptions,
    rangeIndex,
    SchemaGrammar,
    uniquenessConstraint,
    vectorIndex,
    avg,
    count,
    hop,
    key,
    max,
    pathKey,
    sum,
    above,
    anyOf,
    atMost,
    caseOf,
    coalesce,
    div,
    not,
    times,
    CascadeType,
    CypherBackend,
    DatabaseType,
    GraphBackend,
    OracleBackend,
    OracleGraph,
    schemaGrammarFor,
    Direction,
    CypherGrammar,
    FALKORDB_GRAMMAR,
    GraphStatement,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    RelateMode,
    RemovedTargets,
    SchemaItem,
    TargetModel
} from '@liberation-data/drivine';
import {
    ActorStats,
    Customer,
    Director,
    Dog,
    Location,
    ActorWithLatestMovie,
    ActorWithDirectors,
    ActorWithMovies,
    Animal,
    LocationAncestors,
    LocationHierarchy,
    Movie,
    Organization,
    Person,
    PersonCareer,
    Puppy,
    Tier,
    WorkHistory
} from './GoldenModels';

/**
 * The statements this backend writes for drivine-python's test models, in `statements.json`, which drivine-python
 * checks its own against: the two write the same Cypher for the same model. A change to a statement fails here until
 * the file is written again, with `UPDATE_GOLDEN=true`, and copied to drivine-python's tests/golden.
 */
const GOLDEN = path.join(__dirname, 'statements.json');

/** A filter in the store's own language: Cypher over `n`, or SQL over the node row `n` on Oracle. */
const CYPHER_WHERE = 'n.name = $name';
const SQL_WHERE = "JSON_VALUE(n.props, '$.name') = $name";

function statements(grammar: CypherGrammar): Record<string, string> {
    return written(new CypherBackend(grammar), CYPHER_WHERE, !grammar.orphanDeleteLimit);
}

/** Oracle's statements: the same cases, a filter in SQL, and the searches through an index's table too. */
function oracleStatements(): Record<string, string> {
    const backend = new OracleBackend(new OracleGraph());
    const registry = new ModelRegistry();
    const person: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Person) };
    return {
        ...written(backend, SQL_WHERE, true),
        'Person.nearest.indexed': backend.nearest(person, {
            label: 'Person',
            property: 'embedding',
            similarity: 'EUCLIDEAN',
            k: 20,
            limit: 5,
            table: 'drivine_v_Personembedding_1a2b3c'
        }).text,
        'Person.matching.indexed': backend.matching(person, {
            label: 'Person',
            properties: ['name', 'bio'],
            text: 'graph -relational',
            limit: 10,
            table: 'drivine_t_Personnamebio_4d5e6f'
        }).text,
        'Person.searchIndexTable': backend.searchIndexTable('VECTOR', 'Person', ['embedding']).text,
        ...indexedReads(backend, registry)
    };
}

/** Oracle's reads through a labelled index: a filter on a property a range index or a constraint begins with. */
function indexedReads(backend: OracleBackend, registry: ModelRegistry): Record<string, string> {
    const indexed: SchemaItem[] = [
        { label: 'Movie', properties: ['title'] },
        { label: 'Dog', properties: ['breed', 'name'] }
    ];
    const movie: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Movie) };
    const dog: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Dog) };
    const movies = backend.renderQuery(
        (q: any) => ({
            where: [
                q.title.eq('Heat'),
                q.released.gt(1990),
                anyOf(q.title.eq('x'), q.uuid.eq('m1')),
                q.title.lte('Z'),
                q.uuid.eq('m2')
            ]
        }),
        movie,
        indexed
    );
    const dogs = backend.renderQuery((q: any) => ({ where: q.breed.gte('Collie') }), dog, indexed);
    const names = backend.renderQuery((q: any) => ({ where: q.name.eq('Rex') }), dog, indexed);
    return {
        'query.Movie.indexed': backend.loadAllFragments(movie.model, movies.where, {}, movies.labelsTested).text,
        'query.Movie.indexed.count': backend.countFragments(movie.model, movies.where, movies.labelsTested).text,
        'query.Dog.indexed': backend.loadAllFragments(dog.model, dogs.where, {}, dogs.labelsTested).text,
        'query.Dog.indexed.deleteAll': backend.deleteAll(dog, dogs.where, dogs.labelsTested).text,
        'query.Dog.notIndexed': backend.loadAllFragments(dog.model, names.where, {}, names.labelsTested).text
    };
}

function written(backend: GraphBackend, where: string, orphans: boolean): Record<string, string> {
    const registry = new ModelRegistry();
    const fragment = registry.fragment.bind(registry);
    const view = registry.view.bind(registry);
    const cases: Record<string, GraphStatement> = {
        'Person.loadAll': backend.loadAllFragments(fragment(Person)),
        'Person.loadAll.where': backend.loadAllFragments(fragment(Person), where),
        'Person.load': backend.loadFragment(fragment(Person)),
        'Person.count': backend.countFragments(fragment(Person), where),
        'Puppy.loadAll': backend.loadAllFragments(fragment(Puppy)),
        'PersonCareer.loadAll': backend.loadAllViews(view(PersonCareer)),
        'PersonCareer.load': backend.loadView(view(PersonCareer)),
        'PersonCareer.count': backend.countViews(view(PersonCareer), where),
        'LocationHierarchy.load': backend.loadView(view(LocationHierarchy)),
        'LocationHierarchy.load.depth': backend.loadView(view(LocationHierarchy), { subLocations: 5 }),
        'LocationAncestors.load': backend.loadView(view(LocationAncestors)),
        'ActorStats.loadAll': backend.loadAllViews(view(ActorStats)),
        'ActorWithMovies.loadAll.where': backend.loadAllViews(view(ActorWithMovies), where),
        'ActorWithMovies.count': backend.countViews(view(ActorWithMovies)),
        'ActorWithDirectors.loadAll': backend.loadAllViews(view(ActorWithDirectors)),
        'ActorWithLatestMovie.loadAll': backend.loadAllViews(view(ActorWithLatestMovie))
    };
    Object.assign(cases, saves(registry, backend, where, orphans));
    Object.assign(cases, queries(registry, backend));
    Object.assign(cases, groups(registry, backend));
    Object.assign(cases, searches(registry, backend, where));
    return Object.fromEntries(Object.entries(cases).map(([name, it]) => [name, it.text]));
}

/** The grouped reads drivine-python's golden test writes, written alike. */
function searches(registry: ModelRegistry, backend: GraphBackend, where: string): Record<string, GraphStatement> {
    const person: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Person) };
    const career: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(PersonCareer) };
    const vector = { label: 'Person', property: 'embedding', similarity: 'COSINE' as const, k: 5 };
    const text = { label: 'Person', properties: ['name', 'bio'], text: 'graph database', limit: 10 };
    return {
        'Person.nearest': backend.nearest(person, vector),
        'Person.nearest.filtered': backend.nearest(person, {
            ...vector,
            similarity: 'EUCLIDEAN',
            where,
            threshold: true,
            k: 20,
            limit: 5
        }),
        'PersonCareer.nearest': backend.nearest(career, { ...vector, depth: {} }),
        'Person.matching': backend.matching(person, text),
        'Person.matching.filtered': backend.matching(person, {
            ...text,
            properties: ['bio'],
            where,
            threshold: true,
            limit: 3
        }),
        'PersonCareer.matching': backend.matching(career, text)
    };
}

function groups(registry: ModelRegistry, backend: GraphBackend): Record<string, GraphStatement> {
    const movie = registry.fragment(Movie);
    const directors = new Map([['director', registry.fragment(Director)]]);
    return {
        'groups.byProperty': backend.groups(
            movie,
            { keys: { year: key('released') }, aggregates: { films: count() } },
            new Map()
        ),
        'groups.aggregates': backend.groups(
            movie,
            {
                where: 'n.released > $from',
                bindings: { from: 1990 },
                keys: { year: key('released') },
                aggregates: {
                    films: count(),
                    nineties: count('n.released < 2000'),
                    years: sum('released', 'n.released > 2000'),
                    average: avg('released'),
                    last: max('released')
                },
                having: [['films', 'gte', 1]],
                orderBy: [['films', 'desc']],
                skip: 1,
                limit: 2
            },
            new Map()
        ),
        'groups.byPath': backend.groups(
            movie,
            {
                keys: { year: key('released'), director: pathKey(Director, [hop('DIRECTED_BY')]) },
                aggregates: { films: count() },
                orderBy: [['year', 'desc']]
            },
            directors
        )
    };
}

/** The queries drivine-python's golden test writes, written alike: each load as its statement. */
function queries(registry: ModelRegistry, backend: GraphBackend): Record<string, GraphStatement> {
    const fragment = (type: any): TargetModel => ({ kind: 'NODE_FRAGMENT', model: registry.fragment(type) });
    const view = (type: any): TargetModel => ({ kind: 'GRAPH_VIEW', model: registry.view(type) });
    const load = (target: TargetModel, fn: (q: any) => any): GraphStatement => {
        const rendered = backend.renderQuery(fn, target);
        const page = { orderBy: rendered.orderBy, skip: rendered.skip, limit: rendered.limit };
        return target.kind === 'GRAPH_VIEW'
            ? backend.loadAllViews(target.model, rendered.where, rendered.depth, page)
            : backend.loadAllFragments(target.model, rendered.where, page);
    };
    return {
        'query.Movie.where': load(fragment(Movie), (q) => ({
            where: [anyOf(q.released.eq(1999), q.title.startsWith('The')), q.uuid.notIn(['m9']), not(q.title.eq('x'))],
            orderBy: q.released.desc().nullsLast(),
            skip: 10,
            limit: 5
        })),
        'query.Movie.seek': load(fragment(Movie), (q) => ({
            orderBy: [q.released.desc(), q.uuid.asc()],
            seek: [q.released.after(2000), q.uuid.after('m3')],
            limit: 3
        })),
        'query.Movie.expression': load(fragment(Movie), (q) => ({
            orderBy: [
                caseOf(
                    [above(q.released, 2010).or(atMost(q.released, 1995)).then(0)],
                    times(coalesce(q.released, 0), div(1, 2))
                ).desc(),
                q.title.asc().nullsFirst()
            ]
        })),
        'query.PersonCareer.across': load(view(PersonCareer), (q) => ({
            where: [
                q.employmentHistory.target.name.eq('Acme'),
                q.person.bio.contains('Lead'),
                q.employmentHistory.role.eq('Lead')
            ]
        })),
        'query.PersonCareer.quantified': load(view(PersonCareer), (q) => ({
            where: anyOf(
                q.employmentHistory.any((it: any) => [it.role.eq('Engineer'), it.target.name.eq('Acme')]),
                q.employmentHistory.none((it: any) => it.role.eq('Lead'))
            ),
            orderBy: [q.person.name.asc(), q.employmentHistory.startDate.desc()]
        })),
        'query.Customer.bags': load(fragment(Customer), (q) => ({
            where: [
                q.metadata.source.eq('wiki'),
                q.property('metadata.score').gte(3),
                q.predicate('fullName', 'STARTS_WITH', 'A'),
                q.tiers.hasItem('Gold'),
                q.tags.hasItem('vip'),
                q.fullName.containsIgnoreCase('ad'),
                q.legacyCode.isNull()
            ]
        })),
        'query.Animal.labels': load(fragment(Animal), (q) => ({
            where: anyOf(q.instanceOf(Puppy), q.hasAnyLabel('Dog', 'Cat'))
        })),
        'query.Person.count': backend.countFragments(
            registry.fragment(Person),
            backend.renderWhere((q: any) => q.name.eqIgnoreCase('ada'), fragment(Person)).where
        )
    };
}

/** The objects drivine-python's golden test builds, built alike here: what a statement's text depends on is the same. */
const make = <T extends object>(type: new () => T, values: Partial<T>): T => Object.assign(new type(), values) as T;

function saves(
    registry: ModelRegistry,
    backend: GraphBackend,
    where: string,
    orphans: boolean
): Record<string, GraphStatement> {
    const fragment = (type: any): TargetModel => ({ kind: 'NODE_FRAGMENT', model: registry.fragment(type) });
    const view = (type: any): TargetModel => ({ kind: 'GRAPH_VIEW', model: registry.view(type) });
    const save = (target: TargetModel, object: any, options = {}, createOnly = false): GraphStatement =>
        backend.save(target, object, options, createOnly, registry);
    const ada = (): Person => make(Person, { uuid: 'p1', name: 'Ada' });
    const history = (start: string, org: Organization): WorkHistory =>
        make(WorkHistory, { startDate: start, role: 'Engineer', target: org });
    const career = (stamp?: string): PersonCareer =>
        make(PersonCareer, {
            person: make(Person, { uuid: 'p1', name: 'Ada', stamp }),
            employmentHistory: [
                history('2015', make(Organization, { uuid: 'o1', name: 'Acme' })),
                history('2020', make(Organization, { uuid: 'o2', name: 'Babbage' }))
            ]
        });
    const place = (uuid: string, ...below: LocationHierarchy[]): LocationHierarchy =>
        make(LocationHierarchy, {
            location: make(Location, { uuid, name: uuid, type: 'place' }),
            subLocations: below
        });
    const cases: Record<string, GraphStatement> = {
        'Person.save': save(fragment(Person), ada()),
        'Person.save.checked': save(
            fragment(Person),
            make(Person, { ...ada(), stamp: 'aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb' })
        ),
        'Person.create': save(fragment(Person), ada(), {}, true),
        'Puppy.save': save(fragment(Puppy), make(Puppy, { uuid: 'a1', name: 'Bit', ageInWeeks: 9 })),
        'Customer.save': save(
            fragment(Customer),
            make(Customer, {
                uuid: 'c1',
                fullName: 'Ada',
                metadata: { source: 'wiki', score: 3 },
                tiers: new Set([Tier.GOLD])
            })
        ),
        'PersonCareer.save': save(view(PersonCareer), career()),
        'PersonCareer.save.replace': save(view(PersonCareer), career('aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb'), {
            replace: ['employmentHistory'],
            removedTargets: RemovedTargets.DELETE_UNREFERENCED
        }),
        'LocationHierarchy.save': save(view(LocationHierarchy), place('l0', place('l1', place('l2')))),
        'Person.delete': backend.delete(fragment(Person)),
        'Person.deleteAll': backend.deleteAll(fragment(Person), where),
        'PersonCareer.delete.where': backend.delete(view(PersonCareer), where),
        'PersonCareer.delete.all': backend.delete(view(PersonCareer), undefined, CascadeType.DELETE_ALL),
        'LocationHierarchy.delete.all': backend.delete(view(LocationHierarchy), undefined, CascadeType.DELETE_ALL),
        'Person.heldProperties': backend.heldProperties(registry.fragment(Person)),
        'Person.foundStamp': backend.foundStamp(registry.fragment(Person)),
        'saveAll.fragments': backend.fragmentBatch(
            [
                { model: registry.fragment(Person), objects: [ada(), make(Person, { uuid: 'p2', name: 'Grace' })] },
                { model: registry.fragment(Organization), objects: [make(Organization, { uuid: 'o1', name: 'Acme' })] }
            ],
            {}
        ),
        'Person.patch': backend.patchOne(registry.fragment(Person)),
        'Person.patch.where': backend.patchOne(registry.fragment(Person), where),
        'Person.patchAll': backend.patchMany(registry.fragment(Person)),
        'edges.relate': backend.relate(
            { model: registry.fragment(Person), id: 'p1' },
            { model: registry.fragment(Organization), id: 'o1' },
            'WORKS_FOR',
            { startDate: '2020', role: 'Lead', note: undefined },
            RelateMode.MERGE
        ),
        'edges.relate.create': backend.relate(
            { model: registry.fragment(Person), id: 'p1' },
            { model: registry.fragment(Person), id: 'p2', labels: ['Admin'] },
            'KNOWS',
            {},
            RelateMode.CREATE
        ),
        'edges.unrelate': backend.unrelate(
            { model: registry.fragment(Person), id: 'p1' },
            { model: registry.fragment(Organization), id: 'o1' },
            'WORKS_FOR'
        ),
        'edges.unrelateAll': backend.unrelateAll(
            { model: registry.fragment(Person), id: 'p1' },
            'KNOWS',
            Direction.INCOMING
        ),
        'edges.related': backend.related(
            { model: registry.fragment(Person), id: 'p1' },
            'OWNS',
            Direction.OUTGOING,
            registry.fragment(Dog)
        )
    };
    if (orphans) {
        cases['PersonCareer.delete.orphans'] = backend.delete(view(PersonCareer), undefined, CascadeType.DELETE_ORPHAN);
    }
    return cases;
}

/** The schema DDL drivine-python's golden test writes, written alike, for each engine. */
function schema(grammar: SchemaGrammar): Record<string, string> {
    const range = rangeIndex('Session', ['lastActivityAt', 'sessionId']);
    const unique = uniquenessConstraint('Person', 'uuid');
    const pair = uniquenessConstraint('Person', ['email', 'tenant']);
    const vector = vectorIndex('Chunk', 'embedding', 1536, 'COSINE', {
        hnswM: 16,
        hnswEfConstruction: 200,
        engineOptions: [
            neo4jVectorOptions({ quantizationEnabled: false }),
            falkorDbVectorOptions({ efRuntime: 10, hnswM: 32 })
        ]
    });
    const plain = vectorIndex('Chunk', 'summary', 384, 'EUCLIDEAN');
    const text = fullTextIndex('Article', ['title', 'body']);
    const single = fullTextIndex('Article', 'title');
    const shown = (statements: unknown[]): string =>
        statements.map((it) => (typeof it === 'string' ? it : JSON.stringify(it))).join('\n');
    return {
        'schema.listRanges': grammar.listRanges.statement,
        'schema.listUniques': grammar.listUniques.statement,
        'schema.listVectors': grammar.listVectors.statement,
        'schema.listFullTexts': grammar.listFullTexts.statement,
        'schema.createRange': shown(grammar.createRange(range)),
        'schema.dropRange': shown(grammar.dropRange(range)),
        'schema.createUnique': shown(grammar.createUnique(unique)),
        'schema.createUnique.pair': shown(grammar.createUnique(pair)),
        'schema.dropUnique': shown(grammar.dropUnique(pair)),
        'schema.createVector': shown(grammar.createVector(vector)),
        'schema.createVector.plain': shown(grammar.createVector(plain)),
        'schema.dropVector': shown(grammar.dropVector(vector)),
        'schema.createFullText': shown(grammar.createFullText(text)),
        'schema.createFullText.single': shown(grammar.createFullText(single)),
        'schema.dropFullText': shown(grammar.dropFullText(text)),
        'schema.dropFullText.named': shown(grammar.dropFullText(text, 'given_name')),
        'schema.conflicts': grammar.conflicts(pair, 10)
    };
}

describe('Golden statements', () => {
    const written = {
        NEO4J: { ...statements(NEO4J_GRAMMAR), ...schema(NEO4J_SCHEMA) },
        MEMGRAPH: { ...statements(MEMGRAPH_GRAMMAR), ...schema(MEMGRAPH_SCHEMA) },
        FALKORDB: { ...statements(FALKORDB_GRAMMAR), ...schema(FALKORDB_SCHEMA) },
        ORACLE: { ...oracleStatements(), ...schema(schemaGrammarFor(DatabaseType.ORACLE, new OracleGraph())) }
    };

    it('should match the statements drivine-python checks against', () => {
        if (process.env.UPDATE_GOLDEN === 'true') {
            fs.writeFileSync(GOLDEN, `${JSON.stringify(written, null, 2)}\n`);
        }
        expect(JSON.parse(fs.readFileSync(GOLDEN, 'utf8'))).toEqual(written);
    });
});
