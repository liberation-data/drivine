import * as fs from 'fs';
import * as path from 'path';
import {
    CypherBackend,
    CypherGrammar,
    FALKORDB_GRAMMAR,
    GraphStatement,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR
} from '@liberation-data/drivine';
import {
    ActorStats,
    ActorWithLatestMovie,
    ActorWithMovies,
    LocationAncestors,
    LocationHierarchy,
    Person,
    PersonCareer,
    Puppy
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
    return Object.fromEntries(Object.entries(cases).map(([name, it]) => [name, it.text]));
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
