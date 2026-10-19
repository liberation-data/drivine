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
    RemovedTargets,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['SaveTest', 'Person'] })
class Person {
    @NodeId() uuid: string;
    name?: string;
    @GraphProperty('biography') bio?: string;
}

@NodeFragment({ labels: ['SaveTest', 'Organization'] })
class Organization {
    @NodeId() uuid: string;
    name?: string;
}

@NodeFragment({ labels: ['SaveTest', 'Tag'] })
class Tag {
    @NodeId() uuid: string;
}

@RelationshipFragment()
class WorkHistory {
    role: string;
    @TargetNode() organization: Organization;
}

@GraphView()
class PersonCareer {
    @Root() person: Person;
    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory }) employmentHistory: WorkHistory[];
    @GraphRelationship({ type: 'MENTORED_BY' }) mentor?: Person;
    @GraphRelationship({ type: 'KNOWS', direction: Direction.UNDIRECTED, target: () => Person }) friends: Person[];
    @GraphRelationship({ type: 'TAGGED', target: () => Tag }) tags: Tag[];
    @GraphRelationship({ type: 'ARCHIVED', target: () => Tag }) archived: Tag[];
}

@GraphView()
class Team {
    @Root() organization: Organization;
    @GraphRelationship({ type: 'WORKS_FOR', direction: Direction.INCOMING, target: () => PersonCareer })
    members: PersonCareer[];
}

const person = (uuid: string, name?: string): Person => Object.assign(new Person(), { uuid, name });
const org = (uuid: string, name?: string): Organization => Object.assign(new Organization(), { uuid, name });
const tag = (uuid: string): Tag => Object.assign(new Tag(), { uuid });
const job = (role: string, organization: Organization): WorkHistory =>
    Object.assign(new WorkHistory(), { role, organization });
const career = (fields: Partial<PersonCareer>): PersonCareer =>
    Object.assign(new PersonCareer(), { employmentHistory: [], friends: [], tags: [], archived: [], ...fields });

describe.each(graphEngines())('StatelessGraphObjectManager saves on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const edges = async (): Promise<string[]> =>
        pm.query<string>(
            new QuerySpecification(
                "MATCH (a:SaveTest)-[r]->(b:SaveTest) RETURN a.uuid + '-' + type(r) + '->' + b.uuid AS e ORDER BY e"
            )
        );
    const nodes = async (): Promise<string[]> =>
        pm.query<string>(new QuerySpecification('MATCH (n:SaveTest) RETURN n.uuid AS id ORDER BY id'));

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:SaveTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:SaveTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should save a fragment, and leave a property alone where the object holds null', async () => {
        const saved = await gom.save(Object.assign(person('moon', 'Moon Girl'), { bio: 'Genius' }));
        expect(saved).toBeInstanceOf(Person);
        expect(await gom.load(Person, 'moon')).toEqual(Object.assign(person('moon', 'Moon Girl'), { bio: 'Genius' }));
        expect(await pm.getOne(new QuerySpecification("MATCH (n:SaveTest {uuid: 'moon'}) RETURN n.biography"))).toEqual(
            'Genius'
        );

        await gom.save(person('moon', 'Lunella'));
        expect(await gom.load(Person, 'moon')).toEqual(Object.assign(person('moon', 'Lunella'), { bio: 'Genius' }));
    });

    it('should save a view: root, relationship fragments, single and undirected relationships', async () => {
        await pm.execute(new QuerySpecification("CREATE (:SaveTest:Person {uuid: 'devil'})-[:KNOWS]->(:SaveTest:Person {uuid: 'moon'})"));
        await gom.save(
            career({
                person: person('moon', 'Moon Girl'),
                employmentHistory: [job('Inventor', org('lab', 'Lab')), job('Student', org('school'))],
                mentor: person('ms', 'Ms Marvel'),
                friends: [person('devil'), person('kamala')]
            })
        );
        expect(await edges()).toEqual([
            'devil-KNOWS->moon',
            'moon-KNOWS->kamala',
            'moon-MENTORED_BY->ms',
            'moon-WORKS_FOR->lab',
            'moon-WORKS_FOR->school'
        ]);
        const loaded = (await gom.load(PersonCareer, 'moon'))!;
        expect(loaded.employmentHistory.map((it) => [it.role, it.organization.name]).sort()).toEqual([
            ['Inventor', 'Lab'],
            ['Student', undefined]
        ]);
        expect(loaded.mentor!.name).toEqual('Ms Marvel');
    });

    it('should change nothing when saved twice', async () => {
        const view = career({ person: person('moon'), employmentHistory: [job('Inventor', org('lab'))], tags: [tag('t1')] });
        await gom.save(view);
        const before = await edges();
        await gom.save(view);
        expect(await edges()).toEqual(before);
        expect(await nodes()).toEqual(['lab', 'moon', 't1']);
    });

    it('should save a nested view, with its own relationships', async () => {
        await gom.save(
            Object.assign(new Team(), {
                organization: org('lab', 'Lab'),
                members: [career({ person: person('moon'), tags: [tag('t1')], employmentHistory: [job('Lead', org('lab'))] })]
            })
        );
        expect(await edges()).toEqual(['moon-TAGGED->t1', 'moon-WORKS_FOR->lab']);
        const team = (await gom.load(Team, 'lab'))!;
        expect(team.members.map((it) => it.person.uuid)).toEqual(['moon']);
    });

    it('should only add, unless a field is replaced', async () => {
        await gom.save(career({ person: person('moon'), tags: [tag('t1'), tag('t2')] }));
        await gom.save(career({ person: person('moon'), tags: [tag('t3')] }));
        expect(await edges()).toEqual(['moon-TAGGED->t1', 'moon-TAGGED->t2', 'moon-TAGGED->t3']);

        await gom.save(career({ person: person('moon'), tags: [tag('t3')] }), { replace: ['tags'] });
        expect(await edges()).toEqual(['moon-TAGGED->t3']);
        expect(await nodes()).toEqual(['moon', 't1', 't2', 't3']);
    });

    it('should delete removed targets that nothing else refers to, with DELETE_UNREFERENCED', async () => {
        await pm.execute(
            new QuerySpecification(
                "CREATE (m:SaveTest:Person {uuid: 'moon'}), (m)-[:TAGGED]->(:SaveTest:Tag {uuid: 'gone'}), " +
                    "(m)-[:TAGGED]->(shared:SaveTest:Tag {uuid: 'shared'}), (:SaveTest:Person {uuid: 'other'})-[:TAGGED]->(shared), " +
                    "(m)-[:TAGGED]->(:SaveTest:Tag {uuid: 'moved'})"
            )
        );
        // 'moved' leaves tags for archived: the object still holds it, so it stays.
        await gom.save(career({ person: person('moon'), tags: [], archived: [tag('moved')] }), {
            replace: ['tags'],
            removedTargets: RemovedTargets.DELETE_UNREFERENCED
        });
        expect(await nodes()).toEqual(['moon', 'moved', 'other', 'shared']);
        expect(await edges()).toEqual(['moon-ARCHIVED->moved', 'other-TAGGED->shared']);
    });

    it('should remove a single relationship that is replaced with nothing', async () => {
        await gom.save(career({ person: person('moon'), mentor: person('ms') }));
        await gom.save(career({ person: person('moon'), mentor: undefined }), { replace: ['mentor'] });
        expect(await edges()).toEqual([]);
        expect(await nodes()).toEqual(['moon', 'ms']);
    });

    it('should round-trip: load, change, save with replace, load', async () => {
        await gom.save(career({ person: person('moon', 'Moon Girl'), tags: [tag('t1'), tag('t2')] }));
        const loaded = (await gom.load(PersonCareer, 'moon'))!;
        loaded.person.name = 'Lunella';
        loaded.tags = loaded.tags.filter((it) => it.uuid !== 't1');
        await gom.save(loaded, { replace: ['tags'] });
        const again = (await gom.load(PersonCareer, 'moon'))!;
        expect(again.person.name).toEqual('Lunella');
        expect(again.tags.map((it) => it.uuid)).toEqual(['t2']);
    });
});
