import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    Connection,
    DatabaseRegistry,
    DatabaseType,
    inDrivineContext,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    ReusedIdsError,
    SqliteConnectionProvider,
    SqliteGraph,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { openSqlite } from '@/connection/sqlite/SqliteDriver';
import { DATABASE_FILE } from '@/backend/sqlite/SqliteGraph';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() id: string;
}

/**
 * A SQLite graph gives a deleted node's or relationship's id to nothing after it, as Oracle and Postgres give none
 * again (liberation-data/drivine4j#713): its keys are `AUTOINCREMENT`. A file whose tables an earlier Drivine made,
 * without it, is refused. drivine4j's SqliteIdsNotReusedTest.
 */
describe('a SQLite graph', () => {
    /** Its real path, as SQLite names the file it has open. */
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-ids-')));
    const file = (name: string): string => path.join(folder, name);
    let pm: PersistenceManager;

    const cypher = async (text: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text, language: 'CYPHER' }));
    const one = async (text: string): Promise<any> => {
        const rows = await cypher(text);
        expect(rows).toHaveLength(1);
        return rows[0];
    };
    /** The rows of a statement of plain SQL, on a connection of its own to the file, outside Drivine. */
    const plain = (at: string, sql: string): any[] => {
        const db = openSqlite(at);
        try {
            return db
                .prepare(sql)
                .all()
                .map((it: any) => ({ ...it }));
        } finally {
            db.close();
        }
    };
    const clear = async (): Promise<void> => {
        await pm.execute(new QuerySpecification('DELETE FROM reuse_node'));
    };

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({
                databaseType: DatabaseType.SQLITE,
                host: '',
                databaseName: file('reuse.db'),
                defaultGraphPath: 'reuse'
            })
            .register('reuse');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'reuse',
            'NON_TRANSACTIONAL'
        );
    });

    beforeEach(async () => clear());

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    it('should make its tables with AUTOINCREMENT keys', async () => {
        const made = await pm.query<any>(
            new QuerySpecification(
                `SELECT sql FROM sqlite_master WHERE name IN ('reuse_node', 'reuse_edge') ORDER BY name`
            )
        );
        expect(made).toHaveLength(2);
        expect(made[0].sql).toContain('eid   INTEGER PRIMARY KEY AUTOINCREMENT');
        expect(made[1].sql).toContain('nid    INTEGER PRIMARY KEY AUTOINCREMENT');
    });

    it('should give the id of a node deleted, the one with the greatest id, to no node made after it, in another statement', async () => {
        await cypher('CREATE (:Kept)');
        const deleted = await one('CREATE (n:Gone) RETURN elementId(n)');
        await cypher('MATCH (n:Gone) DELETE n');
        const made = await one('CREATE (n:New) RETURN elementId(n)');
        expect(made).not.toEqual(deleted);
        expect(Number(await one(`MATCH (n) WHERE elementId(n) = '${deleted}' RETURN count(n)`))).toBe(0);
    });

    it('should give the id of a relationship deleted to no relationship made after it, in another statement', async () => {
        await cypher('CREATE (:A)-[:Kept]->(:B)');
        const deleted = await one('MATCH (a:A), (b:B) CREATE (a)-[r:Gone]->(b) RETURN elementId(r)');
        await cypher('MATCH ()-[r:Gone]->() DELETE r');
        const made = await one('MATCH (a:A), (b:B) CREATE (a)-[r:New]->(b) RETURN elementId(r)');
        expect(made).not.toEqual(deleted);
    });

    it('should give the id of a node deleted to none the same statement makes after', async () => {
        await cypher('CREATE (:Kept)');
        const [deleted, made] = await one(
            'CREATE (n:Gone) WITH elementId(n) AS deleted, n DELETE n CREATE (m:New) RETURN [deleted, elementId(m)]'
        );
        expect(made).not.toEqual(deleted);
        // TCK Merge1 #14: a MERGE after a DELETE in the same statement makes a node of its own.
        await cypher('MATCH (n) DETACH DELETE n');
        await cypher('CREATE (:Kept), (:Gone)');
        const [gone, merged] = await one(
            'MATCH (n:Gone) WITH n, elementId(n) AS deleted DELETE n MERGE (m:Gone) RETURN [deleted, elementId(m)]'
        );
        expect(merged).not.toEqual(gone);
    });

    it('should give the id of a node deleted inside a transaction to none made after it', async () => {
        await cypher('CREATE (:Kept)');
        const connection: Connection = await DatabaseRegistry.getInstance().connectionProvider('reuse')!.connect();
        const query = async (text: string): Promise<any[]> =>
            connection.query(new QuerySpecification({ text, language: 'CYPHER' }));
        await connection.startTransaction();
        try {
            const [deleted] = await query('CREATE (n:Gone) RETURN elementId(n)');
            await query('MATCH (n:Gone) DELETE n');
            const [made] = await query('CREATE (n:New) RETURN elementId(n)');
            expect(made).not.toEqual(deleted);
        } finally {
            await connection.rollbackTransaction();
            await connection.release();
        }
    });

    it('should keep its ids counting from where they were once cleared, as on Postgres', async () => {
        const before = Number(await one('CREATE (n:Gone) RETURN elementId(n)'));
        await clear();
        const after = Number(await one('CREATE (n:New) RETURN elementId(n)'));
        expect(after).toBeGreaterThan(before);
    });

    describe('in a file an earlier Drivine made', () => {
        let made = 0;

        /** A file with the graph's tables made as an earlier Drivine made them: keys without AUTOINCREMENT. */
        const earlierFile = (graph: string, keepEdges = false): string => {
            const at = file(`earlier-${++made}.db`);
            const db = openSqlite(at);
            try {
                db.exec(
                    `CREATE TABLE ${graph}_node (nid INTEGER PRIMARY KEY, labels TEXT NOT NULL, props TEXT NOT NULL, stamp TEXT)`
                );
                const key = keepEdges ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INTEGER PRIMARY KEY';
                db.exec(
                    `CREATE TABLE ${graph}_edge (eid ${key}, src INTEGER NOT NULL, dst INTEGER NOT NULL, type TEXT NOT NULL, props TEXT NOT NULL DEFAULT '{}')`
                );
                db.exec(`INSERT INTO ${graph}_node (labels, props) VALUES ('["Person"]', '{"name": "Ada"}')`);
            } finally {
                db.close();
            }
            return at;
        };

        it('should be refused on every connection, naming the graph and the file, and nothing is made in it', async () => {
            const at = earlierFile('drivine');
            const provider = new SqliteConnectionProvider('earlier', DatabaseType.SQLITE, at);
            try {
                for (let attempt = 0; attempt < 2; attempt++) {
                    const refused = await provider.connect().then(
                        () => undefined,
                        (e) => e
                    );
                    expect(refused).toBeInstanceOf(ReusedIdsError);
                    expect(refused.graph).toEqual('drivine');
                    expect(refused.path).toEqual(at);
                    expect(refused.message).toEqual(
                        `The SQLite graph 'drivine' in ${at} was made by an earlier Drivine, whose node and ` +
                            `relationship ids could be reused after a delete. Make a new file and save the graph into ` +
                            `it again.`
                    );
                }
            } finally {
                await provider.end();
            }
            expect(
                plain(
                    at,
                    `SELECT count(*) AS n FROM sqlite_master WHERE name IN ('drivine_schema', 'drivine_edge_src')`
                )
            ).toEqual([{ n: 0 }]);
        });

        it('should be refused where its table of nodes alone was made without AUTOINCREMENT, and one of another graph is not', async () => {
            const at = earlierFile('drivine', true);
            const refused = new SqliteConnectionProvider('earlier', DatabaseType.SQLITE, at);
            try {
                await expect(refused.connect()).rejects.toBeInstanceOf(ReusedIdsError);
            } finally {
                await refused.end();
            }
            // Another graph in the same file is made, and works.
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({
                    databaseType: DatabaseType.SQLITE,
                    host: '',
                    databaseName: at,
                    defaultGraphPath: 'fresh'
                })
                .register('earlier-fresh');
            const other = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get('earlier-fresh', 'NON_TRANSACTIONAL');
            expect(
                await other.query(new QuerySpecification({ text: 'MATCH (n) RETURN count(n)', language: 'CYPHER' }))
            ).toEqual([0]);
            // An object manager over the old graph is refused before its first statement.
            const gom = new StatelessGraphObjectManager(
                other,
                backendFor(DatabaseType.SQLITE, 'drivine'),
                new ModelRegistry()
            );
            await expect(gom.count(Person)).rejects.toBeInstanceOf(ReusedIdsError);
        });

        it('should be refused where the name of its graph holds the word AUTOINCREMENT', async () => {
            const provider = new SqliteConnectionProvider(
                'earlier',
                DatabaseType.SQLITE,
                earlierFile('autoincrement'),
                {
                    graph: 'autoincrement'
                }
            );
            try {
                await expect(provider.connect()).rejects.toBeInstanceOf(ReusedIdsError);
            } finally {
                await provider.end();
            }
        });

        it('should be refused as itself where its making is run as a statement outside a transaction', async () => {
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({
                    databaseType: DatabaseType.SQLITE,
                    host: '',
                    databaseName: earlierFile('drivine'),
                    defaultGraphPath: 'fresh'
                })
                .register('earlier-statement');
            const other = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get('earlier-statement', 'NON_TRANSACTIONAL');
            await expect(
                other.execute(new QuerySpecification(new SqliteGraph('drivine').ensuring))
            ).rejects.toBeInstanceOf(ReusedIdsError);
        });

        it('should refuse first connections asked for together alike, and close each', async () => {
            const at = earlierFile('drivine');
            const provider = new SqliteConnectionProvider('earlier', DatabaseType.SQLITE, at);
            const probe = openSqlite(file('probe.db'));
            const close = jest.spyOn(Object.getPrototypeOf(probe), 'close');
            probe.close();
            close.mockClear();
            try {
                const refused = await Promise.allSettled([provider.connect(), provider.connect(), provider.connect()]);
                refused.forEach((it) => {
                    expect(it.status).toEqual('rejected');
                    expect((it as PromiseRejectedResult).reason).toBeInstanceOf(ReusedIdsError);
                });
                expect(close).toHaveBeenCalledTimes(3);
            } finally {
                close.mockRestore();
                await provider.end();
            }
        });

        it('should be refused as itself inside a transaction', async () => {
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({
                    databaseType: DatabaseType.SQLITE,
                    host: '',
                    databaseName: earlierFile('drivine'),
                    defaultGraphPath: 'drivine'
                })
                .register('earlier-tx');
            const tpm = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get('earlier-tx', 'TRANSACTIONAL');
            await expect(
                inDrivineContext()
                    .withTransaction()
                    .run(async () => tpm.query(new QuerySpecification('SELECT 1')))
            ).rejects.toBeInstanceOf(ReusedIdsError);
        });

        it("should be refused by the graph's look before anything is made", () => {
            const at = earlierFile('g');
            const graph = new SqliteGraph('g');
            const sent: string[] = [];
            const db = openSqlite(at);
            try {
                expect(() =>
                    graph.ensure(
                        (statement) => {
                            sent.push(statement);
                            return Object.values(db.prepare(statement).get() ?? {})[0];
                        },
                        () => {
                            throw new Error('nothing is to be made');
                        }
                    )
                ).toThrow(ReusedIdsError);
            } finally {
                db.close();
            }
            // The look, and the file the error names: no statement that makes anything.
            expect(sent).toEqual([graph.made, DATABASE_FILE]);
        });
    });

    it('should make a fresh file with AUTOINCREMENT keys, which works', async () => {
        const at = file('fresh.db');
        const provider = new SqliteConnectionProvider('fresh', DatabaseType.SQLITE, at);
        try {
            const connection = await provider.connect();
            try {
                await connection.query(
                    new QuerySpecification({
                        text: "CREATE (:Person {name: 'Ada'})-[:KNOWS]->(:Person {name: 'Bob'})",
                        language: 'CYPHER'
                    })
                );
                expect(
                    await connection.query(
                        new QuerySpecification({ text: 'MATCH (n:Person) RETURN count(n)', language: 'CYPHER' })
                    )
                ).toEqual([2]);
            } finally {
                await connection.release();
            }
            // Connected again: looked for, found, not refused.
            await (await provider.connect()).release();
        } finally {
            await provider.end();
        }
        expect(
            plain(
                at,
                `SELECT count(*) AS n FROM sqlite_master WHERE name IN ('drivine_node', 'drivine_edge') AND sql LIKE '%AUTOINCREMENT%'`
            )
        ).toEqual([{ n: 2 }]);
        expect(plain(at, 'SELECT name FROM sqlite_sequence ORDER BY name')).toEqual([
            { name: 'drivine_edge' },
            { name: 'drivine_node' }
        ]);
    });
});
