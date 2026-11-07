import * as oracledb from 'oracledb';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';
import { TEST_CONTAINER_PASSWORD } from '@/testing';

/** Whether ORACLE_DATABASE_* configures an Oracle connection: its suites run only then. */
export const oracleConfigured = process.env.ORACLE_DATABASE_TYPE === 'ORACLE';

/** `describe` when Oracle is configured, else `describe.skip`. */
export const describeOnOracle = oracleConfigured ? describe : describe.skip;

/** A non-transactional persistence manager for the ORACLE connection. */
export function oraclePersistenceManager(): PersistenceManager {
    DatabaseRegistry.buildOrResolveFromEnv('ORACLE');
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        'ORACLE',
        'NON_TRANSACTIONAL'
    );
}

/**
 * The plan Oracle makes for `compiled` on the connection registered as `connectionName`, its parameters written in as
 * literals so that the plan is the one for them, shown in the `format` `DBMS_XPLAN.DISPLAY` takes. Explained and read
 * on one session.
 */
export async function oraclePlan(connectionName: string, compiled: CompiledCypher, format: string): Promise<string> {
    const sql = Object.entries(compiled.parameters)
        .sort(([a], [b]) => b.length - a.length)
        .reduce(
            (text, [name, value]) =>
                text
                    .split(`$${name}`)
                    .join(value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`),
            compiled.sql
        );
    const id = `plan_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const connection = await DatabaseRegistry.getInstance().connectionProvider(connectionName)!.connect();
    try {
        await connection.query(new QuerySpecification(`EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR ${sql}`));
        const lines = await connection.query(
            new QuerySpecification(
                `SELECT plan_table_output AS "line" FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${id}', '${format}'))`
            )
        );
        return lines.map((it) => it.line ?? it.LINE ?? it).join('\n');
    } finally {
        await connection.release();
    }
}

/**
 * The plan of the statement the session `sid` ran last, as the child cursor that ran it holds it, shown in the `format`
 * `DBMS_XPLAN.DISPLAY_CURSOR` takes. Read as `system`, as the test user reads no `V$` view: a plan Oracle made again on
 * a later run, from what an earlier run found (statistics feedback), is a child of its own. drivine4j's
 * `OracleTestDatabase.lastPlan`.
 *
 * The child `v$session` names can hold no plan: on CI, the first run after statistics were gathered again, which
 * invalidates the cursor, read "cannot fetch plan" for child 0 (#667). Then the plan is read from the one child of the
 * statement that is valid, holds a plan and was active since the run started, if there is exactly one: no other session
 * runs the statement, and the invalidation left no child from before it valid, so that is the child that ran it. On a
 * later run, a child that statistics feedback planned again leaves the one it replaced not shareable, so the first
 * run's plan can't be read in place of the one the check is there to catch. With none or several, or when that child's
 * plan can't be fetched either, the read is tried again a few times, and then fails, listing the statement's children.
 */
export async function oracleLastPlan(sid: string, format: string): Promise<string> {
    const properties = ConnectionPropertiesFromEnv('ORACLE');
    const admin = await oracledb.getConnection({
        user: 'system',
        password: TEST_CONTAINER_PASSWORD,
        connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
    });
    const display = async (sqlId: string, child: number): Promise<string> => {
        const lines = await admin.execute<[string]>(
            'SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sqlId, :child, :format))',
            { sqlId, child, format }
        );
        return (lines.rows ?? []).map(([line]) => line).join('\n');
    };
    try {
        const session = await admin.execute<[string, number]>(
            'SELECT prev_sql_id, prev_child_number FROM v$session WHERE sid = :sid',
            { sid: Number(sid) }
        );
        const [sqlId, child] = session.rows?.[0] ?? [];
        if (sqlId === undefined || child === undefined) {
            throw new Error(`No session ${sid}.`);
        }
        let plan = '';
        let children: CursorChild[] = [];
        for (let read = 1; read <= LAST_PLAN_READS; read++) {
            plan = await display(sqlId, child);
            if (!plan.includes(NO_CURSOR_PLAN)) {
                return plan;
            }
            children = await cursorChildren(admin, sid, sqlId);
            const ran = children.filter(
                (it) =>
                    it.CHILD_NUMBER !== child &&
                    it.PLAN_LINES > 0 &&
                    it.IS_SHAREABLE === 'Y' &&
                    it.OBJECT_STATUS === 'VALID' &&
                    it.ACTIVE_SINCE_RUN === 'Y'
            );
            if (ran.length === 1) {
                const note = `Read from child ${ran[0].CHILD_NUMBER}: v$session named child ${child}, which holds no plan.`;
                console.log(`${note}\n${childTable(children)}`);
                const fallback = await display(sqlId, ran[0].CHILD_NUMBER);
                if (!fallback.includes(NO_CURSOR_PLAN)) {
                    return `${note}\n${fallback}`;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, LAST_PLAN_WAIT_MS));
        }
        throw new Error(
            `No plan for the statement session ${sid} ran last, ${sqlId} child ${child} as v$session names it, ` +
                `after ${LAST_PLAN_READS} reads:\n${plan}\nIts children in v$sql:\n${childTable(children)}`
        );
    } finally {
        await admin.close();
    }
}

/** What `DBMS_XPLAN.DISPLAY_CURSOR` shows for a child cursor that holds no plan. */
const NO_CURSOR_PLAN = 'cannot fetch plan for SQL_ID';
/** How many times {@link oracleLastPlan} reads a plan the cursor cache doesn't give it, and how long it waits between. */
const LAST_PLAN_READS = 5;
const LAST_PLAN_WAIT_MS = 200;

/** A child cursor of a statement, from `v$sql`, with how many lines of plan `v$sql_plan` holds for it. */
interface CursorChild {
    CHILD_NUMBER: number;
    CHILD_ADDRESS: string;
    PLAN_HASH_VALUE: number;
    PLAN_LINES: number;
    IS_SHAREABLE: string;
    IS_OBSOLETE: string;
    OBJECT_STATUS: string;
    INVALIDATIONS: number;
    LOADS: number;
    EXECUTIONS: number;
    LAST_LOAD_TIME: string;
    LAST_ACTIVE_TIME: string;
    /** `Y` when the child was active at or after the second the session's last run started. */
    ACTIVE_SINCE_RUN: string;
}

/** The children of `sqlId` in the cursor cache, as `admin` reads them, beside what session `sid` ran last. */
async function cursorChildren(admin: oracledb.Connection, sid: string, sqlId: string): Promise<CursorChild[]> {
    const rows = await admin.execute<CursorChild>(
        `SELECT s.child_number AS "CHILD_NUMBER", RAWTOHEX(s.child_address) AS "CHILD_ADDRESS",
                s.plan_hash_value AS "PLAN_HASH_VALUE",
                (SELECT COUNT(*) FROM v$sql_plan p WHERE p.sql_id = s.sql_id AND p.child_address = s.child_address)
                    AS "PLAN_LINES",
                s.is_shareable AS "IS_SHAREABLE", s.is_obsolete AS "IS_OBSOLETE", s.object_status AS "OBJECT_STATUS",
                s.invalidations AS "INVALIDATIONS", s.loads AS "LOADS", s.executions AS "EXECUTIONS",
                s.last_load_time AS "LAST_LOAD_TIME",
                TO_CHAR(s.last_active_time, 'YYYY-MM-DD/HH24:MI:SS') AS "LAST_ACTIVE_TIME",
                CASE WHEN s.last_active_time >= v.prev_exec_start THEN 'Y' ELSE 'N' END AS "ACTIVE_SINCE_RUN"
         FROM v$sql s CROSS JOIN v$session v
         WHERE s.sql_id = :sqlId AND v.sid = :sid
         ORDER BY s.child_number`,
        { sqlId, sid: Number(sid) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return rows.rows ?? [];
}

/** `children` as a table, a line each, or a line saying there are none. */
function childTable(children: CursorChild[]): string {
    if (children.length === 0) {
        return '(none: the statement has left the cursor cache)';
    }
    const columns = Object.keys(children[0]) as (keyof CursorChild)[];
    return [columns.join(' | '), ...children.map((it) => columns.map((column) => String(it[column])).join(' | '))].join(
        '\n'
    );
}
