import { Neo4jError } from 'neo4j-driver';
import { DrivineLogger } from '@/logger';
import { ReusedIdsError } from '@/connection/sqlite/ReusedIdsError';
import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';
import {
    causes,
    ensureResult,
    moduleSpec,
    planItem,
    planRequest,
    planSpec,
    schemaItem,
    withOptionNames
} from '@/schema/SchemaPlan';
import { falkorDbVectorOptions, rangeIndex, uniquenessConstraint, vectorIndex } from '@/schema/SchemaSpecs';
import { ConstraintManager } from '@/schema/ConstraintManager';
import { IndexManager } from '@/schema/IndexManager';
import type { NativeOperation } from '@/schema/SchemaGrammar';
import { planningOn } from './Planning';

/**
 * TypeScript's side of the module's schema plan (SchemaPlan): its specs and items as the module reads and writes them, a
 * driver's error as the module's error rules read it, and the plan's actions run with a host. The plan's decisions are
 * the module's, which plans.yaml pins.
 */
describe('SchemaPlan', () => {
    it('writes each kind of spec as the module reads one, and reads it back as it was declared', () => {
        const specs = [
            rangeIndex('Person', ['born', 'name']),
            rangeIndex('Account', 'email', { ignoreCase: true }),
            uniquenessConstraint('Person', 'email', { nodeIdProperty: 'uuid' }),
            vectorIndex('Chunk', 'embedding', 4, 'EUCLIDEAN', {
                hnswM: 24,
                engineOptions: [falkorDbVectorOptions({ efRuntime: 20 })]
            })
        ];
        expect(specs.map(moduleSpec).map((it) => it.kind)).toEqual([
            'RANGE_INDEX',
            'RANGE_INDEX',
            'UNIQUENESS_CONSTRAINT',
            'VECTOR_INDEX'
        ]);
        expect(moduleSpec(specs[3])).toMatchObject({
            properties: ['embedding'],
            dimensions: 4,
            similarity: 'EUCLIDEAN',
            hnswM: 24,
            engineOptions: [{ engine: 'FalkorDB', efRuntime: 20, hnswM: null, hnswEfConstruction: null }]
        });
        for (const spec of specs) {
            expect(planSpec(moduleSpec(spec))).toEqual(spec);
        }
    });

    it("reads an item and a result as the module writes them, a drift's item and a violation's sample kept", () => {
        const spec = vectorIndex('Chunk', 'embedding', 4);
        const existing = { kind: 'VECTOR_INDEX', label: 'Chunk', properties: ['embedding'], name: 'v', dimensions: 3 };
        expect(schemaItem({ ...existing, similarity: null, aliases: ['a'] })).toEqual({
            label: 'Chunk',
            properties: ['embedding'],
            name: 'v',
            dimensions: 3,
            aliases: ['a']
        });
        expect(ensureResult({ drift: { existing, requested: moduleSpec(spec) } }, spec)).toEqual({
            status: 'DRIFT',
            spec,
            found: { label: 'Chunk', properties: ['embedding'], name: 'v', dimensions: 3 }
        });
        const sample = [{ properties: { id: 'a' }, count: 2, nodes: [{ elementId: '1' }] }];
        expect(ensureResult({ violation: { sample } }, spec)).toEqual({ status: 'VIOLATION', spec, sample });
        expect(() => ensureResult({ unknown: {} }, spec)).toThrow("doesn't know: unknown");
    });

    it("gives each driver's error to the module's rules by its state, number or code, and any other by its message", () => {
        const postgres = Object.assign(new Error('duplicate key'), { code: '23505', severity: 'ERROR' });
        const oracle = Object.assign(new Error('ORA-00001'), { errorNum: 1 });
        const sqlite = Object.assign(new Error('UNIQUE constraint failed'), { errcode: 2067 });
        const neo4j = new Neo4jError('timed out', 'Neo.ClientError.Procedure.ProcedureTimedOut');
        const wrapped = Object.assign(new Error('outer'), { rootCause: postgres });
        expect(causes(postgres)).toEqual([
            { sqlState: '23505', vendorCode: 0, code: null, gqlStatus: null, message: 'duplicate key' }
        ]);
        expect(causes(oracle)[0]).toMatchObject({ vendorCode: 1, sqlState: null, code: null });
        expect(causes(sqlite)[0]).toMatchObject({ vendorCode: 2067, message: 'UNIQUE constraint failed' });
        expect(causes(neo4j)[0]).toMatchObject({
            code: 'Neo.ClientError.Procedure.ProcedureTimedOut',
            vendorCode: null
        });
        expect(causes(new Error('Constraint already exists.'))[0]).toEqual({
            sqlState: null,
            vendorCode: null,
            code: null,
            gqlStatus: null,
            message: 'Constraint already exists.'
        });
        expect(causes(wrapped).map((it) => it.message)).toEqual(['outer', 'duplicate key']);
    });

    it("names SchemaOptions where a plan's failure names drivine4j's settings", () => {
        const failure =
            "Schema application for owner 'schema' found problems:\n  - DRIFT: …\n" +
            'Resolve them, set drivine.schema.recreate-on-drift=true (destructive), ' +
            'drivine.schema.replace-blocking-index=true for an index in the way of a constraint, ' +
            'drivine.schema.index-build-timeout longer for an index still being built, ' +
            'or set drivine.schema.mode=WARN to continue with warnings.';
        const named = withOptionNames(failure);
        expect(named).not.toContain('drivine.schema.');
        expect(named).toContain('set recreateOnDrift (destructive), replaceBlockingIndex');
        expect(named).toContain('indexBuildTimeout longer');
        expect(named.startsWith("Schema application for owner 'schema' found problems:\n  - DRIFT: …\n")).toBe(true);
    });

    it("reports an index Neo4j's wait ran out on as still being built, warning of it under WARN", async () => {
        const ran: (string | NativeOperation)[] = [];
        const executor = {
            run: async (statement: string | NativeOperation): Promise<any[]> => {
                ran.push(statement);
                if (typeof statement === 'string' && statement.startsWith('CALL db.awaitIndex')) {
                    return Promise.reject(
                        new Neo4jError('index still populating', 'Neo.ClientError.Procedure.ProcedureTimedOut')
                    );
                }
                return Promise.resolve([]);
            }
        };
        const planning = planningOn('neo4j', executor);
        const ensure = { type: 'ensure', owner: 'build', items: [moduleSpec(rangeIndex('Seeded', 'text'))] };
        // The items an ensure applies are the owner's runtime items, as SchemaManager keeps them.
        const runtime = planning.plan.runtimeOn('default', planning.plan.runtimeAfter(ensure, [], undefined));
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const report = await planning.plan.run(
                planRequest('default', ensure, { mode: 'WARN', buildTimeoutMillis: 5 }, [], runtime),
                planning.host
            );
            expect(report.owners[0].unbuilt.map((it) => it.stillBuilding)).toEqual([true]);
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/RANGE_INDEX 'Seeded_text_range' on Seeded\[text\] is still being built/)
            );
            expect(ran.some((it) => typeof it === 'string' && it.startsWith('CREATE INDEX'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
        // Under FAIL_FAST the owner fails, naming the index, and the options a TypeScript application sets, in what it
        // throws and in what it logs.
        const error = jest.spyOn(DrivineLogger.prototype, 'error').mockImplementation(() => undefined);
        try {
            const failed = planning.plan.run(
                planRequest('default', ensure, { buildTimeoutMillis: 5 }, [], runtime),
                planning.host
            );
            await expect(failed).rejects.toThrow(/Seeded_text_range' on Seeded\[text\] is still being built/);
            await expect(failed).rejects.toThrow(/indexBuildTimeout longer/);
            const logged = error.mock.calls.map((it) => String(it[0]));
            expect(logged.some((it) => it.includes('indexBuildTimeout longer'))).toBe(true);
            expect(logged.filter((it) => it.includes('drivine.schema.'))).toEqual([]);
        } finally {
            error.mockRestore();
        }
    });

    it('throws the error an action got, as it got it, where its failure ends the plan', async () => {
        const reset = new Error('connection reset');
        const executor = {
            run: async (statement: string | NativeOperation): Promise<any[]> =>
                typeof statement === 'string' && statement.startsWith('CREATE') ? Promise.reject(reset) : []
        };
        await expect(planItem(planningOn('neo4j', executor), 'ENSURE', rangeIndex('Person', 'name'))).rejects.toBe(
            reset
        );
    });

    it('throws a graph refused for every owner (ReusedIdsError) out of its round, unanswered, planning nothing more', async () => {
        const module = cypherCompilerModule();
        const asked: string[] = [];
        useCypherCompiler({
            ...module,
            compile: (request: string) => {
                asked.push(request);
                return module.compile(request);
            }
        });
        const refused = new ReusedIdsError('drivine', '/data/graph.db');
        try {
            const executor = { run: async (): Promise<any[]> => Promise.reject(refused) };
            await expect(planItem(planningOn('sqlite', executor), 'ENSURE', rangeIndex('Person', 'name'))).rejects.toBe(
                refused
            );
            expect(asked.some((it) => it.includes('"resume"'))).toBe(false);
        } finally {
            useCypherCompiler(module);
        }
    });

    it("throws IndexManager's recreate where a table stands under the index's name, dropping nothing, as drivine4j", async () => {
        const ran: string[] = [];
        const executor = {
            run: async (statement: string | NativeOperation): Promise<any[]> => {
                ran.push(String(statement));
                // Postgres's listing, which names a table that stands under the range index's name.
                return Promise.resolve(
                    String(statement).includes('SELECT listed')
                        ? [
                              {
                                  type: 'r',
                                  table: null,
                                  where: null,
                                  method: 'heap',
                                  object: 'drivine_ix2_personname_44ce5436'
                              }
                          ]
                        : []
                );
            }
        };
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            await expect(
                new IndexManager(planningOn('postgres', executor)).recreate(rangeIndex('Person', 'name'))
            ).rejects.toThrow(
                "Could not recreate RANGE_INDEX on Person[name]: drivine_ix2_personname_44ce5436, an object Drivine didn't " +
                    'make, stands under its name. Drop or rename it'
            );
        } finally {
            warn.mockRestore();
        }
        // The listing names pg_stat_progress_create_index, as it finds an online build under way (drivine-cypher-spec#381).
        expect(ran.filter((it) => !it.includes('SELECT listed')).some((it) => /DROP|CREATE/i.test(it))).toBe(false);
    });

    it('reads the data once the engine refuses a constraint, a sample size of 0 giving a VIOLATION with none', async () => {
        const ran: string[] = [];
        const executor = {
            run: async (statement: string | NativeOperation): Promise<any[]> => {
                const text = String(statement);
                ran.push(text);
                if (text.includes('CREATE UNIQUE INDEX')) {
                    return Promise.reject(
                        Object.assign(new Error('could not create unique index'), { code: '23505', severity: 'ERROR' })
                    );
                }
                // The build's claim taken, as Postgres's RETURNING gives the claim's time (drivine-cypher-spec#382).
                if (text.includes("'CLAIM:")) {
                    return Promise.resolve(['t1']);
                }
                // The sample of the keys held more than once.
                return Promise.resolve(
                    text.includes("'count', COUNT(*)") ? [{ properties: { email: 'a' }, count: 2, nodes: [] }] : []
                );
            }
        };
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const result = await new ConstraintManager(planningOn('postgres', executor)).ensure(
                uniquenessConstraint('Person', 'email'),
                0
            );
            expect(result).toMatchObject({ status: 'VIOLATION', sample: [] });
        } finally {
            warn.mockRestore();
        }
        const created = ran.findIndex((it) => it.includes('CREATE UNIQUE INDEX'));
        expect(created).toBeGreaterThanOrEqual(0);
        expect(ran.findIndex((it) => it.includes("'count', COUNT(*)"))).toBeGreaterThan(created);
    });

    // An ensure builds a range index online (drivine-cypher-spec#381); where the store refuses that, by the driver's error
    // as this host gives it to the module, the build is run again as one that blocks writes, said once at WARN.
    it.each([
        [
            'oracle',
            / ONLINE'/,
            Object.assign(new Error('ORA-00439: feature not enabled: Online Index Build'), { errorNum: 439 })
        ],
        [
            'postgres',
            /CREATE INDEX CONCURRENTLY/,
            Object.assign(new Error('CREATE INDEX CONCURRENTLY cannot run inside a transaction block'), {
                code: '25001',
                severity: 'ERROR'
            })
        ]
    ] as const)(
        'builds a range index on %s by a statement that blocks writes where the store refuses an online build',
        async (store, online, refusal) => {
            const ran: string[] = [];
            const executor = {
                run: async (statement: string | NativeOperation): Promise<any[]> => {
                    const text = String(statement);
                    ran.push(text);
                    if (online.test(text)) {
                        return Promise.reject(refusal);
                    }
                    // The build's claim taken, as Postgres's RETURNING gives the claim's time (drivine-cypher-spec#382).
                    return Promise.resolve(text.includes("'CLAIM:") ? ['t1'] : []);
                }
            };
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
            try {
                const item = await planItem(planningOn(store, executor), 'ENSURE', rangeIndex('Person', 'name'));
                expect(Object.keys(item.result ?? {})).toEqual(['created']);
                expect(warn).toHaveBeenCalledWith(expect.stringContaining("can't build an index online here"));
            } finally {
                warn.mockRestore();
            }
            const tried = ran.findIndex((it) => online.test(it));
            expect(tried).toBeGreaterThanOrEqual(0);
            // The same index built again after it, not online.
            expect(ran.slice(tried + 1).some((it) => /CREATE INDEX/.test(it) && !online.test(it))).toBe(true);
        }
    );

    it("gives a Postgres build's deadlock to the planner, which waits for the online builds and builds again", async () => {
        // Each statement the plan runs, and whether the plan reads its failure itself (its `ONCE`), so the host runs it
        // once: the planner waits out a deadlock with another session's online build (drivine-cypher-spec#382).
        const ran: { text: string; once: boolean }[] = [];
        const planning = planningOn('postgres', { run: async () => Promise.resolve([]) });
        planning.host.run = async (statement, _parameters, once) => {
            const text = String(statement);
            ran.push({ text, once: once === true });
            if (text.includes("'CLAIM:")) {
                return Promise.resolve(text.startsWith('DELETE') ? ['CLAIM:UNIQUENESS_CONSTRAINT'] : ['t1']);
            }
            if (text.includes('CREATE UNIQUE INDEX') && ran.filter((it) => it.text === text).length === 1) {
                return Promise.reject(
                    Object.assign(new Error('deadlock detected'), { code: '40P01', severity: 'ERROR' })
                );
            }
            return Promise.resolve([]);
        };
        const log = jest.spyOn(DrivineLogger.prototype, 'log').mockImplementation(() => undefined);
        try {
            // Nothing is listed after the build here, so the ensure ends unmade: what it gives is not this test's.
            await new ConstraintManager(planning)
                .ensure(uniquenessConstraint('Person', 'email'))
                .catch(() => undefined);
            expect(log).toHaveBeenCalledWith(
                expect.stringContaining("deadlocked with another session's online build on the same table")
            );
        } finally {
            log.mockRestore();
        }
        const builds = ran.flatMap((it, at) => (it.text.includes('CREATE UNIQUE INDEX') ? [at] : []));
        expect(builds.length).toBeGreaterThanOrEqual(2);
        expect(builds.every((at) => ran[at].once)).toBe(true);
        // Between the deadlock and the build again, the online builds under way are read, as a listing, run again
        // where contended.
        const waited = ran
            .slice(builds[0] + 1, builds[1])
            .filter((it) => it.text.includes('pg_stat_progress_create_index') && it.text.startsWith('SELECT p.pid'));
        expect(waited.length).toBeGreaterThan(0);
        expect(waited.every((it) => !it.once)).toBe(true);
    });

    it("runs FalkorDB's GRAPH.CONSTRAINT as its driver's command", async () => {
        const ran: (string | NativeOperation)[] = [];
        const executor = {
            run: async (statement: string | NativeOperation): Promise<any[]> => {
                ran.push(statement);
                // The constraint is listed, built, as FalkorDB's db.constraints() gives it.
                return Promise.resolve(
                    typeof statement === 'string' && statement.includes('db.constraints()')
                        ? [
                              {
                                  type: 'unique',
                                  label: 'Person',
                                  properties: ['email'],
                                  entitytype: 'NODE',
                                  status: 'OPERATIONAL'
                              }
                          ]
                        : []
                );
            }
        };
        const item = await planItem(planningOn('falkordb', executor), 'DROP', uniquenessConstraint('Person', 'email'));
        expect(item.dropped).toBe(true);
        expect(ran).toContainEqual({ native: 'CONSTRAINT_DROP', label: 'Person', properties: ['email'] });
    });
});
