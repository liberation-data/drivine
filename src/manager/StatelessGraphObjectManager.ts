import { GraphBackend } from '@/backend/GraphBackend';
import { ClassKind } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { FragmentRow, GraphObjectMapper, ViewRow } from '@/mapper/GraphObjectMapper';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { SaveOptions } from '@/manager/SaveOptions';
import { PatchOptions, PatchResult } from '@/manager/PatchResult';
import { PatchStatements } from '@/backend/PatchStatements';
import { propsOf } from '@/backend/SaveStatementBuilder';
import { NullPolicy } from '@/manager/NullPolicy';
import { ObjectUtils } from '@/utils/ObjectUtils';
import { whenNotContended } from '@/manager/Contention';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { StaleObjectException } from '@/manager/StaleObjectException';
import { Stamps } from '@/model/Stamps';
import { SaveStatement } from '@/backend/SaveStatement';
import { FragmentBatchStatement, FragmentGroup } from '@/backend/FragmentBatchStatement';
import { GraphStatement } from '@/backend/GraphStatement';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { FalkorDbConnectionProvider } from '@/connection/falkordb/FalkorDbConnectionProvider';
import { TransactionMode } from '@/connection/TransactionMode';
import { NonAtomicBatchException } from '@/manager/NonAtomicBatchException';
import { StaleInBatch } from '@/manager/StaleInBatch';
import { EdgeOperations } from '@/manager/EdgeOperations';
import { GroupOperations } from '@/manager/GroupOperations';
import { DrivineLogger } from '@/logger';
import { ModelRegistry } from '@/model/ModelRegistry';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { ClassRef, ClassType } from '@/query/QuerySpecification';

/**
 * Loads, saves and deletes decorated objects. It keeps nothing between calls: what a call does depends only on its
 * arguments and what is in the store.
 *
 * A filter is a Cypher predicate over the node, which statements call `n`: `"n.name STARTS WITH $prefix"`. Values
 * go in `bindings`, never into the predicate's text.
 */
/** How a load filters, and how deep it follows recursive relationships. */
export interface LoadOptions {
    /** A Cypher predicate over the root, `n`. */
    where?: string;
    bindings?: Record<string, any>;
    /** maxDepth overrides for this load, by relationship field name. */
    depth?: Record<string, number>;
}

function loadOptions(where: string | LoadOptions | undefined, bindings: Record<string, any>): Required<LoadOptions> {
    const options = typeof where === 'object' ? where : { where, bindings };
    for (const [field, depth] of Object.entries(options.depth ?? {})) {
        if (!Number.isInteger(depth) || depth < 1) {
            throw new DrivineError(`The depth of ${field} must be a whole number of at least 1.`);
        }
    }
    return { where: options.where as string, bindings: options.bindings ?? {}, depth: options.depth ?? {} };
}

/** How many times `update` loads and applies its change before a stale save is thrown. */
export const UPDATE_ATTEMPTS = 3;

/** How many rows of a patchAll go to one statement. */
export const PATCH_ROWS = 1000;

/** How many fragments of a saveAll go to one statement. */
export const BATCH_ROWS = 1000;

/** The row a save statement returns: see SaveStatement. */
interface SaveResult {
    found: string;
    now: string;
    related: { before: { id: any; stamp: string }[]; after: { id: any; stamp: string }[] }[];
}

/** A statement of a saveAll, and what its result is handed back to. */
interface BatchEntry<T> {
    spec: GraphStatement;
    view?: { object: T; statement: SaveStatement };
    groups?: FragmentGroup[];
}

/** The groups of a batch statement, split so that no statement holds more than `size` rows. */
function chunked(groups: FragmentGroup[], size: number): FragmentGroup[][] {
    const chunks: FragmentGroup[][] = [];
    let current: FragmentGroup[] = [];
    let rows = 0;
    for (const group of groups) {
        for (let start = 0; start < group.objects.length; start += size) {
            const objects = group.objects.slice(start, start + size);
            if (rows + objects.length > size && current.length) {
                chunks.push(current);
                current = [];
                rows = 0;
            }
            current.push({ model: group.model, objects });
            rows += objects.length;
        }
    }
    if (current.length) {
        chunks.push(current);
    }
    return chunks;
}

export class StatelessGraphObjectManager {
    /** Relationships on their own, between stored nodes: see EdgeOperations. */
    readonly edges: EdgeOperations;
    /** Grouped reads: see GroupOperations. */
    readonly groups: GroupOperations;

    private readonly logger = new DrivineLogger(StatelessGraphObjectManager.name);
    private warnedNonAtomic = false;

    private readonly mapper: GraphObjectMapper;

    constructor(
        readonly persistenceManager: PersistenceManager,
        readonly backend: GraphBackend,
        readonly registry: ModelRegistry
    ) {
        this.mapper = new GraphObjectMapper(registry);
        this.edges = new EdgeOperations(
            registry,
            async <R>(statement: GraphStatement) =>
                this.whenUncontended(async () => this.persistenceManager.getOne<R>(statement.spec())),
            async (statement: GraphStatement) => this.persistenceManager.query(statement.spec()),
            this.mapper
        );
        this.groups = new GroupOperations(
            registry,
            async (statement: GraphStatement) => this.persistenceManager.query(statement.spec()),
            this.mapper
        );
    }

    /** Which database this manager works on. */
    get database(): string {
        return this.persistenceManager.database;
    }

    /**
     * Loads every object of the class, optionally filtered: `where` is a Cypher predicate over the root, `n`, with
     * values in `bindings`. Give a LoadOptions instead to override a recursive relationship's maxDepth for this load.
     */
    async loadAll<T>(
        type: ClassRef<T>,
        where?: string | LoadOptions,
        bindings: Record<string, any> = {}
    ): Promise<T[]> {
        const options = loadOptions(where, bindings);
        const target = this.modelOf(type);
        if (target.kind === 'GRAPH_VIEW') {
            const rows = await this.persistenceManager.query<ViewRow>(
                this.backend.loadAllViews(target.model, options.where, options.depth).spec(options.bindings)
            );
            return rows.map((row) => this.mapper.view<T>(target.model, row));
        }
        const rows = await this.persistenceManager.query<FragmentRow>(
            this.backend.loadAllFragments(target.model, options.where).spec(options.bindings)
        );
        return rows.map((row) => this.mapper.fragment<T>(target.model, row));
    }

    async load<T>(type: ClassRef<T>, id: unknown, options: Pick<LoadOptions, 'depth'> = {}): Promise<T | undefined> {
        const target = this.modelOf(type);
        const statement =
            target.kind === 'GRAPH_VIEW'
                ? this.backend.loadView(target.model, options.depth)
                : this.backend.loadFragment(target.model);
        const rows = await this.persistenceManager.query<any>(statement.spec({ id }));
        if (rows.length > 1) {
            throw new DrivineError(`${rows.length} ${type.name} roots have the id ${String(id)}. An id is one node's.`);
        }
        if (!rows.length) {
            return undefined;
        }
        return target.kind === 'GRAPH_VIEW'
            ? this.mapper.view<T>(target.model, rows[0])
            : this.mapper.fragment<T>(target.model, rows[0]);
    }

    async count(type: ClassRef, where?: string, bindings: Record<string, any> = {}): Promise<number> {
        const target = this.modelOf(type);
        const statement =
            target.kind === 'GRAPH_VIEW'
                ? this.backend.countViews(target.model, where)
                : this.backend.countFragments(target.model, where);
        return this.persistenceManager.getOne<number>(statement.spec(bindings));
    }

    /**
     * Writes the object as one statement: its root, merged on its id, with every property that is not null, and for a
     * view each related node and the relationship to it. Relationships are added, never removed, except those of the
     * fields named in `options.replace`. Returns the object.
     *
     * Outside a transaction, a save the engine turns away because another writer held what it writes is run again,
     * after a pause. Inside one, it fails, and the transaction's owner decides.
     */
    async save<T extends object>(object: T, options: SaveOptions<T> = {}): Promise<T> {
        return (await this.write(object, options, false))!;
    }

    /**
     * Makes the object's node only if no node has its id, in one statement, as `save` would make it. When one has,
     * nothing at all is written and undefined is returned: it is then for `update` to merge into what is there.
     * An object that carries a stamp was loaded, and is refused.
     */
    async create<T extends object>(object: T): Promise<T | undefined> {
        return this.write(object, {}, true);
    }

    /**
     * Loads the object, applies `change`, and writes what the change altered: the root's fields that differ, a field
     * set to null cleared, and for a view each relationship list that lost an item replaced (lists that only grew are
     * added to). The save is checked against the stamp that was loaded; if the node changed meanwhile, it is loaded
     * again and the change applied again, `attempts` times in all, then StaleObjectException is thrown. Without a
     * `@NodeStamp` field a change by another writer is not noticed.
     *
     * `change` may change the object it is given or return a copy, but not give it another id or class. Returns the
     * saved object, or undefined when there is no such node or it is deleted meanwhile. A related node is written
     * whole, as `save` writes it.
     */
    async update<T extends object>(
        type: ClassRef<T>,
        id: unknown,
        change: (loaded: T) => T | void | Promise<T | void>,
        attempts: number = UPDATE_ATTEMPTS
    ): Promise<T | undefined> {
        const target = this.modelOf(type);
        for (let attempt = 1; ; attempt++) {
            const loaded = await this.load(type, id);
            if (loaded === undefined) {
                return undefined;
            }
            const before = ObjectUtils.deepCopy(loaded);
            const changed = ((await change(loaded)) ?? loaded) as T;
            const options = this.changeOf(target, before, changed);
            try {
                return await this.write(changed, options, false);
            } catch (failure) {
                if (!(failure instanceof StaleObjectException) || failure.id !== id || attempt >= attempts) {
                    throw failure;
                }
                if (failure.deleted) {
                    return undefined;
                }
            }
        }
    }

    /**
     * Writes named fields of the node with the id, if it meets `options.where`, in one statement, without loading it.
     * It never makes a node, is not checked against a stamp, and hands none back: a node it changed has a new stamp,
     * so an object loaded before is refused when saved. On a view, the fields are its root's.
     */
    async patch(type: ClassRef, id: unknown, options: PatchOptions): Promise<PatchResult> {
        const target = this.modelOf(type);
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const set: Record<string, any> = {};
        const named = [...Object.keys(options.set ?? {}), ...(options.clear ?? [])];
        this.assertPatchable(root, named);
        for (const field of named) {
            const value = options.set?.[field] ?? null;
            set[root.graphProperties.get(field) ?? field] =
                value != null && root.jsonPacked.has(field) ? JSON.stringify(value) : value;
        }
        const statement = PatchStatements.one(root, options.where);
        return this.whenUncontended(async () =>
            this.persistenceManager.getOne<PatchResult>(statement.spec({ ...options.bindings, id, set }))
        );
    }

    /**
     * Writes named fields of many nodes, each where its node is there, making none. One result per object, in order.
     * `only` or `except` is required: to write every field, save. Under NullPolicy.IGNORE, the default, a named field
     * that is null is left as the store has it. For a view the fields are its root's; its relationships aren't written.
     */
    async patchAll<T extends object>(
        objects: T[],
        options: { only?: string[]; except?: string[]; nullPolicy?: NullPolicy }
    ): Promise<PatchResult[]> {
        if (!objects.length) {
            return [];
        }
        if (!options.only === !options.except) {
            throw new DrivineError(
                'patchAll needs only or except, not both. To write every field of an object, save it.'
            );
        }
        const type = objects[0].constructor as ClassType;
        if (objects.some((it) => it.constructor !== type)) {
            throw new DrivineError(`patchAll takes objects of one class; the first is a ${type.name}.`);
        }
        const target = this.modelOf(type);
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        this.assertPatchable(root, options.only ?? []);
        const fragmentOf = (it: any): any => (target.kind === 'GRAPH_VIEW' ? it[target.model.rootField] : it);
        const keep = (field: string): boolean =>
            options.only ? options.only.includes(field) : !options.except!.includes(field);
        const rows = objects.map((object) => {
            const fragment = fragmentOf(object);
            const id = fragment?.[root.nodeIdField!];
            if (id == null) {
                throw new DrivineError(`A ${root.type.name} to patch has no ${root.nodeIdField}.`);
            }
            const fields = Object.fromEntries(
                Object.entries(fragment).filter(
                    ([field]) =>
                        keep(field) &&
                        field !== root.nodeIdField &&
                        field !== root.stampField &&
                        !root.propertyBags.some((bag) => bag.field === field) &&
                        root.nodeLabels?.field !== field
                )
            );
            return { id, props: propsOf(root, fields, [], options.nullPolicy === NullPolicy.CLEAR) };
        });
        const ids = rows.map((it) => it.id);
        if (new Set(ids).size !== ids.length) {
            throw new DrivineError('patchAll takes each id once.');
        }
        // In order of id, so that two calls over the same nodes take their locks in the same order.
        const sorted = [...rows].sort((a, b) =>
            String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
        );
        const results = new Map<any, PatchResult>();
        for (let start = 0; start < sorted.length; start += PATCH_ROWS) {
            const chunk = sorted.slice(start, start + PATCH_ROWS);
            const found = await this.whenUncontended(async () =>
                this.persistenceManager.query<PatchResult & { id: any }>(
                    PatchStatements.many(root).spec({ rows: chunk })
                )
            );
            found.forEach((it) => results.set(it.id, { found: it.found, applied: it.found, changed: it.changed }));
        }
        return ids.map((id) => results.get(id)!);
    }

    /**
     * Saves many objects, fragments and views of any classes, together. Fragments go in one statement (per 1,000),
     * each merged on its id; a view is a statement of its own, as `save` writes it. Outside a transaction of the
     * caller's, the statements run in one transaction, so a failure leaves nothing written; inside one, they join it.
     *
     * A fragment's stamp is not checked: a batch only adds, and a fragment with a stale stamp is written all the same,
     * keeping the stamp it had. A view that carries a stamp is checked as `save` checks it, and a stale one throws
     * StaleObjectException, the batch then writing nothing. FalkorDB has no transactions: a batch of more than one
     * statement runs statement by statement in WARN mode, and is refused with NonAtomicBatchException in STRICT.
     *
     * `replace` applies to views: a batch holding a fragment is refused with it. Returns the objects, in order.
     */
    async saveAll<T extends object>(objects: T[], options: SaveOptions<T> = {}): Promise<T[]> {
        const fragments = new Map<Function, FragmentGroup>();
        const views: T[] = [];
        for (const object of objects) {
            const target = this.modelOf(object.constructor as ClassType);
            // A view, or a fragment with a property bag, whose entries no row of a batch can carry, is a statement of
            // its own.
            if (target.kind === 'GRAPH_VIEW' || target.model.propertyBags.length || target.model.nodeLabels) {
                views.push(object);
            } else {
                if (options.replace) {
                    throw new DrivineError(`replace applies to views. The batch holds a ${target.model.type.name}.`);
                }
                const group = fragments.get(target.model.type) ?? { model: target.model, objects: [] };
                group.objects.push(object);
                fragments.set(target.model.type, group);
            }
        }
        const statements: BatchEntry<T>[] = [];
        for (const chunk of chunked([...fragments.values()], BATCH_ROWS)) {
            statements.push({ spec: FragmentBatchStatement.build(chunk, options), groups: chunk });
        }
        for (const view of views) {
            const statement = this.backend.save(
                this.modelOf(view.constructor as ClassType),
                view,
                options,
                false,
                this.registry
            );
            statements.push({ spec: statement, view: { object: view, statement } });
        }
        const results = await this.runBatch(statements.map((it) => it.spec));
        results.forEach((rows, i) => {
            const entry: BatchEntry<T> = statements[i];
            if (entry.view) {
                this.handBack(entry.view.object, entry.view.statement, rows[0]);
            } else {
                this.handBackFragments(entry.groups!, rows[0]);
            }
        });
        return objects;
    }

    /**
     * Deletes the object whose root has the id, with the root's relationships. A view's root is deleted only if it
     * meets the view's requirements, and `where`, a predicate over `n`, when given. A cascade deletes nodes the view
     * reaches too. Returns the number of roots deleted: 1, or 0 when there was none.
     */
    async delete(
        type: ClassType,
        id: unknown,
        options: { where?: string; bindings?: Record<string, any>; cascade?: CascadeType } = {}
    ): Promise<number> {
        const statement = this.backend.delete(this.modelOf(type), options.where, options.cascade);
        return this.persistenceManager.getOne<number>(statement.spec({ ...options.bindings, id }));
    }

    /**
     * Deletes every object a load with the same filter would find: its root, with the root's relationships. Without a
     * filter, every one. Returns the number deleted.
     */
    async deleteAll(type: ClassRef, where?: string, bindings: Record<string, any> = {}): Promise<number> {
        return this.persistenceManager.getOne<number>(this.backend.deleteAll(this.modelOf(type), where).spec(bindings));
    }

    /**
     * What a change altered, as save options. The stamp the object was loaded with is put back, so the save is checked
     * against it whatever the change did with the object's.
     */
    private changeOf(target: TargetModel, before: any, changed: any): SaveOptions<any> {
        if (changed?.constructor !== before.constructor) {
            throw new DrivineError(
                `An update of a ${before.constructor.name} must leave it one, not a ${changed?.constructor?.name}.`
            );
        }
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const [rootBefore, rootAfter] =
            target.kind === 'GRAPH_VIEW'
                ? [before[target.model.rootField], changed[target.model.rootField]]
                : [before, changed];
        if (rootAfter?.[root.nodeIdField!] !== rootBefore[root.nodeIdField!]) {
            throw new DrivineError(
                `An update of ${root.type.name} '${rootBefore[root.nodeIdField!]}' can't give it another id.`
            );
        }
        if (root.stampField) {
            rootAfter[root.stampField] = rootBefore[root.stampField];
        }
        const ignored = new Set([root.nodeIdField, root.stampField, ...root.transientFields]);
        const fields = new Set([...Object.keys(rootBefore), ...Object.keys(rootAfter)]);
        const only = [...fields].filter(
            (it) => !ignored.has(it) && !ObjectUtils.deepEqual(rootBefore[it], rootAfter[it])
        );
        if (only.some((it) => rootAfter[it] == null)) {
            for (const it of only) {
                rootAfter[it] = rootAfter[it] ?? null;
            }
        }
        const replace =
            target.kind === 'GRAPH_VIEW'
                ? target.model.relationships
                      .filter((rel) => {
                          const after = new Set(relatedIds(rel, changed[rel.field]));
                          return relatedIds(rel, before[rel.field]).some((it) => !after.has(it));
                      })
                      .map((rel) => rel.field)
                : [];
        return { only, nullPolicy: NullPolicy.CLEAR, ...(replace.length ? { replace } : {}) };
    }

    /**
     * Runs statements as one batch: joining the caller's transaction if there is one, otherwise in a transaction of
     * its own on one connection, rolled back on failure and run again when the engine turns it away for contention.
     * A checked save that finds its root stale (it returns no row) fails the batch. FalkorDB can't hold a transaction,
     * so there a batch of more than one statement is run statement by statement, or refused in STRICT mode.
     */
    private async runBatch(specs: GraphStatement[]): Promise<any[][]> {
        if (specs.length === 0) {
            return [];
        }
        const provider = DatabaseRegistry.getInstance().connectionProvider(this.persistenceManager.database);
        if (specs.length > 1 && provider instanceof FalkorDbConnectionProvider) {
            if (provider.transactionMode === TransactionMode.STRICT) {
                throw new NonAtomicBatchException('FalkorDB', specs.length);
            }
            this.warnNonAtomic(specs.length);
        }
        const runEach = async (query: (spec: GraphStatement) => Promise<any[]>): Promise<any[][]> => {
            const results: any[][] = [];
            for (const spec of specs) {
                const rows = await query(spec);
                if (spec instanceof SaveStatement && spec.expectedStamp != null && rows.length === 0) {
                    throw new StaleInBatch(spec);
                }
                results.push(rows);
            }
            return results;
        };
        try {
            if (TransactionContextHolder.getInstance().currentTransaction || specs.length === 1 || !provider) {
                return await this.whenUncontended(async () =>
                    runEach(async (spec) => this.persistenceManager.query(spec.spec()))
                );
            }
            return await this.whenUncontended(async () => {
                const connection = await provider.connect();
                try {
                    await connection.startTransaction();
                    const results = await runEach(async (spec) => {
                        try {
                            return await connection.query(spec.spec());
                        } catch (e) {
                            throw DrivineError.withRootCause(e as Error, spec.spec());
                        }
                    });
                    await connection.commitTransaction();
                    await connection.release();
                    return results;
                } catch (e) {
                    await connection.rollbackTransaction().catch(() => undefined);
                    await connection.release(e as Error);
                    throw e;
                }
            });
        } catch (failure) {
            if (failure instanceof StaleInBatch) {
                throw await this.staleObject(failure.statement);
            }
            throw failure;
        }
    }

    private warnNonAtomic(statements: number): void {
        if (!this.warnedNonAtomic) {
            this.warnedNonAtomic = true;
            this.logger.warn(
                `A batch of ${statements} statements runs statement by statement on FalkorDB, which has no ` +
                    `multi-statement transactions: a failure part way leaves what ran before it.`
            );
        }
    }

    /** Gives each fragment of a batch the stamp the batch left, as far as it was current. */
    private handBackFragments(groups: FragmentGroup[], result: { groups: SaveResult['related'] }): void {
        groups.forEach((group, i) => {
            if (!group.model.stampField) {
                return;
            }
            const found = new Map(result.groups[i].before.map((it) => [it.id, it.stamp]));
            const now = new Map(result.groups[i].after.map((it) => [it.id, it.stamp]));
            for (const object of group.objects) {
                const id = object[group.model.nodeIdField!];
                object[group.model.stampField] = Stamps.handedBack(
                    object[group.model.stampField],
                    found.get(id) ?? '',
                    now.get(id)!
                );
            }
        });
    }

    /**
     * Under NullPolicy.CLEAR, a root with property bags is read first for the keys it holds, so that a save removes the
     * entries a bag no longer has: one more statement, which writes nothing.
     */
    private async withHeldKeys<T extends object>(object: T, options: SaveOptions<T>): Promise<SaveOptions<T>> {
        if (options.nullPolicy !== NullPolicy.CLEAR) {
            return options;
        }
        const target = this.modelOf(object.constructor as ClassRef);
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const rootObject: any = target.kind === 'GRAPH_VIEW' ? (object as any)[target.model.rootField] : object;
        const reads = root.propertyBags.length || (root.nodeLabels && !root.nodeLabels.members);
        if (!reads || rootObject?.[root.nodeIdField!] == null) {
            return options;
        }
        const held = await this.persistenceManager.query<Record<string, any>>(
            this.backend.heldProperties(root).spec({ id: rootObject[root.nodeIdField!] })
        );
        return { ...options, heldProperties: held[0] ?? {} };
    }

    private assertPatchable(root: ReturnType<ModelRegistry['fragment']>, fields: string[]): void {
        const refused = fields.filter(
            (it) =>
                it === root.nodeIdField ||
                it === root.stampField ||
                root.transientFields.has(it) ||
                root.propertyBags.some((bag) => bag.field === it) ||
                root.nodeLabels?.field === it
        );
        if (refused.length) {
            throw new DrivineError(`A patch can't write ${refused.join(', ')} of ${root.type.name}.`);
        }
        if (new Set(fields).size !== fields.length) {
            throw new DrivineError('A patch names each field once.');
        }
    }

    /** Runs a write again when the engine turns it away for contention, unless inside a caller's transaction. */
    private async whenUncontended<R>(statement: () => Promise<R>): Promise<R> {
        return TransactionContextHolder.getInstance().currentTransaction
            ? statement()
            : whenNotContended(statement, (failure) => this.backend.contended(failure));
    }

    private async write<T extends object>(
        object: T,
        given: SaveOptions<T>,
        createOnly: boolean
    ): Promise<T | undefined> {
        const options = await this.withHeldKeys(object, given);
        const statement = this.backend.save(
            this.modelOf(object.constructor as ClassType),
            object,
            options,
            createOnly,
            this.registry
        );
        const run = async (): Promise<SaveResult[]> => this.persistenceManager.query<SaveResult>(statement.spec());
        let rows: SaveResult[];
        try {
            rows = TransactionContextHolder.getInstance().currentTransaction
                ? await run()
                : await whenNotContended(run, (failure) => this.backend.contended(failure));
        } catch (failure) {
            // Turned away every time while another writer held the node: for a checked save, the answer is the same
            // as for a stale one. Nothing was written; load again and re-apply.
            if (statement.expectedStamp != null && this.backend.contended(failure)) {
                throw new StaleObjectException(
                    statement.root.type,
                    statement.bindings.root.id,
                    statement.expectedStamp,
                    undefined,
                    false,
                    failure as Error
                );
            }
            throw failure;
        }
        if (!rows.length) {
            if (createOnly) {
                return undefined;
            }
            throw await this.staleObject(statement);
        }
        this.handBack(object, statement, rows[0]);
        return object;
    }

    /** Gives the object (its root, and its stamped related nodes) the stamps a save left, as far as each was current. */
    private handBack(object: any, statement: SaveStatement, result: SaveResult): void {
        this.handBackRelated(object, statement, result);
        if (statement.root.stampField) {
            statement.rootObject[statement.root.stampField] = Stamps.handedBack(
                statement.expectedStamp,
                result.found,
                result.now
            );
        }
    }

    /**
     * Gives each related node of a stamped class the stamp the save left, as far as it was current: see
     * Stamps.handedBack. A node the save made (absent before) is handed its whole stamp.
     */
    private handBackRelated(object: any, statement: SaveStatement, result: SaveResult): void {
        statement.stampedModels.forEach((model, index) => {
            const { before, after }: SaveResult['related'][number] = result.related[index];
            const found = new Map(before.map((it) => [it.id, it.stamp]));
            const now = new Map(after.map((it) => [it.id, it.stamp]));
            for (const node of this.nodesOf(object, model)) {
                const id = node[model.nodeIdField!];
                if (now.has(id)) {
                    node[model.stampField!] = Stamps.handedBack(
                        node[model.stampField!],
                        found.get(id) ?? '',
                        now.get(id)!
                    );
                }
            }
        });
    }

    /** The instances of a fragment class the object holds, at any depth, the root included. */
    private nodesOf(object: any, model: ReturnType<ModelRegistry['fragment']>, seen: Set<any> = new Set()): any[] {
        if (object == null || typeof object !== 'object' || seen.has(object)) {
            return [];
        }
        seen.add(object);
        if (object instanceof model.type) {
            return [object];
        }
        return Object.values(object).flatMap((value) =>
            Array.isArray(value)
                ? value.flatMap((it) => this.nodesOf(it, model, seen))
                : this.nodesOf(value, model, seen)
        );
    }

    private async staleObject(statement: SaveStatement): Promise<StaleObjectException> {
        const id = statement.bindings.root.id;
        const found = await this.persistenceManager.query<string>(this.backend.foundStamp(statement.root).spec({ id }));
        return new StaleObjectException(
            statement.root.type,
            id,
            statement.expectedStamp!,
            found.length ? found[0] : undefined,
            found.length === 0
        );
    }

    private modelOf(ref: ClassRef): TargetModel {
        // The registry models a class as one it can construct; an abstract one is loaded as its subtypes.
        const type = ref as ClassType;
        switch (this.registry.kindOf(type)) {
            case ClassKind.NODE_FRAGMENT:
                return { kind: 'NODE_FRAGMENT', model: this.registry.fragment(type) };
            case ClassKind.GRAPH_VIEW:
                return { kind: 'GRAPH_VIEW', model: this.registry.view(type) };
            default:
                throw new DrivineError(`${ref.name} is not a @NodeFragment or @GraphView.`);
        }
    }
}

/** The ids of the nodes a relationship field's value leads to. */
function relatedIds(rel: RelationshipModel, value: any): any[] {
    const related = rel.related;
    const into = related.kind === 'RELATIONSHIP_FRAGMENT' ? related.model.target : related;
    const root = into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
    return [value ?? []].flat().map((item: any) => {
        const node = related.kind === 'RELATIONSHIP_FRAGMENT' ? item?.[related.model.targetField] : item;
        const fragment = into.kind === 'GRAPH_VIEW' ? node?.[into.model.rootField] : node;
        return fragment?.[root.nodeIdField!];
    });
}
