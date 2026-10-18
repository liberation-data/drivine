import {
    CypherBackend,
    cypherGrammarFor,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    NullPolicy,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['NullTest', 'Chunk'] })
class Chunk {
    @NodeId() id: string;
    text?: string | null;
    summary?: string | null;
    @GraphProperty('embedding_v') embedding?: number[] | null;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['NullTest', 'Doc'] })
class Doc {
    @NodeId() id: string;
    title?: string | null;
}

@GraphView()
class DocChunks {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'HAS', target: () => Chunk }) chunks: Chunk[];
}

const chunk = (fields: Partial<Chunk>): Chunk => Object.assign(new Chunk(), fields);

describe.each(graphEngines())('NullPolicy, only and except on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const props = async (id: string): Promise<Record<string, any>> =>
        pm.getOne<Record<string, any>>(
            new QuerySpecification('MATCH (n:NullTest {id: $id}) RETURN properties(n)').bind({ id })
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
        await pm.execute(new QuerySpecification('MATCH (n:NullTest) DETACH DELETE n'));
        await gom.save(chunk({ id: 'c1', text: 'Hello', summary: 'Greeting', embedding: [0.1, 0.2] }));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:NullTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should leave a stored property where the object holds null, by default', async () => {
        await gom.save(chunk({ id: 'c1', text: 'Hi', summary: null, embedding: undefined }));
        expect(await props('c1')).toEqual(
            expect.objectContaining({ text: 'Hi', summary: 'Greeting', embedding_v: [0.1, 0.2] })
        );
    });

    it('should clear it under CLEAR, under its graph name', async () => {
        await gom.save(chunk({ id: 'c1', text: 'Hi', summary: null, embedding: undefined }), {
            nullPolicy: NullPolicy.CLEAR
        });
        const stored = await props('c1');
        expect(stored.text).toEqual('Hi');
        expect(Object.keys(stored)).not.toContain('summary');
        expect(Object.keys(stored)).not.toContain('embedding_v');
    });

    it('should not replace the data token when clearing changes nothing', async () => {
        await gom.save(chunk({ id: 'c1', text: 'Hello', summary: null }), { nullPolicy: NullPolicy.CLEAR });
        const before = (await props('c1'))['__drivine.stamp'];
        await gom.save(chunk({ id: 'c1', text: 'Hello', summary: null }), { nullPolicy: NullPolicy.CLEAR });
        expect((await props('c1'))['__drivine.stamp']).toEqual(before);
    });

    it('should write only the fields named in only', async () => {
        await gom.save(chunk({ id: 'c1', text: 'Changed', summary: 'Changed', embedding: null }), {
            only: ['summary', 'embedding'],
            nullPolicy: NullPolicy.CLEAR
        });
        const stored = await props('c1');
        expect(stored.text).toEqual('Hello');
        expect(stored.summary).toEqual('Changed');
        expect(Object.keys(stored)).not.toContain('embedding_v');
    });

    it('should write every field but those named in except', async () => {
        await gom.save(chunk({ id: 'c1', text: 'Changed', summary: 'Changed', embedding: null }), {
            except: ['embedding'],
            nullPolicy: NullPolicy.CLEAR
        });
        expect(await props('c1')).toEqual(
            expect.objectContaining({ text: 'Changed', summary: 'Changed', embedding_v: [0.1, 0.2] })
        );
    });

    it('should refuse both only and except, and the id or stamp in only', async () => {
        await expect(gom.save(chunk({ id: 'c1' }), { only: ['text'], except: ['summary'] })).rejects.toThrow(
            /not both/
        );
        await expect(gom.save(chunk({ id: 'c1' }), { only: ['id'] })).rejects.toThrow(/only names id/);
    });

    it('should apply the policy to a view’s root, and write related nodes as under IGNORE', async () => {
        await gom.save(
            Object.assign(new DocChunks(), { doc: Object.assign(new Doc(), { id: 'd1', title: 'Old' }), chunks: [] })
        );
        await gom.save(
            Object.assign(new DocChunks(), {
                doc: Object.assign(new Doc(), { id: 'd1', title: null }),
                chunks: [chunk({ id: 'c1', summary: null })]
            }),
            { nullPolicy: NullPolicy.CLEAR }
        );
        expect(Object.keys(await props('d1'))).not.toContain('title');
        expect((await props('c1')).summary).toEqual('Greeting');
    });
});
