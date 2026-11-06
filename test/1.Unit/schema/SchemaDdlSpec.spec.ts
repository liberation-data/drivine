import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { CATALOG_KINDS } from '@/backend/sql/SqlCatalog';
import { SchemaDdl, SchemaDdlResult } from '@/schema/ddl';

/** The spec's file of Neo4j schema commands. A run without it fails: it is not skipped. */
const FILE = path.join(__dirname, '../../cypher/schema.yaml');

interface Step {
    ddl: string;
    note?: string;
    create?: Record<string, unknown>;
    drop?: Record<string, unknown>;
    await?: boolean;
    reserved?: Record<string, unknown>;
    cypher?: boolean;
    error?: string;
}

interface Case {
    name: string;
    description?: string;
    steps: Step[];
}

function cases(): Case[] {
    if (!fs.existsSync(FILE)) {
        throw new Error(`No spec file ${FILE}: run scripts/sync-cypher-spec.sh <tag>.`);
    }
    return (parse(fs.readFileSync(FILE, 'utf8')) as { cases: Case[] }).cases;
}

/** What the step says the command reads as, in the form `read` gives. */
function expected(step: Step, where: string): Record<string, unknown> {
    const given = [
        step.create && { create: { alias: null, ifNotExists: false, options: {}, ...step.create } },
        step.drop && { drop: { ifExists: false, ...step.drop } },
        step.await && { await: true },
        step.reserved && { reserved: step.reserved },
        step.cypher && { cypher: true },
        step.error !== undefined && { error: step.error }
    ].filter(Boolean);
    if (given.length !== 1) {
        throw new Error(`${where}: a step gives one of create, drop, await, reserved, cypher and error`);
    }
    return given[0] as Record<string, unknown>;
}

/** The options of a spec to create, as a step writes them. */
function options(result: Extract<SchemaDdlResult, { type: 'CREATE' }>): Record<string, unknown> {
    const spec = result.spec;
    if (spec.kind === 'FULLTEXT') {
        return result.analyzer !== undefined ? { analyzer: result.analyzer } : {};
    }
    if (spec.kind !== 'VECTOR') {
        return {};
    }
    const quantization = spec.engineOptions?.find(
        (it) => it.engine === 'Neo4j' && it.quantizationEnabled !== undefined
    );
    return {
        dimensions: spec.dimensions,
        similarity: spec.similarity,
        ...(spec.hnswM !== undefined ? { hnswM: spec.hnswM } : {}),
        ...(spec.hnswEfConstruction !== undefined ? { hnswEfConstruction: spec.hnswEfConstruction } : {}),
        ...(quantization?.engine === 'Neo4j' ? { quantizationEnabled: quantization.quantizationEnabled } : {})
    };
}

/** The result as a step writes it. */
function read(result: SchemaDdlResult): Record<string, unknown> {
    switch (result.type) {
        case 'CREATE':
            return {
                create: {
                    kind: result.spec.kind === 'TEXT' ? 'TEXT_INDEX' : CATALOG_KINDS[result.spec.kind],
                    label: result.spec.label,
                    properties: result.spec.properties,
                    alias: result.alias ?? null,
                    ifNotExists: result.ifNotExists,
                    options: options(result)
                }
            };
        case 'DROP':
            return { drop: { kind: result.kind, name: result.name, ifExists: result.ifExists } };
        case 'AWAIT_INDEXES':
            return { await: true };
        case 'RESERVED':
            return { reserved: { label: result.spec.label, properties: result.spec.properties } };
        case 'REFUSED':
            return { error: result.message };
        default:
            return { cypher: true };
    }
}

/**
 * The spec's `schema.yaml`: each step's Neo4j schema command, given to `SchemaDdl.translate`, reads as the spec, the
 * drop, the wait or the refusal the step says, or as no schema command. drivine4j and drivine-python read the same file.
 */
describe("The spec's schema commands", () => {
    it('are in the spec file', () => {
        expect(cases().length).toBeGreaterThan(0);
    });

    describe.each(fs.existsSync(FILE) ? cases().map((it) => [it.name, it] as const) : [])('%s', (_, schemaCase) => {
        it.each(schemaCase.steps.map((step, i) => [i + 1, step.ddl, step] as const))(
            'step %i: %s',
            (step, ddl, given) => {
                const where = `${schemaCase.name}, step ${step}: ${ddl}`;
                expect({ where, read: read(SchemaDdl.translate(ddl)) }).toEqual({
                    where,
                    read: expected(given, where)
                });
            }
        );
    });
});
