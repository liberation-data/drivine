import {
    ClassRef,
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    PersistenceManager,
    PropertyBag,
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

@NodeFragment({ labels: ['UpdateTest', 'Finding'] })
class Finding {
    @NodeId() id: string;
    sources: string[] = [];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['UpdateTest', 'Tagged'] })
class Tagged {
    @NodeId() id: string;
    text?: string;
    @PropertyBag() meta: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

/** A flat bag and an open set of labels beside a stamp. */
@NodeFragment({ labels: ['UpdateTest', 'Sticker'] })
class Sticker {
    @NodeId() id: string;
    @NodeLabels() labels: string[] = [];
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

enum Shade {
    RED = 'Red',
    GREEN = 'Green',
    BLUE = 'Blue'
}

/** A closed set of labels: the field speaks for the Shade labels and no other. */
@NodeFragment({ labels: ['UpdateTest', 'Swatch'] })
class Swatch {
    @NodeId() id: string;
    @NodeLabels(Shade) shades: Set<string> = new Set();
    @NodeStamp() stamp?: string;
}

/** A field the store holds as a temporal value, which a load hands over as a Date. */
@NodeFragment({ labels: ['UpdateTest', 'Dated'] })
class Dated {
    @NodeId() id: string;
    text?: string;
    seen?: Date;
    @NodeStamp() stamp?: string;
}

const proposition = (fields: Partial<Proposition>): Proposition => Object.assign(new Proposition(), fields);
const entity = (id: string, name?: string): Entity => Object.assign(new Entity(), { id, name });
const make = <T extends object>(type: new () => T, fields: Partial<T>): T => Object.assign(new type(), fields);

describe.each(graphEngines())('update and create on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
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

        it("should keep every writer's change when many writers update one node at once", async () => {
            // A load that runs while another writer commits can be handed that writer's stamp with the data from
            // before its write, on an engine that reads without a snapshot. An update of what it loaded then passes
            // the stamp's check and writes over the other writer's change.
            const [writers, each] = [8, 50];
            await gom.save(make(Finding, { id: 'f1' }));
            await Promise.all(
                Array.from({ length: writers }, async (_, writer) => {
                    for (let k = 0; k < each; k++) {
                        await gom.update(Finding, 'f1', (it) => void it.sources.push(`w${writer}-${k}`), 500);
                    }
                })
            );
            const kept = new Set((await gom.load(Finding, 'f1'))!.sources);
            const lost = Array.from(
                { length: writers * each },
                (_, i) => `w${Math.floor(i / each)}-${i % each}`
            ).filter((it) => !kept.has(it));
            expect(lost).toEqual([]);
        }, 300_000);

        /**
         * Runs an update whose first load is overtaken by `unmarked`, Cypher that changes the node and leaves its stamp
         * alone: the node as a load sees it when it is handed another writer's stamp with the data from before that
         * writer's write. Gives how many times the change was applied.
         */
        const appliedAfterUnmarked = async <T extends object>(
            type: ClassRef<T>,
            id: string,
            unmarked: string,
            change: (loaded: T) => void
        ): Promise<number> => {
            let applied = 0;
            const updated = await gom.update(type, id, async (loaded) => {
                if (applied++ === 0) {
                    await pm.execute(new QuerySpecification(unmarked));
                }
                change(loaded);
            });
            expect(updated).toBeDefined();
            return applied;
        };

        // Neo4j reads without a snapshot: there an update compares the root's fields as loaded, not only the stamp.
        const readsWithoutSnapshot = engine.type === DatabaseType.NEO4J ? it : it.skip;

        readsWithoutSnapshot(
            'should load again when a field differs from what it loaded under the same stamp',
            async () => {
                await gom.save(make(Finding, { id: 'f1', sources: ['first'] }));

                const applied = await appliedAfterUnmarked(
                    Finding,
                    'f1',
                    "MATCH (n:Finding {id: 'f1'}) SET n.sources = n.sources + 'theirs'",
                    (it) => void it.sources.push('mine')
                );

                expect(applied).toEqual(2);
                expect((await gom.load(Finding, 'f1'))!.sources.sort()).toEqual(['first', 'mine', 'theirs']);
            }
        );

        readsWithoutSnapshot(
            'should load again when a bag entry differs from what it loaded under the same stamp',
            async () => {
                await gom.save(make(Tagged, { id: 't1', text: 'one', meta: { owner: 'first' } }));

                const applied = await appliedAfterUnmarked(
                    Tagged,
                    't1',
                    "MATCH (n:Tagged {id: 't1'}) SET n.`meta.owner` = 'theirs'",
                    (it) => void (it.meta.mine = 'yes')
                );

                expect(applied).toEqual(2);
                expect((await gom.load(Tagged, 't1'))!.meta).toEqual({ owner: 'theirs', mine: 'yes' });
            }
        );

        readsWithoutSnapshot(
            'should load again when a bag gained an entry under the same stamp, and not for a property outside it',
            async () => {
                await gom.save(make(Tagged, { id: 't1', text: 'one', meta: { owner: 'first' } }));

                const gained = "MATCH (n:Tagged {id: 't1'}) SET n.`meta.extra` = 'theirs'";
                const outside = "MATCH (n:Tagged {id: 't1'}) SET n.unrelated = 'theirs'";
                expect(await appliedAfterUnmarked(Tagged, 't1', gained, (it) => void (it.text = 'two'))).toEqual(2);
                expect(await appliedAfterUnmarked(Tagged, 't1', outside, (it) => void (it.text = 'three'))).toEqual(1);
                expect((await gom.load(Tagged, 't1'))!.meta).toEqual({ owner: 'first', extra: 'theirs' });
            }
        );

        readsWithoutSnapshot(
            'should load again when a flat bag or an open set of labels differs under the same stamp',
            async () => {
                await gom.save(make(Sticker, { id: 's1', labels: ['Shiny'], extras: { size: 1 } }));

                const coloured = "MATCH (n:Sticker {id: 's1'}) SET n.colour = 'red'";
                const sneaked = "MATCH (n:Sticker {id: 's1'}) SET n:Sneaked";
                expect(await appliedAfterUnmarked(Sticker, 's1', coloured, (it) => void (it.extras.size = 2))).toEqual(
                    2
                );
                expect(await appliedAfterUnmarked(Sticker, 's1', sneaked, (it) => void (it.extras.size = 3))).toEqual(
                    2
                );

                const sticker = (await gom.load(Sticker, 's1'))!;
                expect(sticker.extras).toEqual({ size: 3, colour: 'red' });
                expect(sticker.labels).toContain('Sneaked');
            }
        );

        readsWithoutSnapshot(
            'should load again when a closed set of labels differs under the same stamp, and not for a label outside it',
            async () => {
                await gom.save(make(Swatch, { id: 'w1', shades: new Set([Shade.BLUE]) }));

                const red = "MATCH (n:Swatch {id: 'w1'}) SET n:Red";
                const unrelated = "MATCH (n:Swatch {id: 'w1'}) SET n:Unrelated";
                expect(await appliedAfterUnmarked(Swatch, 'w1', red, (it) => void it.shades.add(Shade.GREEN))).toEqual(
                    2
                );
                expect(
                    await appliedAfterUnmarked(Swatch, 'w1', unrelated, (it) => void it.shades.delete(Shade.BLUE))
                ).toEqual(1);

                // The label another writer added is kept.
                expect([...(await gom.load(Swatch, 'w1'))!.shades].sort()).toEqual(['Green', 'Red']);
            }
        );

        readsWithoutSnapshot('should update a node holding a temporal value it does not change', async () => {
            await gom.save(make(Dated, { id: 'd1', text: 'one' }));
            await pm.execute(new QuerySpecification("MATCH (n:Dated {id: 'd1'}) SET n.seen = datetime()"));

            expect((await gom.load(Dated, 'd1'))!.seen).toBeInstanceOf(Date);
            await gom.update(Dated, 'd1', (it) => void (it.text = 'two'), 1);

            expect((await gom.load(Dated, 'd1'))!.text).toEqual('two');

            await gom.save(make(Tagged, { id: 't1', text: 'one' }));
            await pm.execute(new QuerySpecification("MATCH (n:Tagged {id: 't1'}) SET n.`meta.seen` = datetime()"));
            await gom.update(Tagged, 't1', (it) => void (it.text = 'two'), 1);
            expect((await gom.load(Tagged, 't1'))!.text).toEqual('two');
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
