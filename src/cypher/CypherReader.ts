import { BaseErrorListener, CharStream, CommonTokenStream, ParseTree, TerminalNode } from 'antlr4ng';
import { DrivineError } from '@/DrivineError';
import { CypherLexer } from '@/cypher/grammar/CypherLexer';
import {
    CypherParser,
    OC_AddOrSubtractExpressionContext,
    OC_AtomContext,
    OC_CaseExpressionContext,
    OC_ComparisonExpressionContext,
    OC_ExpressionContext,
    OC_InQueryCallContext,
    OC_IntegerLiteralContext,
    OC_ListOperatorExpressionContext,
    OC_ListPredicateExpressionContext,
    OC_LiteralContext,
    OC_MapLiteralContext,
    OC_MapProjectionContext,
    OC_MultiplyDivideModuloExpressionContext,
    OC_NodeLabelsContext,
    OC_NodePatternContext,
    OC_NonArithmeticOperatorExpressionContext,
    OC_NullPredicateExpressionContext,
    OC_ParameterContext,
    OC_PathQuantifierContext,
    OC_PatternContext,
    OC_PatternElementChainContext,
    OC_PatternElementContext,
    OC_ProcedureNameContext,
    OC_ProjectionBodyContext,
    OC_PropertiesContext,
    OC_PropertyExpressionContext,
    OC_PropertyLookupContext,
    OC_QuantifiedPathPatternContext,
    OC_QueryContext,
    OC_RangeLiteralContext,
    OC_ReadingClauseContext,
    OC_RegularQueryContext,
    OC_RelationshipPatternContext,
    OC_RelationshipsPatternContext,
    OC_RemoveItemContext,
    OC_ReturnContext,
    OC_SchemaNameContext,
    OC_SetContext,
    OC_SingleQueryContext,
    OC_StandaloneCallContext,
    OC_StringListNullPredicateExpressionContext,
    OC_StringPredicateExpressionContext,
    OC_SubqueryCallContext,
    OC_SubqueryReadingsContext,
    OC_SymbolicNameContext,
    OC_UnaryAddOrSubtractExpressionContext,
    OC_UpdatingClauseContext,
    OC_VariableContext,
    OC_WithContext,
    OC_YieldItemsContext
} from '@/cypher/grammar/CypherParser';
import {
    BinaryOperator,
    CypherFloat,
    Expression,
    MapLiteral,
    MapProjectionElement,
    Parameter
} from '@/cypher/ast/Expression';
import { Direction, NodePattern, Pattern, Range, RelationshipPattern } from '@/cypher/ast/Pattern';
import { Clause, Projection, Query, RemoveItem, SetItem } from '@/cypher/ast/Query';
import { CypherProcedure, CypherProcedures } from '@/cypher/CypherProcedure';

const COMPARISONS: Record<string, BinaryOperator> = {
    '=': 'EQUALS',
    '<>': 'NOT_EQUALS',
    '<': 'LESS_THAN',
    '>': 'GREATER_THAN',
    '<=': 'LESS_THAN_OR_EQUAL',
    '>=': 'GREATER_THAN_OR_EQUAL'
};

const MULTIPLICATIVE: Record<string, BinaryOperator> = { '*': 'MULTIPLY', '/': 'DIVIDE', '%': 'MODULO' };

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

/** Refuses the statement at the first place it is not Cypher, with where that is. */
class Refusing extends BaseErrorListener {
    override syntaxError(
        _recognizer: unknown,
        _offendingSymbol: unknown,
        line: number,
        charPositionInLine: number,
        msg: string
    ): void {
        throw new DrivineError(
            `The statement is not Cypher, at line ${line}, column ${charPositionInLine + 1}: ${msg}`
        );
    }
}

/**
 * Reads a Cypher statement into a {@link Query}: parsed with openCypher's grammar, then walked into the syntax tree the
 * compiler works from, which says what the statement means and no more of how it was written. A statement that is not
 * Cypher is refused with where it went wrong. A statement that is Cypher the compiler does not take (a call of a
 * procedure it does not know) is refused by name. A call of one it knows, `CALL db.labels()`, is read as the query that
 * gives its rows: see {@link CypherProcedures}.
 */
export const CypherReader = {
    /** The statement `cypher`, read. */
    read(cypher: string): Query {
        const refusing = new Refusing();
        const lexer = new CypherLexer(CharStream.fromString(cypher));
        lexer.removeErrorListeners();
        lexer.addErrorListener(refusing);
        const parser = new CypherParser(new CommonTokenStream(lexer));
        parser.removeErrorListeners();
        parser.addErrorListener(refusing);
        return query(parser.oC_Cypher().oC_Statement().oC_Query());
    }
};

function query(context: OC_QueryContext): Query {
    const regularQuery = context.oC_RegularQuery();
    return regularQuery ? regular(regularQuery) : standalone(context.oC_StandaloneCall()!);
}

/**
 * `CALL db.labels()` as the whole statement: the procedure's rows, each field under the name it is yielded as, or its
 * own where it yields them all, by `YIELD *` or no `YIELD`.
 */
function standalone(call: OC_StandaloneCallContext): Query {
    const invocation = call.oC_ExplicitProcedureInvocation();
    const procedure = procedureNamed(
        invocation?.oC_ProcedureName() ?? call.oC_ImplicitProcedureInvocation()!.oC_ProcedureName()
    );
    const items = call.oC_YieldItems();
    // As Neo4j refuses it: a WHERE filters rows a clause after it reads.
    if (items?.oC_Where()) {
        throw new DrivineError(
            `A CALL that is the whole statement takes no WHERE, as in Cypher: follow its YIELD with WITH or RETURN, as in CALL ${procedure.qualifiedName}() YIELD ${procedure.field} WHERE … RETURN ${procedure.field}.`
        );
    }
    const yielded: [string, string][] = items ? yields(items) : [[procedure.field, procedure.field]];
    return CypherProcedures.query(procedure, invocation?.oC_Expression().map(expression) ?? [], yielded, undefined);
}

/**
 * `CALL db.labels() YIELD label` within a query: for each row, the procedure's rows, joined to it as a `CALL { … }`'s
 * are, each field yielded bound for the clauses after.
 */
function inQuery(call: OC_InQueryCallContext): Clause {
    const invocation = call.oC_ExplicitProcedureInvocation();
    const procedure = procedureNamed(invocation.oC_ProcedureName());
    // As Neo4j refuses it: within a query, what a procedure gives is named.
    const items = call.oC_YieldItems();
    if (!items) {
        throw new DrivineError(
            `A CALL of a procedure within a query names what it yields, as in Cypher: CALL ${procedure.qualifiedName}() YIELD ${procedure.field}.`
        );
    }
    const condition = items.oC_Where();
    return {
        kind: 'Call',
        optional: false,
        query: CypherProcedures.query(
            procedure,
            invocation.oC_Expression().map(expression),
            yields(items),
            condition ? expression(condition.oC_Expression()) : undefined
        ),
        // Its WHERE may read any variable of the row.
        importsAll: true
    };
}

/** The procedure a call names, or the call refused where the compiler does not take it. */
function procedureNamed(context: OC_ProcedureNameContext): CypherProcedure {
    const qualified =
        context
            .oC_Namespace()
            .oC_SymbolicName()
            .map((it) => `${symbolic(it)}.`)
            .join('') + symbolic(context.oC_SymbolicName());
    return CypherProcedures.named(qualified) ?? refuse('A procedure call (CALL)');
}

/** Each field a `YIELD` names, and the variable it is bound to: its own name, or the one after `AS`. */
function yields(items: OC_YieldItemsContext): [string, string][] {
    return items.oC_YieldItem().map((item): [string, string] => {
        const variable = name(item.oC_Variable());
        const field = item.oC_ProcedureResultField();
        return [field ? symbolic(field.oC_SymbolicName()) : variable, variable];
    });
}

function regular(context: OC_RegularQueryContext): Query {
    return {
        clauses: single(context.oC_SingleQuery()),
        unions: context.oC_Union().map((it) => ({ all: it.ALL() !== null, clauses: single(it.oC_SingleQuery()!) }))
    };
}

function single(context: OC_SingleQueryContext): Clause[] {
    const clauses: Clause[] = [];
    const multi = context.oC_MultiPartQuery();
    if (multi) {
        // Its children in order: the reading clauses and updates of each part, in the order written, then the part's WITH.
        for (const child of multi.children) {
            if (child instanceof OC_ReadingClauseContext) {
                clauses.push(reading(child));
            } else if (child instanceof OC_UpdatingClauseContext) {
                clauses.push(updating(child));
            } else if (child instanceof OC_WithContext) {
                clauses.push(withClause(child));
            }
        }
    }
    const last = context.oC_SinglePartQuery() ?? multi!.oC_SinglePartQuery();
    // Reading clauses and updates in the order written: a reading clause may follow an update.
    for (const child of last.children) {
        if (child instanceof OC_ReadingClauseContext) {
            clauses.push(reading(child));
        } else if (child instanceof OC_UpdatingClauseContext) {
            clauses.push(updating(child));
        } else if (child instanceof OC_ReturnContext) {
            clauses.push({ kind: 'Return', projection: projection(child.oC_ProjectionBody()) });
        }
    }
    return clauses;
}

function withClause(context: OC_WithContext): Clause {
    return { kind: 'With', projection: projection(context.oC_ProjectionBody()), where: where(context.oC_Where()) };
}

/** The condition of a `WHERE`, where there is one. */
function where(context: { oC_Expression(): OC_ExpressionContext } | null): Expression | undefined {
    return context ? expression(context.oC_Expression()) : undefined;
}

function updating(context: OC_UpdatingClauseContext): Clause {
    const create = context.oC_Create();
    if (create) {
        return { kind: 'Create', patterns: patterns(create.oC_Pattern()) };
    }
    const merge = context.oC_Merge();
    if (merge) {
        const part = merge.oC_PatternPart();
        if (part.oC_AnonymousPatternPart()!.oC_ShortestPathPattern()) {
            refuse('A shortest path in MERGE');
        }
        const actions = merge.oC_MergeAction();
        return {
            kind: 'Merge',
            pattern: pattern(part.oC_AnonymousPatternPart()!.oC_PatternElement()!, optionalName(part.oC_Variable())),
            onCreate: actions.filter((it) => it.CREATE()).flatMap((it) => set(it.oC_Set()!)),
            onMatch: actions.filter((it) => it.MATCH()).flatMap((it) => set(it.oC_Set()!))
        };
    }
    const setClause = context.oC_Set();
    if (setClause) {
        return { kind: 'Set', items: set(setClause) };
    }
    const remove = context.oC_Remove();
    if (remove) {
        return { kind: 'Remove', items: remove.oC_RemoveItem().map(removeItem) };
    }
    const call = context.oC_SubqueryCall();
    if (call) {
        return subquery(call);
    }
    const foreach = context.oC_Foreach();
    if (foreach) {
        return {
            kind: 'Foreach',
            variable: name(foreach.oC_Variable()),
            list: expression(foreach.oC_Expression()),
            clauses: foreach.oC_UpdatingClause().map(updating)
        };
    }
    const deleted = context.oC_Delete()!;
    return { kind: 'Delete', detach: deleted.DETACH() !== null, expressions: deleted.oC_Expression().map(expression) };
}

function set(context: OC_SetContext): SetItem[] {
    return context.oC_SetItem().map((item): SetItem => {
        const property = item.oC_PropertyExpression();
        if (property) {
            const [variable, key] = propertyOf(property);
            return { kind: 'Property', variable, key, value: expression(item.oC_Expression()!) };
        }
        const labels = item.oC_NodeLabels();
        if (labels) {
            return { kind: 'Labels', variable: name(item.oC_Variable()!), labels: labelsOf(labels) };
        }
        const variable = name(item.oC_Variable()!);
        const value = expression(item.oC_Expression()!);
        return item.children.some((it) => it.getText() === '+=')
            ? { kind: 'Add', variable, value }
            : { kind: 'Replace', variable, value };
    });
}

function removeItem(context: OC_RemoveItemContext): RemoveItem {
    const labels = context.oC_NodeLabels();
    if (labels) {
        return { kind: 'Labels', variable: name(context.oC_Variable()!), labels: labelsOf(labels) };
    }
    const [variable, key] = propertyOf(context.oC_PropertyExpression()!);
    return { kind: 'Property', variable, key };
}

/** `n.key`, as a variable and a key: a property of anything else, or of a property, is not written to. */
function propertyOf(context: OC_PropertyExpressionContext): [string, string] {
    const variable = context.oC_Atom().oC_Variable();
    if (!variable || context.oC_PropertyLookup().length !== 1) {
        refuse('A write to a property of anything but a variable');
    }
    return [name(variable), schemaName(context.oC_PropertyLookup(0)!.oC_PropertyKeyName()!.oC_SchemaName())];
}

function labelsOf(context: OC_NodeLabelsContext): string[] {
    return context.oC_NodeLabel().map((it) => schemaName(it.oC_LabelName().oC_SchemaName()));
}

/** `CALL { … }`, with the variables its brackets import where it has them, `CALL (a, b) { … }` or `CALL (*) { … }`. */
function subquery(call: OC_SubqueryCallContext): Clause {
    const bracketed = call.children.some((it) => it.getText() === '(');
    return {
        kind: 'Call',
        optional: call.OPTIONAL() !== null,
        query: regular(call.oC_RegularQuery()),
        ...(bracketed ? { imports: call.oC_Variable().map(name) } : {}),
        ...(call.children.some((it) => it.getText() === '*') ? { importsAll: true } : {})
    };
}

function reading(context: OC_ReadingClauseContext): Clause {
    const call = context.oC_SubqueryCall();
    if (call) {
        return subquery(call);
    }
    const match = context.oC_Match();
    if (match) {
        return {
            kind: 'Match',
            optional: match.OPTIONAL() !== null,
            patterns: patterns(match.oC_Pattern()),
            where: where(match.oC_Where())
        };
    }
    const unwind = context.oC_Unwind();
    if (unwind) {
        return { kind: 'Unwind', list: expression(unwind.oC_Expression()), variable: name(unwind.oC_Variable()) };
    }
    return inQuery(context.oC_InQueryCall()!);
}

/** Reading clauses that return nothing, the body of an `EXISTS { … }` or a `COUNT { … }`. */
function readings(context: OC_SubqueryReadingsContext): Query {
    return { clauses: context.oC_ReadingClause().map(reading), unions: [] };
}

function projection(context: OC_ProjectionBodyContext): Projection {
    const items = context.oC_ProjectionItems();
    return {
        distinct: context.DISTINCT() !== null,
        star: items.children[0]?.getText() === '*',
        items: items.oC_ProjectionItem().map((item) => ({
            expression: expression(item.oC_Expression()!),
            name: optionalName(item.oC_Variable()) ?? item.oC_Expression()!.getText()
        })),
        orderBy: (context.oC_Order()?.oC_SortItem() ?? []).map((sort) => ({
            expression: expression(sort.oC_Expression()),
            descending: sort.DESC() !== null || sort.DESCENDING() !== null
        })),
        skip: context.oC_Skip() ? expression(context.oC_Skip()!.oC_Expression()) : undefined,
        limit: context.oC_Limit() ? expression(context.oC_Limit()!.oC_Expression()) : undefined
    };
}

// ----- Patterns -----

function patterns(context: OC_PatternContext): Pattern[] {
    return context.oC_PatternPart().map((part) => {
        const variable = optionalName(part.oC_Variable());
        const anonymous = part.oC_AnonymousPatternPart()!;
        const shortest = anonymous.oC_ShortestPathPattern();
        if (shortest) {
            return {
                ...pattern(shortest.oC_PatternElement()!, variable),
                shortest: shortest.SHORTESTPATH() ? ('ONE' as const) : ('ALL' as const)
            };
        }
        return pattern(anonymous.oC_PatternElement()!, variable);
    });
}

function pattern(context: OC_PatternElementContext, variable: string | undefined): Pattern {
    // A pattern in parentheses is the pattern.
    const inner = context.oC_PatternElement();
    if (inner) {
        return pattern(inner, variable);
    }
    const nodes: NodePattern[] = [];
    const relationships: RelationshipPattern[] = [];
    // A quantified path pattern with no node beside it is joined to a node of no label of its own.
    for (const child of context.children) {
        if (child instanceof OC_NodePatternContext) {
            if (nodes.length > relationships.length) {
                throw new DrivineError(
                    'Two nodes of a path are side by side: a relationship or a quantified path pattern goes between them.'
                );
            }
            nodes.push(node(child));
        } else if (child instanceof OC_PatternElementChainContext) {
            // Only after a quantified path pattern: Cypher puts a node between them.
            if (nodes.length === relationships.length) {
                throw new DrivineError('A relationship after a quantified path pattern has a node between them.');
            }
            relationships.push(link(child));
            nodes.push(node(child.oC_NodePattern()));
        } else if (child instanceof OC_QuantifiedPathPatternContext) {
            if (nodes.length === relationships.length) {
                nodes.push({ labels: [] });
            }
            relationships.push(quantifiedPath(child));
        }
    }
    if (nodes.length === relationships.length) {
        nodes.push({ labels: [] });
    }
    return { variable, nodes, relationships };
}

/** `((a)-[:R]->(b) WHERE …){1,3}`: a relationship of the pattern that repeats its own, between the nodes beside it. */
function quantifiedPath(context: OC_QuantifiedPathPatternContext): RelationshipPattern {
    const inner = pattern(context.oC_PatternElement(), undefined);
    if (inner.relationships.length === 0) {
        throw new DrivineError('A quantified path pattern holds a relationship.');
    }
    inner.relationships.forEach((relationship) => {
        if (relationship.group) {
            throw new DrivineError('A quantified path pattern holds no quantified path pattern.');
        }
        if (relationship.range) {
            refuse('A variable-length relationship in a quantified path pattern');
        }
    });
    const group = { pattern: inner, where: where(context.oC_Where()) };
    const range = quantified(context.oC_PathQuantifier());
    // As in Neo4j: a group that may repeat no times at most matches nothing of its own.
    if (range.max === 0) {
        throw new DrivineError("A quantified path pattern's quantifier has a maximum of at least 1.");
    }
    return { types: [], direction: 'OUTGOING', range, group };
}

function relationshipsPattern(context: OC_RelationshipsPatternContext, variable: string | undefined): Pattern {
    const nodes = [node(context.oC_NodePattern())];
    const relationships: RelationshipPattern[] = [];
    context.oC_PatternElementChain().forEach((chain) => {
        relationships.push(link(chain));
        nodes.push(node(chain.oC_NodePattern()));
    });
    return { variable, nodes, relationships };
}

/** The relationship of a link of a path, `-[:R]->` or a quantified relationship, `-[:R]->{1,3}`. */
function link(chain: OC_PatternElementChainContext): RelationshipPattern {
    const relationship = relationshipOf(chain.oC_RelationshipPattern());
    const quantifier = chain.oC_PathQuantifier();
    if (!quantifier) {
        return relationship;
    }
    if (relationship.range) {
        refuse('A quantified relationship that has a range of its own');
    }
    return { ...relationship, range: quantified(quantifier) };
}

/**
 * `+` is one or more, `*` any, `{n}` exactly n, and `{m,n}` from m to n, either bound left out. As in Neo4j, braces with
 * no bound in them, `{}`, and a least bound above the greatest, `{3,1}`, are refused.
 */
function quantified(context: OC_PathQuantifierContext): Range {
    if (context.getText() === '+') {
        return { min: 1 };
    }
    if (context.getText() === '*') {
        return { min: 0 };
    }
    const integers = context.oC_IntegerLiteral();
    const comma = context.children.findIndex((it) => it.getText() === ',');
    if (comma < 0) {
        if (integers.length !== 1) {
            throw new DrivineError('A quantifier in braces has a bound in them, as in {2} or {1,3}.');
        }
        const bound = integer(integers[0]);
        return { min: bound, max: bound };
    }
    const before = integers.find((it) => context.children.indexOf(it) < comma);
    const after = integers.find((it) => context.children.indexOf(it) > comma);
    const [least, greatest] = [before ? integer(before) : undefined, after ? integer(after) : undefined];
    if (least !== undefined && greatest !== undefined && least > greatest) {
        throw new DrivineError(
            `A quantifier's least bound is at most its greatest, and ${least} is more than ${greatest}.`
        );
    }
    return { min: least ?? 0, max: greatest };
}

function node(context: OC_NodePatternContext): NodePattern {
    const labels = context.oC_NodeLabels();
    const properties = context.oC_Properties();
    return {
        variable: optionalName(context.oC_Variable()),
        labels: labels ? labelsOf(labels) : [],
        properties: properties ? propertiesOf(properties) : undefined
    };
}

function relationshipOf(context: OC_RelationshipPatternContext): RelationshipPattern {
    const left = context.oC_LeftArrowHead() !== null;
    const right = context.oC_RightArrowHead() !== null;
    const detail = context.oC_RelationshipDetail();
    const direction: Direction = right && !left ? 'OUTGOING' : left && !right ? 'INCOMING' : 'EITHER';
    const range = detail?.oC_RangeLiteral();
    const properties = detail?.oC_Properties();
    return {
        variable: optionalName(detail?.oC_Variable() ?? null),
        types: (detail?.oC_RelationshipTypes()?.oC_RelTypeName() ?? []).map((it) => schemaName(it.oC_SchemaName())),
        direction,
        range: range ? rangeOf(range) : undefined,
        properties: properties ? propertiesOf(properties) : undefined
    };
}

/** `*`, `*2`, `*1..3`, `*..3`, `*2..`: a bare number is both bounds. */
function rangeOf(context: OC_RangeLiteralContext): Range {
    const integers = context.oC_IntegerLiteral();
    const bounds = integers.map(integer);
    const dots = context.children.findIndex((it) => it.getText() === '..');
    if (dots < 0) {
        return bounds.length === 1 ? { min: bounds[0], max: bounds[0] } : {};
    }
    if (bounds.length === 2) {
        return { min: bounds[0], max: bounds[1] };
    }
    if (bounds.length === 0) {
        return {};
    }
    // One bound and the dots: before them it is the least, after them the most.
    return dots < context.children.indexOf(integers[0]) ? { max: bounds[0] } : { min: bounds[0] };
}

function propertiesOf(context: OC_PropertiesContext): Expression {
    const map = context.oC_MapLiteral();
    return map ? mapLiteral(map) : parameter(context.oC_Parameter()!);
}

// ----- Expressions -----

function expression(context: OC_ExpressionContext): Expression {
    const or = context.oC_OrExpression();
    const xors = or.oC_XorExpression().map((xor) =>
        xor
            .oC_AndExpression()
            .map((and) =>
                and
                    .oC_NotExpression()
                    .map((not) =>
                        not
                            .NOT()
                            .reduce<Expression>(
                                (operand) => ({ kind: 'Unary', operator: 'NOT', operand }),
                                comparison(not.oC_ComparisonExpression())
                            )
                    )
                    .reduce((a, b) => binary('AND', a, b))
            )
            .reduce((a, b) => binary('XOR', a, b))
    );
    return xors.reduce((a, b) => binary('OR', a, b));
}

function binary(operator: BinaryOperator, left: Expression, right: Expression): Expression {
    return { kind: 'Binary', operator, left, right };
}

/** `a < b <= c` is `a < b AND b <= c`, as Cypher reads a chain of comparisons. */
function comparison(context: OC_ComparisonExpressionContext): Expression {
    let left = predicate(context.oC_StringListNullPredicateExpression());
    let result: Expression | undefined;
    for (const partial of context.oC_PartialComparisonExpression()) {
        const right = predicate(partial.oC_StringListNullPredicateExpression()!);
        const one = binary(COMPARISONS[partial.children[0].getText()], left, right);
        result = result ? binary('AND', result, one) : one;
        left = right;
    }
    return result ?? left;
}

function predicate(context: OC_StringListNullPredicateExpressionContext): Expression {
    let result = additive(context.oC_AddOrSubtractExpression());
    for (const child of context.children.slice(1)) {
        if (child instanceof OC_StringPredicateExpressionContext) {
            const operator: BinaryOperator = child.STARTS()
                ? 'STARTS_WITH'
                : child.ENDS()
                ? 'ENDS_WITH'
                : child.CONTAINS()
                ? 'CONTAINS'
                : 'MATCHES';
            result = binary(operator, result, additive(child.oC_AddOrSubtractExpression()));
        } else if (child instanceof OC_ListPredicateExpressionContext) {
            result = binary('IN', result, additive(child.oC_AddOrSubtractExpression()));
        } else if (child instanceof OC_NullPredicateExpressionContext) {
            result = { kind: 'Unary', operator: child.NOT() ? 'IS_NOT_NULL' : 'IS_NULL', operand: result };
        }
    }
    return result;
}

function additive(context: OC_AddOrSubtractExpressionContext): Expression {
    const operands = context.oC_MultiplyDivideModuloExpression().map(multiplicative);
    const operators = operatorsOf(context.children, ['+', '-']);
    return operands
        .slice(1)
        .reduce((left, right, i) => binary(operators[i] === '+' ? 'ADD' : 'SUBTRACT', left, right), operands[0]);
}

function unary(context: OC_UnaryAddOrSubtractExpressionContext): Expression {
    const negated = context.children[0].getText() === '-';
    const written = context.oC_NonArithmeticOperatorExpression()!;
    // The least whole number, -9223372036854775808, is written negated: its digits alone are past the greatest.
    if (negated && written.getChildCount() === 1) {
        const literal = written.oC_Atom()?.oC_Literal()?.oC_NumberLiteral()?.oC_IntegerLiteral();
        if (literal) {
            const value = magnitude(literal);
            if (value === LONG_MIN_MAGNITUDE) {
                return { kind: 'Literal', value: -Number(LONG_MIN_MAGNITUDE) };
            }
            if (value > LONG_MIN_MAGNITUDE) {
                throw outOfRange(`-${literal.getText()}`);
            }
        }
    }
    const operand = nonArithmetic(written);
    return negated ? { kind: 'Unary', operator: 'NEGATE', operand } : operand;
}

function multiplicative(context: OC_MultiplyDivideModuloExpressionContext): Expression {
    const operands = context.oC_PowerOfExpression().map((power) =>
        power
            .oC_UnaryAddOrSubtractExpression()
            .map(unary)
            .reduce((a, b) => binary('POWER', a, b))
    );
    const operators = operatorsOf(context.children, Object.keys(MULTIPLICATIVE));
    return operands.slice(1).reduce((left, right, i) => binary(MULTIPLICATIVE[operators[i]], left, right), operands[0]);
}

/** The operators among `children`, in order. */
function operatorsOf(children: ParseTree[], operators: string[]): string[] {
    return children.map((it) => it.getText()).filter((it) => operators.includes(it));
}

/** An atom, then its property lookups and list operators in the order written, then a label test. */
function nonArithmetic(context: OC_NonArithmeticOperatorExpressionContext): Expression {
    let result = atom(context.oC_Atom());
    for (const child of context.children.slice(1)) {
        if (child instanceof OC_PropertyLookupContext) {
            result = {
                kind: 'Property',
                subject: result,
                key: schemaName(child.oC_PropertyKeyName()!.oC_SchemaName())
            };
        } else if (child instanceof OC_ListOperatorExpressionContext) {
            result = listOperator(result, child);
        } else if (child instanceof OC_NodeLabelsContext) {
            result = { kind: 'HasLabels', subject: result, labels: labelsOf(child) };
        }
    }
    return result;
}

function listOperator(subject: Expression, context: OC_ListOperatorExpressionContext): Expression {
    const split = context.children.findIndex((it) => it.getText() === '..');
    if (split < 0) {
        return { kind: 'Index', subject, index: expression(context.oC_Expression(0)!) };
    }
    // Which bound each expression is: before the dots, the start; after them, the end.
    const bounds = context.oC_Expression();
    const from = bounds.find((it) => context.children.indexOf(it) < split);
    const to = bounds.find((it) => context.children.indexOf(it) > split);
    return { kind: 'Slice', subject, from: from && expression(from), to: to && expression(to) };
}

/** The atoms read by the construct that makes them: the first that is there reads the atom. */
const ATOMS: ((context: OC_AtomContext) => Expression | undefined)[] = [
    (context) => (context.oC_Literal() ? literal(context.oC_Literal()!) : undefined),
    (context) => (context.oC_Parameter() ? parameter(context.oC_Parameter()!) : undefined),
    (context) => (context.oC_CaseExpression() ? caseOf(context.oC_CaseExpression()!) : undefined),
    (context) => (context.COUNT() ? { kind: 'CountStar' } : undefined),
    listComprehension,
    patternComprehension,
    quantifier,
    reduce,
    (context) => {
        const predicate = context.oC_PatternPredicate();
        return predicate
            ? {
                  kind: 'PatternPredicate',
                  pattern: relationshipsPattern(predicate.oC_RelationshipsPattern(), undefined)
              }
            : undefined;
    },
    (context) => {
        const parenthesized = context.oC_ParenthesizedExpression();
        return parenthesized ? expression(parenthesized.oC_Expression()) : undefined;
    },
    functionInvocation,
    existential,
    countSubquery,
    (context) => (context.oC_MapProjection() ? mapProjection(context.oC_MapProjection()!) : undefined)
];

function atom(context: OC_AtomContext): Expression {
    for (const read of ATOMS) {
        const atomic = read(context);
        if (atomic) {
            return atomic;
        }
    }
    return { kind: 'Variable', name: name(context.oC_Variable()!) };
}

function listComprehension(context: OC_AtomContext): Expression | undefined {
    const comprehension = context.oC_ListComprehension();
    if (!comprehension) {
        return undefined;
    }
    const filter = comprehension.oC_FilterExpression()!;
    const projected = comprehension.oC_Expression();
    return {
        kind: 'ListComprehension',
        variable: name(filter.oC_IdInColl().oC_Variable()),
        list: expression(filter.oC_IdInColl().oC_Expression()),
        where: where(filter.oC_Where()),
        projection: projected ? expression(projected) : undefined
    };
}

function patternComprehension(context: OC_AtomContext): Expression | undefined {
    const comprehension = context.oC_PatternComprehension();
    if (!comprehension) {
        return undefined;
    }
    return {
        kind: 'PatternComprehension',
        pattern: relationshipsPattern(
            comprehension.oC_RelationshipsPattern(),
            optionalName(comprehension.oC_Variable())
        ),
        where: where(comprehension.oC_Where()),
        projection: expression(comprehension.oC_Expression())
    };
}

function quantifier(context: OC_AtomContext): Expression | undefined {
    const quantified = context.oC_Quantifier();
    if (!quantified) {
        return undefined;
    }
    const filter = quantified.oC_FilterExpression()!;
    return {
        kind: 'Quantifier',
        of: quantified.ALL() ? 'ALL' : quantified.ANY() ? 'ANY' : quantified.NONE() ? 'NONE' : 'SINGLE',
        variable: name(filter.oC_IdInColl().oC_Variable()),
        list: expression(filter.oC_IdInColl().oC_Expression()),
        where: where(filter.oC_Where())
    };
}

function reduce(context: OC_AtomContext): Expression | undefined {
    const reduced = context.oC_Reduce();
    if (!reduced) {
        return undefined;
    }
    return {
        kind: 'Reduce',
        accumulator: name(reduced.oC_Variable()),
        initial: expression(reduced.oC_Expression(0)!),
        variable: name(reduced.oC_IdInColl().oC_Variable()),
        list: expression(reduced.oC_IdInColl().oC_Expression()),
        expression: expression(reduced.oC_Expression(1)!)
    };
}

function functionInvocation(context: OC_AtomContext): Expression | undefined {
    const invocation = context.oC_FunctionInvocation();
    if (!invocation) {
        return undefined;
    }
    const functionName = invocation.oC_FunctionName();
    const namespace = functionName
        .oC_Namespace()
        .oC_SymbolicName()
        .map((it) => `${symbolic(it)}.`)
        .join('');
    return {
        kind: 'Function',
        name: namespace + symbolic(functionName.oC_SymbolicName()),
        distinct: invocation.DISTINCT() !== null,
        arguments: invocation.oC_Expression().map(expression)
    };
}

function existential(context: OC_AtomContext): Expression | undefined {
    const exists = context.oC_ExistentialSubquery();
    if (!exists) {
        return undefined;
    }
    if (exists.oC_RegularQuery()) {
        return { kind: 'Subquery', of: 'EXISTS', query: regular(exists.oC_RegularQuery()!) };
    }
    if (exists.oC_SubqueryReadings()) {
        return { kind: 'Subquery', of: 'EXISTS', query: readings(exists.oC_SubqueryReadings()!) };
    }
    return { kind: 'Exists', patterns: patterns(exists.oC_Pattern()!), where: where(exists.oC_Where()) };
}

function countSubquery(context: OC_AtomContext): Expression | undefined {
    const count = context.oC_CountSubquery();
    if (!count) {
        return undefined;
    }
    const counted: Query = count.oC_RegularQuery()
        ? regular(count.oC_RegularQuery()!)
        : count.oC_SubqueryReadings()
        ? readings(count.oC_SubqueryReadings()!)
        : {
              clauses: [
                  {
                      kind: 'Match',
                      optional: false,
                      patterns: patterns(count.oC_Pattern()!),
                      where: where(count.oC_Where())
                  }
              ],
              unions: []
          };
    return { kind: 'Subquery', of: 'COUNT', query: counted };
}

function mapProjection(context: OC_MapProjectionContext): Expression {
    return {
        kind: 'MapProjection',
        variable: name(context.oC_Variable()),
        elements: context.oC_MapProjectionElement().map((element): MapProjectionElement => {
            const key = element.oC_PropertyKeyName();
            const value = element.oC_Expression();
            if (value) {
                return { kind: 'Entry', key: schemaName(key!.oC_SchemaName()), value: expression(value) };
            }
            if (key) {
                return { kind: 'Selected', key: schemaName(key.oC_SchemaName()) };
            }
            const variable = element.oC_Variable();
            return variable ? { kind: 'Variable', name: name(variable) } : { kind: 'All' };
        })
    };
}

function caseOf(context: OC_CaseExpressionContext): Expression {
    const expressions = context.oC_Expression();
    // A subject is an expression before the first WHEN; ELSE's is after the last alternative.
    const firstWhen = context.children.indexOf(context.oC_CaseAlternative(0)!);
    const subject = expressions.find((it) => context.children.indexOf(it) < firstWhen);
    const otherwise = expressions.find((it) => context.children.indexOf(it) > firstWhen);
    return {
        kind: 'Case',
        subject: subject && expression(subject),
        alternatives: context
            .oC_CaseAlternative()
            .map((it): [Expression, Expression] => [
                expression(it.oC_Expression(0)!),
                expression(it.oC_Expression(1)!)
            ]),
        otherwise: otherwise && expression(otherwise)
    };
}

function literal(context: OC_LiteralContext): Expression {
    const bool = context.oC_BooleanLiteral();
    if (bool) {
        return { kind: 'Literal', value: bool.TRUE() !== null };
    }
    if (context.NULL()) {
        return { kind: 'Literal', value: null };
    }
    const number = context.oC_NumberLiteral();
    if (number) {
        const whole = number.oC_IntegerLiteral();
        return {
            kind: 'Literal',
            value: whole ? integer(whole) : new CypherFloat(Number(number.oC_DoubleLiteral()!.getText()))
        };
    }
    const text = context.StringLiteral();
    if (text) {
        return { kind: 'Literal', value: string(text) };
    }
    const list = context.oC_ListLiteral();
    if (list) {
        return { kind: 'ListLiteral', items: list.oC_Expression().map(expression) };
    }
    return mapLiteral(context.oC_MapLiteral()!);
}

function mapLiteral(context: OC_MapLiteralContext): MapLiteral {
    const values = context.oC_Expression();
    return {
        kind: 'MapLiteral',
        entries: context
            .oC_PropertyKeyName()
            .map((key, i): [string, Expression] => [schemaName(key.oC_SchemaName()), expression(values[i])])
    };
}

/** `$name`, `$1`, or a keyword, `$limit`, which names a parameter as any other word does. */
function parameter(context: OC_ParameterContext): Parameter {
    const schema = context.oC_SchemaName();
    return {
        kind: 'Parameter',
        name: schema ? schemaName(schema) : context.DecimalInteger()?.getText() ?? context.getChild(1)!.getText()
    };
}

// ----- Names and literals -----

function name(context: OC_VariableContext): string {
    return symbolic(context.oC_SymbolicName());
}

function optionalName(context: OC_VariableContext | null | undefined): string | undefined {
    return context ? name(context) : undefined;
}

/** A name, as written or between backticks, where a doubled backtick is one. */
function schemaName(context: OC_SchemaNameContext): string {
    const symbolicName = context.oC_SymbolicName();
    return symbolicName ? symbolic(symbolicName) : context.oC_ReservedWord()!.getText();
}

function symbolic(context: OC_SymbolicNameContext): string {
    const text = context.getText();
    return text.startsWith('`') ? text.substring(1, text.length - 1).replace(/``/g, '`') : text;
}

const LONG_MAX_MAGNITUDE = BigInt('9223372036854775807');

const LONG_MIN_MAGNITUDE = LONG_MAX_MAGNITUDE + BigInt(1);

/** An integer literal's value: one past either end of a 64-bit integer is refused. */
function integer(context: OC_IntegerLiteralContext): number {
    const value = magnitude(context);
    if (value > LONG_MAX_MAGNITUDE) {
        throw outOfRange(context.getText());
    }
    return Number(value);
}

/** The number an integer literal writes, decimal, hexadecimal (`0x`) or octal (`0o`, or a leading 0), however large. */
function magnitude(context: OC_IntegerLiteralContext): bigint {
    const text = context.getText();
    if (text.startsWith('0x') || text.startsWith('0o')) {
        return BigInt(text);
    }
    if (text.length > 1 && text.startsWith('0')) {
        return BigInt(`0o${text.substring(1)}`);
    }
    return BigInt(text);
}

function outOfRange(written: string): DrivineError {
    return new DrivineError(
        `${written} is past the range of a whole number, from -9223372036854775808 to 9223372036854775807.`
    );
}

/** A string literal's value: its quotes taken off and its escapes read. */
function string(node: TerminalNode): string {
    const text = node.getText();
    const body = text.substring(1, text.length - 1);
    let out = '';
    let i = 0;
    while (i < body.length) {
        const c = body[i];
        if (c !== '\\' || i === body.length - 1) {
            out += c;
            i++;
            continue;
        }
        const escaped = body[i + 1];
        if (escaped === 'u' || escaped === 'U') {
            const digits = escaped === 'u' ? 4 : 8;
            out += String.fromCodePoint(parseInt(body.substring(i + 2, i + 2 + digits), 16));
            i += digits;
        } else {
            out += ESCAPES[escaped] ?? escaped;
        }
        i += 2;
    }
    return out;
}

/** Cypher the compiler does not take: refused by name, so the caller is told what, and not that the SQL failed. */
function refuse(construct: string): never {
    throw new DrivineError(`${construct} is Cypher, and is not compiled to SQL yet.`);
}
