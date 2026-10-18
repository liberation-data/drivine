import { GraphBackend } from '@/backend/GraphBackend';
import { ClassKind } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { FragmentRow, GraphObjectMapper, ViewRow } from '@/mapper/GraphObjectMapper';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { ModelRegistry } from '@/model/ModelRegistry';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { ClassType } from '@/query/QuerySpecification';

/**
 * Loads, saves and deletes decorated objects. It keeps nothing between calls: what a call does depends only on its
 * arguments and what is in the store.
 *
 * A filter is a Cypher predicate over the node, which statements call `n`: `"n.name STARTS WITH $prefix"`. Values
 * go in `bindings`, never into the predicate's text.
 */
export class StatelessGraphObjectManager {
    private readonly mapper = new GraphObjectMapper();

    constructor(
        readonly persistenceManager: PersistenceManager,
        readonly backend: GraphBackend,
        readonly registry: ModelRegistry
    ) {}

    /** Which database this manager works on. */
    get database(): string {
        return this.persistenceManager.database;
    }

    async loadAll<T>(type: ClassType<T>, where?: string, bindings: Record<string, any> = {}): Promise<T[]> {
        const target = this.modelOf(type);
        if (target.kind === 'GRAPH_VIEW') {
            const rows = await this.persistenceManager.query<ViewRow>(
                this.backend.loadAllViews(target.model, where).spec(bindings)
            );
            return rows.map((row) => this.mapper.view<T>(target.model, row));
        }
        const rows = await this.persistenceManager.query<FragmentRow>(
            this.backend.loadAllFragments(target.model, where).spec(bindings)
        );
        return rows.map((row) => this.mapper.fragment<T>(target.model, row));
    }

    async load<T>(type: ClassType<T>, id: unknown): Promise<T | undefined> {
        const target = this.modelOf(type);
        const statement =
            target.kind === 'GRAPH_VIEW' ? this.backend.loadView(target.model) : this.backend.loadFragment(target.model);
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

    async count(type: ClassType, where?: string, bindings: Record<string, any> = {}): Promise<number> {
        const target = this.modelOf(type);
        const statement =
            target.kind === 'GRAPH_VIEW'
                ? this.backend.countViews(target.model, where)
                : this.backend.countFragments(target.model, where);
        return this.persistenceManager.getOne<number>(statement.spec(bindings));
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
    async deleteAll(type: ClassType, where?: string, bindings: Record<string, any> = {}): Promise<number> {
        return this.persistenceManager.getOne<number>(this.backend.deleteAll(this.modelOf(type), where).spec(bindings));
    }

    private modelOf(type: ClassType): TargetModel {
        switch (this.registry.kindOf(type)) {
            case ClassKind.NODE_FRAGMENT:
                return { kind: 'NODE_FRAGMENT', model: this.registry.fragment(type) };
            case ClassKind.GRAPH_VIEW:
                return { kind: 'GRAPH_VIEW', model: this.registry.view(type) };
            default:
                throw new DrivineError(`${type.name} is not a @NodeFragment or @GraphView.`);
        }
    }
}
