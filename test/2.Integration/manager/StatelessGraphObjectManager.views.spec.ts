import {
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['ViewTest', 'Person'] })
class Person {
    @NodeId() uuid: string;
    name: string;
}

@NodeFragment({ labels: ['ViewTest', 'Organization'] })
class Organization {
    @NodeId() uuid: string;
    name: string;
}

@NodeFragment({ labels: ['ViewTest', 'City'] })
class City {
    @NodeId() uuid: string;
    name: string;
}

@RelationshipFragment()
class WorkHistory {
    role: string;
    @GraphProperty('start_year') startYear: number;
    @TargetNode() organization: Organization;
}

@GraphView()
class PersonCareer {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    employmentHistory: WorkHistory[];

    @GraphRelationship({ type: 'LIVES_IN', required: true })
    city: City;

    @GraphRelationship({ type: 'KNOWS', direction: Direction.UNDIRECTED, target: () => Person })
    friends: Person[];
}

@GraphView()
class Team {
    @Root() organization: Organization;

    @GraphRelationship({ type: 'WORKS_FOR', direction: Direction.INCOMING, target: () => PersonCareer })
    members: PersonCareer[];
}

@NodeFragment({ labels: ['ViewTest', 'Category'] })
class CategoryNode {
    @NodeId() uuid: string;
}

@GraphView()
class Category {
    @Root() node: CategoryNode;

    @GraphRelationship({ type: 'PARENT', target: () => Category, maxDepth: 2 })
    parent?: Category;

    @GraphRelationship({ type: 'PARENT', direction: Direction.INCOMING, target: () => Category })
    children: Category[];
}

const byName = <T>(key: (it: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

describe.each(graphEngines())('StatelessGraphObjectManager views on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
        await pm.execute(new QuerySpecification('MATCH (n:ViewTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (moon:ViewTest:Person {uuid: 'moon', name: 'Moon Girl'}), " +
                    "(devil:ViewTest:Person {uuid: 'devil', name: 'Devil Dinosaur'}), " +
                    "(lonely:ViewTest:Person {uuid: 'lonely', name: 'Lonely'}), " +
                    "(lab:ViewTest:Organization {uuid: 'lab', name: 'Lab'}), " +
                    "(school:ViewTest:Organization {uuid: 'school', name: 'School'}), " +
                    "(nyc:ViewTest:City {uuid: 'nyc', name: 'New York'}), " +
                    "(moon)-[:WORKS_FOR {role: 'Inventor', start_year: 2015}]->(lab), " +
                    "(moon)-[:WORKS_FOR {role: 'Student', start_year: 2014}]->(school), " +
                    "(devil)-[:WORKS_FOR {role: 'Muscle', start_year: 2015}]->(lab), " +
                    "(moon)-[:LIVES_IN]->(nyc), (lonely)-[:LIVES_IN]->(nyc), " +
                    "(devil)-[:KNOWS]->(moon), " +
                    "(cat:ViewTest:Category {uuid: 'cat'}), (mid:ViewTest:Category {uuid: 'mid'}), " +
                    "(top:ViewTest:Category {uuid: 'top'}), (sky:ViewTest:Category {uuid: 'sky'}), " +
                    '(cat)-[:PARENT]->(mid), (mid)-[:PARENT]->(top), (top)-[:PARENT]->(sky)'
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:ViewTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should load only roots that have their required relationships', async () => {
        const careers = await gom.loadAll(PersonCareer);
        expect(careers.map((it) => it.person.name).sort()).toEqual(['Lonely', 'Moon Girl']);
        expect(await gom.count(PersonCareer)).toEqual(2);
        expect(await gom.load(PersonCareer, 'devil')).toBeUndefined();
    });

    it('should map relationship fragments, single and undirected relationships, as instances', async () => {
        const moon = (await gom.load(PersonCareer, 'moon'))!;
        expect(moon).toBeInstanceOf(PersonCareer);
        expect(moon.person).toEqual(Object.assign(new Person(), { uuid: 'moon', name: 'Moon Girl' }));
        expect(moon.city).toEqual(Object.assign(new City(), { uuid: 'nyc', name: 'New York' }));
        expect(moon.friends.map((it) => it.name)).toEqual(['Devil Dinosaur']);

        const history = moon.employmentHistory.sort(byName((it) => it.role));
        expect(history.every((it) => it instanceof WorkHistory)).toBe(true);
        expect(history.map((it) => [it.role, it.startYear, it.organization.name])).toEqual([
            ['Inventor', 2015, 'Lab'],
            ['Student', 2014, 'School']
        ]);
        expect(history[0].organization).toBeInstanceOf(Organization);
    });

    it('should load empty lists as empty', async () => {
        const lonely = (await gom.load(PersonCareer, 'lonely'))!;
        expect(lonely.employmentHistory).toEqual([]);
        expect(lonely.friends).toEqual([]);
    });

    it('should combine a filter with the requirements', async () => {
        expect(await gom.count(PersonCareer, 'n.name = $name', { name: 'Devil Dinosaur' })).toEqual(0);
        const found = await gom.loadAll(PersonCareer, 'n.name = $name', { name: 'Moon Girl' });
        expect(found.map((it) => it.person.uuid)).toEqual(['moon']);
    });

    it('should nest views, applying the nested view’s requirements', async () => {
        const team = (await gom.load(Team, 'lab'))!;
        expect(team.organization.name).toEqual('Lab');
        // Devil Dinosaur works for the lab, but has no city, so is not a PersonCareer.
        expect(team.members.map((it) => it.person.name)).toEqual(['Moon Girl']);
        expect(team.members[0]).toBeInstanceOf(PersonCareer);
        expect(team.members[0].employmentHistory.map((it) => it.organization.name).sort()).toEqual(['Lab', 'School']);
    });

    it('should follow a view that refers to itself as far as maxDepth', async () => {
        const cat = (await gom.load(Category, 'cat'))!;
        expect(cat.parent!.node.uuid).toEqual('mid');
        expect(cat.parent!.parent!.node.uuid).toEqual('top');
        expect(cat.parent!.parent!.parent).toBeUndefined();
        expect(cat.children).toEqual([]);

        const mid = (await gom.load(Category, 'mid'))!;
        expect(mid.children.map((it) => it.node.uuid)).toEqual(['cat']);
        // maxDepth 1 for children: the child's own children are not followed.
        expect(mid.children[0].children).toEqual([]);
    });
});
