import { DrivineError } from '@/DrivineError';
import { Expression, FunctionCall } from '@/cypher/ast/Expression';
import { Group, Pattern } from '@/cypher/ast/Pattern';
import { Call, Clause, Projection, Query, SetItem } from '@/cypher/ast/Query';
import { bracketed, imports } from '@/cypher/sql/CypherSyntax';
import { knownOf } from '@/cypher/sql/Value';

/** A kind of variable: see {@link VariableKinds}. A value's kinds are named as {@link knownOf} names them; `ANY` is any kind at all. */
type Kind =
    | 'NODE'
    | 'RELATIONSHIP'
    | 'RELATIONSHIPS'
    | 'PATH'
    | 'INTEGER'
    | 'FLOAT'
    | 'TEXT'
    | 'BOOLEAN'
    | 'LIST'
    | 'MAP'
    | 'ANY';

/** A variable of each kind, as a message names it. */
const NOUNS: Record<Kind, string> = {
    NODE: 'a node',
    RELATIONSHIP: 'a relationship',
    RELATIONSHIPS: 'a list of relationships',
    PATH: 'a path',
    INTEGER: 'an integer',
    FLOAT: 'a float',
    TEXT: 'a text',
    BOOLEAN: 'a truth value',
    LIST: 'a list',
    MAP: 'a map',
    ANY: 'a value'
};

/** The variables in scope, by name, each of its kind. */
type Scope = Map<string, Kind>;

/**
 * The kind of each variable of a statement, as Neo4j works it out when it plans the statement, and the statements it
 * refuses for them: a variable used as two kinds, `MATCH (a)-[a]->()` (Neo4j's VariableTypeConflict), and one bound
 * already where a pattern makes it, `MATCH (a) CREATE (a)` (VariableAlreadyBound). Read from the statement alone, before
 * it is compiled, so a statement that compiles is compiled as it was, and one refused here is refused for what is wrong
 * with it, not for what the compiler does not take yet. As drivine4j's VariableKinds.
 *
 * Only a kind the statement fixes is known: a pattern's node, relationship, variable-length relationship or path, a value
 * written, and a variable a `WITH` passes on as it is. Any other value (a property, a parameter, an unwound item, a
 * function's result) may be of any kind, and is never refused here as being of another: what it is used as is left to
 * the compiler, as before.
 */
export const VariableKinds = {
    /** Refuses `query` where a variable of it is used as two kinds, or made where it is bound already. */
    check(query: Query): void {
        queryKinds(query, new Map());
    }
};

/** `query`'s variables, from those of `outer` it reads: what each part of it returns. */
function queryKinds(query: Query, outer: Scope): Scope[] {
    return [query.clauses, ...query.unions.map((it) => it.clauses)].map((it) => clauses(it, new Map(outer)));
}

/**
 * `list`, the clauses, in turn, over `scope`: what their `RETURN` returns, of the kinds it returns. Within a `FOREACH`,
 * `foreach`, a `CREATE` or a `MERGE` may name a variable bound already, as Neo4j takes it there. `kept` stay in scope
 * after each `WITH` that does not name them, as what a `CALL`'s brackets import does.
 */
function clauses(list: Clause[], scope: Scope, foreach = false, kept: Scope = new Map()): Scope {
    let current = scope;
    let returned: Scope = new Map();
    for (const clause of list) {
        switch (clause.kind) {
            case 'Match':
                clause.patterns.forEach((it) => matched(it, current));
                if (clause.where) {
                    expression(clause.where, current);
                }
                break;
            case 'Unwind':
                expression(clause.list, current);
                current.set(clause.variable, 'ANY');
                break;
            case 'With':
                current = projected(clause.projection, current, clause.where);
                kept.forEach((kind, name) => {
                    if (!current.has(name)) {
                        current.set(name, kind);
                    }
                });
                break;
            case 'Return':
                returned = projected(clause.projection, current, undefined);
                break;
            case 'Create': {
                const made = new Set<string>();
                clause.patterns.forEach((it) => madeOf(it, current, made, false, foreach));
                break;
            }
            case 'Merge':
                madeOf(clause.pattern, current, new Set(), true, foreach);
                [...clause.onCreate, ...clause.onMatch].forEach((it) => set(it, current));
                break;
            case 'Set':
                clause.items.forEach((it) => set(it, current));
                break;
            case 'Remove':
                break;
            case 'Delete':
                clause.expressions.forEach((it) => expression(it, current));
                break;
            case 'Foreach': {
                expression(clause.list, current);
                const inner = new Map(current);
                inner.set(clause.variable, 'ANY');
                clauses(clause.clauses, inner, true);
                break;
            }
            case 'Call':
                called(clause, current).forEach((kind, name) => current.set(name, kind));
                break;
        }
    }
    return returned;
}

/**
 * What `call` returns, of the kinds each of its queries returns, read from the row `scope` holds: only a variable its
 * brackets import, `CALL (a) { … }` or `CALL (*) { … }`, or where it has none its leading `WITH` imports as it is, or
 * with `*`, of the kind it is; any other of the row is a new variable there, as in Neo4j.
 */
function called(call: Call, scope: Scope): Scope {
    const query = call.query;
    const parts = [query.clauses, ...query.unions.map((it) => it.clauses)].map((list) => {
        const imported = imports(call, list, scope.keys());
        const inner: Scope = new Map([...scope].filter(([name]) => imported.has(name)));
        // What its brackets import stays in scope after a WITH that does not name it.
        return clauses(list, new Map(inner), false, bracketed(call) ? inner : new Map());
    });
    return new Map(
        [...parts[0]].map(([name, kind]): [string, Kind] => [
            name,
            parts.every((it) => it.get(name) === kind) ? kind : 'ANY'
        ])
    );
}

/**
 * The scope after a `WITH` or a `RETURN` of `projection` over `scope`: each item of the kind its expression is, and with
 * `*` each variable in scope. Its `WHERE`, `where`, and its order read the items, and a variable before it as of any kind.
 */
function projected(projection: Projection, scope: Scope, where: Expression | undefined): Scope {
    projection.items.forEach((it) => expression(it.expression, scope));
    const next: Scope = projection.star ? new Map(scope) : new Map();
    projection.items.forEach((it) => next.set(it.name, kindOf(it.expression, scope)));
    const reading: Scope = new Map([...[...scope.keys()].map((it): [string, Kind] => [it, 'ANY']), ...next]);
    if (where) {
        expression(where, reading);
    }
    projection.orderBy.forEach((it) => expression(it.expression, reading));
    if (projection.skip) {
        expression(projection.skip, scope);
    }
    if (projection.limit) {
        expression(projection.limit, scope);
    }
    return next;
}

/** The kind of `value`, where the statement fixes it: see {@link VariableKinds}. */
function kindOf(value: Expression, scope: Scope): Kind {
    switch (value.kind) {
        case 'Variable':
            return scope.get(value.name) ?? 'ANY';
        case 'Literal':
            return knownOf(value.value) ?? 'ANY';
        case 'ListLiteral':
            return 'LIST';
        case 'MapLiteral':
            return 'MAP';
        default:
            return 'ANY';
    }
}

/**
 * A pattern a `MATCH` finds, over `scope`: what it names, bound as it names it, or used as it is bound. Its path
 * variable is new, but in a pattern within an expression, `within`, where it is the pattern's own.
 */
function matched(pattern: Pattern, scope: Scope, within = false): void {
    // In the order written, so the first of two kinds is the one the variable is bound as.
    pattern.nodes.forEach((node, i) => {
        if (node.properties) {
            expression(node.properties, scope);
        }
        if (node.variable !== undefined) {
            use(node.variable, 'NODE', scope);
        }
        const relationship = pattern.relationships[i];
        if (relationship === undefined) {
            return;
        }
        if (relationship.properties) {
            expression(relationship.properties, scope);
        }
        if (relationship.group) {
            grouped(relationship.group, scope);
        }
        if (relationship.variable !== undefined) {
            use(relationship.variable, relationship.range ? 'RELATIONSHIPS' : 'RELATIONSHIP', scope);
        }
    });
    const variable = pattern.variable;
    if (variable !== undefined) {
        if (!within && scope.has(variable)) {
            throw new DrivineError(`${variable} is bound already, so a pattern binds no path to it, as in Neo4j.`);
        }
        scope.set(variable, 'PATH');
    }
}

/** A quantified path pattern's `group`: what it names is a list outside it, of whatever it matched. */
function grouped(group: Group, scope: Scope): void {
    [...group.pattern.nodes, ...group.pattern.relationships]
        .map((it) => it.variable)
        .forEach((it) => {
            if (it !== undefined && !scope.has(it)) {
                scope.set(it, 'ANY');
            }
        });
}

/** `variable` where a pattern binds it as `kind`: bound so, or used so where it is bound already as that kind. */
function use(variable: string, kind: Kind, scope: Scope): void {
    const bound = scope.get(variable);
    if (bound === undefined) {
        scope.set(variable, kind);
    } else if (!fits(bound, kind)) {
        throw conflict(variable, bound, kind);
    }
}

/** Whether a variable bound as `bound` may be used where a pattern takes `kind`. */
function fits(bound: Kind, kind: Kind): boolean {
    return bound === kind || bound === 'ANY' || (kind === 'RELATIONSHIPS' && bound === 'LIST');
}

function conflict(variable: string, bound: Kind, used: Kind): DrivineError {
    return new DrivineError(
        `${variable} is ${NOUNS[bound]}, and is used as ${NOUNS[used]}: a variable is of one kind, as in Neo4j.`
    );
}

/**
 * A pattern a `CREATE` or a `MERGE` makes, over `scope`: each node of it new, or one bound already that it joins up,
 * and each relationship new: a node a pattern of the same `CREATE` made before it is bound already. `made` holds the
 * relationships the clause made before. A relationship bound before the clause, as one, is left to the compiler, which
 * refuses it as not compiled yet, as the spec has it. Within a `FOREACH`, `foreach`, Neo4j takes a variable bound
 * already in each of these places, and only one of another kind is refused.
 */
function madeOf(pattern: Pattern, scope: Scope, made: Set<string>, merging: boolean, foreach: boolean): void {
    const clause = merging ? 'MERGE' : 'CREATE';
    pattern.nodes.forEach((node) => {
        if (node.properties) {
            expression(node.properties, scope);
        }
        const variable = node.variable;
        if (variable === undefined) {
            return;
        }
        const bound = scope.get(variable);
        if (bound === undefined) {
            scope.set(variable, 'NODE');
            return;
        }
        if (!foreach && (node.labels.length > 0 || node.properties !== undefined)) {
            throw new DrivineError(
                `${variable} is bound already, so a CREATE or MERGE makes no node of it with labels or properties.`
            );
        }
        if (pattern.relationships.length === 0) {
            if (!foreach) {
                throw new DrivineError(`${variable} is bound already, so a ${clause} makes no node of it, as in Neo4j.`);
            }
            return;
        }
        if (!fits(bound, 'NODE')) {
            throw conflict(variable, bound, 'NODE');
        }
    });
    pattern.relationships.forEach((relationship) => {
        if (relationship.properties) {
            expression(relationship.properties, scope);
        }
        const variable = relationship.variable;
        if (variable === undefined) {
            return;
        }
        if (foreach) {
            scope.set(variable, scope.get(variable) ?? 'RELATIONSHIP');
            return;
        }
        const bound = scope.get(variable);
        if (bound !== undefined && (bound !== 'RELATIONSHIP' || made.has(variable))) {
            throw new DrivineError(
                `${variable} is bound already, so a ${clause} makes no relationship of it, as in Neo4j.`
            );
        }
        scope.set(variable, 'RELATIONSHIP');
        made.add(variable);
    });
    if (pattern.variable !== undefined && !scope.has(pattern.variable)) {
        scope.set(pattern.variable, 'PATH');
    }
}

function set(item: SetItem, scope: Scope): void {
    if (item.kind !== 'Labels') {
        expression(item.value, scope);
    }
}

/**
 * The patterns within `value`, each over `scope` and what it names only within it, and the functions of a variable
 * whose kind they do not take.
 */
function expression(value: Expression, scope: Scope): void {
    switch (value.kind) {
        case 'Literal':
        case 'Parameter':
        case 'Variable':
        case 'CountStar':
            return;
        case 'Property':
        case 'HasLabels':
            return expression(value.subject, scope);
        case 'ListLiteral':
            return value.items.forEach((it) => expression(it, scope));
        case 'MapLiteral':
            return value.entries.forEach(([, it]) => expression(it, scope));
        case 'MapProjection':
            return value.elements.forEach((it) => {
                if (it.kind === 'Entry') {
                    expression(it.value, scope);
                }
            });
        case 'Binary':
            expression(value.left, scope);
            return expression(value.right, scope);
        case 'Unary':
            return expression(value.operand, scope);
        case 'Index':
            expression(value.subject, scope);
            return expression(value.index, scope);
        case 'Slice':
            return [value.subject, value.from, value.to].forEach((it) => it && expression(it, scope));
        case 'Function':
            value.arguments.forEach((it) => expression(it, scope));
            return functionOf(value, scope);
        case 'Case':
            [value.subject, value.otherwise].forEach((it) => it && expression(it, scope));
            return value.alternatives.forEach(([key, result]) => {
                expression(key, scope);
                expression(result, scope);
            });
        case 'ListComprehension': {
            expression(value.list, scope);
            const inner: Scope = new Map(scope).set(value.variable, 'ANY');
            return [value.where, value.projection].forEach((it) => it && expression(it, inner));
        }
        case 'Quantifier': {
            expression(value.list, scope);
            const inner: Scope = new Map(scope).set(value.variable, 'ANY');
            return value.where && expression(value.where, inner);
        }
        case 'Reduce': {
            expression(value.initial, scope);
            expression(value.list, scope);
            const inner: Scope = new Map(scope).set(value.accumulator, 'ANY').set(value.variable, 'ANY');
            return expression(value.expression, inner);
        }
        case 'PatternComprehension': {
            const inner: Scope = new Map(scope);
            matched(value.pattern, inner, true);
            if (value.where) {
                expression(value.where, inner);
            }
            return expression(value.projection, inner);
        }
        case 'PatternPredicate':
            return matched(value.pattern, new Map(scope), true);
        case 'Exists': {
            const inner: Scope = new Map(scope);
            value.patterns.forEach((it) => matched(it, inner, true));
            return value.where && expression(value.where, inner);
        }
        case 'Subquery':
            queryKinds(value.query, scope);
            return;
    }
}

/** A function of a variable whose kind it does not take, as Neo4j refuses it: `size()` of a path. */
function functionOf(fn: FunctionCall, scope: Scope): void {
    const argument = fn.arguments.length === 1 ? fn.arguments[0] : undefined;
    const kind = argument?.kind === 'Variable' ? scope.get(argument.name) : undefined;
    if (fn.name.toLowerCase() === 'size' && kind === 'PATH') {
        throw new DrivineError('size() takes a list or a text, not a path, as in Neo4j: length() takes a path.');
    }
}
