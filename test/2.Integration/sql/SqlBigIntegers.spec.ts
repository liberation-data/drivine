import {
    backendFor,
    cypherStatement,
    DatabaseRegistry,
    ModelRegistry,
    NodeFragment,
    NodeId,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { cypherSqlStores, SqlSeed, sqlPersistenceManager } from '../support/SqlStores';

@NodeFragment({ labels: ['SqlBigInteger', 'Counter'] })
class Counter {
    @NodeId() id: string;
    count?: number;
}

afterAll(async () => {
    await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    DatabaseRegistry.tearDown();
});

// A whole number past 2^53 that compiled Cypher gives back keeps its digits, as a bigint, as one bound is given
// (liberation-data/drivine#735): read as a JavaScript number, 9007199254740993 would be 9007199254740992. A whole
// number a number holds exactly stays a number.
// Oracle's driver reads a JSON number through a JavaScript number, so a compiled read there still rounds: left out
// until that is read otherwise.
describe.each(cypherSqlStores().filter((it) => it.name !== 'ORACLE'))('a whole number past 2^53 on $name', (store) => {
    const manager = sqlPersistenceManager(store);
    const cypher = (text: string, parameters: Record<string, unknown> = {}) =>
        new QuerySpecification<any>(cypherStatement(text)).bind(parameters);

    it('is given back with its digits, written, computed or bound', async () => {
        expect(await manager.query(cypher('RETURN 9007199254740993 AS big'))).toEqual([BigInt('9007199254740993')]);
        expect(await manager.query(cypher('RETURN 9007199254740992 + 1 AS big'))).toEqual([BigInt('9007199254740993')]);
        expect(await manager.query(cypher('RETURN $x AS big', { x: BigInt('-9007199254740993') }))).toEqual([
            BigInt('-9007199254740993')
        ]);
    });

    it('keeps its digits in a list and a map', async () => {
        expect(
            await manager.query(cypher('RETURN [9223372036854775807, 1] AS l, {k: -9223372036854775808} AS m'))
        ).toEqual([[[BigInt('9223372036854775807'), 1], { k: BigInt('-9223372036854775808') }]]);
    });

    it('leaves a whole number a number holds exactly a number, and a float a float', async () => {
        expect(await manager.query(cypher('RETURN 9007199254740991 AS n, 2.5 AS f, 1e20 AS e'))).toEqual([
            [9007199254740991, 2.5, 1e20]
        ]);
    });

    it('is loaded by the object manager as a number, as it was saved, so it saves again', async () => {
        const seed = new SqlSeed(manager, store, 'SqlBigInteger');
        await seed.prepare();
        await seed.clear();
        const gom = new StatelessGraphObjectManager(manager, backendFor(store.type), new ModelRegistry());
        try {
            await gom.save(Object.assign(new Counter(), { id: 'c', count: 2 ** 60 }));
            const loaded = (await gom.load(Counter, 'c'))!;
            expect(loaded.count).toBe(2 ** 60);
            await gom.save(Object.assign(loaded, { count: 2 ** 60 + 2 ** 10 }));
            expect((await gom.load(Counter, 'c'))!.count).toBe(2 ** 60 + 2 ** 10);
        } finally {
            await seed.clear();
        }
    });
});

// A compiled write's rows are read apart from a read's on Oracle, where they keep their digits too.
describe.each(cypherSqlStores())('a whole number past 2^53 a write gives back on $name', (store) => {
    const manager = sqlPersistenceManager(store);

    it('keeps its digits, and a float stays a float', async () => {
        const seed = new SqlSeed(manager, store, 'SqlBigInteger');
        await seed.prepare();
        await seed.clear();
        try {
            const rows = await manager.query(
                new QuerySpecification<any>(
                    cypherStatement(
                        "CREATE (n:SqlBigInteger {id: 'w', v: 9007199254740993}) RETURN n.v AS v, 2.5 AS f, toFloat(n.v) AS g"
                    )
                )
            );
            expect(rows).toEqual([[BigInt('9007199254740993'), 2.5, 9007199254740992]]);
        } finally {
            await seed.clear();
        }
    });
});
