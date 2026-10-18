import {
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    nodeRef,
    NullPolicy,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

enum Role {
    Admin = 'Admin',
    Reviewer = 'Reviewer'
}

@NodeFragment({ labels: ['LabelTest', 'Person'] })
class Person {
    @NodeId() id: string;
    @NodeLabels(Role) roles: Set<Role> = new Set();
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['LabelTest', 'Thing'] })
class Thing {
    @NodeId() id: string;
    @NodeLabels() tags: string[] = [];
}

@GraphView()
class PersonThings {
    @Root() person: Person;
    @GraphRelationship({ type: 'OWNS', target: () => Thing }) things: Thing[];
}

const person = (id: string, ...roles: Role[]): Person => Object.assign(new Person(), { id, roles: new Set(roles) });
const thing = (id: string, ...tags: string[]): Thing => Object.assign(new Thing(), { id, tags });

describe.each(graphEngines())('@NodeLabels on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const labels = async (id: string): Promise<string[]> =>
        (
            await pm.getOne<string[]>(
                new QuerySpecification('MATCH (n:LabelTest {id: $id}) RETURN labels(n)').bind({ id })
            )
        ).sort();
    const stamp = async (id: string): Promise<string> =>
        pm.getOne<string>(
            new QuerySpecification('MATCH (n:LabelTest {id: $id}) RETURN n.`__drivine.stamp`').bind({ id })
        );

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:LabelTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:LabelTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should write a closed set as labels, keep them by default, and remove them under CLEAR', async () => {
        await gom.save(person('ada', Role.Admin, Role.Reviewer));
        expect(await labels('ada')).toEqual(['Admin', 'LabelTest', 'Person', 'Reviewer']);
        expect((await gom.load(Person, 'ada'))!.roles).toEqual(new Set(['Admin', 'Reviewer']));

        await gom.save(person('ada', Role.Admin));
        expect(await labels('ada')).toContain('Reviewer');
        await gom.save(person('ada', Role.Admin), { nullPolicy: NullPolicy.CLEAR });
        expect(await labels('ada')).toEqual(['Admin', 'LabelTest', 'Person']);
    });

    it('should read only a closed set’s members, and refuse a value outside it', async () => {
        await pm.execute(new QuerySpecification("CREATE (:LabelTest:Person:Admin:Legacy {id: 'bob'})"));
        expect((await gom.load(Person, 'bob'))!.roles).toEqual(new Set(['Admin']));
        await expect(gom.save(Object.assign(new Person(), { id: 'bob', roles: new Set(['Owner']) }))).rejects.toThrow(
            /holds Owner, which its labels don't include/
        );
    });

    it('should replace the data token only when the labels change', async () => {
        await gom.save(person('ada', Role.Admin));
        const before = await stamp('ada');
        await gom.save(person('ada', Role.Admin));
        expect(await stamp('ada')).toEqual(before);
        await gom.save(person('ada', Role.Admin, Role.Reviewer));
        expect((await stamp('ada')).split(':')[0]).not.toEqual(before.split(':')[0]);
    });

    it('should read every other label into an open set, and under CLEAR remove only those it wrote', async () => {
        await gom.save(thing('lyre', 'Featured'));
        await pm.execute(new QuerySpecification("MATCH (n:LabelTest {id: 'lyre'}) SET n:Legacy"));
        expect((await gom.load(Thing, 'lyre'))!.tags.sort()).toEqual(['Featured', 'Legacy']);
        await gom.save(thing('lyre'), { nullPolicy: NullPolicy.CLEAR });
        expect(await labels('lyre')).toEqual(['LabelTest', 'Legacy', 'Thing']);
    });

    it('should add the labels of related nodes, and load related nodes by a runtime type', async () => {
        await gom.save(
            Object.assign(new PersonThings(), { person: person('ada'), things: [thing('lyre', 'Antique')] })
        );
        expect(await labels('lyre')).toEqual(['Antique', 'LabelTest', 'Thing']);
        const owned = await gom.edges.loadRelated(nodeRef(Person, 'ada'), 'OWNS', Direction.OUTGOING, Thing);
        expect(owned.map((it) => [it.id, it.tags])).toEqual([['lyre', ['Antique']]]);
    });

    it('should refuse to patch a labels field', async () => {
        await gom.save(person('ada'));
        await expect(gom.patch(Person, 'ada', { set: { roles: ['Admin'] } })).rejects.toThrow(/can't write roles/);
    });
});
