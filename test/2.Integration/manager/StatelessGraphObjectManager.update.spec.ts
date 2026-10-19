import {
    CypherBackend,
    cypherGrammarFor,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['UpdateTest', 'Proposition'] })
class Proposition {
    @NodeId() id: string;
    text?: string | null;
    confidence?: number | null;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['UpdateTest', 'Entity'] })
class Entity {
    @NodeId() id: string;
    name?: string;
}

@GraphView()
class PropositionView {
    @Root() proposition: Proposition;
    @GraphRelationship({ type: 'MENTIONS', target: () => Entity }) mentions: Entity[];
}

const proposition = (fields: Partial<Proposition>): Proposition => Object.assign(new Proposition(), fields);
const entity = (id: string, name?: string): Entity => Object.assign(new Entity(), { id, name });

describe.each(graphEngines())('update and create on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:UpdateTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:UpdateTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    describe('update', () => {
        it('should return undefined when there is no such node', async () => {
            expect(await gom.update(Proposition, 'nobody', (it) => it)).toBeUndefined();
        });

        it('should write what the change altered, and clear what it set to null', async () => {
            await gom.save(proposition({ id: 'p1', text: 'Sky is blue', confidence: 0.5 }));
            const updated = await gom.update(Proposition, 'p1', (it) => {
                it.text = 'Sky is grey';
                it.confidence = null;
            });
            expect(updated).toBeInstanceOf(Proposition);
            const loaded = (await gom.load(Proposition, 'p1'))!;
            expect(loaded.text).toEqual('Sky is grey');
            expect(loaded.confidence).toBeUndefined();
            expect(updated!.stamp).toEqual(loaded.stamp);
        });

        it('should load again and re-apply the change when another writer got there first, keeping both', async () => {
            await gom.save(proposition({ id: 'p1', text: 'Sky is blue', confidence: 0.5 }));
            let calls = 0;
            await gom.update(Proposition, 'p1', async (it) => {
                if (++calls === 1) {
                    await gom.update(Proposition, 'p1', (other) => {
                        other.confidence = 0.9;
                    });
                }
                it.text = 'Sky is grey';
                return it;
            });
            expect(calls).toEqual(2);
            const loaded = (await gom.load(Proposition, 'p1'))!;
            expect([loaded.text, loaded.confidence]).toEqual(['Sky is grey', 0.9]);
        });

        it('should return undefined when the node is deleted meanwhile', async () => {
            await gom.save(proposition({ id: 'p1', text: 'Sky is blue' }));
            const result = await gom.update(Proposition, 'p1', async (it) => {
                await gom.delete(Proposition, 'p1');
                it.text = 'Gone';
            });
            expect(result).toBeUndefined();
            expect(await gom.count(Proposition)).toEqual(0);
        });

        it('should refuse a change of id or class', async () => {
            await gom.save(proposition({ id: 'p1' }));
            await expect(gom.update(Proposition, 'p1', (it) => Object.assign(it, { id: 'p2' }))).rejects.toThrow(
                /can't give it another id/
            );
            await expect(gom.update(Proposition, 'p1', () => entity('p1') as any)).rejects.toThrow(/must leave it one/);
        });

        it('should replace a view’s list that lost an item, and add to one that grew', async () => {
            await gom.save(
                Object.assign(new PropositionView(), {
                    proposition: proposition({ id: 'p1' }),
                    mentions: [entity('e1'), entity('e2')]
                })
            );
            await gom.update(PropositionView, 'p1', (it) => {
                it.mentions = it.mentions.filter((m) => m.id !== 'e1');
            });
            expect((await gom.load(PropositionView, 'p1'))!.mentions.map((it) => it.id)).toEqual(['e2']);
            await gom.update(PropositionView, 'p1', (it) => {
                it.mentions.push(entity('e3'));
            });
            expect((await gom.load(PropositionView, 'p1'))!.mentions.map((it) => it.id).sort()).toEqual(['e2', 'e3']);
        });
    });

    describe('create', () => {
        it('should make the node when it is absent, and hand back its whole stamp', async () => {
            const created = await gom.create(proposition({ id: 'p1', text: 'Sky is blue' }));
            expect(created!.stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
            expect((await gom.load(Proposition, 'p1'))!.text).toEqual('Sky is blue');
        });

        it('should write nothing, and return undefined, when a node has the id', async () => {
            await gom.save(proposition({ id: 'p1', text: 'First' }));
            const stamp = (await gom.load(Proposition, 'p1'))!.stamp;
            expect(await gom.create(proposition({ id: 'p1', text: 'Second' }))).toBeUndefined();
            const loaded = (await gom.load(Proposition, 'p1'))!;
            expect([loaded.text, loaded.stamp]).toEqual(['First', stamp]);
        });

        it('should make a view with its related nodes, or nothing at all', async () => {
            const view = (mentions: Entity[]): PropositionView =>
                Object.assign(new PropositionView(), { proposition: proposition({ id: 'p1' }), mentions });
            expect(await gom.create(view([entity('e1')]))).toBeDefined();
            expect(await gom.create(view([entity('e2')]))).toBeUndefined();
            expect((await gom.load(PropositionView, 'p1'))!.mentions.map((it) => it.id)).toEqual(['e1']);
            expect(await gom.count(Entity)).toEqual(1);
        });

        it('should refuse an object that carries a stamp', async () => {
            const saved = await gom.save(proposition({ id: 'p1' }));
            await expect(gom.create(saved)).rejects.toThrow(/carries a stamp was loaded/);
        });

        it('should merge into what is there with update when create finds it', async () => {
            await gom.save(proposition({ id: 'p1', text: 'Theirs', confidence: 0.4 }));
            const mine = proposition({ id: 'p1', text: 'Mine' });
            const stored =
                (await gom.create(mine)) ??
                (await gom.update(Proposition, 'p1', (it) => {
                    it.text = mine.text;
                }));
            expect([stored!.text, stored!.confidence]).toEqual(['Mine', 0.4]);
        });
    });
});
