import * as fs from 'fs';
import * as path from 'path';
import {
    CascadeType,
    CypherBackend,
    CypherGrammar,
    FALKORDB_GRAMMAR,
    GraphStatement,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    RemovedTargets,
    TargetModel
} from '@liberation-data/drivine';
import {
    ActorStats,
    Customer,
    Location,
    ActorWithLatestMovie,
    ActorWithMovies,
    LocationAncestors,
    LocationHierarchy,
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

function statements(grammar: CypherGrammar): Record<string, string> {
    const registry = new ModelRegistry();
    const backend = new CypherBackend(grammar);
    const fragment = registry.fragment.bind(registry);
    const view = registry.view.bind(registry);
    const cases: Record<string, GraphStatement> = {
        'Person.loadAll': backend.loadAllFragments(fragment(Person)),
        'Person.loadAll.where': backend.loadAllFragments(fragment(Person), 'n.name = $name'),
        'Person.load': backend.loadFragment(fragment(Person)),
        'Person.count': backend.countFragments(fragment(Person), 'n.name = $name'),
        'Puppy.loadAll': backend.loadAllFragments(fragment(Puppy)),
        'PersonCareer.loadAll': backend.loadAllViews(view(PersonCareer)),
        'PersonCareer.load': backend.loadView(view(PersonCareer)),
        'PersonCareer.count': backend.countViews(view(PersonCareer), 'n.name = $name'),
        'LocationHierarchy.load': backend.loadView(view(LocationHierarchy)),
        'LocationHierarchy.load.depth': backend.loadView(view(LocationHierarchy), { subLocations: 5 }),
        'LocationAncestors.load': backend.loadView(view(LocationAncestors)),
        'ActorStats.loadAll': backend.loadAllViews(view(ActorStats)),
        'ActorWithMovies.loadAll.where': backend.loadAllViews(view(ActorWithMovies), 'n.name = $name'),
        'ActorWithMovies.count': backend.countViews(view(ActorWithMovies)),
        'ActorWithLatestMovie.loadAll': backend.loadAllViews(view(ActorWithLatestMovie))
    };
    Object.assign(cases, saves(grammar, registry, backend));
    return Object.fromEntries(Object.entries(cases).map(([name, it]) => [name, it.text]));
}

/** The objects drivine-python's golden test builds, built alike here: what a statement's text depends on is the same. */
const make = <T extends object>(type: new () => T, values: Partial<T>): T => Object.assign(new type(), values) as T;

function saves(
    grammar: CypherGrammar,
    registry: ModelRegistry,
    backend: CypherBackend
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
        'Person.deleteAll': backend.deleteAll(fragment(Person), 'n.name = $name'),
        'PersonCareer.delete.where': backend.delete(view(PersonCareer), 'n.name = $name'),
        'PersonCareer.delete.all': backend.delete(view(PersonCareer), undefined, CascadeType.DELETE_ALL),
        'LocationHierarchy.delete.all': backend.delete(view(LocationHierarchy), undefined, CascadeType.DELETE_ALL),
        'Person.heldProperties': backend.heldProperties(registry.fragment(Person)),
        'Person.foundStamp': backend.foundStamp(registry.fragment(Person))
    };
    if (!grammar.orphanDeleteLimit) {
        cases['PersonCareer.delete.orphans'] = backend.delete(view(PersonCareer), undefined, CascadeType.DELETE_ORPHAN);
    }
    return cases;
}

describe('Golden statements', () => {
    const written = {
        NEO4J: statements(NEO4J_GRAMMAR),
        MEMGRAPH: statements(MEMGRAPH_GRAMMAR),
        FALKORDB: statements(FALKORDB_GRAMMAR)
    };

    it('should match the statements drivine-python checks against', () => {
        if (process.env.UPDATE_GOLDEN === 'true') {
            fs.writeFileSync(GOLDEN, `${JSON.stringify(written, null, 2)}\n`);
        }
        expect(JSON.parse(fs.readFileSync(GOLDEN, 'utf8'))).toEqual(written);
    });
});
