import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';
import { OracleGraph } from '@/backend/oracle';
import { LayoutVerdict, layoutVerdict } from '@/backend/sql/StoreLayout';
import { planItem, planSpec, SchemaPlan, SchemaPlanning } from '@/schema/SchemaPlan';
import type { NativeOperation } from '@/schema/SchemaGrammar';

/**
 * The indexes and constraints this library makes on Oracle, held to drivine4j's (#696). `store.yaml` holds drivine4j's
 * statements for each schema case, the reference, which the shared module writes byte for byte: this runs `ensure` of
 * each case's spec as an index or constraint manager plans it, on a store that has nothing yet, and holds what it runs to
 * them, item for item. It then holds the module's equality on an indexed property, the fragment the query DSL writes on
 * Oracle (drivine-cypher-spec#235; not yet compiled Cypher's, #753), to the expressions the labelled index or the unique
 * index is made over, as Oracle reads a filter through a function-based index only where its expression is the index's.
 */
const STORE = parse(fs.readFileSync(path.join(__dirname, '../../cypher/store.yaml'), 'utf8'));

interface Case {
    name: string;
    spec: Record<string, any>;
    stores: { oracle?: { form: number; create: string[] } };
}

/** The block that makes the graph's tables where they aren't there: the store's, not an item's. */
const STORE_ENSURING = new OracleGraph('drivine').ensuring;

/** The cases of a range index or a uniqueness constraint: the items made over a node's property, by expression. */
const CASES: Case[] = (STORE.cases as Case[]).filter(
    (it) => ['RANGE_INDEX', 'UNIQUENESS_CONSTRAINT'].includes(it.spec.kind) && it.stores.oracle?.create
);

/** The statements `ensure` of `spec` runs on a store that has nothing yet, past the store's own: those that make it. */
async function ensured(spec: Record<string, any>): Promise<string[]> {
    const ran: string[] = [];
    const made: string[] = [];
    const planning: SchemaPlanning = {
        plan: new SchemaPlan('oracle', 'drivine'),
        database: 'default',
        host: {
            run: async (statement: string | NativeOperation) => {
                ran.push(typeof statement === 'string' ? statement : JSON.stringify(statement));
                return Promise.resolve([]);
            },
            marker: async () => Promise.resolve([]),
            readLowerCopies: async () => Promise.resolve([]),
            fillLowerCopies: async () => Promise.resolve(),
            // Told after each statement that makes or drops an item: the store's own statements and the listings aren't.
            changed: () => {
                made.push(ran[ran.length - 1]);
            }
        }
    };
    await planItem(planning, 'ENSURE', planSpec(spec));
    // The block that makes the store where it isn't there runs first, as before any item.
    return made.filter((it) => it !== STORE_ENSURING);
}

/** The expressions of the index the statement makes over the node table `n`, as the SQL a fragment reads them in. */
function columns(statement: string, index: string): string[] {
    const ddl = statement.replace(/''/g, "'");
    const start = ddl.indexOf(`INDEX IF NOT EXISTS ${index} ON drivine_node n (`);
    expect(start).toBeGreaterThanOrEqual(0);
    // A range index's indexes are built ONLINE, so writes go on while they are built (drivine-cypher-spec#381).
    const open = ddl.indexOf('(', start) + 1;
    const close = open + ddl.slice(open).search(/\)( ONLINE)?';/);
    const body = ddl.slice(open, close);
    return body
        .split(/, (?=CASE WHEN JSON_EXISTS\(n\.labels)/)
        .map((it) => it.replace(/\bn\.(labels|props)\b/g, 'n_.$1'));
}

/** The module's condition `n.<property> = $v`, as compiled Cypher's equality, over a root of `label` with the property indexed. */
function equality(label: string, property: string): string {
    const answer = JSON.parse(
        cypherCompilerModule().compile(
            JSON.stringify({
                store: 'oracle',
                graph: { name: 'drivine', indexedProperties: [[label, property]] },
                fragment: {
                    condition: `n.\`${property.replace(/`/g, '``')}\` = $v`,
                    variables: { n: { node: 'n_', labels: [label] } }
                },
                parameters: { v: 'x' }
            })
        )
    );
    expect(answer.refusal).toBeUndefined();
    return answer.terms[0];
}

describe("Oracle's indexes and constraints, as drivine4j makes them", () => {
    it('should cover each case of a range index and a uniqueness constraint store.yaml holds for Oracle', () => {
        expect(CASES.map((it) => it.name)).toEqual(
            expect.arrayContaining([
                'Range index',
                'Range index over two properties',
                'Uniqueness constraint',
                'Uniqueness constraint over two properties',
                'A property with a dot',
                'A property with a quote',
                'A label with a quote'
            ])
        );
    });

    it.each(CASES.map((it) => [it.name, it] as const))(
        "should make %s with drivine4j's statements, byte for byte",
        async (_name, it) => {
            expect(await ensured(it.spec)).toEqual(it.stores.oracle!.create);
        }
    );

    it("should name a range index's indexes and a constraint's unique index as drivine4j names them in layout 2", async () => {
        const graph = new OracleGraph();
        const range = await ensured({ kind: 'RANGE_INDEX', label: 'Person', properties: ['name'] });
        expect(range.join('\n')).toContain(`CREATE INDEX IF NOT EXISTS ${graph.objectName('ix2', ['name'])} ON`);
        expect(range.join('\n')).toContain(
            `CREATE INDEX IF NOT EXISTS ${graph.objectName('lx2', ['Person', 'name'])} ON drivine_node n (`
        );
        const unique = await ensured({ kind: 'UNIQUENESS_CONSTRAINT', label: 'Person', properties: ['email'] });
        expect(unique.join('\n')).toContain(
            `CREATE UNIQUE INDEX IF NOT EXISTS ${graph.objectName('uq2', ['Person', 'email'])} ON drivine_node n (`
        );
        // No index of layout 1's names: an index of those is an earlier layout's, which the layout verdict drops.
        expect([...range, ...unique].join('\n')).not.toMatch(/drivine_(ix|lx|uq)_/);
    });

    it.each([
        ['Person', 'name'],
        ['Person', 'with.dot'],
        ['Person', '$odd'],
        ["Pers'on", 'name']
    ])(
        "should write an equality on %s.%s over its labelled index's expressions, so Oracle reads it through the index",
        async (label, property) => {
            const graph = new OracleGraph();
            const made = await ensured({ kind: 'RANGE_INDEX', label, properties: [property] });
            const labelled = graph.objectName('lx2', [label, property]);
            const statement = made.find((it) => it.includes(`INDEX IF NOT EXISTS ${labelled} ON`))!;
            const expressions = columns(statement, labelled);
            expect(expressions).toHaveLength(2);
            const term = equality(label, property);
            for (const expression of expressions) {
                expect(term).toContain(expression);
            }
        }
    );

    it("should write an equality on a constrained property over the unique index's expressions", async () => {
        const graph = new OracleGraph();
        const made = await ensured({ kind: 'UNIQUENESS_CONSTRAINT', label: 'OraIssue', properties: ['code'] });
        const unique = graph.objectName('uq2', ['OraIssue', 'code']);
        const statement = made.find((it) => it.includes(`INDEX IF NOT EXISTS ${unique} ON`))!;
        const expressions = columns(statement, unique);
        expect(expressions).toHaveLength(2);
        const term = equality('OraIssue', 'code');
        for (const expression of expressions) {
            expect(term).toContain(expression);
        }
    });

    describe("a graph Drivine 5.0 made, with its own index expressions under layout 1's names", () => {
        const graph = new OracleGraph();
        /** The objects 5.0 made for rangeIndex('Person', 'name') and uniquenessConstraint('Person', 'email'). */
        const made50 = [
            graph.objectName('ix', ['name']),
            graph.objectName('lx', ['Person', 'name']),
            graph.objectName('ix', ['email']),
            graph.objectName('uq', ['Person', 'email'])
        ].map((it) => it.toLowerCase());
        const objects = [
            { name: 'drivine_node', type: 'TABLE' },
            { name: 'drivine_schema', type: 'TABLE' },
            ...made50.map((name) => ({ name, type: 'INDEX' }))
        ];

        it('should have each dropped by its name, with its record, where the graph holds no node of the application', () => {
            const verdict = layoutVerdict('ORACLE', 'drivine', {
                stamps: [{ layout: null }],
                foreignNodes: false,
                objects
            });
            expect(verdict.verdict).toEqual('stamp');
            const stamped = verdict as Extract<LayoutVerdict, { verdict: 'stamp' }>;
            const drops = stamped.drops;
            expect(drops.slice(0, made50.length)).toEqual(made50.map((it) => `DROP INDEX IF EXISTS ${it}`));
            // The records go with them, those naming one as their labelled index too: the next ensure makes each again.
            expect(drops[made50.length]).toEqual(
                `DELETE FROM drivine_schema WHERE LOWER(object_name) IN (${made50
                    .map((it) => `'${it}'`)
                    .join(', ')}) ` +
                    `OR LOWER(JSON_VALUE(details, '$.labelled')) IN (${made50.map((it) => `'${it}'`).join(', ')})`
            );
            expect(drops).toHaveLength(made50.length + 1);
            expect(stamped.parameters).toEqual({ key: 'singleton', layout: 2 });
        });

        it('should be refused whole where the graph holds a node of the application, nothing dropped', () => {
            const verdict = layoutVerdict('ORACLE', 'drivine', {
                stamps: [{ layout: null }],
                foreignNodes: true,
                objects
            });
            expect(verdict.verdict).toEqual('refuse');
        });

        it("should leave alone layout 2's indexes, which are drivine4j's", async () => {
            const current = [
                ...(await ensured({ kind: 'RANGE_INDEX', label: 'Person', properties: ['name'] })),
                ...(await ensured({ kind: 'UNIQUENESS_CONSTRAINT', label: 'Person', properties: ['email'] }))
            ].join('\n');
            const names = [
                graph.objectName('ix2', ['name']),
                graph.objectName('lx2', ['Person', 'name']),
                graph.objectName('ix2', ['email']),
                graph.objectName('uq2', ['Person', 'email'])
            ];
            for (const name of names) {
                expect(current).toContain(` ${name} ON drivine_node`);
            }
            // Beside 5.0's on a graph being stamped: only 5.0's are dropped.
            const verdict = layoutVerdict('ORACLE', 'drivine', {
                stamps: [{ layout: null }],
                foreignNodes: false,
                objects: [...objects, ...names.map((it) => ({ name: it.toLowerCase(), type: 'INDEX' }))]
            });
            expect(verdict.verdict).toEqual('stamp');
            const drops = (verdict as Extract<LayoutVerdict, { verdict: 'stamp' }>).drops.join('\n');
            for (const name of made50) {
                expect(drops).toContain(`DROP INDEX IF EXISTS ${name}`);
            }
            for (const name of names) {
                expect(drops).not.toContain(name.toLowerCase());
            }
        });
    });
});
