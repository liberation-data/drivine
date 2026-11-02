import { hasLabels, SqliteGraph, textOf } from '@/backend/sqlite/SqliteGraph';
import { byCodePoints, ExactJson } from '@/backend/sqlite/ExactJson';
import { WriteReturns } from '@/backend/sql/WritePlan';
import { LowerCopies } from '@/model/LowerCopies';
import { Stamps } from '@/model/Stamps';
import { Stopped } from '@/backend/sqlite/PlanStopped';
import { SqliteStatements } from '@/backend/sqlite/SqliteStatements';

/** In a patch step's entry: a value written differed from the node's. */
const CHANGED = '1';
/** In a patch step's entry: the node is there, and the patch left it as it was. */
const UNCHANGED = '0';
/** In a patch step's entry: the node is there and does not meet the patch's condition, so nothing was written. */
const UNMET = '-';

/** How a step finds a node: its labels, and the property its id is stored under. */
interface Shape {
    labels: string[];
    key: string;
}

/** A node as it is stored. */
interface Row {
    nid: number;
    labels: string[];
    props: Record<string, any>;
    stamp: string | null;
}

/** What a `node` step starts from: the labels and properties of the node it found, or of the one it makes. */
interface Start {
    labels: string[];
    props: Record<string, any>;
}

/** The labels a `node` step leaves, and whether they differ from the node's. */
interface Relabelled {
    labels: string[];
    relabel: boolean;
}

/** The node a `node` step saved: whether it made it, and the stamp it found. */
interface Saved {
    nid: number;
    made: boolean;
    found: string | null;
}

/** A node whose stamp is handed back: under `index`, with what was `found` of it. */
interface Handed {
    index: string;
    found: string | null;
    nid: number;
}

/**
 * Carries out one plan of steps (see WritePlan) on a graph kept by SQLite, for the `drivine_write` function: a port of
 * drivine4j's `SqlitePlanWriter`, itself `<graph>_write` on Postgres step for step, so a save stamps, checks and writes
 * a node here as it does there. What it works out, it works out over JSON in memory, and writes a row only where what
 * the step leaves differs from what it found.
 *
 * - A `node` step finds the node of its shape by its id, or makes it. A root that is gone, carries another stamp, or is
 *   there when the save may only make it, is stale: the plan stops, and nothing is written. A node that is made is
 *   written whole, with a stamp of its own; one that is found gets a new first token only where the step changes it,
 *   or where it has no stamp of two tokens yet.
 * - A `ref` step finds a node that must be there: one that is not stops the plan, which counts nothing.
 * - `link`, `unlink` and `cut` write a node's relationships; each node whose relationships changed gets a new second
 *   token once, at the end.
 * - A `patch` step writes to a node that is there, and only where it meets the query the plan was given, if any.
 * - A `node` step, and a `patch` step that changes its node, write the lowercased copy of each property they name under
 *   `lower`, from what the node then holds (see LowerCopies). The copies are no part of whether a step changed the node.
 *
 * Numbers are read and written as the text they are written as (see ExactJson), so a property no step writes keeps its
 * text, and two values are the same where Postgres's `jsonb` says so: `1.5` is `1.50`. Labels are written sorted by
 * code point, with nothing escaped that JSON does not require, as drivine4j writes them.
 */
export class SqlitePlanWriter {
    private readonly nodesTable: string;
    private readonly edgesTable: string;
    private readonly steps: Record<string, any>[];
    private readonly shapes: Shape[];

    /** The node each `node` and `ref` step saved or found, by the number the plan gives it. */
    private readonly nodes = new Map<number, number>();
    /** The nodes whose stamps are handed back, in the order their steps came. */
    private readonly handed: Handed[] = [];
    /** The nodes whose relationships changed, each to get a new second token. */
    private relinks: number[] = [];

    private root?: number;
    private rootMade = false;
    private was: string | null = null;
    private carried: string | null = null;
    private count = 0;

    constructor(
        graph: SqliteGraph,
        private readonly statements: SqliteStatements,
        plan: string,
        shapes: string,
        private readonly mark: string,
        private readonly patchedIf: string | null
    ) {
        this.nodesTable = graph.nodes;
        this.edgesTable = graph.edges;
        this.steps = ExactJson.parse(plan);
        this.shapes = (JSON.parse(shapes) as any[]).map((it) => ({ labels: it.labels.map(String), key: it.key }));
    }

    /** Carries out the steps and gives back what `returns` asks; throws Stopped where the plan stops. */
    write(returns: WriteReturns): (string | number)[] {
        for (const step of this.steps) {
            switch (step.op) {
                case 'node':
                    this.node(step);
                    break;
                case 'ref':
                    this.ref(step);
                    break;
                case 'link':
                    this.link(step);
                    break;
                case 'unlink':
                    this.unlink(step);
                    break;
                case 'cut':
                    this.cut(step);
                    break;
                case 'patch':
                    this.patch(step);
                    break;
                default:
                    throw new Error(`A plan has a step drivine_write does not know: ${step.op}`);
            }
        }
        // Each node whose relationships changed gets a new second token, once. A stamp that is not two tokens, which
        // no save leaves, is replaced whole.
        if (this.relinks.length) {
            this.statements.update(
                `UPDATE ${this.nodesTable} SET stamp = COALESCE(substr(${twoTokensOf(
                    'stamp'
                )}, 1, 17), substr(?, 1, 17)) || substr(?, 18) WHERE nid IN (SELECT value FROM json_each(?))`,
                this.mark,
                this.mark,
                JSON.stringify([...new Set(this.relinks)])
            );
        }
        switch (returns) {
            case 'STAMPS': {
                const stamps = this.stamps();
                return stamps === undefined ? [] : [stamps];
            }
            case 'EACH_STAMP': {
                const stamps = this.currentStamps();
                return this.handed.map((it) => `${it.index}/${it.found ?? ''}=${stamps.get(it.nid) ?? ''}`);
            }
            default:
                return [this.count];
        }
    }

    /**
     * The stamps a save hands back: the root's, keeping the object's own token wherever the node had another when the
     * save began, then `index/found=stamp` for each node whose stamp is handed back.
     */
    private stamps(): string | undefined {
        const stamps = this.currentStamps();
        const now = this.root !== undefined ? stamps.get(this.root) ?? undefined : undefined;
        if (now == null) {
            return undefined;
        }
        return (
            this.rootStamp(now) +
            this.handed.map((it) => `,${it.index}/${it.found ?? ''}=${stamps.get(it.nid) ?? ''}`).join('')
        );
    }

    /** The root's stamp as handed back: of the tokens it carries `now`, those the object's stamp was in step with. */
    private rootStamp(now: string): string {
        const carried = this.carried;
        const was = this.was;
        if (carried == null) {
            // An object that carried no stamp is handed the whole stamp only of a node its save made.
            return this.rootMade ? now : now.slice(0, 17);
        }
        if (was === carried) {
            return now;
        }
        const first = equal(was?.slice(0, 16), carried.slice(0, 16)) ? now.slice(0, 16) : carried.slice(0, 16);
        const carriedLinks = carried.slice(17) || undefined;
        const second =
            equal(was?.slice(17) || undefined, carriedLinks) || (this.rootMade && !carriedLinks)
                ? now.slice(17)
                : carried.slice(17);
        return `${first}:${second}`;
    }

    /** The stamp of each node a step saved or found, as it is now; a node deleted since has none. */
    private currentStamps(): Map<number, string | null> {
        const wanted = [
            ...new Set([...this.handed.map((it) => it.nid), ...(this.root !== undefined ? [this.root] : [])])
        ];
        if (!wanted.length) {
            return new Map();
        }
        return new Map(
            this.statements
                .rows(
                    `SELECT nid, stamp FROM ${this.nodesTable} WHERE nid IN (SELECT value FROM json_each(?))`,
                    JSON.stringify(wanted)
                )
                .map(([nid, stamp]) => [Number(nid), stamp as string | null])
        );
    }

    // ----- Steps -----

    /** Saves a node: found, or made. What the step writes is worked out over the node as it was found. */
    private node(step: Record<string, any>): void {
        const { nid, made, found }: Saved = this.saved(step);
        this.nodes.set(Number(step.r), nid);
        const index = text(step, 'i');
        if (index != null) {
            // Nothing for a node the step made, and a mark for one that was there without a stamp.
            this.handed.push({ index, found: made ? null : found ?? Stamps.NEVER_STAMPED, nid });
        }
        if (flag(step, 'root', false)) {
            this.root = nid;
            this.rootMade = made;
            this.was = found;
            this.carried = text(step, 'carried');
        }
    }

    /**
     * Finds the step's node and writes it, or makes it. A node that is made is written once, whole, with a stamp of
     * its own. A uniqueness constraint may refuse it: once, the node is looked for again, as on Postgres; a second
     * time, the constraint is on something other than this node's key, and refuses this save.
     */
    private saved(step: Record<string, any>): Saved {
        const shape = this.shapes[step.s];
        for (let tries = 0; ; tries++) {
            const row = this.find(shape, String(step.k));
            const start = this.startOf(step, row);
            setAndUnset(start.props, step);
            const relabelled = this.relabelled(step, start, row === undefined);
            // The copies are written from what the step leaves, and are no part of whether it changed the node.
            const copied = lowered(start.props, step.lower);
            if (row !== undefined) {
                this.rewritten(step, row, start.props, copied, relabelled);
                return { nid: row.nid, made: false, found: row.stamp };
            }
            const nid = this.inserted(relabelled.labels, copied, step.fresh, tries > 0);
            if (nid !== undefined) {
                return { nid, made: true, found: null };
            }
        }
    }

    /**
     * What the step starts from: the node as it was found, or as it is made. A checked save does not make the node
     * again: it is gone, and the object is stale. Nor does a step that makes no node; and a step that only makes the
     * node writes nothing to one that is there. A root whose stamp is not the one expected is stale too.
     */
    private startOf(step: Record<string, any>, row: Row | undefined): Start {
        const expect = text(step, 'expect');
        if (row === undefined) {
            if (expect != null || !flag(step, 'create', true)) {
                throw new Stopped(this.count);
            }
            return { labels: [...step.labels], props: { [step.key]: step.id } };
        }
        if (flag(step, 'absent', false)) {
            throw new Stopped(this.count);
        }
        if (
            expect != null &&
            (row.stamp == null || (flag(step, 'whole', false) ? row.stamp : row.stamp.slice(0, 16)) !== expect)
        ) {
            throw new Stopped(this.count);
        }
        return { labels: row.labels, props: { ...row.props } };
    }

    /**
     * The node's labels with those the step adds and without those it drops, in order, and whether they changed: labels
     * that are as they were are not written again. The labels an open label field holds are recorded on the node first
     * (see `owned`).
     */
    private relabelled(step: Record<string, any>, start: Start, made: boolean): Relabelled {
        const add = strings(step.add);
        const drop = [...strings(step.drop), ...owned(step, start.props, add)];
        if (!add.length && !drop.length) {
            return { labels: start.labels, relabel: false };
        }
        const now = [...new Set([...start.labels, ...add])].filter((it) => !drop.includes(it)).sort(byCodePoints);
        const before = new Set(start.labels);
        const relabel = now.length !== before.size || now.some((it) => !before.has(it));
        return { labels: relabel || made ? now : start.labels, relabel };
    }

    /** Makes the node, giving its `nid`, or none where a constraint turned it away the first time. */
    private inserted(labels: string[], copied: Record<string, any>, fresh: string, again: boolean): number | undefined {
        const values = [JSON.stringify(labels), ExactJson.stringify(copied), fresh];
        const [inserted] = this.statements.rows(
            `INSERT INTO ${this.nodesTable} (labels, props, stamp) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING nid`,
            ...values
        );
        if (inserted !== undefined) {
            return Number(inserted[0]);
        }
        if (again) {
            this.statements.update(`INSERT INTO ${this.nodesTable} (labels, props, stamp) VALUES (?, ?, ?)`, ...values);
        }
        return undefined;
    }

    /**
     * Writes what the step changes of a node it found. A new first token only if the step changes the node, or the node
     * has no stamp of two tokens yet; a copy alone out of step with its property is written, and the node keeps its
     * stamp.
     */
    private rewritten(
        step: Record<string, any>,
        row: Row,
        props: Record<string, any>,
        copied: Record<string, any>,
        relabelled: Relabelled
    ): void {
        const fresh: string = step.fresh;
        const same = ExactJson.same(props, row.props);
        // Whether the properties, copies and all, are as they were.
        const kept = ExactJson.same(copied, row.props);
        const two = twoTokens(row.stamp);
        if (two != null && same && !relabelled.relabel) {
            if (!kept) {
                this.statements.update(
                    `UPDATE ${this.nodesTable} SET props = ? WHERE nid = ?`,
                    ExactJson.stringify(copied),
                    row.nid
                );
            }
            return;
        }
        const stamp = fresh.slice(0, 16) + (two?.slice(16) ?? fresh.slice(16));
        if (relabelled.relabel) {
            this.statements.update(
                `UPDATE ${this.nodesTable} SET labels = ? WHERE nid = ?`,
                JSON.stringify(relabelled.labels),
                row.nid
            );
        }
        if (!kept) {
            this.statements.update(
                `UPDATE ${this.nodesTable} SET props = ?, stamp = ? WHERE nid = ?`,
                ExactJson.stringify(copied),
                stamp,
                row.nid
            );
        } else {
            this.statements.update(`UPDATE ${this.nodesTable} SET stamp = ? WHERE nid = ?`, stamp, row.nid);
        }
    }

    /** Finds a node that must be there. */
    private ref(step: Record<string, any>): void {
        const row = this.find(this.shapes[step.s], String(step.k));
        if (row === undefined) {
            throw new Stopped(0);
        }
        this.nodes.set(Number(step.r), row.nid);
    }

    /** Joins two nodes. The relationship is as the step says only if every one of its type between them is. */
    private link(step: Record<string, any>): void {
        const from = this.nodes.get(Number(step.from))!;
        const to = this.nodes.get(Number(step.to))!;
        const type: string = step.type;
        const direction: string = step.dir;
        const props: Record<string, any> = isObject(step.props) ? step.props : {};
        const clear = strings(step.clear);
        let seen = 0;
        let unchanged = 0;
        if (!flag(step, 'always', false)) {
            // A node's relationship to itself is one relationship, whichever way it is read.
            const existing = this.statements.rows(
                `SELECT eid, props FROM ${this.edgesTable} WHERE type = ? AND ((? IN ('OUT', 'BOTH') AND src = ? AND dst = ?) ` +
                    `OR ((? = 'IN' OR (? = 'BOTH' AND ? <> ?)) AND src = ? AND dst = ?)) ORDER BY eid`,
                type,
                direction,
                from,
                to,
                direction,
                direction,
                from,
                to,
                to,
                from
            );
            for (const [eid, text] of existing) {
                seen++;
                const stored = objectOf(text as string | null);
                const written: Record<string, any> = { ...stored, ...props };
                clear.forEach((it) => delete written[it]);
                if (ExactJson.same(written, stored)) {
                    unchanged++;
                } else {
                    this.statements.update(
                        `UPDATE ${this.edgesTable} SET props = ? WHERE eid = ?`,
                        ExactJson.stringify(written),
                        eid
                    );
                }
            }
        }
        if (seen === 0) {
            // An undirected field is satisfied by a relationship either way, and makes one from the first node.
            const incoming = direction === 'IN';
            this.statements.update(
                `INSERT INTO ${this.edgesTable} (src, dst, type, props) VALUES (?, ?, ?, ?)`,
                incoming ? to : from,
                incoming ? from : to,
                type,
                ExactJson.stringify(props)
            );
        }
        if (seen === 0 || unchanged < seen) {
            this.relinks.push(from, to);
        }
        this.count += Math.max(seen, 1);
    }

    /** Removes a field's relationships to the targets whose ids the step names, or to every target but those. */
    private unlink(step: Record<string, any>): void {
        const from = this.nodes.get(Number(step.from))!;
        const shape = this.shapes[step.s];
        const type: string = step.type;
        const direction: string = step.dir;
        const ids = new Set(strings(step.ids));
        const held = new Set(strings(step.held));
        const keep = flag(step, 'keep', false);
        const remove = flag(step, 'delete', false);
        const key = textOf('t', shape.key);
        const labels = shape.labels.length ? ` AND ${hasLabels('t', shape.labels)}` : '';
        // A relationship from the node to itself is read as leaving it, and so once when both directions are read.
        const reached = this.statements
            .rows(
                `SELECT e.eid, t.nid, ${key} FROM ${this.edgesTable} e JOIN ${this.nodesTable} t ON t.nid = e.dst ` +
                    `WHERE ? IN ('OUT', 'BOTH') AND e.src = ? AND e.type = ?${labels} ` +
                    `UNION ALL ` +
                    `SELECT e.eid, t.nid, ${key} FROM ${this.edgesTable} e JOIN ${this.nodesTable} t ON t.nid = e.src ` +
                    `WHERE ? IN ('IN', 'BOTH') AND e.dst = ? AND e.type = ?${labels} AND (? = 'IN' OR e.src <> ?)`,
                direction,
                from,
                type,
                direction,
                from,
                type,
                direction,
                from
            )
            .map(([eid, nid, id]) => ({ eid: Number(eid), nid: Number(nid), id: id as string | null }));
        const gone = reached.filter((it) => it.id != null && ids.has(it.id) !== keep);
        if (!gone.length) {
            return;
        }
        const targets = gone.map((it) => it.nid);
        for (const target of [...new Set(targets)].sort((x, y) => x - y)) {
            // A target gone since the relationships were read has nothing left to remove or count.
            if (!this.statements.rows(`SELECT 1 FROM ${this.nodesTable} WHERE nid = ?`, target).length) {
                continue;
            }
            const removed = targets.filter((it) => it === target).length;
            const id = gone.find((it) => it.nid === target)!.id;
            // The root is never deleted, and nor is a node the object still holds in another field.
            if (remove && target !== from && !held.has(id!) && this.references(target, direction) === removed) {
                this.relinks = this.relinks.filter((it) => it !== target);
                this.statements.update(`DELETE FROM ${this.nodesTable} WHERE nid = ?`, target);
            } else {
                this.relinks.push(target);
            }
        }
        this.statements.update(
            `DELETE FROM ${this.edgesTable} WHERE eid IN (SELECT value FROM json_each(?))`,
            JSON.stringify(gone.map((it) => it.eid))
        );
        this.relinks.push(from);
        this.count += gone.length;
    }

    /**
     * What refers to a target: the relationships on the side a field in `direction` reaches it from, counted before any
     * is removed. A relationship from the node to itself is counted once.
     */
    private references(target: number, direction: string): number {
        const count = (sql: string, ...values: (string | number)[]): number =>
            Number(this.statements.rows(sql, ...values)[0][0]);
        return (
            (direction === 'OUT' || direction === 'BOTH'
                ? count(`SELECT count(*) FROM ${this.edgesTable} WHERE dst = ?`, target)
                : 0) +
            (direction === 'IN' || direction === 'BOTH'
                ? count(
                      `SELECT count(*) FROM ${this.edgesTable} WHERE src = ? AND (? = 'IN' OR dst <> ?)`,
                      target,
                      direction,
                      target
                  )
                : 0)
        );
    }

    /** Removes the relationships of a type from one node to another, or with no other node named to any in a direction. */
    private cut(step: Record<string, any>): void {
        const from = this.nodes.get(Number(step.from))!;
        const to = step.to != null ? this.nodes.get(Number(step.to))! : null;
        const type: string = step.type;
        const direction: string = step.dir;
        const gone = this.statements
            .rows(
                `SELECT eid, dst FROM ${this.edgesTable} WHERE ? IN ('OUT', 'BOTH') AND src = ? AND type = ? AND (? IS NULL OR dst = ?) ` +
                    `UNION ALL ` +
                    `SELECT eid, src FROM ${this.edgesTable} WHERE ? IN ('IN', 'BOTH') AND dst = ? AND type = ? AND (? IS NULL OR src = ?) ` +
                    `AND (? = 'IN' OR src <> ?)`,
                direction,
                from,
                type,
                to,
                to,
                direction,
                from,
                type,
                to,
                to,
                direction,
                from
            )
            .map(([eid, end]) => ({ eid: Number(eid), end: Number(end) }));
        if (!gone.length) {
            return;
        }
        for (const target of [...new Set(gone.map((it) => it.end))].sort((a, b) => a - b)) {
            // An end gone since the relationships were read took them with it, and has no token to change.
            if (this.statements.rows(`SELECT 1 FROM ${this.nodesTable} WHERE nid = ?`, target).length) {
                this.relinks.push(target);
            }
        }
        this.statements.update(
            `DELETE FROM ${this.edgesTable} WHERE eid IN (SELECT value FROM json_each(?))`,
            JSON.stringify(gone.map((it) => it.eid))
        );
        this.relinks.push(from);
        this.count += gone.length;
    }

    /**
     * Writes properties to a node that is there, and makes none. One that is not there is left out of what the call
     * hands back; one that does not meet the query is left as it is, and said to.
     */
    private patch(step: Record<string, any>): void {
        const row = this.find(this.shapes[step.s], String(step.k));
        if (row === undefined) {
            return;
        }
        const fresh: string = step.fresh;
        // The query names the node's id `$1`, as Postgres's function reads it.
        const met =
            this.patchedIf != null
                ? Number(Object.values(this.statements.statement(this.patchedIf).get({ $1: row.nid })!)[0])
                : 1;
        let o: Record<string, any> = { ...row.props };
        if (met > 0) {
            setAndUnset(o, step);
        }
        const same = ExactJson.same(o, row.props);
        // A node the step changes has its copies written from what it now holds.
        if (!same) {
            o = lowered(o, step.lower);
        }
        const two = twoTokens(row.stamp);
        if (two == null || !same) {
            const stamp = fresh.slice(0, 16) + (two?.slice(16) ?? fresh.slice(16));
            if (!same) {
                this.statements.update(
                    `UPDATE ${this.nodesTable} SET props = ?, stamp = ? WHERE nid = ?`,
                    ExactJson.stringify(o),
                    stamp,
                    row.nid
                );
            } else {
                this.statements.update(`UPDATE ${this.nodesTable} SET stamp = ? WHERE nid = ?`, stamp, row.nid);
            }
        }
        const outcome = met === 0 ? UNMET : !same ? CHANGED : UNCHANGED;
        this.handed.push({ index: String(step.i), found: outcome, nid: row.nid });
    }

    // ----- Reading -----

    /** The node of `shape` whose id is stored as `id`, the first made where there are several. */
    private find(shape: Shape, id: string): Row | undefined {
        const labels = shape.labels.length ? ` AND ${hasLabels('n', shape.labels)}` : '';
        const [found] = this.statements.rows(
            `SELECT n.nid, n.labels, n.props, n.stamp FROM ${this.nodesTable} n WHERE ${textOf(
                'n',
                shape.key
            )} = ?${labels} ORDER BY n.nid LIMIT 1`,
            id
        );
        if (!found) {
            return undefined;
        }
        const [nid, labelsText, props, stamp] = found;
        return {
            nid: Number(nid),
            labels: (JSON.parse(labelsText as string) as any[]).map(String),
            props: objectOf(props as string | null),
            stamp: stamp as string | null
        };
    }
}

/**
 * Records the labels an open label field holds on the node, so the node knows which are its own, and gives the labels
 * the step drops for it. A step that clears replaces the record, and drops the labels recorded that the field no longer
 * holds, but for those of the class; one that does not adds to the record.
 */
function owned(step: Record<string, any>, props: Record<string, any>, add: string[]): string[] {
    const record = step.owned;
    if (record == null) {
        return [];
    }
    const property: string = record.prop;
    const recorded = Array.isArray(props[property]) ? (props[property] as any[]).map(String) : [];
    if (!flag(record, 'clear', false)) {
        if (add.length) {
            props[property] = [...recorded.filter((it) => !add.includes(it)).sort(byCodePoints), ...add];
        }
        return [];
    }
    const base = strings(record.base);
    if (add.length) {
        props[property] = [...add];
    } else {
        delete props[property];
    }
    return recorded.filter((it) => !add.includes(it) && !base.includes(it));
}

/** Whether `a` and `b` are both there and the same: SQL's `=`, which a null never meets. */
function equal(a: string | undefined, b: string | undefined): boolean {
    return a != null && b != null && a === b;
}

function isObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `text` as a JSON object: properties are stored as one. */
function objectOf(text: string | null | undefined): Record<string, any> {
    if (text == null) {
        return {};
    }
    const value = ExactJson.parse(text);
    return isObject(value) ? value : {};
}

/** `o` with the properties `step` sets, and without those it unsets. */
function setAndUnset(o: Record<string, any>, step: Record<string, any>): void {
    if (isObject(step.set)) {
        Object.assign(o, step.set);
    }
    strings(step.unset).forEach((it) => delete o[it]);
}

/**
 * `o` with the lowercased copy of each property `keys` names, from what `o` holds, and without the copy of one that
 * holds nothing: see LowerCopies. It is lowercased as `drivine_lower` lowercases what a lookup compares the copy with.
 */
function lowered(o: Record<string, any>, keys: unknown): Record<string, any> {
    const names = strings(keys);
    if (!names.length) {
        return o;
    }
    const copied = { ...o };
    for (const key of names) {
        const value = copied[key];
        if (value == null) {
            delete copied[LowerCopies.of(key)];
        } else {
            copied[LowerCopies.of(key)] = asText(value).toLowerCase();
        }
    }
    return copied;
}

/** A JSON value as text, as drivine4j reads one for its copy: a string as itself, a number or a boolean as its JSON. */
function asText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'object') {
        return value === null || Array.isArray(value) || value.constructor === Object ? '' : String(value);
    }
    return String(value);
}

/** The text of the field `name` of `node`; null where it is absent or null. */
function text(node: Record<string, any>, name: string): string | null {
    const value = node[name];
    return value == null ? null : String(value);
}

/** The boolean field `name` of `node`, or `otherwise` where it is absent or null. */
function flag(node: Record<string, any>, name: string, otherwise: boolean): boolean {
    const value = node[name];
    return value == null ? otherwise : Boolean(value);
}

/** The strings of the array `value`; none where it is absent. */
function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
}

/** `stamp` where it is two tokens, as every save leaves one, and null where it is not. */
function twoTokens(stamp: string | null | undefined): string | null {
    return stamp != null && stamp.length === 33 && stamp[16] === ':' ? stamp : null;
}

/** The SQL that reads `stamp`, a column, where it is two tokens, and null where it is not. */
function twoTokensOf(stamp: string): string {
    return `CASE WHEN length(${stamp}) = 33 AND substr(${stamp}, 17, 1) = ':' THEN ${stamp} END`;
}
