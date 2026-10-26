import {
    CypherBackend,
    cypherGrammarFor,
    GraphRelationship,
    GraphView,
    instanceOf,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

@NodeFragment({ labels: ['PolyTest', 'WebUser'] })
abstract class WebUser {
    @NodeId() id: string;
    displayName?: string;
}

@NodeFragment({ labels: ['Anonymous'] })
class Anonymous extends WebUser {
    sessionId?: string;
}

@NodeFragment({ labels: ['Registered'] })
class Registered extends WebUser {
    email?: string;
}

@NodeFragment({ labels: ['PolyTest', 'Site'] })
class Site {
    @NodeId() id: string;
}

@GraphView()
class SiteVisitors {
    @Root() site: Site;
    @GraphRelationship({ type: 'VISITED_BY', target: () => WebUser }) visitors: WebUser[];
}

@GraphView()
class UserSites {
    @Root(() => WebUser) user: WebUser;
    @GraphRelationship({ type: 'OWNS', target: () => Site }) sites: Site[];
}

@NodeFragment({ labels: ['PolyTest', 'Signal'] })
class Signal {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PolyTest', 'Signal', 'Alarm'] })
class Alarm {
    @NodeId() id: string;
    severity?: number;
}

const anonymous = (id: string, sessionId: string): Anonymous => Object.assign(new Anonymous(), { id, sessionId });
const registered = (id: string, email: string): Registered => Object.assign(new Registered(), { id, email });

describe.each(graphEngines())('polymorphism on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const labels = async (id: string): Promise<string[]> =>
        (
            await pm.getOne<string[]>(
                new QuerySpecification('MATCH (n:PolyTest {id: $id}) RETURN labels(n)').bind({ id })
            )
        ).sort();

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        const registry = new ModelRegistry();
        registry.registerSubtype(Signal, Alarm);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), registry);
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:PolyTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:PolyTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should save a subclass with its own labels and its parent’s, and load the parent as the subclass', async () => {
        await gom.saveAll([anonymous('a1', 's-1'), registered('r1', 'ada@example.com')]);
        expect(await labels('r1')).toEqual(['PolyTest', 'Registered', 'WebUser']);
        const users = await gom.loadAll(WebUser);
        const byId = new Map(users.map((it) => [it.id, it]));
        expect(byId.get('a1')).toBeInstanceOf(Anonymous);
        expect((byId.get('a1') as Anonymous).sessionId).toEqual('s-1');
        expect(byId.get('r1')).toBeInstanceOf(Registered);
        expect((byId.get('r1') as Registered).email).toEqual('ada@example.com');
    });

    it('should filter a load of the parent by subclass', async () => {
        await gom.saveAll([anonymous('a1', 's-1'), registered('r1', 'ada@example.com')]);
        const found = await gom.loadAll(WebUser, instanceOf(Registered));
        expect(found.map((it) => it.id)).toEqual(['r1']);
    });

    it('should save related nodes of subclasses with their own labels, and load them as such', async () => {
        await gom.save(
            Object.assign(new SiteVisitors(), {
                site: Object.assign(new Site(), { id: 'shop' }),
                visitors: [anonymous('a1', 's-1'), registered('r1', 'ada@example.com')]
            })
        );
        expect(await labels('a1')).toEqual(['Anonymous', 'PolyTest', 'WebUser']);
        expect(await labels('r1')).toEqual(['PolyTest', 'Registered', 'WebUser']);
        const visitors = (await gom.load(SiteVisitors, 'shop'))!.visitors.sort((a, b) => a.id.localeCompare(b.id));
        expect(visitors.map((it) => it.constructor)).toEqual([Anonymous, Registered]);
    });

    it('should save and load a view whose root is a subclass', async () => {
        await gom.save(
            Object.assign(new UserSites(), {
                user: registered('r1', 'ada@example.com'),
                sites: [Object.assign(new Site(), { id: 'blog' })]
            })
        );
        expect(await labels('r1')).toEqual(['PolyTest', 'Registered', 'WebUser']);
        const loaded = (await gom.load(UserSites, 'r1'))!;
        expect(loaded.user).toBeInstanceOf(Registered);
        expect(loaded.sites.map((it) => it.id)).toEqual(['blog']);
    });

    it('should load a registered subtype that does not extend the class', async () => {
        await gom.saveAll([
            Object.assign(new Signal(), { id: 's1' }),
            Object.assign(new Alarm(), { id: 'al1', severity: 3 })
        ]);
        const signals = await gom.loadAll(Signal);
        const alarm = signals.find((it) => it.id === 'al1');
        expect(alarm).toBeInstanceOf(Alarm);
        expect((alarm as unknown as Alarm).severity).toEqual(3);
        expect(signals.find((it) => it.id === 's1')).toBeInstanceOf(Signal);
    });
});
