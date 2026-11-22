import {
    CascadeType,
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    Direction,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    PersistenceManager,
    QuerySpecification,
    RelateMode,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { ClassType } from '@/query/QuerySpecification';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['IdTextGraph', 'IdTextNumber'] })
class IdTextNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['IdTextGraph', 'IdTextDate'] })
class IdTextDate {
    @NodeId() id: Date;
    name?: string;
}

@NodeFragment({ labels: ['IdTextGraph', 'IdTextString'] })
class IdTextString {
    @NodeId() id: string;
    name?: string;
}

/** A node of IdTextString's labels whose id is a number: what a string id must not find by the same text. */
@NodeFragment({ labels: ['IdTextGraph', 'IdTextString'] })
class IdTextStringNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['IdTextGraph', 'IdTextTarget'] })
class IdTextTarget {
    @NodeId() id: string;
    name?: string;
}

/** Days, each with the days that are part of it, one level deep: a cascade delete refuses a tree deeper than that. */
@GraphView()
class IdTextDateTree {
    @Root() day: IdTextDate;
    @GraphRelationship({
        type: 'DAY_PART_OF',
        direction: Direction.INCOMING,
        target: () => IdTextDateTree,
        maxDepth: 1
    })
    parts: IdTextDateTree[] = [];
}

const make = <T extends object>(type: new () => T, fields: Partial<T>): T => Object.assign(new type(), fields);
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * A node found by its id's text on a graph engine, as on a SQL store (#838, a port of drivine4j's
 * NodeIdTextGraphCrossEngineTest): a load, a relate, loadRelated, an unrelate, a patch and a delete read the given text as
 * the @NodeId field's type, and bind what a save writes for it. So `'5'` finds the number id 5, and a date's ISO text its
 * Date id; text that is no value of the type finds nothing and throws nothing, and a string id is the text given.
 */
describe.each(graphEngines())("a lookup by an id's text on $type", (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const target = nodeRef(IdTextTarget, 'x');
    // Neo4j and Memgraph don't yet save a property holding a JavaScript Date (#810), so a Date id is found by its text
    // only on FalkorDB until it lands.
    const savesDates = ![DatabaseType.NEO4J, DatabaseType.MEMGRAPH].includes(engine.type);
    const withDates = savesDates ? it : it.skip;

    const clear = async (): Promise<void> => {
        await pm.execute(new QuerySpecification('MATCH (n:IdTextGraph) DETACH DELETE n'));
    };

    /** The names of the nodes of `type`'s labels, in order. */
    const names = async (type: ClassType): Promise<string[]> =>
        ((await gom.loadAll(type)) as any[]).map((it) => it.name).sort();

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await clear();
        await gom.save(make(IdTextTarget, { id: 'x', name: 'the target' }));
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    /**
     * Saves `node`, and finds it by `text` through a relate, a load, loadRelated, an unrelate, a patch and a delete,
     * the relate given its id's value too.
     */
    const lookups = async (type: ClassType, node: any, text: string): Promise<void> => {
        await gom.save(node);
        expect(await gom.edges.relate(nodeRef(type, text), target, 'POINTS_TO')).toBe(true);
        expect(await gom.edges.relate(nodeRef(type, node.id), target, 'POINTS_TO', {}, RelateMode.CREATE)).toBe(true);
        expect((await gom.load(type, text)) as any).toMatchObject({ name: node.name });
        const related = await gom.edges.loadRelated(nodeRef(type, text), 'POINTS_TO', Direction.OUTGOING, IdTextTarget);
        expect(related.map((it) => it.id)).toEqual(['x']);
        expect(await gom.edges.unrelate(nodeRef(type, text), target, 'POINTS_TO')).toEqual(2);
        expect(await gom.patch(type, text, { set: { name: 'renamed' } })).toEqual({
            found: true,
            applied: true,
            changed: true
        });
        expect(((await gom.load(type, node.id)) as any).name).toEqual('renamed');
        expect(await gom.delete(type, text)).toEqual(1);
        expect(await gom.load(type, text)).toBeUndefined();
    };

    it('should find a number id by its text', async () => {
        await lookups(IdTextNumber, make(IdTextNumber, { id: 5, name: 'five' }), '5');
    });

    withDates('should find a Date id by its text, a day and an instant', async () => {
        await lookups(IdTextDate, make(IdTextDate, { id: day('2024-03-04'), name: 'march' }), '2024-03-04');
        await lookups(
            IdTextDate,
            make(IdTextDate, { id: day('2024-03-05'), name: 'march 5' }),
            '2024-03-05T00:00:00.000Z'
        );
    });

    it('should find a UUID id by its text', async () => {
        const uuid = '0b6f7f1e-4c7a-4c11-9a43-2f7d3b6f9a10';
        await lookups(IdTextString, make(IdTextString, { id: uuid, name: 'uuid' }), uuid);
    });

    it('should find a string id by its text', async () => {
        await lookups(IdTextString, make(IdTextString, { id: 't5', name: 'text' }), 't5');
    });

    /**
     * A cascade delete by a Date id's text finds its root as a load does, both in the check that refuses a tree deeper
     * than the view reads and in the delete itself.
     */
    withDates("should check the depth of a cascade delete by a Date id's text, and delete the tree", async () => {
        const isos = ['2026-02-01', '2026-02-02', '2026-02-03'];
        for (const [i, iso] of isos.entries()) {
            await gom.save(make(IdTextDate, { id: day(iso), name: `tree day ${i}` }));
        }
        for (let i = 1; i < isos.length; i++) {
            expect(
                await gom.edges.relate(nodeRef(IdTextDate, isos[i]), nodeRef(IdTextDate, isos[i - 1]), 'DAY_PART_OF')
            ).toBe(true);
        }
        await expect(gom.delete(IdTextDateTree, '2026-02-01', { cascade: CascadeType.DELETE_ALL })).rejects.toThrow(
            '1 node below that would be left behind'
        );
        expect(await names(IdTextDate)).toHaveLength(3);

        expect(await gom.delete(IdTextDate, '2026-02-03')).toEqual(1);
        expect(await gom.delete(IdTextDateTree, '2026-02-01', { cascade: CascadeType.DELETE_ALL })).toEqual(2);
        expect(await names(IdTextDate)).toEqual([]);
    });

    it('should find only the string by text on a string id, not a number of the same text', async () => {
        await gom.save(make(IdTextStringNumber, { id: 6, name: 'number' }));
        await gom.save(make(IdTextString, { id: '6', name: 'string' }));

        expect((await gom.load(IdTextString, '6'))?.name).toEqual('string');
        expect(await gom.delete(IdTextString, '6')).toEqual(1);
        expect((await gom.load(IdTextStringNumber, 6))?.name).toEqual('number');
        expect(await gom.load(IdTextString, '6')).toBeUndefined();
    });

    it('should find nothing for text that is no number on a number id, and throw nothing', async () => {
        await gom.save(make(IdTextNumber, { id: 7, name: 'seven' }));
        const nowhere = nodeRef(IdTextNumber, 'abc');

        expect(await gom.load(IdTextNumber, 'abc')).toBeUndefined();
        expect(await gom.delete(IdTextNumber, 'abc')).toEqual(0);
        expect(await gom.edges.loadRelated(nowhere, 'POINTS_TO', Direction.OUTGOING, IdTextTarget)).toEqual([]);
        expect(await gom.edges.relate(nowhere, target, 'POINTS_TO')).toBe(false);
        expect(await gom.patch(IdTextNumber, 'abc', { set: { name: 'x' } })).toEqual({
            found: false,
            applied: false,
            changed: false
        });
        expect((await gom.load(IdTextNumber, '7'))?.name).toEqual('seven');
    });
});
