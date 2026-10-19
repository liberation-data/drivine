import {
    Aggregate,
    AggregateFunction,
    backendFor,
    Count,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() id: string;
    name: string;
}

@NodeFragment({ labels: ['Engineer'] })
class Engineer extends Person {}

@NodeFragment({ labels: ['Org'] })
class Org {
    @NodeId() id: string;
    name: string;
}

@NodeFragment({ labels: ['City'] })
class City {
    @NodeId() id: string;
    name: string;
}

@RelationshipFragment()
class WorkHistory {
    role: string;
    @GraphProperty('start_year') startYear: number;
    @TargetNode() org: Org;
}

@GraphView()
class Career {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    jobs: WorkHistory[];

    @GraphRelationship({ type: 'LIVES_IN', required: true })
    city: City;

    @GraphRelationship({ type: 'KNOWS', direction: Direction.UNDIRECTED, target: () => Person })
    friends: Person[];

    @GraphRelationship({ type: 'MANAGES', target: () => Person, maxDepth: 2 })
    reports: Person[];

    @GraphPath([hop('WORKS_FOR'), hop('BASED_IN')], { target: () => City })
    officeCities: City[];

    @Count('RATED') ratings: number;
    @Aggregate({ function: AggregateFunction.AVG, type: 'RATED', property: 'score' }) avgScore?: number;
    @Aggregate({ function: AggregateFunction.SUM, type: 'RATED', property: 'score' }) totalScore: number;
}

@GraphView()
class Team {
    @Root() org: Org;

    @GraphRelationship({ type: 'WORKS_FOR', direction: Direction.INCOMING, target: () => Career })
    members: Career[];
}

/** The cities of the studios a person funded, in the order the studios were founded or of their codes. */
@GraphView()
class Patron {
    @Root() person: Person;
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'founded'), hop('LOCATED_IN')], { target: () => City })
    cities: City[];
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'founded'), hop('LOCATED_IN')], { target: () => City })
    first?: City;
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'founded', false), hop('LOCATED_IN')], {
        target: () => City
    })
    latest?: City;
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'founded', false), hop('LOCATED_IN')], {
        target: () => City
    })
    latestFirst: City[];
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'code'), hop('LOCATED_IN')], { target: () => City })
    byCode: City[];
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'code', false), hop('LOCATED_IN')], {
        target: () => City
    })
    byCodeDescending: City[];
}

/** The cities of the studios a person funded, in the order of a key that is a text on some studios and a number on others. */
@GraphView()
class RankedPatron {
    @Root() person: Person;
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'sort key'), hop('LOCATED_IN')], { target: () => City })
    cities: City[];
    @GraphPath([hop('FUNDED', Direction.OUTGOING, 'Studio', 'sort key', false), hop('LOCATED_IN')], {
        target: () => City
    })
    citiesDescending: City[];
}

/** The patrons a person knows: a path ordered by a hop, in a view nested in another. */
@GraphView()
class PatronFriend {
    @Root() person: Person;
    @GraphRelationship({ type: 'KNOWS', target: () => Patron })
    knows: Patron[];
}

@NodeFragment({ labels: ['Category'] })
class CategoryNode {
    @NodeId() id: string;
}

@GraphView()
class Category {
    @Root() node: CategoryNode;

    @GraphRelationship({ type: 'PARENT', target: () => Category, maxDepth: 2 })
    parent?: Category;
}

describeOnOracle('views on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: OracleSeed;

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
        seed = new OracleSeed(pm, 'OraView');
        await seed.clear();
        await seed.node(['Person'], { id: 'ava', name: 'Ada' });
        await seed.node(['Person', 'Engineer'], { id: 'ben', name: 'Bob' });
        await seed.node(['Person'], { id: 'cal', name: 'Cy' });
        await seed.node(['Person'], { id: 'dot', name: 'Dee' });
        await seed.node(['Org'], { id: 'initech', name: 'Acme' });
        await seed.node(['Org'], { id: 'hooli', name: 'Globex' });
        await seed.node(['City'], { id: 'paris', name: 'Paris' });
        await seed.node(['City'], { id: 'oslo', name: 'Oslo' });
        await seed.node(['Movie'], { id: 'm1', score: 4 });
        await seed.node(['Movie'], { id: 'm2', score: 2 });
        await seed.node(['Movie'], { id: 'm3' });
        await seed.edge('ava', 'WORKS_FOR', 'initech', { role: 'lead', start_year: 2020 });
        await seed.edge('ava', 'WORKS_FOR', 'hooli', { role: 'advisor', start_year: 2024 });
        await seed.edge('ben', 'WORKS_FOR', 'initech', { role: 'dev', start_year: 2022 });
        await seed.edge('initech', 'BASED_IN', 'paris');
        await seed.edge('hooli', 'BASED_IN', 'oslo');
        await seed.edge('ava', 'LIVES_IN', 'paris');
        await seed.edge('ben', 'LIVES_IN', 'oslo');
        await seed.edge('ava', 'KNOWS', 'ben');
        await seed.edge('cal', 'KNOWS', 'ava');
        await seed.edge('ava', 'MANAGES', 'ben');
        await seed.edge('ben', 'MANAGES', 'cal');
        await seed.edge('cal', 'MANAGES', 'dot');
        await seed.edge('ava', 'RATED', 'm1');
        await seed.edge('ava', 'RATED', 'm2');
        await seed.edge('ava', 'RATED', 'm3');
        await seed.node(['Category'], { id: 'c1' });
        await seed.node(['Category'], { id: 'c2' });
        await seed.node(['Category'], { id: 'c3' });
        await seed.node(['Category'], { id: 'c4' });
        await seed.edge('c1', 'PARENT', 'c2');
        await seed.edge('c2', 'PARENT', 'c3');
        await seed.edge('c3', 'PARENT', 'c4');
        // 999 is first as a number and last as text. '0100' is first as text and last as a number. A studio without
        // founded or code comes last either way.
        await seed.node(['City'], { id: 'rome', name: 'Rome' });
        await seed.node(['Studio'], { id: 'ufa', founded: 999, code: '99' });
        await seed.node(['Studio'], { id: 'pixar', founded: 1986, code: '0100' });
        await seed.node(['Studio'], { id: 'bare' });
        await seed.edge('ava', 'FUNDED', 'bare');
        await seed.edge('ava', 'FUNDED', 'pixar');
        await seed.edge('ava', 'FUNDED', 'ufa');
        await seed.edge('bare', 'LOCATED_IN', 'rome');
        await seed.edge('pixar', 'LOCATED_IN', 'paris');
        await seed.edge('ufa', 'LOCATED_IN', 'oslo');
        // Dee funded studios whose 'sort key' is a text or a number: lyon 'a', paris 'b', oslo 'c' and 5, tokyo 10, and
        // rome none. Lowest first, oslo keeps 'c'; highest first, 5.
        await seed.node(['City'], { id: 'lyon', name: 'Lyon' });
        await seed.node(['City'], { id: 'tokyo', name: 'Tokyo' });
        const keys: [string, string | number | undefined, string][] = [
            ['gaumont', 'a', 'lyon'],
            ['pathe', 'b', 'paris'],
            ['cines', 'c', 'oslo'],
            ['nordisk', 5, 'oslo'],
            ['toho', 10, 'tokyo'],
            ['lux', undefined, 'rome']
        ];
        for (const [studio, key, city] of keys) {
            await seed.node(['Studio'], key === undefined ? { id: studio } : { id: studio, 'sort key': key });
            await seed.edge('dot', 'FUNDED', studio);
            await seed.edge(studio, 'LOCATED_IN', city);
        }
        // Cy funded studios whose 'sort key' is a text, one of them "": oslo '' and 'c', lyon 'a', paris 'b', tokyo 'd'.
        // "" is a text, and the lowest one, so lowest first oslo leads; highest first, oslo keeps 'c'.
        const texts: [string, string, string][] = [
            ['empty', '', 'oslo'],
            ['cee', 'c', 'oslo'],
            ['ay', 'a', 'lyon'],
            ['bee', 'b', 'paris'],
            ['dee', 'd', 'tokyo']
        ];
        for (const [studio, key, city] of texts) {
            await seed.node(['Studio'], { id: studio, 'sort key': key });
            await seed.edge('cal', 'FUNDED', studio);
            await seed.edge(studio, 'LOCATED_IN', city);
        }
    }, 60_000);

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should load a view: relationship fragments, single and undirected relationships', async () => {
        const ada = (await gom.load(Career, 'ava'))!;
        expect(ada).toBeInstanceOf(Career);
        expect(ada.person).toEqual(Object.assign(new Person(), { id: 'ava', name: 'Ada' }));
        expect(ada.city.name).toEqual('Paris');
        const jobs = ada.jobs.map((it) => [it.role, it.startYear, it.org.name]).sort();
        expect(jobs).toEqual([
            ['advisor', 2024, 'Globex'],
            ['lead', 2020, 'Acme']
        ]);
        expect(ada.jobs[0]).toBeInstanceOf(WorkHistory);
        expect(ada.friends.map((it) => it.id).sort()).toEqual(['ben', 'cal']);
        expect(ada.friends.find((it) => it.id === 'ben')).toBeInstanceOf(Engineer);
    });

    it('should read deep fragment lists once each, paths, counts and aggregates', async () => {
        const ada = (await gom.load(Career, 'ava'))!;
        expect(ada.reports.map((it) => it.id).sort()).toEqual(['ben', 'cal']);
        expect(ada.officeCities.map((it) => it.name).sort()).toEqual(['Oslo', 'Paris']);
        expect([ada.ratings, ada.avgScore, ada.totalScore]).toEqual([3, 3, 6]);
        const deeper = (await gom.load(Career, 'ava', { depth: { reports: 3 } }))!;
        expect(deeper.reports.map((it) => it.id).sort()).toEqual(['ben', 'cal', 'dot']);
        const bob = (await gom.load(Career, 'ben'))!;
        expect([bob.ratings, bob.avgScore, bob.totalScore]).toEqual([0, undefined, 0]);
        expect(bob.friends.map((it) => it.id)).toEqual(['ava']);
    });

    it('should read a path in the order one of its hops names, a number compared as one', async () => {
        const ada = (await gom.load(Patron, 'ava'))!;
        expect(ada.cities.map((it) => it.name)).toEqual(['Oslo', 'Paris', 'Rome']);
        expect(ada.first!.name).toEqual('Oslo');
        expect(ada.latest!.name).toEqual('Paris');
        expect(ada.latestFirst.map((it) => it.name)).toEqual(['Paris', 'Oslo', 'Rome']);
        const bob = (await gom.load(Patron, 'ben'))!;
        expect(bob.cities).toEqual([]);
        expect(bob.first).toBeUndefined();
    });

    it('should read a text of digits as text, and a node without the property last either way', async () => {
        const ada = (await gom.load(Patron, 'ava'))!;
        expect(ada.byCode.map((it) => it.name)).toEqual(['Paris', 'Oslo', 'Rome']);
        expect(ada.byCodeDescending.map((it) => it.name)).toEqual(['Oslo', 'Paris', 'Rome']);
    });

    it('should read a text before a number, lowest first, and a number before a text, highest first', async () => {
        const dee = (await gom.load(RankedPatron, 'dot'))!;
        expect(dee.cities.map((it) => it.name)).toEqual(['Lyon', 'Paris', 'Oslo', 'Tokyo', 'Rome']);
        expect(dee.citiesDescending.map((it) => it.name)).toEqual(['Tokyo', 'Oslo', 'Paris', 'Lyon', 'Rome']);
    });

    it('should read an empty text as a text, and the lowest one', async () => {
        const cy = (await gom.load(RankedPatron, 'cal'))!;
        expect(cy.cities.map((it) => it.name)).toEqual(['Oslo', 'Lyon', 'Paris', 'Tokyo']);
        expect(cy.citiesDescending.map((it) => it.name)).toEqual(['Tokyo', 'Oslo', 'Paris', 'Lyon']);
    });

    it('should read an ordered path of a view nested in another', async () => {
        const cy = (await gom.load(PatronFriend, 'cal'))!;
        expect(cy.knows.map((it) => it.person.id)).toEqual(['ava']);
        expect(cy.knows[0].cities.map((it) => it.name)).toEqual(['Oslo', 'Paris', 'Rome']);
        expect(cy.knows[0].latest!.name).toEqual('Paris');
    });

    it('should keep only roots with the required relationships', async () => {
        const careers = await gom.loadAll(Career);
        expect(careers.map((it) => it.person.id).sort()).toEqual(['ava', 'ben']);
        expect(await gom.count(Career)).toBe(2);
        expect(await gom.load(Career, 'cal')).toBeUndefined();
    });

    it('should nest views, and follow a view that holds itself to its maxDepth', async () => {
        const acme = (await gom.load(Team, 'initech'))!;
        expect(acme.members.map((it) => it.person.id).sort()).toEqual(['ava', 'ben']);
        expect(acme.members.find((it) => it.person.id === 'ava')!.city.name).toEqual('Paris');
        const c1 = (await gom.load(Category, 'c1'))!;
        expect(c1.parent!.node.id).toEqual('c2');
        expect(c1.parent!.parent!.node.id).toEqual('c3');
        expect(c1.parent!.parent!.parent).toBeUndefined();
    });

    it('should filter views by SQL over the root row, and delete a view root that meets its requirements', async () => {
        const named = await gom.loadAll(Career, {
            where: "JSON_VALUE(n.props, '$.name') = $name",
            bindings: { name: 'Bob' }
        });
        expect(named.map((it) => it.person.id)).toEqual(['ben']);
        await seed.node(['Person'], { id: 'tmp', name: 'Tmp' });
        expect(await gom.delete(Career, 'tmp')).toBe(0);
        expect(await gom.delete(Person, 'tmp')).toBe(1);
    });
});
