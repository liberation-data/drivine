import { Direction } from '@/annotation/Metadata';
import { EdgeStatements, MatchedNode } from '@/backend/EdgeStatements';
import { GraphStatement } from '@/backend/GraphStatement';
import { ModelRegistry } from '@/model/ModelRegistry';
import { NodeRef, RelateMode } from '@/manager/NodeRef';

/**
 * Relationships on their own, between stored nodes matched by id: neither node is loaded or created, and neither's
 * own properties are touched. Both ends get a new links token in their stamp when a relationship is made, removed, or
 * has its properties changed, so a save that replaces a relationship list of either, from an object loaded before, is
 * refused. Each statement is run again when the engine turns it away for contention.
 */
export class EdgeOperations {
    constructor(
        private readonly registry: ModelRegistry,
        private readonly run: <R>(statement: GraphStatement) => Promise<R>
    ) {}

    /**
     * Joins `from` to `to` with a relationship of the type. Under MERGE (the default) one is made only when there is
     * none, and the properties are set whether it was made or found; a call that finds it as it is marks neither end.
     * Under CREATE each call makes another. A null property is left out.
     * @returns whether both nodes were found and joined
     */
    async relate(
        from: NodeRef,
        to: NodeRef,
        type: string,
        properties: Record<string, any> = {},
        mode: RelateMode = RelateMode.MERGE
    ): Promise<boolean> {
        const related = await this.run<number>(
            EdgeStatements.relate(this.node(from), this.node(to), type, properties, mode)
        );
        return related > 0;
    }

    /** Removes every relationship of the type from `from` to `to`, and returns how many there were. */
    async unrelate(from: NodeRef, to: NodeRef, type: string): Promise<number> {
        return this.run<number>(EdgeStatements.unrelate(this.node(from), this.node(to), type));
    }

    /** Removes every relationship of the type `from` has in the direction (OUTGOING by default), and returns how many. */
    async unrelateAll(from: NodeRef, type: string, direction: Direction = Direction.OUTGOING): Promise<number> {
        return this.run<number>(EdgeStatements.unrelateAll(this.node(from), type, direction));
    }

    private node(ref: NodeRef): MatchedNode {
        return { model: this.registry.fragment(ref.type), id: ref.id, labels: ref.labels };
    }
}
