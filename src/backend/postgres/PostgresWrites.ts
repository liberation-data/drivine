import { Direction } from '@/annotation/Metadata';
import { MatchedNode } from '@/backend/EdgeStatements';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { GraphStatement } from '@/backend/GraphStatement';
import { FoundStamp } from '@/backend/postgres/FoundStamp';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { absent, present, storedKey, withoutKey } from '@/backend/postgres/PostgresSaveBuilder';
import { PostgresWriteStatement } from '@/backend/postgres/PostgresWriteStatement';
import { idOf, objectProps } from '@/backend/SaveStatementBuilder';
import { sqlText } from '@/backend/sql/SqlGraph';
import { WritePlan } from '@/backend/sql/WritePlan';
import { DrivineError } from '@/DrivineError';
import { RelateMode } from '@/manager/NodeRef';
import { SaveOptions } from '@/manager/SaveOptions';
import { FragmentModel } from '@/model/FragmentModel';

/** In a patch step's entry, where a save's has the stamp found: a value written differed from the node's. */
const CHANGED = '1';

/** In a patch step's entry: the node is there and does not meet the patch's condition, so nothing was written. */
const UNMET = '-';

/**
 * The writes beside a save, each a plan for drivine4j's write function, so stamps are kept as a save keeps them: patch
 * and patchAll, a batch of fragments, and relationships written on their own. A patch's values, and the condition it
 * holds to, are bound by the manager when it runs the statement, so its plan is made then.
 */
export class PostgresWrites {
    constructor(private readonly graph: PostgresGraph) {}

    /**
     * Writes `$set` (a merge patch, `$vectors` beside it) to the node with id `$id`, if it meets `where`, a condition
     * over its row `n`: `{found, applied, changed}`.
     */
    patchOne(model: FragmentModel, where?: string): GraphStatement {
        const key = idProperty(model, "it can't be patched by id");
        return new PostgresWriteStatement(
            this.graph,
            'EACH_STAMP',
            (bound) => {
                const plan = new WritePlan();
                const values = { ...bound.set, ...bound.vectors };
                plan.patch(plan.shape(model.labels, key), storedKey(bound.id), '0', present(values), absent(values));
                return { plan, patchedIf: where ? this.meeting(where, bound) : undefined };
            },
            (rows) => {
                const outcome = rows.length ? FoundStamp.of(rows[0]).found : undefined;
                return [
                    {
                        found: outcome !== undefined,
                        applied: outcome !== undefined && outcome !== UNMET,
                        changed: outcome === CHANGED
                    }
                ];
            }
        );
    }

    /** Patches a node per row of `$rows`, `{id, props, vectors}`: `{id, found, changed}` for each row. */
    patchMany(model: FragmentModel): GraphStatement {
        const key = idProperty(model, "it can't be patched by id");
        return new PostgresWriteStatement(
            this.graph,
            'EACH_STAMP',
            (bound) => {
                const plan = new WritePlan();
                const shape = plan.shape(model.labels, key);
                (bound.rows as any[]).forEach((row, i) => {
                    const values = { ...row.props, ...row.vectors };
                    plan.patch(shape, storedKey(row.id), String(i), present(values), absent(values));
                });
                return { plan };
            },
            (rows, bound) => {
                const outcomes = new Map(rows.map((it) => FoundStamp.of(it)).map((it) => [it.index, it.found]));
                return (bound.rows as any[]).map((row, i) => ({
                    id: row.id,
                    found: outcomes.has(String(i)),
                    changed: outcomes.get(String(i)) === CHANGED
                }));
            }
        );
    }

    /**
     * Saves fragments of any number of classes, each a step of one plan, merged on its id. Stamps are not checked: a
     * batch only adds. Returns `{groups: [{before, after}]}`, each a list of `{id, stamp}`, for the stamps to be handed
     * back.
     */
    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement {
        const plan = new WritePlan();
        const handed = new Map<string, { group: number; id: any }>();
        groups.forEach((group, g) => {
            const key = idProperty(group.model, "it can't be saved: a save merges on the id");
            const shape = plan.shape(group.model.labels, key);
            group.objects.forEach((object) => {
                const id = idOf(group.model, object);
                const props = withoutKey(objectProps(group.model, object, options), key);
                const index = String(handed.size);
                handed.set(index, { group: g, id });
                plan.node(
                    shape,
                    key,
                    id,
                    storedKey(id),
                    [...new Set(group.model.labels)],
                    { set: present(props), unset: absent(props) },
                    index
                );
            });
        });
        return new PostgresWriteStatement(
            this.graph,
            'EACH_STAMP',
            () => ({ plan }),
            (rows) => {
                const result = groups.map(() => ({ before: [] as any[], after: [] as any[] }));
                for (const entry of rows.map((it) => FoundStamp.of(it))) {
                    const { group, id }: { group: number; id: any } = handed.get(entry.index)!;
                    result[group].before.push({ id, stamp: entry.found });
                    result[group].after.push({ id, stamp: entry.stamp });
                }
                return [{ groups: result }];
            }
        );
    }

    /** Joins two stored nodes: 1, or 0 when either is not there. */
    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        return this.counting(type, (plan) =>
            plan.link(
                this.found(plan, from),
                this.found(plan, to),
                type,
                Direction.OUTGOING,
                present(properties),
                [],
                mode === RelateMode.CREATE
            )
        );
    }

    /** Removes the relationships of the type from one stored node to another: how many. */
    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        return this.counting(type, (plan) =>
            plan.cut(this.found(plan, from), this.found(plan, to), type, Direction.OUTGOING)
        );
    }

    /** Removes the relationships of the type from a stored node in the direction: how many. */
    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        return this.counting(type, (plan) => plan.cut(this.found(plan, from), undefined, type, direction));
    }

    /** The plan `steps` writes, which counts the relationships it writes: one row, their number. */
    private counting(type: string, steps: (plan: WritePlan) => void): GraphStatement {
        if (!type?.trim()) {
            throw new DrivineError('A relationship needs a type.');
        }
        const plan = new WritePlan();
        steps(plan);
        return new PostgresWriteStatement(
            this.graph,
            'COUNT',
            () => ({ plan }),
            (rows) => rows.map(Number)
        );
    }

    /** The step that finds the node `node` names, which must be there: by its class's labels and those it adds. */
    private found(plan: WritePlan, node: MatchedNode): number {
        const key = idProperty(node.model, "a node of it can't be referred to by id");
        return plan.ref(
            plan.shape([...new Set([...node.model.labels, ...(node.labels ?? [])])], key),
            storedKey(node.id)
        );
    }

    /**
     * The query a patch step asks of the node it found, by its `nid`, the function's `$1`: whether its row `n` meets
     * `where`. The function runs it on its own, where no value can be bound, so each value `where` names is written in.
     */
    private meeting(where: string, bound: Record<string, any>): string {
        const names = Object.keys(bound).sort((a, b) => b.length - a.length);
        const written = where.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) =>
            names.includes(name) ? literal(bound[name]) : match
        );
        return `SELECT COUNT(*) FROM ${this.graph.nodes} n WHERE n.nid = $1 AND (${written})`;
    }
}

/**
 * A value written into a statement as a literal, as a driver would bind it: a number as itself, anything else as text,
 * which Postgres reads as the type the statement wants there, as it reads a value bound without a type.
 */
function literal(value: unknown): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (value instanceof Date) {
        return sqlText(value.toISOString());
    }
    return sqlText(typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function idProperty(model: FragmentModel, because: string): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(`${model.type.name} has no @NodeId property, so ${because}.`);
    }
    return model.nodeIdProperty;
}
