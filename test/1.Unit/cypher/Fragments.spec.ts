import neo4j from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { fragment, FragmentPart, FragmentVariable, SharedGraph, SharedStore } from '@/cypher/SharedCypherCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';
import { digestOf, loadFragmentsSpec, parametersOf, partOf } from '../../cypher/FragmentsSpec';

const STORES: SharedStore[] = ['postgres', 'oracle', 'sqlite'];

const PEOPLE: Record<string, FragmentVariable> = { n: { node: 'people_', labels: ['Person'] } };

/**
 * The parts of a statement the library writes itself, as the shared module compiles them (`fragment`): a condition, a
 * value or an order over rows of the library's SQL, its parameters bound as a compiled statement's are, and one
 * statement's fragments named apart (`SqlFragments`).
 */
describe('fragment', () => {
    describe.each(STORES)('on %s', (store) => {
        const graph = { name: 'g', indexedProperties: [['Person', 'name']] as [string, string][] };

        it("compiles a condition over the library's row, its parameter bound by the module's name for it", () => {
            const compiled = fragment(store, graph, { condition: 'n.name = $p' }, PEOPLE, { p: 'Ada' });
            expect(compiled.terms).toHaveLength(1);
            expect(compiled.terms[0]).toContain('people_.props');
            // On Oracle an equality of an indexed property compares the property's key with the parameter's.
            expect(compiled.parameters).toEqual(store === 'oracle' ? { _cyk_p: 'Ada' } : { _cy_p: '"Ada"' });
            expect(compiled.terms[0]).toContain(store === 'oracle' ? '$_cyk_p' : '$_cy_p');
            expect(compiled.hints).toEqual(store === 'oracle' ? ['NO_JSON_TABLE_TRANSFORM'] : []);
            expect(compiled.nonFinite).toBe(false);
        });

        it('compiles a value, and an order both ways, with no parameters', () => {
            const value = fragment(store, graph, { value: 'n.born' }, PEOPLE);
            expect(value.terms).toHaveLength(1);
            expect(value.parameters).toEqual({});
            const ascending = fragment(store, graph, { order: 'n.age' }, PEOPLE);
            const descending = fragment(store, graph, { order: 'n.age', descending: true }, PEOPLE);
            expect(ascending.terms.length).toBeGreaterThan(0);
            expect(descending.terms).not.toEqual(ascending.terms);
            expect(descending.terms.join()).toContain('DESC');
        });

        it('binds a Date as the datetime it is, and a driver date as a date, as a statement binds them', () => {
            const at = fragment(store, graph, { condition: 'n.seen < $t' }, PEOPLE, {
                t: new Date('2020-01-01T00:00:00.000Z')
            });
            expect(Object.keys(at.parameters)).toEqual(['_cy_t']);
            expect(JSON.parse(at.parameters._cy_t)).toMatchObject({ $t: 'datetime', v: '2020-01-01T00:00:00Z' });
            const on = fragment(store, graph, { condition: 'n.born < $d' }, PEOPLE, {
                d: new neo4j.types.Date(1900, 1, 1)
            });
            expect(JSON.parse(on.parameters._cy_d)).toMatchObject({ $t: 'date', v: '1900-01-01' });
        });

        it("refuses a form the module doesn't take, and a row whose alias doesn't end with _, as a DrivineError", () => {
            expect(() => fragment(store, graph, { condition: 'count(n) > 1' }, PEOPLE)).toThrow(
                new DrivineError(
                    "The fragment API doesn't take count(): a fragment is a condition, a value or an order of the forms compiler/README.md lists. count(n) > 1"
                )
            );
            expect(() => fragment(store, graph, { condition: 'n.x = 1' }, { n: { node: 'people' } })).toThrow(
                /A fragment's variable n is a row whose name ends with _/
            );
        });

        it("throws a request the module can't read as a DrivineError that says so", () => {
            expect(() => fragment(store, graph, {} as FragmentPart, PEOPLE)).toThrow(
                new DrivineError(
                    "The Cypher compiler can't read the fragment's request: A fragment gives one of condition, value and order."
                )
            );
        });
    });

    it('names the parameters of two fragments of one statement apart, and gathers what they bind and their hints', () => {
        const fragments = new SqlFragments('oracle', { name: 'g' });
        const first = fragments.condition(PEOPLE, 'n.name = $p AND n.tag <> $pp', { p: 'Ada', pp: "'$p'" });
        const second = fragments.condition(PEOPLE, (name) => `n.age > ${name('p')}`, { p: 36 });
        const order = fragments.order(PEOPLE, 'n.age', true);
        // On Oracle a property compared by its key binds the parameter's key, `_cyk_`, and otherwise its JSON, `_cy_`.
        expect(first).toContain('$_cyk_f1_p,');
        expect(first).toContain('$_cyk_f1_pp,');
        expect(second).toContain('$_cy_f2_p)');
        expect(order.length).toBeGreaterThan(0);
        expect(fragments.parameters).toEqual({ _cyk_f1_p: 'Ada', _cyk_f1_pp: "'$p'", _cy_f2_p: '36' });
        expect([...fragments.hints]).toEqual(['NO_JSON_TABLE_TRANSFORM']);
        expect(fragments.nonFinite).toBe(false);
    });

    it("renames a parameter's name whole, and not in a quoted text or a name in backticks", () => {
        const fragments = new SqlFragments('postgres', { name: 'g' });
        const term = fragments.condition(PEOPLE, "n.id = $id AND n.`$id` = '$id' AND n.ids = $idList", {
            id: 'a',
            idList: 'b'
        });
        expect(term).toContain('CAST($_cy_f1_id AS jsonb)');
        expect(term).toContain('CAST($_cy_f1_idList AS jsonb)');
        expect(term).toContain(`(people_.props -> '$$id') = CAST('"$id"' AS jsonb)`);
        expect(fragments.parameters).toEqual({ _cy_f1_id: '"a"', _cy_f1_idList: '"b"' });
    });

    it('gathers whether a fragment may give NaN', () => {
        const fragments = new SqlFragments('postgres', { name: 'g' });
        fragments.condition(PEOPLE, 'n.x = $p', { p: NaN });
        expect(fragments.nonFinite).toBe(true);
        // A later fragment that gives none leaves it so: the statement still binds the first's NaN.
        fragments.condition(PEOPLE, 'n.x = $p', { p: 1.5 });
        expect(fragments.nonFinite).toBe(true);
    });

    it('renames a parameter named by a number, `$0`, as the module takes one', () => {
        const fragments = new SqlFragments('postgres', { name: 'g' });
        const term = fragments.condition(PEOPLE, 'n.x = $0 AND n.y = $10', { '0': 'a', '10': 'b' });
        expect(term).toContain('CAST($_cy_f1_0 AS jsonb)');
        expect(term).toContain('CAST($_cy_f1_10 AS jsonb)');
        expect(fragments.parameters).toEqual({ _cy_f1_0: '"a"', _cy_f1_10: '"b"' });
    });

    it("gathers whether a fragment calls Oracle's stored nullsEqual, and keeps it past a fragment that doesn't", () => {
        const fragments = new SqlFragments('oracle', { name: 'g' });
        expect(fragments.condition(PEOPLE, 'n.a = [1, null]')).toContain('g_nulls_equal(');
        fragments.condition(PEOPLE, 'n.a = 1');
        expect(fragments.callsStoredNullsEqual).toBe(true);
        expect(fragments.callsStoredEra).toBe(false);
    });
});

/**
 * The spec's fragments.yaml: each case's terms on each store are those it pins, and each of the table's forms, in each
 * position or as an order both ways, gives the terms its digests pin. Its rows are checked on each store by
 * test/2.Integration/cypher/FragmentsSpec.spec.ts.
 */
describe('fragments.yaml', () => {
    const spec = loadFragmentsSpec();
    const graph: SharedGraph = { name: spec.graph, indexedProperties: spec.indexed };

    describe.each(STORES)('on %s', (store) => {
        it.each(spec.cases.map((it) => [it.name, it] as const))('%s', (_, it) => {
            const compiled = fragment(store, graph, partOf(it), spec.variables, parametersOf(it.parameters));
            expect(compiled.terms).toEqual(it.sql[store]);
        });

        it("gives each of the table's forms the terms its digests pin", () => {
            const wrong: string[] = [];
            for (const entry of spec.table.conditions) {
                spec.table.positions.forEach((position, at) => {
                    const condition = position.replace('{f}', entry.form);
                    const terms = fragment(
                        store,
                        graph,
                        { condition },
                        spec.variables,
                        parametersOf(entry.parameters)
                    ).terms;
                    if (digestOf(terms) !== entry.digests[store][at]) {
                        wrong.push(condition);
                    }
                });
            }
            for (const entry of spec.table.orders) {
                [false, true].forEach((descending, at) => {
                    const terms = fragment(store, graph, { order: entry.value, descending }, spec.variables).terms;
                    if (digestOf(terms) !== entry.digests[store][at]) {
                        wrong.push(`ORDER BY ${entry.value}${descending ? ' DESC' : ''}`);
                    }
                });
            }
            expect(wrong).toEqual([]);
        });
    });
});
