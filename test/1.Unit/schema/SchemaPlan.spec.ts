import { Neo4jError } from 'neo4j-driver';
import { DrivineLogger } from '@/logger';
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
        // Under FAIL_FAST the owner fails, naming the index, and the options a TypeScript application sets.
        const failed = planning.plan.run(
            planRequest('default', ensure, { buildTimeoutMillis: 5 }, [], runtime),
            planning.host
        );
        await expect(failed).rejects.toThrow(/Seeded_text_range' on Seeded\[text\] is still being built/);
        await expect(failed).rejects.toThrow(/indexBuildTimeout longer/);
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
