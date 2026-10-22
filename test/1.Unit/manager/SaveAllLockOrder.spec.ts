import {
    CypherBackend,
    FragmentGroup,
    GraphBackend,
    GraphStatement,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    NodeStamp,
    OracleBackend,
    OracleGraph,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Ledger'] })
class Ledger {
    @NodeId() id: string;
    total?: number;
}

@NodeFragment({ labels: ['Bookmark'] })
class Bookmark {
    @NodeId() id: string;
    cursor?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['ChunkHash'] })
class ChunkHash {
    @NodeId() id: string;
    chunk?: string;
}

const ledger = (id: string): Ledger => Object.assign(new Ledger(), { id, total: 1 });
const bookmark = (id: string): Bookmark => Object.assign(new Bookmark(), { id, cursor: `c-${id}` });
const chunkHash = (id: string): ChunkHash => Object.assign(new ChunkHash(), { id, chunk: id });

/** The stamp the store left on the node with the id. */
const stampOf = (id: string): string => `stamp-of-${id}`;

/** A statement the persistence manager ran, with the parameters it bound. */
interface Ran {
    text: string;
    parameters: Record<string, any>;
}

/**
 * A persistence manager of a database no provider is registered under, so a batch runs statement by statement: it
 * records each statement, and answers a batch of fragments with the stamp of each id it binds.
 */
interface Recording {
    pm: PersistenceManager;
    ran: Ran[];
}

function recording(): Recording {
    const ran: Ran[] = [];
    const run = async (spec: QuerySpecification<any>): Promise<any[]> => {
        const parameters: Record<string, any> = spec.parameters;
        ran.push({ text: spec.statement.text, parameters });
        const ids = Object.keys(parameters)
            .filter((it) => /^ids\d+$/.test(it))
            .map((it) => parameters[it] as string[]);
        const stamps = (group: string[]): { id: string; stamp: string }[] =>
            group.map((id) => ({ id, stamp: stampOf(id) }));
        return Promise.resolve([{ groups: ids.map((group) => ({ before: [], after: stamps(group) })) }]);
    };
    const pm = {
        database: 'save-all-lock-order',
        query: run,
        execute: async (spec: QuerySpecification<void>) => {
            await run(spec);
        }
    } as unknown as PersistenceManager;
    return { pm, ran };
}

describe('saveAll lock order', () => {
    const managerOver = (pm: PersistenceManager, backend: GraphBackend = new CypherBackend(NEO4J_GRAMMAR)) =>
        new StatelessGraphObjectManager(pm, backend, new ModelRegistry());

    it('should write the classes of one statement in the order of their names, whatever order they are given in', async () => {
        const { pm, ran }: Recording = recording();
        const gom = managerOver(pm);
        await gom.saveAll([ledger('l1'), bookmark('b1'), chunkHash('h1')]);
        await gom.saveAll([chunkHash('h2'), bookmark('b2'), ledger('l2')]);

        const orders = ran.map((spec) =>
            ['Ledger', 'Bookmark', 'ChunkHash'].sort(
                (a, b) => spec.text.indexOf(`MERGE (n:${a}`) - spec.text.indexOf(`MERGE (n:${b}`)
            )
        );
        expect(orders).toEqual([
            ['Bookmark', 'ChunkHash', 'Ledger'],
            ['Bookmark', 'ChunkHash', 'Ledger']
        ]);
    });

    it('should write the rows of each class of one statement in the order of their ids', async () => {
        const { pm, ran }: Recording = recording();
        await managerOver(pm).saveAll([chunkHash('h2'), ledger('l1'), chunkHash('h1'), chunkHash('h3')]);

        const rows = ran[0].parameters.rows0 as { id: string }[];
        expect(rows.map((it) => it.id)).toEqual(['h1', 'h2', 'h3']);
        expect(ran[0].parameters.ids0).toEqual(['h1', 'h2', 'h3']);
    });

    it('should keep the rows of one id in the order they were given in', async () => {
        const { pm, ran }: Recording = recording();
        const later = Object.assign(ledger('l1'), { total: 2 });
        await managerOver(pm).saveAll([ledger('l2'), ledger('l1'), later]);

        const rows = ran[0].parameters.rows0 as { id: string; props: { total: number } }[];
        expect(rows.map((it) => [it.id, it.props.total])).toEqual([
            ['l1', 1],
            ['l1', 2],
            ['l2', 1]
        ]);
    });

    it('should return the objects in the order given, each with its own stamp', async () => {
        const { pm }: Recording = recording();
        const objects = [bookmark('b3'), ledger('l1'), bookmark('b1'), bookmark('b2')];

        const saved = await managerOver(pm).saveAll(objects);

        expect(saved).toBe(objects);
        expect(saved.map((it) => it.id)).toEqual(['b3', 'l1', 'b1', 'b2']);
        expect([saved[0], saved[2], saved[3]].map((it) => (it as Bookmark).stamp)).toEqual(
            ['b3', 'b1', 'b2'].map(stampOf)
        );
    });

    describe.each([
        ['Cypher', (): GraphBackend => new CypherBackend(NEO4J_GRAMMAR)],
        ['Oracle', (): GraphBackend => new OracleBackend(new OracleGraph())],
        ['Postgres', (): GraphBackend => new PostgresBackend(new PostgresGraph())]
    ])('on the %s backend', (_, backendOf) => {
        it('should hand the batch its classes in the order of their names and the objects of each in the order of their ids', async () => {
            const backend = backendOf();
            const given: FragmentGroup[][] = [];
            jest.spyOn(backend, 'fragmentBatch').mockImplementation((groups) => {
                given.push(groups);
                const ids = Object.fromEntries(groups.map((group, i) => [`ids${i}`, group.objects.map((it) => it.id)]));
                return new GraphStatement('BATCH', ids);
            });
            const { pm }: Recording = recording();

            await managerOver(pm, backend).saveAll([ledger('l2'), bookmark('b2'), ledger('l1'), bookmark('b1')]);

            expect(
                given.map((groups) => groups.map((it) => [it.model.type.name, it.objects.map((o) => o.id)]))
            ).toEqual([
                [
                    ['Bookmark', ['b1', 'b2']],
                    ['Ledger', ['l1', 'l2']]
                ]
            ]);
        });
    });
});
