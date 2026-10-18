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
        await seed.node(['Person'], { id: 'ada', name: 'Ada' });
        await seed.node(['Person', 'Engineer'], { id: 'bob', name: 'Bob' });
        await seed.node(['Person'], { id: 'cy', name: 'Cy' });
        await seed.node(['Person'], { id: 'dee', name: 'Dee' });
        await seed.node(['Org'], { id: 'acme', name: 'Acme' });
        await seed.node(['Org'], { id: 'globex', name: 'Globex' });
        await seed.node(['City'], { id: 'paris', name: 'Paris' });
        await seed.node(['City'], { id: 'oslo', name: 'Oslo' });
        await seed.node(['Movie'], { id: 'm1', score: 4 });
        await seed.node(['Movie'], { id: 'm2', score: 2 });
        await seed.node(['Movie'], { id: 'm3' });
        await seed.edge('ada', 'WORKS_FOR', 'acme', { role: 'lead', start_year: 2020 });
        await seed.edge('ada', 'WORKS_FOR', 'globex', { role: 'advisor', start_year: 2024 });
        await seed.edge('bob', 'WORKS_FOR', 'acme', { role: 'dev', start_year: 2022 });
        await seed.edge('acme', 'BASED_IN', 'paris');
        await seed.edge('globex', 'BASED_IN', 'oslo');
        await seed.edge('ada', 'LIVES_IN', 'paris');
        await seed.edge('bob', 'LIVES_IN', 'oslo');
        await seed.edge('ada', 'KNOWS', 'bob');
        await seed.edge('cy', 'KNOWS', 'ada');
        await seed.edge('ada', 'MANAGES', 'bob');
        await seed.edge('bob', 'MANAGES', 'cy');
        await seed.edge('cy', 'MANAGES', 'dee');
        await seed.edge('ada', 'RATED', 'm1');
        await seed.edge('ada', 'RATED', 'm2');
        await seed.edge('ada', 'RATED', 'm3');
        await seed.node(['Category'], { id: 'c1' });
        await seed.node(['Category'], { id: 'c2' });
        await seed.node(['Category'], { id: 'c3' });
        await seed.node(['Category'], { id: 'c4' });
        await seed.edge('c1', 'PARENT', 'c2');
        await seed.edge('c2', 'PARENT', 'c3');
        await seed.edge('c3', 'PARENT', 'c4');
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should load a view: relationship fragments, single and undirected relationships', async () => {
        const ada = (await gom.load(Career, 'ada'))!;
        expect(ada).toBeInstanceOf(Career);
        expect(ada.person).toEqual(Object.assign(new Person(), { id: 'ada', name: 'Ada' }));
        expect(ada.city.name).toEqual('Paris');
        const jobs = ada.jobs.map((it) => [it.role, it.startYear, it.org.name]).sort();
        expect(jobs).toEqual([
            ['advisor', 2024, 'Globex'],
            ['lead', 2020, 'Acme']
        ]);
        expect(ada.jobs[0]).toBeInstanceOf(WorkHistory);
        expect(ada.friends.map((it) => it.id).sort()).toEqual(['bob', 'cy']);
        expect(ada.friends.find((it) => it.id === 'bob')).toBeInstanceOf(Engineer);
    });

    it('should read deep fragment lists once each, paths, counts and aggregates', async () => {
        const ada = (await gom.load(Career, 'ada'))!;
        expect(ada.reports.map((it) => it.id).sort()).toEqual(['bob', 'cy']);
        expect(ada.officeCities.map((it) => it.name).sort()).toEqual(['Oslo', 'Paris']);
        expect([ada.ratings, ada.avgScore, ada.totalScore]).toEqual([3, 3, 6]);
        const deeper = (await gom.load(Career, 'ada', { depth: { reports: 3 } }))!;
        expect(deeper.reports.map((it) => it.id).sort()).toEqual(['bob', 'cy', 'dee']);
        const bob = (await gom.load(Career, 'bob'))!;
        expect([bob.ratings, bob.avgScore, bob.totalScore]).toEqual([0, undefined, 0]);
        expect(bob.friends.map((it) => it.id)).toEqual(['ada']);
    });

    it('should keep only roots with the required relationships', async () => {
        const careers = await gom.loadAll(Career);
        expect(careers.map((it) => it.person.id).sort()).toEqual(['ada', 'bob']);
        expect(await gom.count(Career)).toBe(2);
        expect(await gom.load(Career, 'cy')).toBeUndefined();
    });

    it('should nest views, and follow a view that holds itself to its maxDepth', async () => {
        const acme = (await gom.load(Team, 'acme'))!;
        expect(acme.members.map((it) => it.person.id).sort()).toEqual(['ada', 'bob']);
        expect(acme.members.find((it) => it.person.id === 'ada')!.city.name).toEqual('Paris');
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
        expect(named.map((it) => it.person.id)).toEqual(['bob']);
        await seed.node(['Person'], { id: 'tmp', name: 'Tmp' });
        expect(await gom.delete(Career, 'tmp')).toBe(0);
        expect(await gom.delete(Person, 'tmp')).toBe(1);
    });
});
