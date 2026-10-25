import {
    backendFor,
    DatabaseType,
    GraphProperty,
    GraphRelationship,
    GraphView,
    JsonPacked,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    nodeRef,
    NullPolicy,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { rawProps, SqlStore } from '../support/SqlStores';

/**
 * Set fields without `@EmptyWhenAbsent`: one TypeScript records as a Set, as it does for a decorated field, one packed
 * as JSON, and one the class initializes with a Set.
 */
@NodeFragment({ labels: ['PlainSet'] })
class Coded {
    @NodeId() id: string;
    @GraphProperty('code_set') codes: Set<string>;
    @JsonPacked() packed?: Set<string>;
    badges = new Set<string>();
    @NodeStamp() stamp?: string;
}

@RelationshipFragment()
class Coding {
    reasons = new Set<string>();
    @TargetNode() target: Coded;
}

@GraphView()
class CodedView {
    @Root() root: Coded;
    @GraphRelationship({ type: 'PLAIN_SET_CODES', target: () => Coded }) related: Coded[] = [];
}

/** A view holding a view, whose fragments hold Sets, and relationship fragments holding a Set. */
@GraphView()
class CodedHolder {
    @Root() root: Coded;
    @GraphRelationship({ type: 'PLAIN_SET_HOLDS' }) view?: CodedView;
    @GraphRelationship({ type: 'PLAIN_SET_CODING', target: () => Coding }) codings: Coding[] = [];
}

const coded = (id: string, fields: Partial<Coded> = {}): Coded => Object.assign(new Coded(), { id, ...fields });

/** A Set field loads the list the store holds as a Set, in a fragment, in a view and in a relationship fragment. */
describe.each(allStores())('Set fields on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    const stored = async (id: string): Promise<Record<string, any>> => {
        const sql = engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES;
        const rows = await pm.query<any>(
            new QuerySpecification(
                sql ? rawProps(engine as SqlStore, 'PlainSet') : 'MATCH (n:PlainSet) RETURN properties(n)'
            )
        );
        const all = rows
            .map((row) => (sql ? row.props ?? row : row))
            .map((props) => (typeof props === 'string' ? JSON.parse(props) : props));
        return all.find((it) => it.id === id);
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, engine, 'PlainSet');
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'PlainSet');
        await closeGraphEngines();
    });

    it('should store a Set as a list, load it back as a Set, and save the loaded Set back as a list', async () => {
        await gom.save(coded('c1', { codes: new Set(['x', 'y']), packed: new Set(['p']), badges: new Set(['gold']) }));
        const props = await stored('c1');
        expect([...props.code_set].sort()).toEqual(['x', 'y']);
        expect(JSON.parse(props.packed)).toEqual(['p']);
        expect(props.badges).toEqual(['gold']);

        const loaded = (await gom.load(Coded, 'c1'))!;
        expect(loaded.codes).toBeInstanceOf(Set);
        expect(loaded.codes.has('x')).toBe(true);
        expect(loaded.codes).toEqual(new Set(['x', 'y']));
        expect(loaded.packed).toEqual(new Set(['p']));
        expect(loaded.badges).toEqual(new Set(['gold']));

        await gom.save(coded('c1', { ...loaded, codes: new Set([...loaded.codes, 'z']) }), { from: loaded });
        expect([...(await stored('c1')).code_set].sort()).toEqual(['x', 'y', 'z']);
        const again = (await gom.load(Coded, 'c1'))!;
        expect(again.codes).toEqual(new Set(['x', 'y', 'z']));
        expect(again.badges).toEqual(new Set(['gold']));
    });

    it('should leave a Set the node holds nothing for absent, and load an empty one as an empty Set', async () => {
        await gom.save(coded('c2'));
        // badges, initialized with an empty Set, is saved as [].
        expect((await stored('c2')).badges).toEqual([]);
        const loaded = (await gom.load(Coded, 'c2'))!;
        expect(loaded.codes).toBeUndefined();
        expect(loaded.packed).toBeUndefined();
        expect(loaded.badges).toEqual(new Set());
    });

    it('should save a Set loaded from a list holding an item twice from the loaded copy', async () => {
        if (engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES) {
            return;
        }
        await gom.save(coded('d1', { codes: new Set(['a']) }));
        // Another writer stored the list with an item twice, leaving the stamp as it was.
        await pm.execute(new QuerySpecification(`MATCH (n:PlainSet {id: 'd1'}) SET n.code_set = ['a', 'a', 'b']`));
        const loaded = (await gom.load(Coded, 'd1'))!;
        expect(loaded.codes).toEqual(new Set(['a', 'b']));

        await gom.save(coded('d1', { ...loaded, badges: new Set(['new']) }), { from: loaded });
        expect((await gom.load(Coded, 'd1'))!.badges).toEqual(new Set(['new']));
    });

    it('should update a Set loaded from a list out of order and holding an item twice, changed in place', async () => {
        await gom.save(coded('d2', { codes: new Set(['a']) }));
        if (engine.type !== DatabaseType.ORACLE && engine.type !== DatabaseType.POSTGRES) {
            // Another writer stored the list out of order with an item twice, leaving the stamp as it was.
            await pm.execute(new QuerySpecification(`MATCH (n:PlainSet {id: 'd2'}) SET n.code_set = ['b', 'a', 'b']`));
        }
        await gom.update(Coded, 'd2', (it) => {
            it.codes.add('c');
        });
        expect((await gom.load(Coded, 'd2'))!.codes.has('c')).toBe(true);
        // The Set unchanged, and another field changed.
        await gom.update(Coded, 'd2', (it) => {
            it.badges.add('new');
        });
        expect((await gom.load(Coded, 'd2'))!.badges).toEqual(new Set(['new']));
    });

    it('should patch a Set as the list of its items, packed or not, and load it back as a Set', async () => {
        await gom.save(coded('p1', { codes: new Set(['old']) }));
        await gom.patch(Coded, 'p1', {
            set: { codes: new Set(['x', 'y']), packed: new Set(['p', 'q']), badges: new Set(['gold']) }
        });
        const props = await stored('p1');
        expect([...props.code_set].sort()).toEqual(['x', 'y']);
        expect(JSON.parse(props.packed)).toEqual(['p', 'q']);
        expect(props.badges).toEqual(['gold']);
        const loaded = (await gom.load(Coded, 'p1'))!;
        expect(loaded.codes).toEqual(new Set(['x', 'y']));
        expect(loaded.packed).toEqual(new Set(['p', 'q']));
        expect(loaded.badges).toEqual(new Set(['gold']));

        // A loaded Set handed back, with an item added, and an empty one.
        await gom.patch(Coded, 'p1', { set: { packed: new Set([...loaded.packed!, 'r']), badges: new Set() } });
        expect(JSON.parse((await stored('p1')).packed)).toEqual(['p', 'q', 'r']);
        expect((await stored('p1')).badges).toEqual([]);
        const again = (await gom.load(Coded, 'p1'))!;
        expect(again.packed).toEqual(new Set(['p', 'q', 'r']));
        expect(again.badges).toEqual(new Set());
    });

    it('should patchAll Sets as the lists of their items, packed or not, and load them back as Sets', async () => {
        await gom.saveAll([coded('a1'), coded('a2')]);
        const patched = [
            coded('a1', { codes: new Set(['x']), packed: new Set(['p']), badges: new Set(['gold']) }),
            coded('a2', { codes: new Set(['y', 'z']), packed: new Set(['q', 'r']), badges: new Set() })
        ];
        await gom.patchAll(patched, { only: ['codes', 'packed', 'badges'], nullPolicy: NullPolicy.CLEAR });
        const first = await stored('a1');
        expect(first.code_set).toEqual(['x']);
        expect(JSON.parse(first.packed)).toEqual(['p']);
        expect(first.badges).toEqual(['gold']);
        const second = await stored('a2');
        expect([...second.code_set].sort()).toEqual(['y', 'z']);
        expect(JSON.parse(second.packed)).toEqual(['q', 'r']);
        expect(second.badges).toEqual([]);
        const loaded = (await gom.load(Coded, 'a2'))!;
        expect(loaded.codes).toEqual(new Set(['y', 'z']));
        expect(loaded.packed).toEqual(new Set(['q', 'r']));
        expect(loaded.badges).toEqual(new Set());
    });

    it('should relate with a Set property as the list of its items, and load it in a relationship fragment', async () => {
        await gom.saveAll([coded('root'), coded('target')]);
        expect(
            await gom.edges.relate(nodeRef(Coded, 'root'), nodeRef(Coded, 'target'), 'PLAIN_SET_CODING', {
                reasons: new Set(['because', 'why'])
            })
        ).toBe(true);
        const loaded = (await gom.load(CodedHolder, 'root'))!;
        expect(loaded.codings[0].reasons).toEqual(new Set(['because', 'why']));
    });

    it('should load a Set in a view that holds a view, and in a relationship fragment', async () => {
        const holder = Object.assign(new CodedHolder(), {
            root: coded('root', { codes: new Set(['r']) }),
            view: Object.assign(new CodedView(), {
                root: coded('nested', { codes: new Set(['n']) }),
                related: [coded('related', { codes: new Set(['e']) })]
            }),
            codings: [
                Object.assign(new Coding(), {
                    reasons: new Set(['because']),
                    target: coded('target', { codes: new Set(['t']) })
                })
            ]
        });
        await gom.save(holder);

        const loaded = (await gom.load(CodedHolder, 'root'))!;
        expect(loaded.root.codes).toEqual(new Set(['r']));
        expect(loaded.view!.root.codes).toBeInstanceOf(Set);
        expect(loaded.view!.root.codes.has('n')).toBe(true);
        expect(loaded.view!.related[0].codes).toEqual(new Set(['e']));
        expect(loaded.codings[0].reasons).toEqual(new Set(['because']));
        expect(loaded.codings[0].target.codes).toEqual(new Set(['t']));
    });
});
