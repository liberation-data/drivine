import { GraphBackend } from '@/backend/GraphBackend';
import { ClassKind } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { FragmentRow, GraphObjectMapper } from '@/mapper/GraphObjectMapper';
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
        const model = this.fragmentModel(type);
        const rows = await this.persistenceManager.query<FragmentRow>(
            this.backend.loadAllFragments(model, where).spec(bindings)
        );
        return rows.map((row) => this.mapper.fragment<T>(model, row));
    }

    async load<T>(type: ClassType<T>, id: unknown): Promise<T | undefined> {
        const model = this.fragmentModel(type);
        const rows = await this.persistenceManager.query<FragmentRow>(this.backend.loadFragment(model).spec({ id }));
        if (rows.length > 1) {
            throw new DrivineError(`${rows.length} ${type.name} nodes have the id ${String(id)}. An id is one node's.`);
        }
        return rows.length ? this.mapper.fragment<T>(model, rows[0]) : undefined;
    }

    async count(type: ClassType, where?: string, bindings: Record<string, any> = {}): Promise<number> {
        return this.persistenceManager.getOne<number>(
            this.backend.countFragments(this.fragmentModel(type), where).spec(bindings)
        );
    }

    private fragmentModel(type: ClassType): ReturnType<ModelRegistry['fragment']> {
        const kind = this.registry.kindOf(type);
        if (kind === ClassKind.NODE_FRAGMENT) {
            return this.registry.fragment(type);
        }
        if (kind === ClassKind.GRAPH_VIEW) {
            throw new DrivineError(`Loading a @GraphView (${type.name}) is not supported yet.`);
        }
        throw new DrivineError(`${type.name} is not a @NodeFragment or @GraphView.`);
    }
}
