import {
    CypherBackend,
    cypherGrammarFor,
    GraphProperty,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['ReadTest', 'Hero'] })
class Hero {
    @NodeId() id: string;
    name: string;
    @GraphProperty('first_seen') firstSeen?: number;

    shout(): string {
        return this.name.toUpperCase();
    }
}

@GraphView()
class HeroView {
    @Root() hero: Hero;
}

describe.each(graphEngines())('StatelessGraphObjectManager reads on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
        await pm.execute(new QuerySpecification('MATCH (n:ReadTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (:ReadTest:Hero {id: 'h1', name: 'Moon Girl', first_seen: 2015}), " +
                    "(:ReadTest:Hero {id: 'h2', name: 'Devil Dinosaur', first_seen: 1978})"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:ReadTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should load all as instances', async () => {
        const heroes = await gom.loadAll(Hero);
        expect(heroes.map((it) => it.shout()).sort()).toEqual(['DEVIL DINOSAUR', 'MOON GIRL']);
        expect(heroes.every((it) => it instanceof Hero)).toBe(true);
    });

    it('should filter with bound values', async () => {
        const heroes = await gom.loadAll(Hero, 'n.first_seen < $year', { year: 2000 });
        expect(heroes.map((it) => it.name)).toEqual(['Devil Dinosaur']);
    });

    it('should load by id, with renamed fields', async () => {
        const hero = await gom.load(Hero, 'h1');
        expect(hero).toEqual(Object.assign(new Hero(), { id: 'h1', name: 'Moon Girl', firstSeen: 2015 }));
        expect(await gom.load(Hero, 'nobody')).toBeUndefined();
    });

    it('should count', async () => {
        expect(await gom.count(Hero)).toEqual(2);
        expect(await gom.count(Hero, 'n.name = $name', { name: 'Moon Girl' })).toEqual(1);
    });

    it('should say that views are not loaded yet', async () => {
        await expect(gom.loadAll(HeroView)).rejects.toThrow(/@GraphView \(HeroView\) is not supported yet/);
    });
});
