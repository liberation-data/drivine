import {
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    nodeRef,
    PersistenceManager,
    QuerySpecification,
    RelateMode,
    Root,
    StaleObjectException,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['EdgeTest', 'Issue'] })
class Issue {
    @NodeId() id: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['EdgeTest', 'Person'] })
class Person {
    @NodeId() id: string;
    name?: string;
    @NodeStamp() stamp?: string;
}

@GraphView()
class IssueView {
    @Root() issue: Issue;
    @GraphRelationship({ type: 'ASSIGNED_TO', target: () => Person }) assignees: Person[];
}

describe.each(graphEngines())('edges on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const stamp = async (id: string): Promise<string> =>
        pm.getOne<string>(
            new QuerySpecification('MATCH (n:EdgeTest {id: $id}) RETURN n.`__drivine.stamp`').bind({ id })
        );
    const edges = async (): Promise<string[]> =>
        pm.query<string>(
            new QuerySpecification(
                "MATCH (a:EdgeTest)-[r]->(b:EdgeTest) RETURN a.id + '-' + type(r) + '->' + b.id + ':' + coalesce(r.role, '') AS e ORDER BY e"
            )
        );
    const links = (s: string): string => s.split(':')[1];

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:EdgeTest) DETACH DELETE n'));
        await gom.saveAll([
            Object.assign(new Issue(), { id: 'i1' }),
            Object.assign(new Person(), { id: 'ada', name: 'Ada' }),
            Object.assign(new Person(), { id: 'bob' })
        ]);
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:EdgeTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should relate two stored nodes once, marking both ends, and neither when found as it is', async () => {
        const [issueBefore, adaBefore] = [await stamp('i1'), await stamp('ada')];
        expect(
            await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO', { role: 'lead' })
        ).toBe(true);
        expect(await edges()).toEqual(['i1-ASSIGNED_TO->ada:lead']);
        const [issueAfter, adaAfter] = [await stamp('i1'), await stamp('ada')];
        expect(links(issueAfter)).not.toEqual(links(issueBefore));
        expect(links(adaAfter)).not.toEqual(links(adaBefore));

        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO', { role: 'lead' });
        expect(await edges()).toEqual(['i1-ASSIGNED_TO->ada:lead']);
        expect(await stamp('i1')).toEqual(issueAfter);

        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO', { role: 'reviewer' });
        expect(await edges()).toEqual(['i1-ASSIGNED_TO->ada:reviewer']);
        expect(links(await stamp('i1'))).not.toEqual(links(issueAfter));
    });

    it('should make another each time with CREATE', async () => {
        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'MENTIONS', {}, RelateMode.CREATE);
        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'MENTIONS', {}, RelateMode.CREATE);
        expect(await edges()).toEqual(['i1-MENTIONS->ada:', 'i1-MENTIONS->ada:']);
    });

    it('should make nothing when a node is absent, or lacks a label the ref names', async () => {
        expect(await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'nobody'), 'ASSIGNED_TO')).toBe(false);
        expect(await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada', 'Admin'), 'ASSIGNED_TO')).toBe(
            false
        );
        expect(await edges()).toEqual([]);
        expect(await gom.count(Person)).toEqual(2);
    });

    it('should unrelate, and unrelate all of a type in a direction', async () => {
        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO');
        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'bob'), 'ASSIGNED_TO');
        expect(await gom.edges.unrelate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO')).toEqual(1);
        expect(await gom.edges.unrelate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO')).toEqual(0);
        expect(await edges()).toEqual(['i1-ASSIGNED_TO->bob:']);
        expect(await gom.edges.unrelateAll(nodeRef(Person, 'bob'), 'ASSIGNED_TO', Direction.INCOMING)).toEqual(1);
        expect(await edges()).toEqual([]);
        expect(await gom.count(Person)).toEqual(2);
    });

    it('should make a replace of a view loaded before stale', async () => {
        const loaded = (await gom.load(IssueView, 'i1'))!;
        await gom.edges.relate(nodeRef(Issue, 'i1'), nodeRef(Person, 'ada'), 'ASSIGNED_TO');
        await expect(gom.save(loaded, { replace: ['assignees'] })).rejects.toBeInstanceOf(StaleObjectException);
    });
});
