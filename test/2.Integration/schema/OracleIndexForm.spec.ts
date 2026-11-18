import * as oracledb from 'oracledb';
import {
    backendFor,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { SqlFragments } from '@/cypher/SqlFragments';
import { describeOnOracle } from '../support/Oracle';
import { sqlPersistenceManager } from '../support/SqlStores';

jest.setTimeout(300_000);

/** A graph of its own, which the test makes as Drivine 5.0 left it, and drops after. */
const GRAPH = 'idx_form_696';

const LABEL = 'OraForm';

const NODES = 20_000;

/** A session of its own of the test user, outside any pool, so the graph is set up before Drivine first connects to it. */
async function session(): Promise<oracledb.Connection> {
    const it = ConnectionPropertiesFromEnv('ORACLE');
    return oracledb.getConnection({
        user: it.userName,
        password: it.password,
        connectString: `${it.host}:${it.port ?? 1521}/${it.databaseName}`
    });
}

/** Runs `statements` in a session of its own, committing each. */
async function run(statements: string[]): Promise<void> {
    const connection = await session();
    try {
        for (const statement of statements) {
            await connection.execute(statement, [], { autoCommit: true });
        }
    } finally {
        await connection.close();
    }
}

/** The names of the graph's indexes over its node table, upper case, as Oracle's dictionary holds them. */
async function indexes(): Promise<string[]> {
    const connection = await session();
    try {
        const result = await connection.execute<[string]>(
            `SELECT index_name FROM user_indexes WHERE table_name = UPPER('${GRAPH}_node') ORDER BY index_name`
        );
        return (result.rows ?? []).map(([it]) => it);
    } finally {
        await connection.close();
    }
}

/** What drops the graph's store, with whatever layout made it. */
function dropping(): string[] {
    const graph = new OracleGraph(GRAPH);
    return [
        `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
        `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
        `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
        `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`,
        `DROP TABLE IF EXISTS ${GRAPH}_count2_delta PURGE`,
        `DROP TABLE IF EXISTS ${GRAPH}_count2 PURGE`,
        `DROP TABLE IF EXISTS ${GRAPH}_lock2 PURGE`,
        ...[graph.nullsEqual, graph.era, graph.eraDate].map((it) => `DROP FUNCTION IF EXISTS ${it}`)
    ];
}

/**
 * Drivine 5.0's index over a node property, as it made a range index's labelled index and a uniqueness constraint's
 * unique index: its own expression, not drivine4j's, which the shared compiler's SQL never matches (#696).
 */
function labelled50(label: string, property: string): string {
    return (
        `CASE WHEN JSON_EXISTS(n.labels, '$?(@ == "${label}")') THEN JSON_VALUE(n.props, '$."${property}"' ` +
        `RETURNING VARCHAR2(4000) NULL ON ERROR) END`
    );
}

/**
 * #696 on a store an earlier Drivine made: an empty graph Drivine 5.0 left with its range index and uniqueness
 * constraint, over its own expressions under layout 1's names, has them dropped on the first connection of this version,
 * with their records, so the first `ensure` makes them again as drivine4j makes them, under layout 2's names; and the
 * shared module's equality, which compiled Cypher writes, is then read through the index Oracle has, not the label's.
 */
describeOnOracle("An earlier version's Oracle index over a property, made again in drivine4j's form", () => {
    const graph = new OracleGraph(GRAPH);
    const old = {
        shared: graph.objectName('ix', ['repoKey']),
        labelled: graph.objectName('lx', [LABEL, 'repoKey']),
        sharedCode: graph.objectName('ix', ['code']),
        unique: graph.objectName('uq', [LABEL, 'code'])
    };
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    /** The objects Oracle's plan of `SELECT … WHERE <the module's equality>` reads: tables and indexes. */
    const planOf = async (property: string, value: string): Promise<string[]> => {
        const fragments = new SqlFragments('oracle', {
            name: GRAPH,
            indexedProperties: [[LABEL, property]]
        });
        const term = fragments.condition({ n: { node: 'n_', labels: [LABEL] } }, `n.${property} = $v`, { v: value });
        const hints = [...fragments.hints].join(' ');
        const id = `d696_${property}`;
        // On one session, as plan_table is the session's own (see oraclePlan).
        const connection = await DatabaseRegistry.getInstance().connectionProvider(`ORACLE_${GRAPH}`)!.connect();
        try {
            await connection.query(
                new QuerySpecification(
                    `EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR SELECT /*+ ${hints} */ n_.nid FROM ${GRAPH}_node n_ WHERE ${term}`
                ).bind(fragments.parameters)
            );
            const rows = await connection.query(
                new QuerySpecification(
                    `SELECT object_name AS "name" FROM plan_table WHERE statement_id = '${id}' AND object_name IS NOT NULL`
                )
            );
            await connection.query(new QuerySpecification(`DELETE FROM plan_table WHERE statement_id = '${id}'`));
            return rows.map((it: any) => it.name ?? it.NAME ?? it);
        } finally {
            await connection.release();
        }
    };

    beforeAll(async () => {
        await run(dropping());
        // The tables 5.0 made, its stamp with no layout, and its two items, each index with its record.
        await run([
            `CREATE TABLE ${GRAPH}_node (nid NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, labels JSON NOT NULL, ` +
                `props JSON NOT NULL, stamp VARCHAR2(33))`,
            `CREATE TABLE ${GRAPH}_schema (kind VARCHAR2(40) NOT NULL, label VARCHAR2(400) NOT NULL, ` +
                `properties VARCHAR2(2000) NOT NULL, name VARCHAR2(400), object_name VARCHAR2(128), details JSON NOT NULL, ` +
                `PRIMARY KEY (kind, label, properties))`,
            `INSERT INTO ${GRAPH}_node (labels, props) VALUES ('["DrivineStore"]', ` +
                `'{"key": "singleton", "storeId": "s696", "assignedAt": "2026-01-01T00:00:00Z", "engine": "ORACLE"}')`,
            `CREATE INDEX ${old.shared} ON ${GRAPH}_node (JSON_VALUE(props, '$.repoKey'))`,
            `CREATE INDEX ${old.labelled} ON ${GRAPH}_node n (${labelled50(LABEL, 'repoKey')})`,
            `INSERT INTO ${GRAPH}_schema VALUES ('RANGE_INDEX', '${LABEL}', '["repoKey"]', '${LABEL}_repoKey_range', ` +
                `'${old.shared}', '{"labelled": "${old.labelled}"}')`,
            `CREATE INDEX ${old.sharedCode} ON ${GRAPH}_node (JSON_VALUE(props, '$.code'))`,
            `CREATE UNIQUE INDEX ${old.unique} ON ${GRAPH}_node n (${labelled50(LABEL, 'code')})`,
            `INSERT INTO ${GRAPH}_schema VALUES ('RANGE_INDEX', '${LABEL}', '["code"]', '${LABEL}_code_range', ` +
                `'${old.sharedCode}', '{"unique": "${old.unique}"}')`,
            `INSERT INTO ${GRAPH}_schema VALUES ('UNIQUENESS_CONSTRAINT', '${LABEL}', '["code"]', ` +
                `'${LABEL}_code_unique', '${old.unique}', '{}')`
        ]);
        expect(await indexes()).toEqual(expect.arrayContaining(Object.values(old).map((it) => it.toUpperCase())));
        pm = sqlPersistenceManager({ name: 'ORACLE', type: DatabaseType.ORACLE }, GRAPH);
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE, GRAPH), new ModelRegistry());
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        await run(dropping());
    });

    it("should drop the earlier version's indexes and their records on the graph's first connection", async () => {
        await pm.query(new QuerySpecification('SELECT 1 AS "one" FROM dual'));
        const left = await indexes();
        for (const name of Object.values(old)) {
            expect(left).not.toContain(name.toUpperCase());
        }
        // The label's records go with them; the store's own, of its stamp's key, may be there.
        expect(
            await pm.query(
                new QuerySpecification(`SELECT kind AS "kind" FROM ${GRAPH}_schema WHERE label = '${LABEL}'`)
            )
        ).toEqual([]);
        expect((await gom.indexes.list('RANGE')).filter((it) => it.label === LABEL)).toEqual([]);
        expect((await gom.constraints.list()).filter((it) => it.label === LABEL)).toEqual([]);
    });

    it("should make them again on ensure, under drivine4j's names, and read the module's equality through each", async () => {
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO ${GRAPH}_node (labels, props) SELECT JSON('["${LABEL}"]'), JSON_OBJECT('id' VALUE 'i' || ` +
                    `LEVEL, 'repoKey' VALUE 'r' || MOD(LEVEL, 50), 'code' VALUE 'c' || LEVEL RETURNING JSON) FROM dual ` +
                    `CONNECT BY LEVEL <= ${NODES}`
            )
        );
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO ${GRAPH}_node (labels, props) SELECT JSON('["OraOther"]'), JSON_OBJECT('repoKey' VALUE ` +
                    `'r' || MOD(LEVEL, 50) RETURNING JSON) FROM dual CONNECT BY LEVEL <= 10`
            )
        );
        expect((await gom.indexes.ensure(rangeIndex(LABEL, 'repoKey'))).status).toEqual('CREATED');
        expect((await gom.constraints.ensure(uniquenessConstraint(LABEL, 'code'))).status).toEqual('CREATED');
        await pm.execute(
            new QuerySpecification(`BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, UPPER('${GRAPH}_NODE')); END;`)
        );

        const labelled = graph.objectName('lx2', [LABEL, 'repoKey']).toUpperCase();
        const unique = graph.objectName('uq2', [LABEL, 'code']).toUpperCase();
        expect(await indexes()).toEqual(
            expect.arrayContaining([
                graph.objectName('ix2', ['repoKey']).toUpperCase(),
                labelled,
                graph.objectName('ix2', ['code']).toUpperCase(),
                unique
            ])
        );
        const byRepo = await planOf('repoKey', 'r7');
        expect(byRepo).toContain(labelled);
        expect(byRepo).not.toContain(`${GRAPH}_NODE_LABELS`.toUpperCase());
        const byCode = await planOf('code', 'c42');
        expect(byCode).toContain(unique);
        expect(byCode).not.toContain(`${GRAPH}_NODE_LABELS`.toUpperCase());
    });
});
