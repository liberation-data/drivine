import { Direction } from '@/annotation/Metadata';
import { GraphStatement } from '@/backend/GraphStatement';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { MatchedNode } from '@/backend/EdgeStatements';
import { idOf, objectProps } from '@/backend/SaveStatementBuilder';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { prelude } from '@/backend/oracle/OracleSaveBuilder';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { Stamps } from '@/model/Stamps';
import { RelateMode } from '@/manager/NodeRef';
import { SaveOptions } from '@/manager/SaveOptions';

/**
 * The writes beside a save, each one PL/SQL block over the save block's procedures, so stamps are kept as a save keeps
 * them: patch and patchAll, a batch of fragments, and relationships written on their own.
 */
export class OracleWrites {
    /** Bindings the helpers below name, taken by the next block. */
    private readonly pending: Record<string, any> = {};
    /** Whether the next block writes lowercased copies, and so declares `lower_node`. */
    private lowers = false;

    constructor(private readonly graph: OracleGraph) {}

    /** Writes `$set` (a merge patch) to the node with id `$id` if it meets `where`: `{found, applied, changed}`. */
    patchOne(model: FragmentModel, where?: string): GraphStatement {
        const condition = where
            ? `SELECT COUNT(*) INTO v_meets FROM ${this.graph.nodes} n WHERE n.nid = v_root AND (${where});`
            : 'v_meets := 1;';
        return this.block(
            ['v_meets NUMBER;', 'v_changed BOOLEAN := FALSE;', 'v_id VARCHAR2(4000);', 'v_patch CLOB;'],
            [
                'SELECT JSON_SERIALIZE(JSON_SCALAR($id)) INTO v_id FROM dual;',
                `v_root := find_node(${this.match(model)}, v_id);`,
                'IF v_root IS NOT NULL THEN',
                `    SELECT stamp INTO v_found FROM ${this.graph.nodes} WHERE nid = v_root FOR UPDATE;`,
                `    ${condition}`,
                '    IF v_meets > 0 THEN',
                // As a CLOB: JSON_SERIALIZE gives a VARCHAR2(4000) unless told otherwise, too short for a long text.
                "        SELECT JSON_SERIALIZE(JSON_MERGEPATCH(JSON($set), JSON(NVL($vectors, '{}'))) RETURNING CLOB) " +
                    'INTO v_patch FROM dual;',
                "        v_changed := apply_node(v_root, v_patch, '[]', '[]', NULL, FALSE);",
                '        restamp(v_root, v_changed);',
                ...this.lowering(model, 'IF v_changed THEN ', ' END IF;').map((it) => `        ${it}`),
                '    END IF;',
                'END IF;',
                "OPEN c FOR SELECT JSON_OBJECT('found' VALUE v_root IS NOT NULL, 'applied' VALUE NVL(v_meets, 0) > 0, " +
                    '\'changed\' VALUE v_changed RETURNING CLOB) AS "result:json" FROM dual;'
            ]
        );
    }

    /** Writes each row of `$rows`, `{id, props, vectors}`, to its node, making none: `{id, found, changed}` per row. */
    patchMany(model: FragmentModel): GraphStatement {
        return this.block(
            [
                'v_changed BOOLEAN;',
                'v_out SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();',
                'TYPE texts IS TABLE OF CLOB;',
                'v_ids texts;',
                'v_patches texts;'
            ],
            [
                // Read whole before any write: a cursor loop over the bound rows, with writes in it, stopped after the
                // first node it changed (23.26), silently. Each patch as a CLOB, as in patchOne.
                "SELECT JSON_SERIALIZE(id), JSON_SERIALIZE(JSON_MERGEPATCH(NVL(props, JSON('{}')), " +
                    "NVL(vectors, JSON('{}'))) RETURNING CLOB) BULK COLLECT INTO v_ids, v_patches FROM " +
                    "JSON_TABLE($rows, '$[*]' COLUMNS (id JSON PATH '$.id', props JSON PATH '$.props', " +
                    "vectors JSON PATH '$.vectors'));",
                'FOR i IN 1 .. v_ids.COUNT LOOP',
                `    v_root := find_node(${this.match(model)}, v_ids(i));`,
                '    v_changed := FALSE;',
                '    IF v_root IS NOT NULL THEN',
                `        SELECT stamp INTO v_found FROM ${this.graph.nodes} WHERE nid = v_root FOR UPDATE;`,
                "        v_changed := apply_node(v_root, v_patches(i), '[]', '[]', NULL, FALSE);",
                '        restamp(v_root, v_changed);',
                ...this.lowering(model, 'IF v_changed THEN ', ' END IF;').map((it) => `        ${it}`),
                '    END IF;',
                '    v_out.EXTEND;',
                "    SELECT JSON_SERIALIZE(JSON_OBJECT('id' VALUE JSON(v_ids(i)), 'found' VALUE v_root IS NOT NULL, " +
                    "'changed' VALUE v_changed)) INTO v_out(v_out.COUNT) FROM dual;",
                'END LOOP;',
                // Rows from a collection, as text: a returned result set with a JSON column gives only its prefetched rows
                // (oracle/node-oracledb#1795).
                'OPEN c FOR SELECT column_value AS "result:json" FROM TABLE(v_out);'
            ]
        );
    }

    /**
     * Saves fragments of several classes, adding to what each node holds and checking no stamp: `{groups: [{before,
     * after}]}`, the `{id, stamp}` of each class's nodes before and after.
     */
    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement {
        const bindings: Record<string, any> = {};
        let count = 0;
        const bind = (value: unknown): string => {
            const name = `x_${++count}`;
            bindings[name] = value;
            return `$${name}`;
        };
        const declarations: string[] = [];
        const body: string[] = [];
        const reads = (when: 'before' | 'after'): void =>
            groups.forEach((group, i) => {
                const k = jsonKey(group.model.nodeIdProperty!);
                const variable = `v_${when}${i}`;
                if (when === 'before') {
                    declarations.push(`${variable} CLOB;`, `v_after${i} CLOB;`);
                }
                body.push(
                    `SELECT NVL(JSON_ARRAYAGG(JSON_OBJECT('id' VALUE JSON_QUERY(n.props, '$${k}'), 'stamp' VALUE ` +
                        `NVL(n.stamp, '${Stamps.NEVER_STAMPED}')) RETURNING CLOB), '[]') INTO ${variable} FROM ${this.graph.nodes} n ` +
                        `WHERE ${hasLabels('n', group.model.labels)} AND EXISTS (SELECT 1 FROM JSON_TABLE(${bind(
                            JSON.stringify(group.objects.map((it) => idOf(group.model, it)))
                        )}, '$[*]' COLUMNS (v JSON PATH '$')) t WHERE JSON_EXISTS(n.props, '$?(@${k} == $v)' PASSING t.v AS "v"));`
                );
            });
        reads('before');
        groups.forEach((group) => {
            for (const object of group.objects) {
                const props = objectProps(group.model, object, options);
                body.push(
                    `v_root := write_node(${bind(this.matchText(group.model))}, ${bind(
                        JSON.stringify(idOf(group.model, object))
                    )}, ` +
                        `${bind(JSON.stringify(group.model.labels))}, ${bind(
                            JSON.stringify(props, (_, value) => (value === undefined ? null : value))
                        )}, '[]', '[]', NULL, FALSE);`,
                    ...this.lowering(group.model)
                );
            }
        });
        reads('after');
        const result = groups
            .map(
                (_, i) =>
                    `JSON_OBJECT('before' VALUE JSON(v_before${i}), 'after' VALUE JSON(v_after${i}) RETURNING JSON)`
            )
            .join(', ');
        body.push(
            `OPEN c FOR SELECT JSON_OBJECT('groups' VALUE JSON_ARRAY(${result} RETURNING JSON) RETURNING CLOB) AS "result:json" FROM dual;`
        );
        return this.block(declarations, body, bindings);
    }

    /** Joins `from` to `to`: how many such relationships there are after, 0 when either node is absent. */
    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        assertType(type);
        const written = Object.fromEntries(Object.entries(properties).filter(([, value]) => value != null));
        const merge = mode === RelateMode.MERGE;
        return this.block(
            ['v_to NUMBER;', 'v_had NUMBER := 0;', 'v_same NUMBER := 0;', 'v_related NUMBER := 0;'],
            [
                ...this.ends(from, to),
                'IF v_root IS NOT NULL AND v_to IS NOT NULL THEN',
                // Both locked, in the order of their keys, so two relates of one pair don't wait on each other.
                `    SELECT stamp INTO v_found FROM ${this.graph.nodes} WHERE nid = LEAST(v_root, v_to) FOR UPDATE;`,
                `    SELECT stamp INTO v_found FROM ${this.graph.nodes} WHERE nid = GREATEST(v_root, v_to) FOR UPDATE;`,
                ...(merge
                    ? [
                          `    SELECT COUNT(*), NVL(SUM(CASE WHEN JSON_EQUAL(props, JSON_MERGEPATCH(props, JSON($x_props))) THEN 1 ELSE 0 END), 0)`,
                          `        INTO v_had, v_same FROM ${this.graph.edges} WHERE src = v_root AND dst = v_to AND type = $x_type;`,
                          '    IF v_had = 0 THEN',
                          `        INSERT INTO ${this.graph.edges} (src, dst, type, props) VALUES (v_root, v_to, $x_type, JSON($x_props));`,
                          '    ELSE',
                          `        UPDATE ${this.graph.edges} SET props = JSON_MERGEPATCH(props, JSON($x_props)) WHERE src = v_root AND dst = v_to AND type = $x_type;`,
                          '    END IF;',
                          '    IF v_had = 0 OR v_same < v_had THEN relink(v_root); relink(v_to); END IF;',
                          '    v_related := GREATEST(v_had, 1);'
                      ]
                    : [
                          `    INSERT INTO ${this.graph.edges} (src, dst, type, props) VALUES (v_root, v_to, $x_type, JSON($x_props));`,
                          '    relink(v_root);',
                          '    relink(v_to);',
                          '    v_related := 1;'
                      ]),
                'END IF;',
                'OPEN c FOR SELECT v_related AS "related" FROM dual;'
            ],
            { x_type: type, x_props: JSON.stringify(written) }
        );
    }

    /** Removes every relationship of the type from `from` to `to`: how many there were. */
    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        assertType(type);
        return this.block(
            ['v_to NUMBER;', 'v_removed NUMBER := 0;'],
            [
                ...this.ends(from, to),
                'IF v_root IS NOT NULL AND v_to IS NOT NULL THEN',
                `    DELETE FROM ${this.graph.edges} WHERE src = v_root AND dst = v_to AND type = $x_type;`,
                '    v_removed := SQL%ROWCOUNT;',
                '    IF v_removed > 0 THEN relink(v_root); relink(v_to); END IF;',
                'END IF;',
                'OPEN c FOR SELECT v_removed AS "removed" FROM dual;'
            ],
            { x_type: type }
        );
    }

    /** Removes every relationship of the type `from` has in the direction: how many there were. */
    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        assertType(type);
        const mine =
            direction === Direction.INCOMING
                ? 'dst = v_root'
                : direction === Direction.UNDIRECTED
                ? '(src = v_root OR dst = v_root)'
                : 'src = v_root';
        return this.block(
            ['v_removed NUMBER := 0;', 'v_others SYS.ODCINUMBERLIST;'],
            [
                `v_root := find_node(${this.matchOf(from)}, $x_from);`,
                'IF v_root IS NOT NULL THEN',
                `    SELECT CASE WHEN src = v_root THEN dst ELSE src END BULK COLLECT INTO v_others FROM ${this.graph.edges} WHERE type = $x_type AND ${mine};`,
                `    DELETE FROM ${this.graph.edges} WHERE type = $x_type AND ${mine};`,
                '    v_removed := SQL%ROWCOUNT;',
                '    FOR i IN 1 .. v_others.COUNT LOOP relink(v_others(i)); END LOOP;',
                '    IF v_removed > 0 THEN relink(v_root); END IF;',
                'END IF;',
                'OPEN c FOR SELECT v_removed AS "removed" FROM dual;'
            ],
            { x_type: type, x_from: JSON.stringify(from.id) }
        );
    }

    /** The nodes of `target` joined to `from` by the type in the direction, each once, as fragment rows. */
    related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement {
        assertType(type);
        const join =
            direction === Direction.INCOMING
                ? 'e.dst = a.nid AND x.nid = e.src'
                : direction === Direction.UNDIRECTED
                ? '((e.src = a.nid AND x.nid = e.dst) OR (e.dst = a.nid AND x.nid = e.src))'
                : 'e.src = a.nid AND x.nid = e.dst';
        const labels = [...new Set([...from.model.labels, ...(from.labels ?? [])])];
        return new GraphStatement(
            `SELECT ${nodeDocument('n')} AS "result" FROM ${this.graph.nodes} n WHERE n.nid IN (` +
                `SELECT x.nid FROM ${this.graph.nodes} a JOIN ${this.graph.edges} e ON e.type = $x_type ` +
                `JOIN ${this.graph.nodes} x ON ${join} WHERE ${hasLabels('a', labels)} AND ` +
                `JSON_EXISTS(a.props, '$?(@${jsonKey(
                    idProperty(from.model)
                )} == $v)' PASSING JSON($x_from) AS "v") AND ` +
                `${hasLabels('x', target.labels)})`,
            { x_type: type, x_from: JSON.stringify(from.id) }
        );
    }

    /** Finds both ends, into v_root and v_to. */
    private ends(from: MatchedNode, to: MatchedNode): string[] {
        return [
            `v_root := find_node(${this.matchOf(from)}, $x_from);`,
            `v_to := find_node(${this.matchOf(to, 'x_tomatch')}, $x_to);`
        ];
    }

    private matchOf(node: MatchedNode, name: string = 'x_frommatch'): string {
        const labels = [...new Set([...node.model.labels, ...(node.labels ?? [])])];
        const k = jsonKey(idProperty(node.model));
        this.pending[name] = `${hasLabels(
            'n',
            labels
        )} AND JSON_EXISTS(n.props, '$?(@${k} == $v)' PASSING JSON(:1) AS "v")`;
        if (name === 'x_frommatch') {
            this.pending.x_from = JSON.stringify(node.id);
        } else {
            this.pending.x_to = JSON.stringify(node.id);
        }
        return `$${name}`;
    }

    private match(model: FragmentModel): string {
        this.pending.x_match = this.matchText(model);
        return '$x_match';
    }

    private matchText(model: FragmentModel): string {
        const k = jsonKey(idProperty(model));
        return `${hasLabels('n', model.labels)} AND JSON_EXISTS(n.props, '$?(@${k} == $v)' PASSING JSON(:1) AS "v")`;
    }

    /**
     * The call that writes the lowercased copies of the model's `@CaseInsensitive` properties on the node `v_root`, from
     * what it now holds, once its change is told (see LowerCopies), between `before` and `after`: none for a model with
     * none. The block it is in declares `lower_node`.
     */
    private lowering(model: FragmentModel, before: string = '', after: string = ''): string[] {
        if (!model.lowerCopied.length) {
            return [];
        }
        this.lowers = true;
        return [`${before}lower_node(v_root, ${this.pend(JSON.stringify(model.lowerCopied))});${after}`];
    }

    /** Binds the value for the next block, under a name of its own. */
    private pend(value: unknown): string {
        const name = `x_lower${Object.keys(this.pending).length}`;
        this.pending[name] = value;
        return `$${name}`;
    }

    private block(declarations: string[], body: string[], bindings: Record<string, any> = {}): GraphStatement {
        const lowers = this.lowers;
        this.lowers = false;
        const text = `${prelude(this.graph, declarations, lowers)}
BEGIN
${body.map((it) => `    ${it}`).join('\n')}
    DBMS_SQL.RETURN_RESULT(c);
END;`;
        const all = { ...this.pending, ...bindings, x_stamp: Stamps.fresh() };
        for (const key of Object.keys(this.pending)) {
            delete this.pending[key];
        }
        return new GraphStatement(text, all);
    }
}

function idProperty(model: FragmentModel): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(
            `${model.type.name} has no @NodeId property, so a node of it can't be referred to by id.`
        );
    }
    return model.nodeIdProperty;
}

function assertType(type: string): void {
    if (!type?.trim()) {
        throw new DrivineError('A relationship needs a type.');
    }
}
