import {
    anyOf,
    CaseInsensitive,
    ConstraintManager,
    CYPHER_LOWER_COPIES,
    CypherBackend,
    DatabaseType,
    FALKORDB_SCHEMA,
    GraphProperty,
    GraphRelationship,
    GraphView,
    IndexManager,
    inventoryKey,
    itemName,
    JsonPacked,
    LowerCopies,
    LowerCopyCatalog,
    madeAs,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NEO4J_SCHEMA,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    not,
    OracleBackend,
    OracleGraph,
    PostgresBackend,
    PostgresGraph,
    PropertyBag,
    RangeIndex,
    rangeIndex,
    Root,
    SchemaCatalog,
    SchemaExecutor,
    schemaGrammarFor,
    TargetModel,
    Unique,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { loweredEntry } from '@/schema/LowerCopyCatalog';
import { loweredQuery, loweredWhere } from '@/dsl/LowerCopyLookups';

@NodeFragment({ labels: ['CiAccount'] })
class CiAccount {
    @NodeId() id: string;
    @CaseInsensitive() email?: string;
    @CaseInsensitive() @GraphProperty('display_name') displayName?: string;
    name?: string;
    @PropertyBag({ flat: true }) extra: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['CiMember'] })
class CiMember {
    @NodeId() id: string;
    @CaseInsensitive() @Unique({ ignoreCase: true }) email?: string;
    @CaseInsensitive() @RangeIndex({ ignoreCase: true }) @GraphProperty('handle_name') handle?: string;
}

@GraphView()
class CiAccountView {
    @Root() account: CiAccount;
    @GraphRelationship({ type: 'CI_KNOWS', target: () => CiAccount }) friends: CiAccount[];
}

const registry = new ModelRegistry();

/** An executor that records each statement it is given, and answers none. */
function recording(ran: string[]): SchemaExecutor {
    return {
        run: async (statement: string): Promise<any[]> => {
            ran.push(statement);
            return Promise.resolve([]);
        }
    } as any as SchemaExecutor;
}
const account: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(CiAccount) };
const view: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(CiAccountView) };

describe('@CaseInsensitive', () => {
    describe('the model', () => {
        it('should name the stored properties a save keeps lowercased copies of, in the order of their fields', () => {
            expect(registry.fragment(CiAccount).lowerCopied).toEqual(['display_name', 'email']);
            expect(registry.fragment(CiMember).lowerCopied).toEqual(['email', 'handle_name']);
        });

        it('should keep a copy under __drivine.lower.<stored name>, written from the property by the store', () => {
            expect(LowerCopies.of('email')).toEqual('__drivine.lower.email');
            expect(LowerCopies.setClause('a', 'email')).toEqual('a.`__drivine.lower.email` = toLower(a.email)');
            expect(LowerCopies.clause('n', [])).toBeUndefined();
        });

        it('should refuse a field that is not text stored as a property of its own', () => {
            const refused =
                (type: Function): (() => void) =>
                () =>
                    new ModelRegistry().fragment(type as any);
            @NodeFragment({ labels: ['CiNumber'] })
            class CiNumber {
                @NodeId() id: string;
                @CaseInsensitive() age: number;
            }
            @NodeFragment({ labels: ['CiStamp'] })
            class CiStamp {
                @NodeId() id: string;
                @CaseInsensitive() @NodeStamp() stamp?: string;
            }
            @NodeFragment({ labels: ['CiBag'] })
            class CiBag {
                @NodeId() id: string;
                @CaseInsensitive() @PropertyBag() bag: Record<string, any> = {};
            }
            @NodeFragment({ labels: ['CiLabels'] })
            class CiLabels {
                @NodeId() id: string;
                @CaseInsensitive() @NodeLabels() kinds: string[] = [];
            }
            @NodeFragment({ labels: ['CiPacked'] })
            class CiPacked {
                @NodeId() id: string;
                @CaseInsensitive() @JsonPacked() packed: string;
            }
            expect(refused(CiNumber)).toThrow(/@CaseInsensitive CiNumber.age is a Number/);
            expect(refused(CiStamp)).toThrow(/is a @NodeStamp field/);
            expect(refused(CiBag)).toThrow(/is a @PropertyBag field/);
            expect(refused(CiLabels)).toThrow(/is a @NodeLabels field/);
            expect(refused(CiPacked)).toThrow(/is a @JsonPacked field/);
        });
    });

    describe('the writes', () => {
        const cypher = new CypherBackend(NEO4J_GRAMMAR);
        const object = Object.assign(new CiAccount(), { id: 'a1', email: 'Ada@X.com' });

        it('should write the copies in a SET of their own after the properties, on every Cypher write path', () => {
            const copies =
                'SET n.`__drivine.lower.display_name` = toLower(n.display_name), ' +
                'n.`__drivine.lower.email` = toLower(n.email)';
            const save = cypher.save(account, object, {}, false, registry).text;
            expect(save).toContain(`SET n += $root.props\n${copies}`);
            expect(cypher.save(account, object, {}, true, registry).text).toContain(copies);
            expect(cypher.fragmentBatch([{ model: account.model as any, objects: [object] }], {}).text).toContain(
                `SET n += row.props ${copies})`
            );
            const patched =
                'FOREACH (x IN CASE WHEN changed THEN [n] ELSE [] END | SET x.`__drivine.lower.display_name` = ' +
                'toLower(x.display_name), x.`__drivine.lower.email` = toLower(x.email))';
            expect(cypher.patchOne(account.model as any).text).toContain(patched);
            expect(cypher.patchMany(account.model as any).text).toContain(patched);
        });

        it('should write the copies of a related node a view saves', () => {
            const saved = Object.assign(new CiAccountView(), {
                account: object,
                friends: [Object.assign(new CiAccount(), { id: 'a2', email: 'Bo@X.com' })]
            });
            expect(cypher.save(view, saved, {}, false, registry).text).toContain(
                'SET t1 += row1.props SET t1.`__drivine.lower.display_name` = toLower(t1.display_name), ' +
                    't1.`__drivine.lower.email` = toLower(t1.email) MERGE'
            );
        });

        it('should write no copy for a fragment with none', () => {
            @NodeFragment({ labels: ['CiPlain'] })
            class CiPlain {
                @NodeId() id: string;
                email?: string;
            }
            const plain: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(CiPlain) };
            const text = cypher.save(plain, Object.assign(new CiPlain(), { id: 'p1' }), {}, false, registry).text;
            expect(text).not.toContain('__drivine.lower');
            expect(new OracleBackend(new OracleGraph()).save(plain, { id: 'p1' }, {}, false).text).not.toContain(
                'lower_node'
            );
        });

        it("should name the copies in Postgres's node and patch steps, which drivine4j's write function writes", () => {
            const postgres = new PostgresBackend(new PostgresGraph());
            const plan = (spec: any): any[] => JSON.parse(spec.parameters._plan);
            expect(plan(postgres.save(account, object, {}, false, registry).spec())[0].lower).toEqual([
                'display_name',
                'email'
            ]);
            const patch = postgres.patchOne(account.model as any).spec({ id: 'a1', set: { email: 'x' }, vectors: {} });
            expect(plan(patch)[0]).toMatchObject({ op: 'patch', lower: ['display_name', 'email'] });
        });

        it("should have Oracle's block write the copies once a save's change is told, and a patch's only when it changed", () => {
            const oracle = new OracleBackend(new OracleGraph());
            const save = oracle.save(account, object, {}, false, registry);
            expect(save.text).toContain('PROCEDURE lower_node(p NUMBER, p_keys VARCHAR2)');
            expect(save.text).toMatch(/OR v_made\);\n\s+lower_node\(v_root, \$x_\d+\);/);
            expect(Object.values(save.bindings)).toContain('["display_name","email"]');
            const patch = oracle.patchOne(account.model as any);
            expect(patch.text).toMatch(/IF v_changed THEN lower_node\(v_root, \$x_lower\d+\); END IF;/);
        });
    });

    describe('the lookup', () => {
        const filled = new Set(['email', 'display_name']);
        const render = (fn: (q: any) => any, target: TargetModel = account, copies: Set<string> = filled) =>
            new CypherBackend(NEO4J_GRAMMAR).renderQuery(loweredQuery(fn, target, copies), target);

        it('should compare eqIgnoreCase and containsIgnoreCase with the copy, the value lowercased by the store', () => {
            const rendered = render((q) => ({
                where: [q.email.eqIgnoreCase('Ada@X.com'), q.displayName.containsIgnoreCase('AD')]
            }));
            expect(rendered.where).toEqual(
                'n.`__drivine.lower.email` = toLower($_q0) AND n.`__drivine.lower.display_name` CONTAINS toLower($_q1)'
            );
            expect(rendered.bindings).toEqual({ _q0: 'Ada@X.com', _q1: 'AD' });
        });

        it('should rewrite within anyOf and not, and leave a property without a filled copy, or an empty value', () => {
            const rendered = render(
                (q) => ({
                    where: [anyOf(q.email.eqIgnoreCase('a'), q.name.eqIgnoreCase('b')), not(q.email.eqIgnoreCase(''))]
                }),
                account,
                new Set(['email'])
            );
            expect(rendered.where).toEqual(
                '(n.`__drivine.lower.email` = toLower($_q0) OR toLower(n.name) = $_q1) AND NOT (toLower(n.email) = $_q2)'
            );
        });

        it("should rewrite a view's root and not a related node, which a load reads as the map it projects", () => {
            const rendered = render(
                (q) => ({ where: [q.account.email.eqIgnoreCase('A'), q.friends.email.eqIgnoreCase('B')] }),
                view
            );
            expect(rendered.where).toContain('n.`__drivine.lower.email` = toLower($_q0)');
            expect(rendered.where).toContain('WHERE toLower(_x0.email) = $_q1');
        });

        it('should leave the query as it is until the copies are filled in', () => {
            const fn = (q: any): any => ({ where: q.email.eqIgnoreCase('A') });
            expect(loweredQuery(fn, account, new Set())).toBe(fn);
            expect(render(fn, account, new Set()).where).toEqual('toLower(n.email) = $_q0');
        });

        it("should rewrite a patch's condition too", () => {
            const where = new CypherBackend(NEO4J_GRAMMAR).renderWhere(
                loweredWhere((q: any) => q.email.eqIgnoreCase('A'), account, filled),
                account
            );
            expect(where.where).toEqual('n.`__drivine.lower.email` = toLower($_q0)');
        });

        it("should lowercase the value in the store on Oracle and Postgres, and read Oracle's copy through its index", () => {
            const fn = (q: any): any => ({ where: q.email.eqIgnoreCase('A') });
            const oracle = new OracleBackend(new OracleGraph());
            expect(oracle.renderQuery(loweredQuery(fn, account, filled), account).where).toContain(
                `JSON_VALUE(n.props, '$."__drivine.lower.email"') = LOWER($_q0)`
            );
            const indexed = oracle.renderQuery(loweredQuery(fn, account, filled), account, [
                { label: 'CiAccount', properties: ['__drivine.lower.email'] }
            ]);
            expect(indexed.where).toMatch(/END = LOWER\(\$_q0\) AND JSON_VALUE/);
            expect(indexed.labelsTested).toEqual(['CiAccount']);
            const postgres = new PostgresBackend(new PostgresGraph());
            expect(postgres.renderQuery(loweredQuery(fn, account, filled), account).where).toContain(
                `(n.props ->> '__drivine.lower.email') = lower(CAST($_q0 AS text))`
            );
        });
    });

    describe('the schema', () => {
        it("should make an item that ignores case over the copies, under its own name, as drivine4j's made() does", () => {
            const range = rangeIndex('Account', 'email', { ignoreCase: true });
            expect(itemName(range)).toEqual('Account_email_ci_range');
            expect(madeAs(range)).toEqual({
                kind: 'RANGE',
                label: 'Account',
                properties: ['__drivine.lower.email'],
                name: 'Account_email_ci_range'
            });
            expect(inventoryKey(range)).toEqual('RANGE_INDEX:Account:__drivine.lower.email:Account_email_ci_range');
            const unique = uniquenessConstraint('Account', 'email', { ignoreCase: true, nodeIdProperty: 'id' });
            expect(inventoryKey(unique)).toEqual(
                'UNIQUENESS_CONSTRAINT:Account:__drivine.lower.email:Account_email_ci_unique'
            );
            // Apart from an item over the property itself.
            expect(inventoryKey(rangeIndex('Account', 'email'))).toEqual(
                'RANGE_INDEX:Account:email:Account_email_range'
            );
            expect(madeAs(rangeIndex('Account', 'email'))).toEqual(rangeIndex('Account', 'email'));
        });

        it('should read ignoreCase from the decorators, over the stored names', () => {
            const items = SchemaCatalog.fromFragments(undefined, CiMember).items;
            expect(items).toEqual([
                uniquenessConstraint('CiMember', 'email', { ignoreCase: true, nodeIdProperty: 'id' }),
                rangeIndex('CiMember', 'handle_name', { ignoreCase: true })
            ]);
        });

        it('should refuse an item that ignores case over a field that keeps no copy', () => {
            @NodeFragment({ labels: ['CiUncopied'] })
            class CiUncopied {
                @NodeId() id: string;
                @Unique({ ignoreCase: true }) email?: string;
            }
            expect(() => SchemaCatalog.fromFragments(undefined, CiUncopied)).toThrow(
                /ignores case, and 'email' is not the property of a @CaseInsensitive field/
            );
        });

        it('should refuse on FalkorDB a constraint over a copy, before anything is filled in (FalkorDB#551)', async () => {
            const ran: string[] = [];
            const executor = recording(ran);
            const filled: string[] = [];
            const copies = {
                fillIn: async (label: string): Promise<void> => {
                    filled.push(label);
                    return Promise.resolve();
                }
            };
            const constraints = new ConstraintManager(executor, FALKORDB_SCHEMA, undefined, copies);
            await expect(
                constraints.ensure(uniquenessConstraint('Account', 'email', { ignoreCase: true }))
            ).rejects.toThrow(/FalkorDB cannot make the uniqueness constraint Account_email_ci_unique/);
            expect(filled).toEqual([]);
            expect(ran).toEqual([]);
        });

        it('should fill the copies in before it makes an index that ignores case, again where it is made anew', async () => {
            const ran: string[] = [];
            const executor = recording(ran);
            const fills: [string, string[], boolean][] = [];
            const copies = {
                fillIn: async (label: string, properties: string[], again: boolean): Promise<void> => {
                    fills.push([label, properties, again]);
                    return Promise.resolve();
                }
            };
            const indexes = new IndexManager(executor, NEO4J_SCHEMA, undefined, copies);
            const result = await indexes.ensure(rangeIndex('Account', 'email', { ignoreCase: true }));
            expect(result.status).toEqual('CREATED');
            expect(result.spec).toEqual(rangeIndex('Account', 'email', { ignoreCase: true }));
            expect(fills).toEqual([['Account', ['email'], true]]);
            expect(ran.filter((it) => it.startsWith('CREATE'))).toEqual([
                'CREATE INDEX Account_email_ci_range IF NOT EXISTS FOR (n:Account) ON (n.`__drivine.lower.email`)'
            ]);
            await indexes.recreate(rangeIndex('Account', 'email', { ignoreCase: true }));
            expect(fills[1]).toEqual(['Account', ['email'], true]);
        });

        it('should refuse an item that ignores case where there is no store to fill the copies in through', async () => {
            const executor = recording([]);
            await expect(
                new IndexManager(executor, NEO4J_SCHEMA).ensure(rangeIndex('Account', 'email', { ignoreCase: true }))
            ).rejects.toThrow(/ignores case, and this manager has no store to fill the lowercased copies in through/);
        });
    });

    describe('the record of copies filled in', () => {
        it('should write an entry as drivine4j does: the JSON array of label and property, only \\ and " escaped', () => {
            expect(loweredEntry('Account', 'email')).toEqual('["Account","email"]');
            expect(loweredEntry('A"c', 'e\\m')).toEqual('["A\\"c","e\\\\m"]');
            expect(CYPHER_LOWER_COPIES.entries([{ e: '["Account","email"]' }, 'not json', '["x"]'])).toEqual([
                ['Account', 'email']
            ]);
        });

        it('should fill in batch by batch until one writes fewer, then record, and know it at once', async () => {
            const ran: [string, Record<string, any> | undefined][] = [];
            const written = [3, 3, 1];
            const run = async (statement: string, bindings?: Record<string, any>): Promise<any[]> => {
                ran.push([statement, bindings]);
                return Promise.resolve(statement.includes('RETURN count(n)') ? [{ count: written.shift() }] : []);
            };
            let resolved = 0;
            const resolve = async (): Promise<number> => Promise.resolve(resolved++);
            const catalog = new LowerCopyCatalog(run, CYPHER_LOWER_COPIES, resolve, 60_000, Date.now, 3);
            await catalog.fillIn('Account', ['email'], false);
            expect(ran.filter(([it]) => it.includes('LIMIT 3'))).toHaveLength(3);
            expect(resolved).toEqual(1);
            expect(ran[ran.length - 1][1]).toEqual({ entry: '["Account","email"]' });
            expect(await catalog.filledIn('Account', 'email')).toBe(true);
        });

        it('should read what another manager recorded once, then again in the background after maxAge', async () => {
            let now = 0;
            let entries = ['["Account","email"]'];
            let reads = 0;
            const run = async (): Promise<any[]> => {
                reads++;
                return Promise.resolve(entries.map((e) => ({ e })));
            };
            const none = async (): Promise<void> => Promise.resolve();
            const catalog = new LowerCopyCatalog(run, CYPHER_LOWER_COPIES, none, 1000, () => now);
            expect(await catalog.filled(['Account'], ['email', 'name'])).toEqual(new Set(['email']));
            expect(reads).toEqual(1);
            entries = ['["Account","email"]', '["Account","name"]'];
            expect(await catalog.filledIn('Account', 'name')).toBe(false);
            expect(reads).toEqual(1);
            now = 1000;
            // Read again in the background; meanwhile, what was read last.
            expect(await catalog.filledIn('Account', 'name')).toBe(false);
            await new Promise((resolve) => setImmediate(resolve));
            expect(await catalog.filledIn('Account', 'name')).toBe(true);
            expect(reads).toEqual(2);
        });

        it("should keep a SQL store's record in its catalog, as drivine4j does", () => {
            const oracle = schemaGrammarFor(DatabaseType.ORACLE, new OracleGraph()).lowerCopies!;
            expect(oracle.record('Account', 'email').statement).toContain(
                "USING (SELECT 'LOWER_COPY' AS kind, 'Account' AS label, '[\"email\"]' AS properties FROM dual) k"
            );
            const postgres = schemaGrammarFor(DatabaseType.POSTGRES, new PostgresGraph()).lowerCopies!;
            expect(postgres.record('Account', 'email').statement).toEqual(
                'INSERT INTO drivine_schema (kind, label, properties, name, object_name, details) VALUES ' +
                    "('LOWER_COPY', 'Account', '[\"email\"]', NULL, NULL, '{}') ON CONFLICT (kind, label, properties) DO NOTHING"
            );
            expect(postgres.entries([{ label: 'Account', properties: '["email"]' }])).toEqual([['Account', 'email']]);
        });
    });
});
