import { Direction } from '@/annotation/Metadata';
import { MatchedNode } from '@/backend/EdgeStatements';
import { GraphBackend } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { storedValue } from '@/backend/SaveStatementBuilder';
import { ModelRegistry } from '@/model/ModelRegistry';
import { NodeRef, RelateMode } from '@/manager/NodeRef';
import { GraphObjectMapper } from '@/mapper/GraphObjectMapper';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import { lookupId, NO_NODE } from '@/backend/sql/NodeIds';

/**
 * Relationships on their own, between stored nodes matched by id: neither node is loaded or created, and neither's
 * own properties are touched. Both ends get a new links token in their stamp when a relationship is made, removed, or
 * has its properties changed, so a save that replaces a relationship list of either, from an object loaded before, is
 * refused. Each statement is run again when the engine turns it away for contention.
 */
export class EdgeOperations {
    constructor(
        private readonly registry: ModelRegistry,
        private readonly run: <R>(statement: GraphStatement) => Promise<R>,
        private readonly query: (statement: GraphStatement) => Promise<any[]>,
        private readonly mapper: GraphObjectMapper,
        private readonly backend: GraphBackend
    ) {}

    /**
     * The nodes joined to `from` by a relationship of the type in the direction (OUTGOING by default), each once, as
     * the target fragment class (or the subtype of it whose labels each carries).
     */
    async loadRelated<T>(
        from: NodeRef,
        type: string,
        direction: Direction = Direction.OUTGOING,
        target: ClassRef<T>
    ): Promise<T[]> {
        const model = this.registry.fragment(target as ClassType);
        const node = this.node(from);
        if (node === undefined) {
            return [];
        }
        const rows = await this.query(this.backend.related(node, type, direction, model));
        return rows.map((row) => this.mapper.fragment<T>(model, row));
    }

    /**
     * Joins `from` to `to` with a relationship of the type. Under MERGE (the default) one is made only when there is
     * none, and the properties are set whether it was made or found; a call that finds it as it is marks neither end.
     * Under CREATE each call makes another. A null property is left out, and a set is written as the list of its items.
     * @returns whether both nodes were found and joined
     */
    async relate(
        from: NodeRef,
        to: NodeRef,
        type: string,
        properties: Record<string, any> = {},
        mode: RelateMode = RelateMode.MERGE
    ): Promise<boolean> {
        const stored = Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [key, storedValue(value, false)])
        );
        const [start, end] = [this.node(from), this.node(to)];
        if (start === undefined || end === undefined) {
            return false;
        }
        const related = await this.run<number>(this.backend.relate(start, end, type, stored, mode));
        return related > 0;
    }

    /** Removes every relationship of the type from `from` to `to`, and returns how many there were. */
    async unrelate(from: NodeRef, to: NodeRef, type: string): Promise<number> {
        const [start, end] = [this.node(from), this.node(to)];
        return start === undefined || end === undefined ? 0 : this.run<number>(this.backend.unrelate(start, end, type));
    }

    /** Removes every relationship of the type `from` has in the direction (OUTGOING by default), and returns how many. */
    async unrelateAll(from: NodeRef, type: string, direction: Direction = Direction.OUTGOING): Promise<number> {
        const start = this.node(from);
        return start === undefined ? 0 : this.run<number>(this.backend.unrelateAll(start, type, direction));
    }

    /**
     * The node `ref` names, its id read as the `@NodeId` field's type; undefined where no node can have the
     * id, for which no statement is run (see NodeIds).
     */
    private node(ref: NodeRef): MatchedNode | undefined {
        const model = this.registry.fragment(ref.type);
        const id = lookupId(this.backend, model, ref.id);
        return id === NO_NODE ? undefined : { model, id, labels: ref.labels };
    }
}
