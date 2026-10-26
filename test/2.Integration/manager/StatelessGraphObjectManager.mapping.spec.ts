import {
    CypherBackend,
    cypherGrammarFor,
    Default,
    EmptyWhenAbsent,
    GraphRelationship,
    GraphView,
    JsonPacked,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    RelationshipFragment,
    Root,
    SortedBy,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

@NodeFragment({ labels: ['MapTest', 'User'] })
class User {
    @NodeId() id: string;
    name?: string;
    @JsonPacked() preferences?: { key: string; value: number }[];
    @Default() status: string = 'active';
    @EmptyWhenAbsent() roles: string[];
    @EmptyWhenAbsent() settings: Record<string, string>;
}

@NodeFragment({ labels: ['MapTest', 'Team'] })
class Team {
    @NodeId() id: string;
}

@RelationshipFragment()
class Membership {
    @JsonPacked() tags?: string[];
    rank?: number;
    @TargetNode() user: User;
}

@GraphView()
class TeamView {
    @Root() team: Team;
    @SortedBy('name') @GraphRelationship({ type: 'HAS', target: () => User }) byName: User[];
    @SortedBy('name', false) @GraphRelationship({ type: 'HAS', target: () => User }) byNameDesc: User[];
    @SortedBy('user.name') @GraphRelationship({ type: 'MEMBER', target: () => Membership }) memberships: Membership[];
}

const user = (id: string, fields: Partial<User> = {}): User => Object.assign(new User(), { id, ...fields });

describe.each(graphEngines())('field mapping decorators on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const stored = async (id: string): Promise<Record<string, any>> =>
        pm.getOne<Record<string, any>>(
            new QuerySpecification('MATCH (n:MapTest {id: $id}) RETURN properties(n)').bind({ id })
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
        await pm.execute(new QuerySpecification('MATCH (n:MapTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:MapTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should store a @JsonPacked field as JSON text and load it back', async () => {
        const preferences = [
            { key: 'theme', value: 1 },
            { key: 'font', value: 2 }
        ];
        await gom.save(user('u1', { preferences }));
        expect(typeof (await stored('u1')).preferences).toEqual('string');
        expect((await gom.load(User, 'u1'))!.preferences).toEqual(preferences);
        await gom.patch(User, 'u1', { set: { preferences: [{ key: 'x', value: 9 }] } });
        expect((await gom.load(User, 'u1'))!.preferences).toEqual([{ key: 'x', value: 9 }]);
    });

    it('should keep a @Default initializer, and give @EmptyWhenAbsent collections, where the node has nothing', async () => {
        await pm.execute(new QuerySpecification("CREATE (:MapTest:User {id: 'bare'})"));
        const loaded = (await gom.load(User, 'bare'))!;
        expect(loaded.status).toEqual('active');
        expect(loaded.roles).toEqual([]);
        expect(loaded.settings).toEqual({});
    });

    it('should sort a loaded list by @SortedBy, ascending, descending and by a nested path', async () => {
        await gom.save(
            Object.assign(new TeamView(), {
                team: Object.assign(new Team(), { id: 't1' }),
                byName: [user('u1', { name: 'Charlie' }), user('u2', { name: 'Ada' }), user('u3', { name: 'Bob' })],
                byNameDesc: [],
                memberships: [
                    Object.assign(new Membership(), { tags: ['lead'], user: user('u3') }),
                    Object.assign(new Membership(), { tags: ['new', 'remote'], user: user('u2') })
                ]
            })
        );
        const team = (await gom.load(TeamView, 't1'))!;
        expect(team.byName.map((it) => it.name)).toEqual(['Ada', 'Bob', 'Charlie']);
        expect(team.byNameDesc.map((it) => it.name)).toEqual(['Charlie', 'Bob', 'Ada']);
        expect(team.memberships.map((it) => it.user.name)).toEqual(['Ada', 'Bob']);
        expect(team.memberships[0].tags).toEqual(['new', 'remote']);
    });
});
