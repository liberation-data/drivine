import { Direction } from '@/annotation/Metadata';
import { SaveStatement } from '@/backend/SaveStatement';
import { bagEntries, fragmentOf, idOf, objectProps, propsOf } from '@/backend/SaveStatementBuilder';
import { hasLabels, jsonKey, OracleGraph, sqlText } from '@/backend/oracle/OracleGraph';
import { target as targetOf } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import {
    concreteModel,
    heldIds,
    items,
    nodeOf,
    nodeWrite,
    NodeWrite,
    replacedFields,
    rootOf,
    stampExcluded
} from '@/backend/sql/SqlSaves';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { LowerCopies } from '@/model/LowerCopies';
import { Stamps } from '@/model/Stamps';
import { NullPolicy } from '@/manager/NullPolicy';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';

/**
 * Writes a save as one PL/SQL block, applied whole or not at all, with or without a transaction: the root found (or
 * made) and locked, checked against the object's stamp when it carries one, its properties merged and its labels
 * set; the relationships named in `replace` trimmed; then each related node written and joined, as deep as the view
 * goes. Every value is bound. Stamps follow drivine4j's rules, as the Cypher save does: a node's data token is
 * replaced when its properties or labels change, the links token of each end when a relationship is made, removed or
 * has its properties changed. The block returns `{found, now, related}` as one row, or no row when a checked save
 * found the root changed or gone (or a create found it there), having written nothing.
 */
export class OracleSaveBuilder {
    private readonly bindings: Record<string, any> = {};
    private readonly body: string[] = [];
    private readonly declarations: string[] = [];
    private readonly stamped: { model: FragmentModel; ids: any[] }[] = [];
    private count = 0;
    private options: SaveOptions<any> = {};
    /** Whether the block writes lowercased copies, and so declares `lower_node`. */
    private lowers = false;

    constructor(
        private readonly graph: OracleGraph,
        private readonly registry?: ModelRegistry
    ) {}

    build(
        target: TargetModel,
        object: any,
        options: SaveOptions<any> = {},
        createOnly: boolean = false
    ): SaveStatement {
        this.options = options;
        this.bindings.x_stamp = Stamps.fresh();
        if (target.kind === 'NODE_FRAGMENT') {
            if (options.replace === 'all' || options.replace?.length) {
                throw new DrivineError(
                    `replace names relationship fields of a view. ${target.model.type.name} is a @NodeFragment.`
                );
            }
            const expected = this.root(concreteModel(this.registry, target.model, object), object, createOnly, false);
            return this.statement(target.model, object, expected);
        }
        const view = target.model;
        const rootObject = object[view.rootField];
        if (rootObject == null) {
            throw new DrivineError(
                `${view.type.name}.${view.rootField}, the root, is ${rootObject}. A view is saved from its root.`
            );
        }
        const replace = replacedFields(view, object, options);
        const root = concreteModel(this.registry, view.root, rootObject);
        const expected = this.root(root, rootObject, createOnly, replace.length > 0);
        const writes: string[] = [];
        this.related(view, object, 'v_root', [], writes);
        this.body.push(...this.readStamps('before'));
        this.trims(view, object, replace);
        this.body.push(...writes);
        this.body.push(...this.readStamps('after'));
        return this.statement(root, rootObject, expected);
    }

    /** Finds or makes the root, checks it, and writes it. Returns the stamp it was checked against, if any. */
    private root(model: FragmentModel, object: any, createOnly: boolean, replacing: boolean): string | undefined {
        const { only, except }: SaveOptions<any> = this.options;
        const keep = (field: string): boolean => (only ? only.includes(field) : !except?.includes(field));
        const clear = this.options.nullPolicy === NullPolicy.CLEAR;
        const held = this.options.heldProperties ?? {};
        const props: Record<string, any> = { ...objectProps(model, object, this.options) };
        bagEntries(model, object, Object.keys(held), clear, keep).forEach((value, key) => (props[key] = value));
        const write = nodeWrite(
            model,
            object,
            props,
            model.nodeLabels && keep(model.nodeLabels.field) ? clear : undefined,
            held
        );
        const expected = model.stampField ? object[model.stampField] : undefined;
        const p = this.nodeParams(write);
        if (createOnly && expected != null) {
            throw new DrivineError(
                `A ${model.type.name} that carries a stamp was loaded, and create makes a node that is not there. Save it, or update it.`
            );
        }
        this.body.push(`v_root := find_node(${p.match}, ${p.id});`);
        if (createOnly) {
            this.body.push('IF v_root IS NOT NULL THEN v_ok := FALSE; END IF;');
        } else if (expected != null) {
            this.bindings.x_expected = expected;
            const T = Stamps.TOKEN;
            const links = replacing
                ? ` AND LENGTH($x_expected) = ${2 * T + 1} AND SUBSTR(v_found, ${T + 2}) = SUBSTR($x_expected, ${
                      T + 2
                  })`
                : '';
            this.body.push(
                'IF v_root IS NULL THEN v_ok := FALSE; ELSE',
                `    SELECT stamp INTO v_found FROM ${this.graph.nodes} WHERE nid = v_root FOR UPDATE;`,
                `    IF NOT (NVL(SUBSTR(v_found, 1, ${T}) = SUBSTR($x_expected, 1, ${T}), FALSE)${links}) THEN v_ok := FALSE; END IF;`,
                'END IF;'
            );
        }
        this.body.push(
            'IF v_ok THEN',
            '    IF v_root IS NULL THEN',
            `        v_root := make_node(${p.labels});`,
            '        v_made := TRUE;',
            '    ELSIF v_found IS NULL THEN',
            `        SELECT NVL(stamp, '${Stamps.NEVER_STAMPED}') INTO v_found FROM ${this.graph.nodes} WHERE nid = v_root FOR UPDATE;`,
            '    END IF;',
            `    restamp(v_root, apply_node(v_root, ${p.props}, ${p.add}, ${p.remove}, ${p.record}, ${p.replaceRecord}) OR v_made);`,
            ...this.lowering(write, 'v_root').map((it) => `    ${it}`),
            'END IF;'
        );
        return expected;
    }

    /**
     * Writes each relationship of a view, from the node `from` (a PL/SQL variable), into `out`: each related node
     * written, then joined; a related view's relationships after, as far as maxDepth.
     */
    private related(view: GraphViewModel, object: any, from: string, path: RelationshipModel[], out: string[]): void {
        for (const rel of view.relationships) {
            if (rel.readOnly || path.filter((it) => it === rel).length >= rel.maxDepth) {
                continue;
            }
            const into = targetOf(rel);
            for (const item of items(rel, object?.[rel.field])) {
                const node = nodeOf(rel, item);
                if (node == null) {
                    throw new DrivineError(`A ${rel.related.model.type.name} in ${rel.field} has no target node.`);
                }
                const nodeObject = into.kind === 'GRAPH_VIEW' ? node[into.model.rootField] : node;
                const root = rootOf(into);
                const concrete = concreteModel(this.registry, root, nodeObject);
                this.stampedId(root, idOf(root, nodeObject));
                const props: Record<string, any> = { ...propsOf(concrete, nodeObject, stampExcluded(concrete)) };
                bagEntries(concrete, nodeObject).forEach((value, key) => (props[key] = value));
                const write = nodeWrite(concrete, nodeObject, props, concrete.nodeLabels ? false : undefined, {}, root);
                const p = this.nodeParams(write);
                const variable = this.variable();
                out.push(
                    `${variable} := write_node(${p.match}, ${p.id}, ${p.labels}, ${p.props}, ${p.add}, ${p.remove}, ${p.record}, ${p.replaceRecord});`,
                    ...this.lowering(write, variable)
                );
                const relProps =
                    rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                        ? this.bind(JSON.stringify(propsOf(rel.related.model, item, [rel.related.model.targetField])))
                        : 'NULL';
                out.push(
                    `link(${from}, ${variable}, ${sqlText(rel.type)}, '${direction(rel.direction)}', ${relProps});`
                );
                if (into.kind === 'GRAPH_VIEW') {
                    this.related(into.model, node, variable, [...path, rel], out);
                }
            }
        }
    }

    /**
     * Trims each relationship field named in `replace` to what the object holds: relationships of its type and
     * direction from the root to nodes of its labels, other than those any field of that type and direction holds.
     */
    private trims(view: GraphViewModel, object: any, replace: string[]): void {
        const held = heldIds(view, object);
        for (const field of replace) {
            const rel = view.relationships.find((it) => it.field === field);
            if (!rel) {
                throw new DrivineError(
                    `replace names ${field}, which is not a relationship field of ${view.type.name}.`
                );
            }
            if (rel.readOnly) {
                throw new DrivineError(
                    `replace names ${view.type.name}.${field}, which is read-only: a save never writes it.`
                );
            }
            const value = object[field];
            if (rel.isCollection && value == null) {
                throw new DrivineError(
                    `${view.type.name}.${field} is ${value}, so it can't say which relationships to keep. Give an empty ` +
                        `list to remove them all.`
                );
            }
            const into = rootOf(targetOf(rel));
            const keep = view.relationships
                .filter((it) => it.type === rel.type && it.direction === rel.direction)
                .flatMap((it) =>
                    items(it, object[it.field]).map((item) => idOf(rootOf(targetOf(it)), fragmentOf(it, item)))
                );
            const k = jsonKey(into.nodeIdProperty!);
            const notIn = (list: string): string =>
                `NOT EXISTS (SELECT 1 FROM JSON_TABLE(${list}, '$[*]' COLUMNS (v JSON PATH '$')) t ` +
                `WHERE JSON_EXISTS(x.props, '$?(@${k} == $v)' PASSING t.v AS "v"))`;
            const side =
                rel.direction === Direction.INCOMING
                    ? { on: 'x.nid = e.src', root: 'e.dst = q.r' }
                    : rel.direction === Direction.UNDIRECTED
                    ? { on: '((e.src = q.r AND x.nid = e.dst) OR (e.dst = q.r AND x.nid = e.src))', root: '1 = 1' }
                    : { on: 'x.nid = e.dst', root: 'e.src = q.r' };
            // The root's id once, from a row of its own: a dynamic statement's binds are by position.
            const dropped =
                `SELECT e.eid, x.nid FROM (SELECT :1 AS r FROM dual) q CROSS JOIN ${this.graph.edges} e ` +
                `JOIN ${this.graph.nodes} x ON ${side.on} ` +
                `WHERE ${side.root} AND e.type = ${sqlText(rel.type)} AND ${hasLabels('x', into.labels)} AND ${notIn(
                    ':2'
                )}`;
            const unreferenced =
                this.options.removedTargets === RemovedTargets.DELETE_UNREFERENCED
                    ? `SELECT COUNT(*) FROM ${this.graph.nodes} x WHERE x.nid = :1 AND ${notIn(':2')} AND NOT EXISTS ` +
                      `(SELECT 1 FROM ${this.graph.edges} r WHERE ${referencedAs(rel.direction)})`
                    : null;
            this.body.push(
                `trim_edges(v_root, ${this.bind(dropped)}, ${this.bind(JSON.stringify(keep))}, ` +
                    `${unreferenced ? this.bind(unreferenced) : 'NULL'}, ${this.bind(JSON.stringify(held))});`
            );
        }
    }

    /** Reads `{id, stamp}` of each stamped related node, before or after the writes, into a variable each. */
    private readStamps(when: 'before' | 'after'): string[] {
        return this.stamped.map((it, i) => {
            const k = jsonKey(it.model.nodeIdProperty!);
            const variable = `v_${when}${i}`;
            if (!this.declarations.includes(`${variable} CLOB;`)) {
                this.declarations.push(`${variable} CLOB;`);
            }
            return (
                `SELECT NVL(JSON_ARRAYAGG(JSON_OBJECT('id' VALUE JSON_QUERY(n.props, '$${k}'), 'stamp' VALUE ` +
                `NVL(n.stamp, '${Stamps.NEVER_STAMPED}')) RETURNING CLOB), '[]') INTO ${variable} FROM ${this.graph.nodes} n ` +
                `WHERE ${hasLabels('n', it.model.labels)} AND EXISTS (SELECT 1 FROM JSON_TABLE(${this.bind(
                    JSON.stringify(it.ids)
                )}, '$[*]' COLUMNS (v JSON PATH '$')) t WHERE JSON_EXISTS(n.props, '$?(@${k} == $v)' PASSING t.v AS "v"));`
            );
        });
    }

    private statement(root: FragmentModel, rootObject: any, expected?: string): SaveStatement {
        const related = this.stamped.length
            ? `JSON_ARRAY(${this.stamped
                  .map(
                      (_, i) =>
                          `JSON_OBJECT('before' VALUE JSON(v_before${i}), 'after' VALUE JSON(v_after${i}) RETURNING JSON)`
                  )
                  .join(', ')} RETURNING JSON)`
            : `JSON('[]')`;
        const result =
            `SELECT JSON_OBJECT('found' VALUE CASE WHEN v_made THEN NULL ELSE v_found END, ` +
            `'now' VALUE (SELECT stamp FROM ${this.graph.nodes} WHERE nid = v_root), 'related' VALUE ${related} RETURNING CLOB) ` +
            'AS "result:json" FROM dual';
        const text = `${prelude(this.graph, this.declarations, this.lowers)}
BEGIN
${this.body.map((it) => `    ${it}`).join('\n')}
    IF v_ok THEN
        OPEN c FOR ${result};
    ELSE
        OPEN c FOR SELECT 1 AS "result" FROM dual WHERE 1 = 0;
    END IF;
    DBMS_SQL.RETURN_RESULT(c);
END;`;
        this.bindings.root = { id: idOf(root, rootObject) };
        return new SaveStatement(
            text,
            this.bindings,
            root,
            rootObject,
            expected,
            this.stamped.map((it) => it.model)
        );
    }

    /**
     * The call that writes the lowercased copies of the write's `@CaseInsensitive` properties on the node `variable`,
     * from what it now holds, once its properties are written and its change told: none for a model with none.
     */
    private lowering(write: NodeWrite, variable: string): string[] {
        if (!write.lower.length) {
            return [];
        }
        this.lowers = true;
        return [`lower_node(${variable}, ${this.bind(JSON.stringify(write.lower))});`];
    }

    private nodeParams(write: NodeWrite): Record<string, string> {
        const k = jsonKey(write.model.nodeIdProperty!);
        const match = `${hasLabels(
            'n',
            write.model.labels
        )} AND JSON_EXISTS(n.props, '$?(@${k} == $v)' PASSING JSON(:1) AS "v")`;
        return {
            match: this.bind(match),
            id: this.bind(JSON.stringify(write.id)),
            labels: this.bind(JSON.stringify([...new Set(write.labels)])),
            props: this.bind(JSON.stringify(write.props, (_, value) => (value === undefined ? null : value))),
            add: this.bind(JSON.stringify(write.add)),
            remove: this.bind(JSON.stringify(write.remove)),
            record: write.record ? this.bind(write.record.property) : 'NULL',
            replaceRecord: write.record?.replace ? 'TRUE' : 'FALSE'
        };
    }

    private stampedId(model: FragmentModel, id: any): void {
        if (!model.stampField) {
            return;
        }
        let stamped = this.stamped.find((it) => it.model === model);
        if (!stamped) {
            stamped = { model, ids: [] };
            this.stamped.push(stamped);
        }
        if (!stamped.ids.includes(id)) {
            stamped.ids.push(id);
        }
    }

    private variable(): string {
        const name = `v_n${++this.count}`;
        this.declarations.push(`${name} NUMBER;`);
        return name;
    }

    private bind(value: unknown): string {
        const name = `x_${++this.count}`;
        this.bindings[name] = value;
        return `$${name}`;
    }
}

/**
 * The declarations every writing block holds: its state, and the procedures its body calls. The offered stamp is bound
 * as `$x_stamp`. A node's or relationship's properties are taken as a CLOB, as drivine4j holds them: a PL/SQL
 * `VARCHAR2` holds 32,767 bytes, and a long text is bound as a CLOB. With `lowers`, it declares `lower_node` too, for a
 * block that writes lowercased copies.
 */
export function prelude(graph: OracleGraph, declarations: string[], lowers: boolean = false): string {
    const nodes = graph.nodes;
    const edges = graph.edges;
    const T = Stamps.TOKEN;
    return `DECLARE
    v_offered VARCHAR2(40) := $x_stamp;
    v_root NUMBER;
    v_found VARCHAR2(40);
    v_made BOOLEAN := FALSE;
    v_ok BOOLEAN := TRUE;
    c SYS_REFCURSOR;
${declarations.map((it) => `    ${it}`).join('\n')}

    FUNCTION two_tokens(s VARCHAR2) RETURN BOOLEAN IS
    BEGIN
        RETURN s IS NOT NULL AND LENGTH(s) = ${2 * T + 1} AND SUBSTR(s, ${T + 1}, 1) = ':';
    END;

    PROCEDURE restamp(p NUMBER, p_changed BOOLEAN) IS
        s VARCHAR2(40);
    BEGIN
        SELECT stamp INTO s FROM ${nodes} WHERE nid = p;
        IF p_changed OR NOT two_tokens(s) THEN
            IF two_tokens(s) THEN s := SUBSTR(v_offered, 1, ${T}) || SUBSTR(s, ${T + 1});
            ELSE s := v_offered; END IF;
            UPDATE ${nodes} SET stamp = s WHERE nid = p;
        END IF;
    END;

    PROCEDURE relink(p NUMBER) IS
        s VARCHAR2(40);
    BEGIN
        SELECT stamp INTO s FROM ${nodes} WHERE nid = p;
        IF two_tokens(s) THEN s := SUBSTR(s, 1, ${T + 1}) || SUBSTR(v_offered, ${T + 2});
        ELSE s := v_offered; END IF;
        UPDATE ${nodes} SET stamp = s WHERE nid = p;
    END;

    FUNCTION find_node(p_match VARCHAR2, p_id VARCHAR2) RETURN NUMBER IS
        ids SYS.ODCINUMBERLIST;
    BEGIN
        EXECUTE IMMEDIATE 'SELECT nid FROM ${nodes} n WHERE ' || p_match BULK COLLECT INTO ids USING p_id;
        IF ids.COUNT > 1 THEN
            RAISE_APPLICATION_ERROR(-20001, ids.COUNT || ' nodes have the id ' || p_id || '. An id is one node''s.');
        END IF;
        RETURN CASE WHEN ids.COUNT = 1 THEN ids(1) END;
    END;

    FUNCTION make_node(p_labels VARCHAR2) RETURN NUMBER IS
        v NUMBER;
    BEGIN
        INSERT INTO ${nodes} (labels, props) VALUES (JSON(p_labels), JSON('{}')) RETURNING nid INTO v;
        RETURN v;
    END;

    FUNCTION has(a JSON_ARRAY_T, s VARCHAR2) RETURN BOOLEAN IS
    BEGIN
        FOR i IN 0 .. a.get_size - 1 LOOP
            IF a.get_string(i) = s THEN RETURN TRUE; END IF;
        END LOOP;
        RETURN FALSE;
    END;

    -- Merges the patch into the node's properties, adds and removes labels, and records an open label field's labels.
    -- Whether any of it changed the node.
    FUNCTION apply_node(p NUMBER, p_props CLOB, p_add VARCHAR2, p_remove VARCHAR2, p_record VARCHAR2, p_replace BOOLEAN)
        RETURN BOOLEAN IS
        old_props JSON;
        new_props JSON;
        old_labels JSON;
        labels JSON_ARRAY_T;
        kept JSON_ARRAY_T := JSON_ARRAY_T();
        additions JSON_ARRAY_T := JSON_ARRAY_T.parse(p_add);
        removals JSON_ARRAY_T := JSON_ARRAY_T.parse(p_remove);
        props JSON_OBJECT_T;
        recorded JSON_ARRAY_T;
        same NUMBER;
        relabelled BOOLEAN := FALSE;
        kept_text VARCHAR2(4000);
    BEGIN
        SELECT props, labels INTO old_props, old_labels FROM ${nodes} WHERE nid = p FOR UPDATE;
        SELECT JSON_MERGEPATCH(old_props, JSON(p_props)) INTO new_props FROM dual;
        labels := JSON_ARRAY_T.parse(JSON_SERIALIZE(old_labels));
        FOR i IN 0 .. labels.get_size - 1 LOOP
            IF has(removals, labels.get_string(i)) THEN relabelled := TRUE; ELSE kept.append(labels.get_string(i)); END IF;
        END LOOP;
        FOR i IN 0 .. additions.get_size - 1 LOOP
            IF NOT has(kept, additions.get_string(i)) THEN kept.append(additions.get_string(i)); relabelled := TRUE; END IF;
        END LOOP;
        IF p_record IS NOT NULL THEN
            props := JSON_OBJECT_T.parse(JSON_SERIALIZE(new_props RETURNING CLOB));
            IF p_replace OR NOT props.has(p_record) THEN recorded := JSON_ARRAY_T();
            ELSE recorded := props.get_array(p_record); END IF;
            FOR i IN 0 .. additions.get_size - 1 LOOP
                IF NOT has(recorded, additions.get_string(i)) THEN recorded.append(additions.get_string(i)); END IF;
            END LOOP;
            props.put(p_record, recorded);
            new_props := JSON(props.to_clob());
        END IF;
        SELECT CASE WHEN JSON_EQUAL(old_props, new_props) THEN 1 ELSE 0 END INTO same FROM dual;
        -- An object type's methods are PL/SQL's: called in SQL, they are refused (ORA-40573).
        kept_text := kept.to_string();
        UPDATE ${nodes} SET props = new_props, labels = JSON(kept_text) WHERE nid = p;
        RETURN same = 0 OR relabelled;
    END;

    FUNCTION write_node(p_match VARCHAR2, p_id VARCHAR2, p_labels VARCHAR2, p_props CLOB, p_add VARCHAR2,
        p_remove VARCHAR2, p_record VARCHAR2, p_replace BOOLEAN) RETURN NUMBER IS
        v NUMBER := find_node(p_match, p_id);
        made BOOLEAN := v IS NULL;
    BEGIN
        IF made THEN v := make_node(p_labels); END IF;
        restamp(v, apply_node(v, p_props, p_add, p_remove, p_record, p_replace) OR made);
        RETURN v;
    END;

    -- Joins two nodes by a relationship of the type, unless one is there (in either direction, for BOTH), and merges
    -- its properties. Both ends are marked when one is made or its properties change.
    PROCEDURE link(p_from NUMBER, p_to NUMBER, p_type VARCHAR2, p_dir VARCHAR2, p_props CLOB) IS
        e NUMBER;
        old_props JSON;
        new_props JSON;
        same NUMBER;
    BEGIN
        BEGIN
            SELECT eid, props INTO e, old_props FROM ${edges}
            WHERE type = p_type AND ((p_dir IN ('OUT', 'BOTH') AND src = p_from AND dst = p_to)
                OR (p_dir IN ('IN', 'BOTH') AND src = p_to AND dst = p_from))
            FETCH FIRST 1 ROW ONLY;
        EXCEPTION WHEN NO_DATA_FOUND THEN e := NULL;
        END;
        IF e IS NULL THEN
            INSERT INTO ${edges} (src, dst, type, props) VALUES (CASE WHEN p_dir = 'IN' THEN p_to ELSE p_from END,
                CASE WHEN p_dir = 'IN' THEN p_from ELSE p_to END, p_type, JSON(NVL(p_props, '{}')));
            relink(p_from);
            relink(p_to);
        ELSIF p_props IS NOT NULL THEN
            SELECT JSON_MERGEPATCH(old_props, JSON(p_props)) INTO new_props FROM dual;
            SELECT CASE WHEN JSON_EQUAL(old_props, new_props) THEN 1 ELSE 0 END INTO same FROM dual;
            IF same = 0 THEN
                UPDATE ${edges} SET props = new_props WHERE eid = e;
                relink(p_from);
                relink(p_to);
            END IF;
        END IF;
    END;

    -- Removes the relationships p_dropped selects from the root, marks both ends, and deletes each removed node
    -- p_unreferenced counts as no longer referred to.
    PROCEDURE trim_edges(p_root NUMBER, p_dropped VARCHAR2, p_keep VARCHAR2, p_unreferenced VARCHAR2, p_held VARCHAR2) IS
        eids SYS.ODCINUMBERLIST;
        nids SYS.ODCINUMBERLIST;
        unreferenced NUMBER;
    BEGIN
        EXECUTE IMMEDIATE p_dropped BULK COLLECT INTO eids, nids USING p_root, p_keep;
        FOR i IN 1 .. eids.COUNT LOOP
            DELETE FROM ${edges} WHERE eid = eids(i);
        END LOOP;
        FOR i IN 1 .. nids.COUNT LOOP
            relink(nids(i));
        END LOOP;
        IF eids.COUNT > 0 THEN relink(p_root); END IF;
        IF p_unreferenced IS NOT NULL THEN
            FOR i IN 1 .. nids.COUNT LOOP
                IF nids(i) <> p_root THEN
                    EXECUTE IMMEDIATE p_unreferenced INTO unreferenced USING nids(i), p_held;
                    IF unreferenced > 0 THEN DELETE FROM ${nodes} WHERE nid = nids(i); END IF;
                END IF;
            END LOOP;
        END IF;
    END;${lowers ? `\n\n${lowerNode(nodes)}` : ''}`;
}

/**
 * `lower_node`: writes on the node the lowercased copy of each property `p_keys`, a JSON array, names, from what it
 * holds, and removes the copy of one that holds nothing, which an empty text is on Oracle. Oracle lowercases it, as it
 * lowercases what a lookup compares the copy with: see LowerCopies. It is called once a write's change is told, so the
 * copies are no part of it.
 */
function lowerNode(nodes: string): string {
    return `    -- Writes the lowercased copy of each property p_keys names from what the node holds, and removes the copy of one
    -- that holds nothing. Called once the write's change is told: the copies are no part of it.
    PROCEDURE lower_node(p NUMBER, p_keys VARCHAR2) IS
        held CLOB;
        o JSON_OBJECT_T;
        lowered JSON_ARRAY_T := JSON_ARRAY_T.parse(p_keys);
        k VARCHAR2(4000);
        v VARCHAR2(32767);
    BEGIN
        SELECT JSON_SERIALIZE(props RETURNING CLOB) INTO held FROM ${nodes} WHERE nid = p;
        o := JSON_OBJECT_T.parse(held);
        FOR i IN 0 .. lowered.get_size - 1 LOOP
            k := lowered.get_string(i);
            v := NULL;
            IF o.has(k) AND NOT o.get(k).is_null THEN v := LOWER(o.get_string(k)); END IF;
            -- Oracle keeps an empty text as null, so an empty property has no copy.
            IF v IS NULL THEN o.remove('${LowerCopies.PREFIX}' || k);
            ELSE o.put('${LowerCopies.PREFIX}' || k, v); END IF;
        END LOOP;
        -- An object type's methods are PL/SQL's: called in SQL, they are refused (ORA-40573).
        held := o.to_clob();
        UPDATE ${nodes} SET props = JSON(held) WHERE nid = p;
    END;`;
}

function direction(value: Direction): 'OUT' | 'IN' | 'BOTH' {
    return value === Direction.INCOMING ? 'IN' : value === Direction.UNDIRECTED ? 'BOTH' : 'OUT';
}

/** A test over the relationship row `r` that holds when it still refers to the node `x` as the field did. */
function referencedAs(value: Direction): string {
    switch (value) {
        case Direction.INCOMING:
            return 'r.src = x.nid';
        case Direction.UNDIRECTED:
            return '(r.src = x.nid OR r.dst = x.nid)';
        default:
            return 'r.dst = x.nid';
    }
}
