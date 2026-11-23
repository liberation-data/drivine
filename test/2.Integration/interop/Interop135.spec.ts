import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { SchemaManager } from '@/schema/SchemaManager';
import { SchemaPlan } from '@/schema/SchemaPlan';
import { Case, CASES, DECLARATIONS, GAPS } from '../../1.Unit/schema/Declarations';

/**
 * One library's half of a run of drivine-cypher-spec#135's declarations across the three libraries over one store: for
 * each case of declarations.yaml, on a graph of its own, declares it in this library's API, as Declarations.spec does,
 * and enforces it, writing what came of it to a report a driver judges against the other libraries' halves. Run only
 * where the driver sets INTEROP_STORE; it asserts nothing itself.
 *
 * INTEROP_STORE (sqlite, postgres or oracle), INTEROP_GRAPH (each case's graph is `<prefix>_<i>`), INTEROP_PHASE (write
 * or check), INTEROP_CASES (declarations.yaml), INTEROP_REPORT (where the report goes), and the store's INTEROP_HOST,
 * INTEROP_PORT, INTEROP_USER, INTEROP_PASSWORD and INTEROP_DATABASE (Postgres's database, Oracle's service, or the
 * directory of SQLite's `<graph>.db` files).
 */
const env = process.env;

// A case's enforce on Oracle builds its indexes and constraints one DDL at a time, past jest's 5 s for the slowest
// ("fragment"), so a run on its own needs no driver to lengthen it.
jest.setTimeout(120_000);
const run = env.INTEROP_STORE ? describe : describe.skip;

const TYPES: Record<string, DatabaseType> = {
    sqlite: DatabaseType.SQLITE,
    postgres: DatabaseType.POSTGRES,
    oracle: DatabaseType.ORACLE
};

interface Ran {
    purpose: string;
    statement: string;
}

interface Report {
    case: string;
    outcome: string[] | null;
    statements: Ran[];
    markerBefore: string | null;
    markerAfter: string | null;
    failure: string | null;
    /** This library's issues the case waits on, where it can't yet be declared as drivine4j declares it (see GAPS). */
    gap?: string[];
}

/** Registers the store's graph `graph` under that name, as the driver set the store out. */
function register(graph: string): void {
    const type = TYPES[env.INTEROP_STORE!];
    const sqlite = type === DatabaseType.SQLITE;
    DatabaseRegistry.getInstance()
        .builder()
        .withProperties({
            databaseType: type,
            host: sqlite ? '' : env.INTEROP_HOST!,
            port: sqlite ? undefined : Number(env.INTEROP_PORT),
            userName: env.INTEROP_USER,
            password: env.INTEROP_PASSWORD,
            databaseName: sqlite ? path.join(env.INTEROP_DATABASE!, `${graph}.db`) : env.INTEROP_DATABASE,
            defaultGraphPath: graph
        })
        .register(graph);
}

run('drivine-cypher-spec#135: the declarations over one store, a half of a run across the libraries', () => {
    // A skipped describe still collects its tests: without the driver's cases, this copy's, so that a run that isn't one
    // of the driver's skips them rather than failing to read INTEROP_CASES.
    const cases: Case[] = env.INTEROP_CASES ? parse(fs.readFileSync(env.INTEROP_CASES, 'utf8')).cases : CASES;
    const reports: Report[] = [];

    afterAll(async () => {
        fs.writeFileSync(env.INTEROP_REPORT!, JSON.stringify({ phase: env.INTEROP_PHASE, reports }, null, 2));
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it.each(cases.map((it, i) => [i, it.case] as const))('runs case %i, %s', async (i, name) => {
        const graph = `${env.INTEROP_GRAPH}_${i}`;
        const report: Report = {
            case: name,
            outcome: null,
            statements: [],
            markerBefore: null,
            markerAfter: null,
            failure: null,
            ...(name in GAPS ? { gap: GAPS[name] } : {})
        };
        reports.push(report);
        let pm: PersistenceManager | undefined;
        const marker = async (): Promise<string | null> => {
            if (!pm) {
                return null;
            }
            try {
                const rows = await pm.query<any>(
                    new QuerySpecification<any>({
                        text: 'MATCH (m:_DrivineSchema) RETURN properties(m) AS marker',
                        language: 'CYPHER'
                    })
                );
                return JSON.stringify(rows);
            } catch (e) {
                return `unread: ${(e as Error).message}`;
            }
        };
        // Each statement the plan runs, with its purpose, as the module names it: the spy runs each as it would be.
        const execute = jest.spyOn(SchemaPlan.prototype as any, 'execute');
        try {
            // Inside the try, so that a store that can't be registered is the case's failure, in the report.
            register(graph);
            pm = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get(graph, 'NON_TRANSACTIONAL');
            report.markerBefore = await marker();
            const declared = DECLARATIONS[name];
            if (!declared) {
                throw new Error(`No declaration for the spec's case '${name}'.`);
            }
            const factory = new GraphObjectManagerFactory(
                new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
            );
            const manager = new SchemaManager(factory, {
                catalogs: declared.catalogs.map((it) => it.forDatabase(graph))
            });
            for (const [owner, catalog] of declared.runtime ?? []) {
                await manager.ensure(catalog.named(owner).forDatabase(graph));
            }
            const results = await manager.enforce();
            report.outcome = [...results.values()].flat().map((it) => it.status);
        } catch (e) {
            report.failure = (e as Error).message;
        } finally {
            report.statements = execute.mock.calls.map(([action]: any[]) => ({
                purpose: action.purpose,
                statement: typeof action.statement === 'string' ? action.statement : JSON.stringify(action.statement)
            }));
            execute.mockRestore();
            report.markerAfter = await marker();
        }
    });
});
