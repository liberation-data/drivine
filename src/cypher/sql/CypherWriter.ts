import { isInt } from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { Stamps } from '@/model/Stamps';
import {
    Binary,
    BinaryOperator,
    Case,
    CypherFloat,
    Expression,
    expressionKey,
    FunctionCall,
    Index,
    isNullLiteral,
    ListComprehension,
    ListLiteral,
    MapProjection,
    PatternComprehension,
    Property,
    Quantifier,
    Reduce,
    sameExpression,
    Slice,
    Unary
} from '@/cypher/ast/Expression';
import { NodePattern, Pattern, RelationshipPattern } from '@/cypher/ast/Pattern';
import {
    Call,
    Clause,
    Delete,
    Foreach,
    Match,
    Merge,
    Projection,
    ProjectionItem,
    Query,
    RemoveItem,
    Return,
    SetItem,
    Unwind,
    With
} from '@/cypher/ast/Query';
import {
    children,
    contains,
    DISTINCT_ITEMS,
    holdsSubquery,
    indent,
    isAggregate,
    isAnew,
    isGivenNumber,
    iterated,
    literal,
    MADE_TEXT,
    MATH_FUNCTIONS,
    ROUNDING_MODES,
    RoundingMode,
    parametersIn,
    replaced,
    TEXT_FUNCTIONS,
    unsupported,
    variablesIn,
    variablesOfPattern,
    variablesOutsideAggregates,
    writes
} from '@/cypher/sql/CypherSyntax';
import { Parameters } from '@/cypher/sql/Parameters';
import { Select } from '@/cypher/sql/Select';
import { Procedure, Walk, Walked } from '@/cypher/sql/Procedure';
import type { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { Temporal } from '@/cypher/sql/Temporal';
import { Temporals } from '@/cypher/sql/Temporals';
import {
    bool,
    BoolValue,
    EntitiesValue,
    json,
    JsonValue,
    NodeValue,
    nodeOf,
    relationshipOf,
    Value
} from '@/cypher/sql/Value';
import { columns, columnsOf, groupKeys, PENDING } from '@/cypher/sql/ValueColumns';

const {
    ROWS,
    OUT,
    ROW,
    VALUE,
    ID,
    COUNT,
    FOUND,
    SAVED,
    GATHERED,
    CALLER,
    NESTING,
    DOOMED,
    RECORD,
    MATCHED
}: typeof Procedure = Procedure;

/** What a variable a row holds is. */
type Kind = 'NODE' | 'RELATIONSHIP' | 'VALUE' | 'NODES' | 'RELATIONSHIPS' | 'PATH';

/** A scope: the variables an expression sees, and what each is. */
type Scope = Map<string, Value>;

/**
 * The relationships one part of a pattern matched: one, its id `eids`, or with `many` those a variable-length
 * relationship or a quantified path pattern walked, a list of ids. Of the `types` it may have; `nodes` is the list of
 * the ids of the nodes it reaches after the one it starts from.
 */
interface Hop {
    eids: string;
    many: boolean;
    types: string[];
    nodes: string;
}

/**
 * What a `WITH` or a `RETURN` makes of the rows it reads: the `sql` of its query, what each item's name is bound to
 * among its columns, and the order of its rows, each term a column of the query and whether it descends.
 */
interface Projected {
    sql: string;
    scope: Scope;
    order: [string, boolean][];
}

/**
 * The order terms of a projection, each a column of its query and whether it descends, and those read `after` it, over
 * its columns, by the column they are known by.
 */
interface Sorted {
    sorts: [string, boolean][];
    after: Map<string, string>;
    /** What sorts each term carried out of the query as a column, of that column. */
    sorted: Map<string, (column: string) => string>;
    /** Whether a term sorts by an item made anew for each row, `randomUUID()`, of its column: see `SqlCypherCompiler.once`. */
    anew: boolean;
}

/** The names of a shortest path's ends where its pattern gives none, which no statement can write unquoted. */
const SHORTEST_FROM = ' shortest from';
const SHORTEST_TO = ' shortest to';

const TEMPORAL_KINDS = ['date', 'localtime', 'time', 'localdatetime', 'datetime'];

/** The functions of a temporal kind that give the moment the statement runs. */
const TEMPORAL_NOW = TEMPORAL_KINDS.flatMap((kind) =>
    ['statement', 'transaction', 'realtime'].map((it) => `${kind}.${it}`)
);

/** What `round()` is refused with, as Neo4j refuses it, a precision below 0. */
const NEGATIVE_PRECISION = 'round() takes a precision of 0 or more, as in Neo4j.';

/** The functions of a temporal kind that truncate a value to a unit. */
const TEMPORAL_TRUNCATE = TEMPORAL_KINDS.map((it) => `${it}.truncate`);

/** The fields a map makes a moment or a time of day of. */
const INSTANT_MAP_FIELDS = [
    'year',
    'month',
    'day',
    'hour',
    'minute',
    'second',
    'millisecond',
    'microsecond',
    'nanosecond',
    'timezone'
];

/** The fields a map makes a duration of. */
const DURATION_MAP_FIELDS = [
    'years',
    'quarters',
    'months',
    'weeks',
    'days',
    'hours',
    'minutes',
    'seconds',
    'milliseconds',
    'microseconds',
    'nanoseconds'
];

const COMPARISONS: Partial<Record<BinaryOperator, string>> = {
    EQUALS: '=',
    NOT_EQUALS: '<>',
    LESS_THAN: '<',
    GREATER_THAN: '>',
    LESS_THAN_OR_EQUAL: '<=',
    GREATER_THAN_OR_EQUAL: '>='
};

/** A function's call, as its compilation reads it: the call, its arguments compiled, and its name in lower case. */
interface Invocation {
    fn: FunctionCall;
    arguments: Value[];
    scope: Scope;
    name: string;
    /** `DISTINCT `, where it is called so. */
    distinct: string;
    /** The one argument it takes. */
    one(): Value;
}

/** A side of a `+`, as `CypherWriter.summand` reads it. */
interface Summand {
    given: unknown;
    text: boolean;
    texts: boolean;
    passed: unknown;
}

/** The one value of `values`, where each is the same; undefined where they differ or there are none. */
function single<T>(values: T[]): T | undefined {
    return new Set(values).size === 1 ? values[0] : undefined;
}

/** `value` as a list of one, or none where it is undefined. */
function optional<T>(value: T | undefined): T[] {
    return value === undefined ? [] : [value];
}

/**
 * One statement's compilation, for a {@link SqlCypherCompiler}: its parameters, and the names it gives its rows and
 * columns. What is the same on each store is here; the store's own SQL is the compiler's.
 */
export class CypherWriter {
    private readonly logger = new DrivineLogger(CypherWriter.name);
    private counter = 0;

    /** Whether a quantified path pattern's conditions are being compiled: what they hold is in its walk's step. */
    private stepping = false;

    /** The procedure's statements, in order. */
    private readonly body: string[] = [];

    /** How deep in loops and conditions the next statement is, for its indent. */
    private depth = 0;

    /** The variables a row holds, and what each is: what `ROWS` and `ROW` carry from clause to clause. */
    private readonly kinds: Map<string, Kind> = new Map();

    /** The value each variable of kind `VALUE` was when a row was carried: it is read again of the kinds that value was of. */
    private readonly carried: Map<string, JsonValue> = new Map();

    /** The key each variable is held at in a row: a name of the compiler's, so any variable's name will do. */
    private readonly keys: Map<string, string> = new Map();

    /** The rows the last write left, as read from `ROWS`, and how much was read of them then: nothing more is there to carry. */
    private unread?: [Select, number];

    /** The parameters an expression reads from a map it is given, where it reads none bound: see `reduce`. */
    private givenParameters?: Scope;

    /** How deep in `FOREACH`es and writing `CALL`s the write being made is: each keeps the rows it puts back in a variable of its own depth. */
    private nesting = 0;

    /**
     * The order of the rows the projection being compiled reads, which `collect` gathers them in, as Cypher gathers
     * them: a group's rows are not read in the order of the query they come from.
     */
    private rowOrder?: string;

    /**
     * Whether a value's identity is carried out of a query as a column of its own (see {@link JsonValue.identity}): not
     * where the queries of a `UNION` in `CALL { … }` would give different columns, which compare by their properties
     * instead.
     */
    private identities = true;

    /** How each kind of expression is compiled. */
    private readonly expressions: { [K in Expression['kind']]: (expression: any, scope: Scope) => Value } = {
        Literal: (it) => json(this.sql.literalJson(it.value), { text: typeof it.value === 'string' }),
        Parameter: (it) =>
            this.givenParameters?.get(it.name) ??
            json(this.parameters.json(it.name), { temporal: Temporal.ofValue(this.parameters.value(it.name)) }),
        Variable: (it, scope) => scope.get(it.name) ?? this.undefinedVariable(it.name),
        Property: (it, scope) => {
            const inParameter = this.inParameter(it);
            return inParameter !== undefined
                ? json(inParameter)
                : this.property(this.expression(it.subject, scope), it.key);
        },
        HasLabels: (it, scope) => {
            const subject = this.expression(it.subject, scope);
            if (subject.kind !== 'Node') {
                throw new DrivineError('A label is tested of a node.');
            }
            return bool(`(${this.sql.hasLabels(subject.labels, it.labels)})`);
        },
        ListLiteral: (it, scope) => this.listLiteral(it, scope),
        MapLiteral: (it, scope) => {
            const entries = (it.entries as [string, Expression][]).map(([key, value]): [string, Value] => [
                key,
                this.expression(value, scope)
            ]);
            return json(this.sql.jsonObject(entries.map(([key, value]) => [key, this.asJson(value).sql])), {
                ordered: true,
                identity: this.identityHolding(
                    entries.map(([, value]) => value),
                    (ids) => this.sql.jsonObject(entries.map(([key], i) => [key, ids[i]]))
                )
            });
        },
        MapProjection: (it, scope) => this.mapProjection(it, scope),
        Binary: (it, scope) => this.binary(it, scope),
        Unary: (it, scope) => this.unary(it, scope),
        Index: (it, scope) => this.index(it, scope),
        Slice: (it, scope) => this.slice(it, scope),
        Function: (it, scope) => this.function(it, scope),
        CountStar: () => json(this.sql.scalar('count(*)')),
        Case: (it, scope) => this.caseOf(it, scope),
        ListComprehension: (it, scope) => this.listComprehension(it, scope),
        Reduce: (it, scope) => this.reduce(it, scope),
        PatternComprehension: (it, scope) => this.patternComprehension(it, scope),
        PatternPredicate: (it, scope) => this.exists([it.pattern], undefined, scope),
        Exists: (it, scope) => this.exists(it.patterns, it.where, scope),
        Subquery: (it, scope) =>
            it.of === 'EXISTS'
                ? bool(`EXISTS (\n${indent(this.correlated(it.query, scope, 'EXISTS { … }'))}\n)`)
                : json(
                      this.sql.scalar(
                          `(SELECT count(*) FROM (\n${indent(
                              this.correlated(it.query, scope, 'COUNT { … }')
                          )}\n) ${this.alias('q')})`
                      )
                  ),
        Quantifier: (it, scope) => this.quantifier(it, scope)
    };

    /** How each function is compiled, by its name in lower case, where it is none the store compiles alone. */
    private readonly functions: Record<string, (call: Invocation) => Value> = {
        properties: (call) => {
            const subject = call.one();
            return subject.kind === 'Node' || subject.kind === 'Relationship' ? this.asJson(subject) : subject;
        },
        labels: (call) => {
            const subject = call.one();
            if (subject.kind !== 'Node') {
                throw new DrivineError('labels() takes a node.');
            }
            return json(subject.labels);
        },
        type: (call) => {
            const subject = call.one();
            if (subject.kind !== 'Relationship') {
                throw new DrivineError('type() takes a relationship.');
            }
            return json(this.sql.scalar(subject.type), { text: true });
        },
        id: (call) => this.idFunction(call),
        elementid: (call) => this.idFunction(call),
        length: (call) => json(this.sql.idCount(this.path(call, 'length').eids)),
        nodes: (call) => this.nodeList(this.path(call, 'nodes').nids),
        relationships: (call) => this.relationshipList(this.path(call, 'relationships').eids),
        coalesce: (call) =>
            json(
                `COALESCE(${call.arguments
                    .map((it) => this.sql.nullIfJsonNull(this.sql.comparable(this.asJson(it))))
                    .join(', ')})`,
                {
                    temporal: this.kindOf(call.fn.arguments.map((it, i) => [it, call.arguments[i]])),
                    text: call.arguments.every((it) => this.isText(it)),
                    texts: call.arguments.every((it) => this.holdsTexts(it))
                }
            ),
        count: (call) => json(this.sql.scalar(`count(${call.distinct}${this.countable(call.one())})`)),
        collect: (call) => this.collectFunction(call),
        [DISTINCT_ITEMS]: (call) => this.distinctItemsFunction(call),
        sum: (call) => json(this.sql.scalar(`COALESCE(sum(${call.distinct}${this.numberOf(call.one())}), 0)`)),
        avg: (call) => json(this.sql.scalar(this.sql.float(`avg(${call.distinct}${this.numberOf(call.one())})`))),
        min: (call) => this.extreme(call, true),
        max: (call) => this.extreme(call, false),
        range: (call) => {
            if (call.arguments.length < 2 || call.arguments.length > 3) {
                throw new DrivineError('range() takes a start, an end and a step.');
            }
            const [from, to] = call.arguments.map((it) => this.numberOf(it));
            const step = call.arguments[2];
            return json(this.sql.range(from, to, step ? this.numberOf(step) : '1'), { list: true });
        },
        split: (call) => {
            if (call.arguments.length !== 2) {
                throw new DrivineError('split() takes a text and a separator.');
            }
            const [text, separator] = call.arguments.map((it) => this.textOf(it));
            return json(this.sql.split(text, separator), { list: true, texts: true });
        },
        reverse: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const e = this.alias('e');
                    const reversed = this.sql.comparable(
                        json(this.sql.aggregateList(`${e}.item`, `${e}.item_no DESC`), { ordered: true })
                    );
                    return (
                        `CASE ${this.sql.typeOf(x)} WHEN 'string' THEN ${this.sql.scalar(
                            this.sql.reverseText(this.sql.text(x))
                        )} ` + `WHEN 'array' THEN (SELECT ${reversed} FROM ${this.sql.elements(x, e)}) END`
                    );
                }),
                {
                    items: this.itemsOf(call.one()),
                    list: this.isList(call.one()),
                    itemLists: this.holdsLists(call.one()),
                    text: this.isText(call.one()),
                    texts: this.holdsTexts(call.one())
                }
            ),
        tail: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const e = this.alias('e');
                    const rest = this.sql.comparable(
                        json(this.sql.aggregateList(`${e}.item`, `${e}.item_no`), { ordered: true })
                    );
                    return `CASE WHEN ${this.sql.typeOf(x)} = 'array' THEN (SELECT ${rest} FROM ${this.sql.elements(
                        x,
                        e
                    )} WHERE ${e}.item_no > 1) END`;
                }),
                {
                    items: this.itemsOf(call.one()),
                    list: this.isList(call.one()),
                    itemLists: this.holdsLists(call.one()),
                    texts: this.holdsTexts(call.one())
                }
            ),
        // A text is read as Cypher reads it, its case and the spaces around it aside; a number is true but for 0.
        toboolean: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const [yes, no] = [this.sql.literalJson(true), this.sql.literalJson(false)];
                    const text = `LOWER(TRIM(${this.sql.text(x)}))`;
                    return (
                        `CASE WHEN ${this.sql.typeOf(x)} = 'boolean' THEN ${x} ` +
                        `WHEN ${this.sql.typeOf(x)} = 'number' THEN CASE WHEN ${this.sql.number(
                            x
                        )} = 0 THEN ${no} ELSE ${yes} END ` +
                        `WHEN ${text} = 'true' THEN ${yes} WHEN ${text} = 'false' THEN ${no} END`
                    );
                })
            ),
        isempty: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const size = this.sql.function('size', x)!;
                    return this.sql.scalar(
                        `CASE WHEN ${this.sql.typeOf(x)} = 'object' THEN ${x} = ${this.sql.literalJson({})} ` +
                            `WHEN ${this.sql.typeOf(x)} IN ('array', 'string') THEN ${this.sql.number(size)} = 0 END`
                    );
                })
            ),
        // A float, as Cypher gives these; round as Java rounds, half up.
        round: (call) => this.round(call),
        floor: (call) => this.numeric(call),
        ceil: (call) => this.numeric(call),
        ...Object.fromEntries(
            MATH_FUNCTIONS.map((name): [string, (call: Invocation) => Value] => [
                name,
                (call) => json(this.sql.scalar(this.sql.math(name, [this.numberOf(call.one())])))
            ])
        ),
        atan2: (call) => {
            if (call.arguments.length !== 2) {
                throw new DrivineError('atan2() takes two numbers.');
            }
            return json(
                this.sql.scalar(
                    this.sql.math(
                        'atan2',
                        call.arguments.map((it) => this.numberOf(it))
                    )
                )
            );
        },
        // Java's constants, which Neo4j gives, written as the floats they are.
        e: (call) => this.constant(call, Math.E),
        pi: (call) => this.constant(call, Math.PI),
        sign: (call) => json(this.sql.scalar(`SIGN(${this.numberOf(call.one())})`)),
        ltrim: (call) => json(this.sql.scalar(`LTRIM(${this.textOf(call.one())})`), { text: true }),
        rtrim: (call) => json(this.sql.scalar(`RTRIM(${this.textOf(call.one())})`), { text: true }),
        randomuuid: (call) => {
            if (call.arguments.length > 0) {
                throw new DrivineError('randomUUID() takes no argument.');
            }
            return json(this.sql.scalar(this.sql.uuid()));
        },
        // A position is counted from 0, as Cypher counts it, and SQL from 1.
        substring: (call) => {
            if (call.arguments.length < 2 || call.arguments.length > 3) {
                throw new DrivineError('substring() takes a text, a start and a length.');
            }
            const [text, start] = this.textAndCount(call.arguments);
            const length = call.arguments[2] ? `, ${this.whole(call.arguments[2])}` : '';
            return json(this.sql.scalar(`SUBSTR(${text}, ${start} + 1${length})`), { text: true });
        },
        left: (call) => this.leftOrRight(call),
        right: (call) => this.leftOrRight(call),
        replace: (call) => {
            if (call.arguments.length !== 3) {
                throw new DrivineError('replace() takes a text, what to replace, and what with.');
            }
            const [text, search, replacement] = call.arguments.map((it) => this.textOf(it));
            return json(this.sql.scalar(`REPLACE(${text}, ${search}, ${replacement})`), { text: true });
        },
        timestamp: (call) => {
            if (call.arguments.length > 0) {
                throw new DrivineError('timestamp() takes no argument.');
            }
            const now = this.temporals.now(Temporal.DATE_TIME);
            return json(this.sql.scalar(this.temporals.field(now, Temporal.DATE_TIME, 'epochMillis')!.sql));
        },
        'duration.between': (call) => this.between(call),
        'duration.inmonths': (call) => this.between(call),
        'duration.indays': (call) => this.between(call),
        'duration.inseconds': (call) => this.between(call)
    };

    constructor(
        private readonly sql: SqlCypherCompiler,
        readonly parameters: Parameters
    ) {}

    private get temporals(): Temporals {
        return this.sql.temporals;
    }

    /** The query `query` is, which reads and ends with a `RETURN`. */
    query(query: Query): string {
        let select = new Select(new Map());
        for (const clause of query.clauses) {
            if (clause.kind === 'Return') {
                return this.project(select, clause.projection, true).sql;
            }
            select = this.read(select, clause);
        }
        throw new DrivineError('A Cypher statement ends with RETURN.');
    }

    /** The statements of the procedure `query` is: its reads, a loop over its rows for each write, and what it returns. */
    procedure(query: Query): string[] {
        let select = new Select(new Map());
        for (const clause of this.creates(query.clauses)) {
            if (clause.kind === 'Return') {
                this.sql.returnRows(this.project(select, clause.projection, true).sql).forEach((it) => this.emit(it));
            } else {
                select = this.next(select, clause);
            }
        }
        return this.body;
    }

    private alias(prefix: string): string {
        return `${prefix}${++this.counter}`;
    }

    // ----- Clauses -----

    /**
     * A reading clause over the rows `select` reads, and the rows the clauses after it read: a `WITH` is a query of its
     * own. `outer` is what a subquery reads from the row it is in.
     */
    private read(select: Select, clause: Clause, outer: Scope = new Map()): Select {
        switch (clause.kind) {
            case 'Match':
                this.match(select, clause);
                return select;
            case 'Unwind':
                this.unwind(select, clause);
                return select;
            case 'With':
                return this.with(select, clause, outer);
            case 'Call':
                this.call(select, clause);
                return select;
            default:
                throw new Error(`${clause.kind} reads nothing`);
        }
    }

    /**
     * A `WITH`: a query of its own, which the rest of the statement reads from, as it reads `outer`. With `apart`, kept
     * apart from the query that reads it, which must not have it merged in: see {@link casesFirst}.
     */
    private with(select: Select, clause: With, outer: Scope = new Map(), apart: boolean = false): Select {
        const projected = this.project(select, clause.projection, false);
        const name = this.alias('w');
        const next = new Select(outer);
        next.walks = select.walks;
        // A value made anew for each row is one value however often the clauses after read it: see SqlCypherCompiler.once.
        const anew = clause.projection.items.some((item) => contains(item.expression, isAnew));
        const sql = anew ? this.sql.once(projected.sql) : projected.sql;
        next.source(`(\n${indent(apart ? this.sql.called(sql) : sql)}\n) ${name}`);
        projected.scope.forEach((value, variable) => next.bind(variable, columnsOf(value, name)));
        projected.order.forEach(([column, descending]) => next.order.push([`${name}.${column}`, descending]));
        if (clause.where) {
            next.where.push(this.condition(this.expression(clause.where, next.scope)));
        }
        return next;
    }

    private match(select: Select, match: Match): void {
        // A shortest path is the shortest of the paths that meet the WHERE, as Cypher finds it: the WHERE is met where they are found.
        const shortestWhere =
            match.patterns[match.patterns.length - 1].shortest !== undefined ? match.where : undefined;
        const where = shortestWhere === undefined ? match.where : undefined;
        if (!match.optional) {
            this.patterns(select, match.patterns, shortestWhere);
            if (where) {
                select.where.push(this.condition(this.expression(where, select.scope)));
            }
            return;
        }
        // What is found is read by a lateral query, joined to keep the row when it finds nothing.
        const inner = new Select(select.scope);
        this.patterns(inner, match.patterns, shortestWhere);
        if (where) {
            inner.where.push(this.condition(this.expression(where, inner.scope)));
        }
        const outer = select.scope;
        const found = [...inner.bound].filter(([variable]) => !outer.has(variable));
        if (found.length === 0 && inner.sources.length === 0) {
            return;
        }
        const name = this.alias('o');
        // Each variable found under a name of its own: a variable may be called what SQL will not take.
        const named = found.map(([variable, value]): [string, Value, string] => [variable, value, this.alias('v')]);
        const selected = named.flatMap(([, value, column]) => columns(value, column));
        const text = [
            `SELECT ${(selected.length > 0 ? selected : ['1 AS one']).join(', ')}`,
            ...inner.from(),
            ...optional(inner.whereClause())
        ];
        select.join(`LEFT JOIN LATERAL (\n${indent(text.join('\n'))}\n) ${name} ON TRUE`);
        named.forEach(([variable, value, column]) => select.bind(variable, columnsOf(value, name, column)));
    }

    /**
     * The query a subquery is, for the row it is in, whose variables `scope` holds: its rows, or with no `RETURN`, a
     * row for each way its reading clauses are met.
     */
    private correlated(query: Query, scope: Scope, what: string): string {
        if ([...query.clauses, ...query.unions.flatMap((it) => it.clauses)].some(writes)) {
            unsupported(`A write in ${what}`);
        }
        const order = this.rowOrder;
        try {
            if (query.unions.length > 0) {
                return this.correlatedUnion(query, scope);
            }
            let select = new Select(scope);
            for (const clause of query.clauses) {
                if (clause.kind === 'Return') {
                    return this.project(select, clause.projection, false).sql;
                }
                select = this.read(select, clause, scope);
            }
            return ['SELECT 1', ...this.from(select), ...optional(select.whereClause())].join('\n');
        } finally {
            this.rowOrder = order;
        }
    }

    /** Each query of a subquery's `UNION`, its rows as one value each, as a statement's are; without ALL, each once. */
    private correlatedUnion(query: Query, scope: Scope): string {
        const distinct = !query.unions[0].all;
        return [query.clauses, ...query.unions.map((it) => it.clauses)]
            .map((clauses) => {
                let select = new Select(scope);
                clauses.slice(0, -1).forEach((it) => (select = this.read(select, it, scope)));
                const sql = this.project(select, (clauses[clauses.length - 1] as Return).projection, true).sql;
                const result = distinct ? this.sql.comparable(json('q.result', { ordered: true })) : 'q.result';
                return `SELECT ${result} AS result FROM (\n${indent(sql)}\n) q`;
            })
            .join(distinct ? '\nUNION\n' : '\nUNION ALL\n');
    }

    /** `CALL { … }`: a lateral query for each row, what it returns bound as variables of the row. */
    private call(select: Select, call: Call): void {
        const clauses = call.query.clauses;
        if (clauses[clauses.length - 1].kind !== 'Return') {
            unsupported('A CALL { … } that returns nothing');
        }
        if (clauses.some(writes)) {
            unsupported('A write in CALL { … }');
        }
        const order = this.rowOrder;
        const projected =
            call.query.unions.length === 0
                ? this.calledPart(select, clauses, undefined, false)
                : this.calledUnion(select, call.query);
        this.rowOrder = order;
        this.redeclared([...projected.scope.keys()], [...select.bound.keys()]);
        const name = this.alias('c');
        const text = `(\n${indent(this.sql.called(projected.sql))}\n) ${name}`;
        select.join(call.optional ? `LEFT JOIN LATERAL ${text} ON TRUE` : `CROSS JOIN LATERAL ${text}`);
        projected.scope.forEach((value, variable) => select.bind(variable, columnsOf(value, name)));
        projected.order.forEach(([column, descending]) => select.order.push([`${name}.${column}`, descending]));
    }

    /**
     * Fails where a `CALL` returns or yields a variable of `returned` that is bound around it, in `bound`, as Neo4j
     * fails: those of the query part it is in, and not those around a `CALL { … }` that it is in and that does not import
     * them. In a statement that writes, each variable the row holds, which a `CALL { … }` there sees whether it imports it
     * or not.
     */
    private redeclared(returned: string[], bound: string[]): void {
        const again = returned.find((it) => bound.includes(it));
        if (again !== undefined) {
            throw new DrivineError(
                `The variable ${again} is bound already, so a CALL does not return or yield it, as in Cypher: name it with AS.`
            );
        }
    }

    /**
     * One query of a `CALL { … }`, for the row `select` reads: its returned items in the order `names` lists them,
     * where a `UNION` names them so, and kept distinct with `distinct`.
     */
    private calledPart(select: Select, clauses: Clause[], names: string[] | undefined, distinct: boolean): Projected {
        let inner = new Select(select.scope);
        clauses.slice(0, -1).forEach((it) => (inner = this.read(inner, it, select.scope)));
        const projection = (clauses[clauses.length - 1] as Return).projection;
        const items = names ? names.map((name) => projection.items.find((it) => it.name === name)!) : projection.items;
        return this.project(inner, { ...projection, items, distinct: distinct || projection.distinct }, false);
    }

    /** A `UNION` in a `CALL { … }`: each query's rows, the same items of the same kinds, matched by name as Cypher matches them. */
    private calledUnion(select: Select, query: Query): Projected {
        const parts = [query.clauses, ...query.unions.map((it) => it.clauses)];
        if (new Set(query.unions.map((it) => it.all)).size > 1) {
            throw new DrivineError('UNION and UNION ALL are not mixed in one statement, as in Cypher.');
        }
        const returns = parts.map((it) => it[it.length - 1] as Return);
        if (returns.some((it) => it.projection.orderBy.length > 0)) {
            unsupported('An ORDER BY in a query of a UNION in CALL { … }');
        }
        const names = returns[0].projection.items.map((it) => it.name);
        const sameNames = (other: Return): boolean => {
            const theirs = new Set(other.projection.items.map((it) => it.name));
            return theirs.size === new Set(names).size && names.every((it) => theirs.has(it));
        };
        if (!returns.every(sameNames)) {
            throw new DrivineError('Each query of a UNION returns the same names, as in Cypher.');
        }
        const distinct = !query.unions[0].all;
        let projected = parts.map((it) => this.calledPart(select, it, names, distinct));
        if (new Set(projected.map((p) => JSON.stringify([...p.scope.values()].map((it) => it.kind)))).size > 1) {
            unsupported('A UNION in CALL { … } whose queries return values of different kinds');
        }
        // A map or a list that holds a node carries a column more, of its identity. Where one query's value has it and
        // another's has none, as `collect([r])` beside `[]`, the queries are compiled again without identities, so their
        // columns match, and what they return compares by its properties, as it did before identities.
        const held = (p: Projected): string =>
            JSON.stringify([...p.scope.values()].map((it) => it.kind === 'Json' && it.identity !== undefined));
        if (new Set(projected.map(held)).size > 1) {
            const was = this.identities;
            this.identities = false;
            try {
                projected = parts.map((it) => this.calledPart(select, it, names, distinct));
            } finally {
                this.identities = was;
            }
        }
        const sql = projected
            .map((it) => `SELECT * FROM (\n${indent(it.sql)}\n) ${this.alias('q')}`)
            .join(distinct ? '\nUNION\n' : '\nUNION ALL\n');
        // A value is of a temporal kind where each query makes it of that one.
        const scope: Scope = new Map(
            [...projected[0].scope].map(([variable, value]): [string, Value] => {
                if (value.kind !== 'Json') {
                    return [variable, value];
                }
                const all = projected
                    .map((it) => it.scope.get(variable))
                    .map((it) => (it?.kind === 'Json' ? it : undefined));
                return [
                    variable,
                    {
                        ...value,
                        temporal: single(all.map((it) => it?.temporal)),
                        items: single(all.map((it) => it?.items)),
                        text: all.every((it) => it?.text === true),
                        texts: all.every((it) => it?.texts === true)
                    }
                ];
            })
        );
        return { sql, scope, order: [] };
    }

    private unwind(select: Select, unwind: Unwind): void {
        const list = this.expression(unwind.list, select.scope);
        const name = this.alias('u');
        // A list of nodes or relationships unwinds to them, as they are now, so a write reaches them; a null item is a null one.
        if (list.kind === 'Entities') {
            select.source(this.sql.elements(list.ids, name));
            const row = this.alias(list.relationships ? 'e' : 'n');
            if (list.relationships) {
                select.join(`LEFT JOIN ${this.sql.edges} ${row} ON ${row}.eid = ${this.sql.idOf(`${name}.item`)}`);
                select.bind(unwind.variable, relationshipOf(row));
            } else {
                select.join(`LEFT JOIN ${this.sql.nodes} ${row} ON ${row}.nid = ${this.sql.idOf(`${name}.item`)}`);
                select.bind(unwind.variable, nodeOf(row));
            }
            select.order.push([`${name}.item_no`, false]);
            return;
        }
        // A value that is no list is one row, and null no rows, as in Cypher.
        const items = this.sql.shared(
            [this.sql.comparable(this.asJson(list))],
            ([x]) =>
                `CASE WHEN ${this.sql.typeOf(x)} = 'array' THEN ${x} WHEN NOT ${this.sql.isJsonNull(x)} THEN ` +
                `${this.sql.comparable(json(this.sql.jsonArray([x]), { ordered: true }))} END`
        );
        select.source(this.sql.elements(items, name));
        // An item of a list of texts, or of a text, is a text.
        select.bind(
            unwind.variable,
            json(`${name}.item`, {
                temporal: this.itemsOf(list),
                list: this.holdsLists(list),
                text: this.holdsTexts(list) || this.isText(list)
            })
        );
        select.order.push([`${name}.item_no`, false]);
    }

    /** That no relationship of the hop `a` is one of `b`'s. */
    private distinctFrom(a: Hop, b: Hop): string {
        if (!a.many && !b.many) {
            return `${a.eids} <> ${b.eids}`;
        }
        if (!a.many) {
            return `NOT (${this.sql.idIn(a.eids, b.eids)})`;
        }
        if (!b.many) {
            return `NOT (${this.sql.idIn(b.eids, a.eids)})`;
        }
        return `NOT (${this.sql.idsOverlap(a.eids, b.eids)})`;
    }

    /**
     * The patterns of one `MATCH`, matched over the rows `select` reads: their relationships are distinct from one
     * another. `shortestWhere` is met by the paths of the last, a shortest path, see {@link shortest}.
     */
    private patterns(select: Select, patterns: Pattern[], shortestWhere?: Expression): void {
        const hops: Hop[] = [];
        patterns.forEach((it, i) =>
            this.pattern(select, it, hops, i === patterns.length - 1 ? shortestWhere : undefined)
        );
        for (let i = 0; i < hops.length; i++) {
            for (let j = i + 1; j < hops.length; j++) {
                const [a, b] = [hops[i], hops[j]];
                // Relationships of types no relationship has both of cannot be one.
                if (a.types.length === 0 || b.types.length === 0 || a.types.some((it) => b.types.includes(it))) {
                    select.where.push(this.distinctFrom(a, b));
                }
            }
        }
    }

    private pattern(select: Select, pattern: Pattern, hops: Hop[], shortestWhere?: Expression): void {
        if (pattern.shortest) {
            this.shortest(select, pattern, shortestWhere);
            return;
        }
        // A node bound before the pattern, or given properties, is where a walk starts best.
        const pinned = pattern.nodes.map(
            (node) => node.properties !== undefined || (node.variable !== undefined && select.scope.has(node.variable))
        );
        const before = select.scope;
        const bound = pattern.nodes.map((node) => this.patternNode(select, node));
        pattern.relationships.forEach((relationship, i) => {
            if (relationship.group) {
                hops.push(
                    this.quantified(
                        select,
                        relationship,
                        bound[i].nid,
                        bound[i + 1].nid,
                        this.seed(pattern.nodes[i], before)
                    )
                );
                return;
            }
            if (relationship.range) {
                // Walked from its far node when only that one is pinned: the same relationships, read backwards.
                hops.push(
                    pinned[i + 1] && !pinned[i]
                        ? this.walk(
                              select,
                              reversed(relationship),
                              bound[i + 1].nid,
                              bound[i].nid,
                              true,
                              this.seed(pattern.nodes[i + 1], before)
                          )
                        : this.walk(
                              select,
                              relationship,
                              bound[i].nid,
                              bound[i + 1].nid,
                              false,
                              this.seed(pattern.nodes[i], before)
                          )
                );
                return;
            }
            hops.push(this.patternRelationship(select, relationship, bound[i].nid, bound[i + 1].nid));
        });
        if (pattern.variable !== undefined) {
            const mine = hops.slice(hops.length - pattern.relationships.length);
            const nids = this.sql.joinIds([this.sql.ids(bound[0].nid), ...mine.map((it) => it.nodes)]);
            const lists = mine.map((it) => (it.many ? it.eids : this.sql.ids(it.eids)));
            const eids = lists.length === 0 ? this.sql.noIds : this.sql.joinIds(lists);
            select.bind(pattern.variable, { kind: 'Path', nids, eids });
        }
    }

    /** A node of a pattern, bound before it or found by a row of its own. */
    private patternNode(select: Select, node: NodePattern): NodeValue {
        const existing = node.variable !== undefined ? select.scope.get(node.variable) : undefined;
        let value: NodeValue;
        if (existing?.kind === 'Node') {
            value = existing;
        } else if (existing === undefined) {
            const name = this.alias('n');
            select.source(`${this.sql.nodes} ${name}`);
            value = nodeOf(name);
            if (node.variable !== undefined) {
                select.bind(node.variable, value);
            }
        } else {
            throw new DrivineError(`${node.variable} is not a node, and is used as one in a pattern.`);
        }
        if (node.labels.length > 0) {
            select.where.push(this.sql.hasLabels(value.labels, node.labels));
        }
        if (node.properties) {
            select.where.push(this.propertiesMatch(value.props, node.properties, select.scope));
        }
        return value;
    }

    /** A relationship of a pattern, of one step, from the node whose id is `from` to the one whose is `to`. */
    private patternRelationship(select: Select, relationship: RelationshipPattern, from: string, to: string): Hop {
        if (relationship.variable !== undefined && select.scope.has(relationship.variable)) {
            unsupported('A relationship variable bound before its pattern');
        }
        const name = this.alias('e');
        select.source(`${this.sql.edges} ${name}`);
        const value = relationshipOf(name);
        if (relationship.variable !== undefined) {
            select.bind(relationship.variable, value);
        }
        const directions = {
            OUTGOING: `${value.src} = ${from} AND ${value.dst} = ${to}`,
            INCOMING: `${value.dst} = ${from} AND ${value.src} = ${to}`,
            // Either way, and a relationship from a node to itself once.
            EITHER: `((${value.src} = ${from} AND ${value.dst} = ${to}) OR (${value.dst} = ${from} AND ${value.src} = ${to}))`
        };
        select.where.push(directions[relationship.direction]);
        select.where.push(...optional(this.types(value.type, relationship.types)));
        if (relationship.properties) {
            select.where.push(this.propertiesMatch(value.props, relationship.properties, select.scope));
        }
        return { eids: value.eid, many: false, types: relationship.types, nodes: this.sql.ids(to) };
    }

    /**
     * `shortestPath(…)` or `allShortestPaths(…)`: the pattern's paths for the row, found in a lateral query, of which
     * the shortest between each two nodes it joins is kept, or every one of the least length. Its relationship is a
     * walk, so a path of it takes no relationship twice, as Cypher's shortest path takes none. The paths are those that
     * meet `where`, the `WHERE` of its `MATCH`, as Cypher's shortest path is the least of those.
     */
    private shortest(select: Select, pattern: Pattern, where?: Expression): void {
        const relationship = pattern.relationships.length === 1 ? pattern.relationships[0] : undefined;
        if (!relationship?.range || relationship.group) {
            unsupported('A shortest path of anything but one variable-length relationship');
        }
        const inner = new Select(select.scope);
        const hops: Hop[] = [];
        // Its ends named, to find the shortest between each two of them where they were not bound before it.
        const [first, last] = [pattern.nodes[0], pattern.nodes[pattern.nodes.length - 1]];
        const ends = [first.variable ?? SHORTEST_FROM, last.variable ?? SHORTEST_TO];
        this.pattern(
            inner,
            {
                ...pattern,
                nodes: [
                    { ...first, variable: ends[0] },
                    { ...last, variable: ends[1] }
                ],
                shortest: undefined
            },
            hops
        );
        if (where) {
            inner.where.push(this.condition(this.expression(where, inner.scope)));
        }
        const outer = select.scope;
        const found = [...inner.bound]
            .filter(([variable]) => !outer.has(variable) && variable !== SHORTEST_FROM && variable !== SHORTEST_TO)
            .map(([variable, value]): [string, Value, string] => [variable, value, this.alias('v')]);
        const length = this.sql.number(this.sql.idCount(hops[0].eids));
        const [from, to] = ends.map((it) => (inner.scope.get(it) as NodeValue).nid);
        const selected = [
            ...found.flatMap(([, value, column]) => columns(value, column)),
            `${length} AS len`,
            `${from} AS from_nid`,
            `${to} AS to_nid`
        ];
        const paths = [`SELECT ${selected.join(', ')}`, ...inner.from(), ...optional(inner.whereClause())].join('\n');
        const name = this.alias('sp');
        const s = this.alias('s');
        let text: string;
        if (pattern.shortest === 'ONE') {
            const ranked = `SELECT ${s}.*, ROW_NUMBER() OVER (PARTITION BY ${s}.from_nid, ${s}.to_nid ORDER BY ${s}.len) AS k FROM (\n${indent(
                paths
            )}\n) ${s}`;
            text = `SELECT * FROM (\n${indent(ranked)}\n) ${this.alias('s')}\nWHERE k = 1`;
        } else {
            // Every path as short as the shortest.
            const least = `SELECT ${s}.*, MIN(${s}.len) OVER (PARTITION BY ${s}.from_nid, ${s}.to_nid) AS least FROM (\n${indent(
                paths
            )}\n) ${s}`;
            text = `SELECT * FROM (\n${indent(least)}\n) ${this.alias('s')}\nWHERE len = least`;
        }
        select.join(`CROSS JOIN LATERAL (\n${indent(text)}\n) ${name}`);
        found.forEach(([variable, value, column]) => select.bind(variable, columnsOf(value, name, column)));
    }

    /** That the relationship type `type` is one of `types`; undefined when any will do. */
    private types(type: string, types: string[]): string | undefined {
        if (types.length === 0) {
            return undefined;
        }
        return types.length === 1 ? `${type} = ${literal(types[0])}` : `${type} IN (${types.map(literal).join(', ')})`;
    }

    /**
     * What the node `node` meets of its own, before a walk from it, over a node row: its labels, and its properties
     * where their values do not depend on a row. Undefined for a node bound before its pattern, which is found where it
     * was bound, or with nothing of its own to meet.
     */
    private seed(node: NodePattern, before: Scope): ((row: string) => string) | undefined {
        if (node.variable !== undefined && before.has(node.variable)) {
            return undefined;
        }
        const properties =
            node.properties && !contains(node.properties, (e) => e.kind === 'Variable' || e.kind === 'Property')
                ? node.properties
                : undefined;
        if (node.labels.length === 0 && !properties) {
            return undefined;
        }
        return (row) =>
            [
                ...(node.labels.length > 0 ? [this.sql.hasLabels(`${row}.labels`, node.labels)] : []),
                ...(properties ? [this.propertiesMatch(`${row}.props`, properties, before)] : [])
            ].join(' AND ');
    }

    /**
     * A variable-length relationship, `-[:T*min..max]->`, from the node `from` to the node `to`: a walk from `from` that
     * takes a relationship no more than once, as Cypher takes it, to a depth from `min` (1 if left out) to `max` (any if
     * left out), its rows each way it reaches `to`. Walked `backwards`, from the pattern's later node, it keeps its nodes
     * and relationships in the pattern's order.
     */
    private walk(
        select: Select,
        relationship: RelationshipPattern,
        from: string,
        to: string,
        backwards: boolean,
        seed: ((row: string) => string) | undefined
    ): Hop {
        const range = relationship.range!;
        const edge = this.alias('e');
        const conditions = [
            ...optional(this.types(`${edge}.type`, relationship.types)),
            ...(relationship.properties
                ? [this.propertiesMatch(`${edge}.props`, relationship.properties, select.scope)]
                : [])
        ];
        const walked = this.walked({
            from,
            to,
            name: this.alias('p'),
            step: this.alias('w'),
            hops: [{ edge, direction: relationship.direction }],
            nodes: [undefined, undefined],
            min: range.min ?? 1,
            max: range.max,
            conditions,
            backwards,
            seed
        });
        select.source(walked.source);
        select.walks = true;
        select.where.push(walked.condition);
        // A variable on it is the list of its relationships.
        if (relationship.variable !== undefined) {
            select.bind(relationship.variable, this.relationshipList(walked.eids));
        }
        return { eids: walked.eids, many: true, types: relationship.types, nodes: walked.nids };
    }

    /**
     * A quantified path pattern, `((a)-[r:R]->(b) WHERE …){min,max}`, from the node `from` to the node `to`: a walk whose
     * each step is a repetition of the group's pattern, that takes a relationship no more than once, as a walk of a
     * variable-length relationship does. Each variable of the group is bound to the list of what it matched in each
     * repetition, in turn.
     */
    private quantified(
        select: Select,
        relationship: RelationshipPattern,
        from: string,
        to: string,
        seed: ((row: string) => string) | undefined
    ): Hop {
        const group = relationship.group!;
        const inner = group.pattern;
        const rows = inner.nodes.map(() => this.alias('n'));
        const links = inner.relationships.map(() => this.alias('e'));
        const scope: [string, Value][] = [
            ...inner.nodes.flatMap((node, i): [string, Value][] =>
                node.variable !== undefined ? [[node.variable, nodeOf(rows[i])]] : []
            ),
            ...inner.relationships.flatMap((r, i): [string, Value][] =>
                r.variable !== undefined ? [[r.variable, relationshipOf(links[i])]] : []
            )
        ];
        const names = scope.map(([variable]) => variable);
        new Set(names).forEach((variable) => {
            if (names.filter((it) => it === variable).length > 1) {
                unsupported('A variable named twice in a quantified path pattern');
            }
            if (select.scope.has(variable)) {
                throw new DrivineError(`${variable} is bound outside the quantified path pattern that names it.`);
            }
        });
        const tests = [
            ...inner.nodes.flatMap((it) => (it.properties ? [it.properties] : [])),
            ...inner.relationships.flatMap((it) => (it.properties ? [it.properties] : [])),
            ...(group.where ? [group.where] : [])
        ];
        const read = new Set(tests.flatMap((it) => [...variablesIn(it)]));
        // A subquery reads every variable, for variablesIn names none of a subquery's: as evaluate takes it.
        const subquery = tests.some(holdsSubquery);
        if (!this.sql.walksReadRow && [...read].some((it) => select.scope.has(it))) {
            unsupported('On Oracle, a quantified path pattern that reads a variable from outside it');
        }
        if (!this.sql.walksReadRow && subquery && select.scope.size > 0) {
            unsupported('On Oracle, a subquery in a quantified path pattern that may read a variable from outside it');
        }
        const within: Scope = new Map([...select.scope, ...scope]);
        const outer = this.stepping;
        this.stepping = true;
        let conditions: string[];
        try {
            conditions = [
                ...inner.nodes.flatMap((node, i) => [
                    ...(node.labels.length > 0 ? [this.sql.hasLabels(`${rows[i]}.labels`, node.labels)] : []),
                    ...(node.properties ? [this.propertiesMatch(`${rows[i]}.props`, node.properties, within)] : [])
                ]),
                ...inner.relationships.flatMap((r, i) => [
                    ...optional(this.types(`${links[i]}.type`, r.types)),
                    ...(r.properties ? [this.propertiesMatch(`${links[i]}.props`, r.properties, within)] : [])
                ]),
                ...(group.where ? [this.condition(this.expression(group.where, within))] : [])
            ];
        } finally {
            this.stepping = outer;
        }
        // A node is joined to the step where a condition reads it.
        const joined = inner.nodes.map((node, i) =>
            (subquery && node.variable !== undefined) ||
            node.labels.length > 0 ||
            node.properties !== undefined ||
            (node.variable !== undefined && read.has(node.variable))
                ? rows[i]
                : undefined
        );
        const range = relationship.range!;
        const walked = this.walked({
            from,
            to,
            name: this.alias('p'),
            step: this.alias('w'),
            hops: inner.relationships.map((r, i) => ({ edge: links[i], direction: r.direction })),
            nodes: joined,
            min: range.min ?? 1,
            max: range.max,
            conditions,
            backwards: false,
            seed
        });
        select.source(walked.source);
        select.walks = true;
        select.where.push(walked.condition);
        // The step's nodes and relationships, k of each a repetition, in turn: each variable is every k-th of them.
        const k = inner.relationships.length;
        const nids = this.sql.joinIds([this.sql.ids(from), walked.nids]);
        inner.nodes.forEach((node, i) => {
            if (node.variable !== undefined) {
                select.bind(node.variable, {
                    kind: 'Entities',
                    ids: this.every(nids, i, k, k - i),
                    relationships: false
                });
            }
        });
        inner.relationships.forEach((r, i) => {
            if (r.variable !== undefined) {
                select.bind(r.variable, {
                    kind: 'Entities',
                    ids: this.every(walked.eids, i, k, 0),
                    relationships: true
                });
            }
        });
        const types = inner.relationships.every((it) => it.types.length > 0)
            ? [...new Set(inner.relationships.flatMap((it) => it.types))]
            : [];
        return { eids: walked.eids, many: true, types, nodes: walked.nids };
    }

    /**
     * The ids of the store's list `list` from the one after the first `first`, every `stride`-th, short of the last
     * `leave`, as a JSON list in its order.
     */
    private every(list: string, first: number, stride: number, leave: number): string {
        const u = this.alias('u');
        const v = this.alias('v');
        const listed = this.sql.comparable(
            json(this.sql.aggregateList(this.sql.scalar(`${v}.id`), `${v}.ord`), { ordered: true })
        );
        return (
            `(SELECT ${listed} FROM (SELECT ${u}.id, ${u}.ord, COUNT(*) OVER () AS cnt FROM ${this.sql.idRows(
                list,
                u
            )}) ${v} ` +
            `WHERE ${v}.ord > ${first} AND MOD(${v}.ord - ${
                first + 1
            }, ${stride}) = 0 AND ${v}.ord <= ${v}.cnt - ${leave})`
        );
    }

    /** {@link SqlCypherCompiler.walk}'s rows. On Oracle, no walk is in another's step, for its recursive query holds no `WITH` of its own. */
    private walked(walk: Walk): Walked {
        if (!this.sql.walksReadRow && this.stepping) {
            unsupported(
                'On Oracle, a variable-length relationship or quantified path pattern in a subquery of a quantified path pattern'
            );
        }
        return this.sql.walk(walk);
    }

    /** The nodes whose ids are the store's list `nids`, in its order: null where the list is. */
    private nodeList(nids: string): EntitiesValue {
        return { kind: 'Entities', ids: this.idList(nids), relationships: false };
    }

    /** The relationships whose ids are the store's list `eids`, in its order: null where the list is. */
    private relationshipList(eids: string): EntitiesValue {
        return { kind: 'Entities', ids: this.idList(eids), relationships: true };
    }

    /** The store's list of ids `list` as a JSON list of them, in its order: null where the list is. */
    private idList(list: string): string {
        const u = this.alias('u');
        const listed = this.sql.comparable(
            json(this.sql.aggregateList(this.sql.scalar(`${u}.id`), `${u}.ord`), { ordered: true })
        );
        return `CASE WHEN ${list} IS NOT NULL THEN (SELECT ${listed} FROM ${this.sql.idRows(list, u)}) END`;
    }

    /** The nodes or relationships `entities` lists, as a JSON list of their properties in its order: null where the list is. */
    private entitiesJson(entities: EntitiesValue): string {
        if (entities.gathered !== undefined) {
            return entities.gathered;
        }
        return this.sql.shared([entities.ids], ([ids]) => {
            const u = this.alias('u');
            const row = this.alias(entities.relationships ? 'e' : 'n');
            const [table, value, id] = entities.relationships
                ? [this.sql.edges, this.asJson(relationshipOf(row)).sql, 'eid']
                : [this.sql.nodes, this.asJson(nodeOf(row)).sql, 'nid'];
            return (
                `CASE WHEN ${ids} IS NOT NULL THEN (SELECT ${this.sql.aggregateList(
                    value,
                    `${u}.item_no`
                )} FROM ${this.sql.elements(ids, u)} ` +
                `LEFT JOIN ${table} ${row} ON ${row}.${id} = ${this.sql.idOf(`${u}.item`)}) END`
            );
        });
    }

    /** A pattern's properties: each key equal to its value, or every key of a parameter's map. */
    private propertiesMatch(props: string, properties: Expression, scope: Scope): string {
        if (properties.kind === 'MapLiteral') {
            return properties.entries
                .map(([key, value]) =>
                    this.equality(json(this.sql.propertyOf(props, key)), this.expression(value, scope), value)
                )
                .join(' AND ');
        }
        return this.sql.containsAll(props, this.sql.comparable(this.asJson(this.expression(properties, scope))));
    }

    // ----- A statement that writes -----

    /** `clause` over the rows `select` reads, written for them where it writes: the rows the clauses after it read. */
    private next(select: Select, clause: Clause): Select {
        if (!writes(clause)) {
            return this.read(select, clause);
        }
        this.carry(select);
        if (clause.kind === 'Foreach') {
            this.foreach(clause);
        } else if (clause.kind === 'Call') {
            this.callWriting(clause);
        } else {
            this.write(clause);
        }
        return this.rows();
    }

    /** `clauses` with each run of `CREATE`s one `CREATE` of all their patterns, which makes the same, in one loop over the rows. */
    private creates(clauses: Clause[]): Clause[] {
        return clauses.reduce<Clause[]>((merged, clause) => {
            const last = merged[merged.length - 1];
            if (clause.kind === 'Create' && last?.kind === 'Create') {
                merged[merged.length - 1] = { kind: 'Create', patterns: [...last.patterns, ...clause.patterns] };
            } else {
                merged.push(clause);
            }
            return merged;
        }, []);
    }

    private emit(statement: string): void {
        const prefix = '    '.repeat(this.depth);
        this.body.push(
            statement
                .split('\n')
                .map((it) => prefix + it)
                .join('\n')
        );
    }

    private assign(variable: string, sql: string): void {
        this.emit(`SELECT ${sql} INTO ${variable};`);
    }

    private key(variable: string): string {
        let key = this.keys.get(variable);
        if (key === undefined) {
            key = `v${this.keys.size + 1}`;
            this.keys.set(variable, key);
        }
        return key;
    }

    /** The rows `select` reads, each a JSON map of the variables it binds, into `ROWS`. */
    private carry(select: Select): void {
        if (this.unread && this.unread[0] === select && this.unread[1] === select.size()) {
            return;
        }
        this.kinds.clear();
        this.carried.clear();
        const entries = [...select.scope].map(([variable, value]): [string, string] => {
            if (value.kind === 'Json') {
                this.carried.set(variable, value);
            }
            this.kinds.set(variable, heldKind(value));
            return [this.key(variable), this.held(value)];
        });
        const list = this.sql.comparable(
            json(this.sql.aggregateList(this.sql.jsonObject(entries), this.orderOf(select)), { ordered: true })
        );
        this.emit(
            [`SELECT ${list} INTO ${ROWS}`, ...this.from(select), ...optional(select.whereClause())].join('\n') + ';'
        );
    }

    /** A value as a row holds it: a node or a relationship as its id, anything else as JSON. */
    private held(value: Value): string {
        switch (value.kind) {
            case 'Node':
                return this.sql.scalar(value.nid);
            case 'Relationship':
                return this.sql.scalar(value.eid);
            case 'Entities':
                return value.ids;
            case 'Path':
                // A path as the JSON lists of its nodes' and relationships' ids.
                return this.sql.comparable(
                    json(
                        this.sql.jsonObject([
                            ['n', this.idList(value.nids)],
                            ['e', this.idList(value.eids)]
                        ]),
                        { ordered: true }
                    )
                );
            default:
                return this.sql.comparable(this.asJson(value));
        }
    }

    private from(select: Select): string[] {
        return select.from().length > 0 ? select.from() : ['FROM (SELECT 1) one'];
    }

    /** The order `select` reads its rows in, as an `ORDER BY` lists it: undefined where it has none. */
    private orderOf(select: Select): string | undefined {
        const terms = select.order.map(([term, descending]) => (descending ? `${term} DESC` : term));
        return terms.length > 0 ? terms.join(', ') : undefined;
    }

    /** The rows in `ROWS`, as a query reads them. */
    private rows(): Select {
        const select = new Select(new Map());
        const r = this.alias('r');
        select.source(this.sql.elements(ROWS, r));
        select.order.push([`${r}.item_no`, false]);
        this.bindRow(select, `${r}.item`);
        this.unread = [select, select.size()];
        return select;
    }

    /**
     * The row in `ROW` alone, as a statement of a write reads it, with the variables `needed` bound: a row may hold
     * many, and each node or relationship bound is a join.
     */
    private row(needed?: Set<string>): Select {
        const select = new Select(new Map());
        this.bindRow(select, ROW, needed);
        return select;
    }

    /**
     * Binds into `select` each variable the row `row` holds, of `needed` where given: a node or a relationship is read
     * from its table, as it is now.
     */
    private bindRow(select: Select, row: string, needed?: Set<string>): void {
        this.kinds.forEach((kind, variable) => {
            if (needed && !needed.has(variable)) {
                return;
            }
            const key = this.key(variable);
            if (kind === 'NODE') {
                const n = this.alias('n');
                select.join(`LEFT JOIN ${this.sql.nodes} ${n} ON ${n}.nid = ${this.sql.idOf(row, key)}`);
                select.bind(variable, nodeOf(n));
            } else if (kind === 'RELATIONSHIP') {
                const e = this.alias('e');
                select.join(`LEFT JOIN ${this.sql.edges} ${e} ON ${e}.eid = ${this.sql.idOf(row, key)}`);
                select.bind(variable, relationshipOf(e));
            } else if (kind === 'VALUE') {
                const was = this.carried.get(variable);
                select.bind(
                    variable,
                    json(this.sql.propertyOf(row, key), {
                        temporal: was?.temporal,
                        items: was?.items,
                        list: was?.list,
                        itemLists: was?.itemLists,
                        text: was?.text,
                        texts: was?.texts
                    })
                );
            } else if (kind === 'PATH') {
                const held = this.sql.propertyOf(row, key);
                select.bind(variable, {
                    kind: 'Path',
                    nids: this.sql.storeIds(this.sql.nullIfJsonNull(this.sql.propertyOf(held, 'n'))),
                    eids: this.sql.storeIds(this.sql.nullIfJsonNull(this.sql.propertyOf(held, 'e')))
                });
            } else {
                // A list or a path that is null is held as JSON's null, and read as SQL's.
                select.bind(variable, {
                    kind: 'Entities',
                    ids: this.sql.nullIfJsonNull(this.sql.propertyOf(row, key)),
                    relationships: kind === 'RELATIONSHIPS'
                });
            }
        });
    }

    /**
     * `value`, worked out over the row in `ROW`, into `variable`: `expressions` are what it reads. A subquery among them,
     * in a comprehension's, a quantifier's or a reduce's expression too, reads every variable of the row, for
     * {@link variablesIn} names none of a subquery's.
     */
    private evaluate(variable: string, expressions: (Expression | undefined)[], value: (scope: Scope) => string): void {
        const read = expressions.filter((it): it is Expression => it !== undefined);
        const select = this.row(
            read.some(holdsSubquery) ? undefined : new Set(read.flatMap((it) => [...variablesIn(it)]))
        );
        this.emit([`SELECT ${value(select.scope)} INTO ${variable}`, ...this.from(select)].join('\n') + ';');
    }

    /** One write: made for each row of `ROWS` in turn, and the rows it leaves put back there. */
    private write(clause: Clause): void {
        this.assign(OUT, this.sql.literalJson([]));
        const deleting = clause.kind === 'Delete' && !clause.detach;
        if (deleting) {
            this.assign(DOOMED, this.sql.literalJson([]));
        }
        const r = this.alias('r');
        this.emit(`FOR ${RECORD} IN (SELECT ${r}.item FROM ${this.sql.elements(ROWS, r)} ORDER BY ${r}.item_no) LOOP`);
        this.depth++;
        this.emit(`${ROW} := ${RECORD}.item;`);
        this.writeRow(clause);
        this.depth--;
        this.emit('END LOOP;');
        this.emit(`${ROWS} := ${OUT};`);
        if (deleting) {
            // A node is deleted when the clause has deleted the relationships it deletes: one it does not delete must not be there.
            const d = this.alias('d');
            const doomed = `SELECT ${this.sql.idOf(`${d}.item`)} FROM ${this.sql.elements(DOOMED, d)}`;
            this.emit(
                `SELECT count(*) INTO ${COUNT} FROM ${this.sql.edges} WHERE src IN (${doomed}) OR dst IN (${doomed});`
            );
            this.emit(`IF ${COUNT} > 0 THEN`);
            this.emit(
                `    ${this.sql.raise(
                    'A node is deleted that still has relationships: delete them first, or DETACH DELETE it.'
                )}`
            );
            this.emit('END IF;');
            this.emit(`DELETE FROM ${this.sql.nodes} WHERE nid IN (${doomed});`);
        }
    }

    /** The write `clause` makes for the row in `ROW`. */
    private writeRow(clause: Clause): void {
        switch (clause.kind) {
            case 'Create':
                clause.patterns.forEach((it) => this.create(it, false));
                this.keep();
                return;
            case 'Merge':
                this.merge(clause);
                return;
            case 'Set':
                clause.items.forEach((it) => this.set(it));
                this.keep();
                return;
            case 'Remove':
                clause.items.forEach((it) => this.remove(it));
                this.keep();
                return;
            case 'Delete':
                this.delete(clause);
                this.keep();
                return;
            default:
                throw new Error(`${clause.kind} reads`);
        }
    }

    /**
     * A `CALL { … }` that writes, over the rows in `ROWS`: its clauses written for each row alone, in turn, as a graph
     * engine writes them, so what one row writes is there for the next to read. One that returns nothing leaves the rows
     * as it found them; one that returns adds what it returns to each row it gives, the row's own variables as they were
     * before the call, whatever it bound to their names inside it.
     */
    private callWriting(call: Call): void {
        if (call.optional) {
            unsupported('An OPTIONAL CALL { … } that writes');
        }
        if (call.query.unions.length > 0) {
            unsupported('A UNION in CALL { … }');
        }
        const last = call.query.clauses[call.query.clauses.length - 1];
        const returned = last.kind === 'Return' ? last : undefined;
        if (returned && returned.projection.items.some((it) => contains(it.expression, isAggregate))) {
            unsupported('An aggregate in the RETURN of a CALL { … } that writes');
        }
        if (this.nesting === NESTING) {
            unsupported(`A FOREACH or CALL { … } that writes nested more than ${NESTING} deep`);
        }
        if (returned) {
            this.redeclared(
                returned.projection.items.map((it) => it.name),
                [...this.kinds.keys()]
            );
        }
        const kept = `${SAVED}${++this.nesting}`;
        const gathered = `${GATHERED}${this.nesting}`;
        const caller = `${CALLER}${this.nesting}`;
        const before = new Map(this.kinds);
        const carriedBefore = new Map(this.carried);
        const returnedKinds = new Map<string, Kind>();
        const returnedCarried = new Map<string, JsonValue>();
        this.emit(`${kept} := ${ROWS};`);
        if (returned) {
            this.assign(gathered, this.sql.literalJson([]));
        }
        this.eachRow(kept, () => {
            if (returned) {
                this.emit(`${caller} := ${RECORD}.item;`);
            }
            let select = this.rows();
            for (const clause of this.imported(call.query.clauses)) {
                select =
                    clause.kind === 'Return'
                        ? this.with(select, { kind: 'With', projection: clause.projection })
                        : this.next(select, clause);
            }
            if (returned) {
                // The rows this row gives, after those of the rows before it: each the row the call was written for,
                // read from before the call, with what it returns. A name of the row it returns is the row's.
                this.carry(select);
                const names = [...this.kinds.keys()].filter((it) => !before.has(it));
                names.forEach((it) => returnedKinds.set(it, this.kinds.get(it)!));
                this.carried.forEach((value, it) => {
                    if (names.includes(it)) {
                        returnedCarried.set(it, value);
                    }
                });
                const [g, a, b] = [this.alias('g'), this.alias('g'), this.alias('g')];
                const row = this.sql.comparable(
                    json(
                        this.sql.jsonObject([
                            ...[...before.keys()].map((it): [string, string] => [
                                this.key(it),
                                this.sql.propertyOf(caller, this.key(it))
                            ]),
                            ...names.map((it): [string, string] => [
                                this.key(it),
                                this.sql.propertyOf(`${b}.item`, this.key(it))
                            ])
                        ]),
                        { ordered: true }
                    )
                );
                const both =
                    `SELECT 1 AS part, ${a}.item_no, ${a}.item FROM ${this.sql.elements(gathered, a)} UNION ALL ` +
                    `SELECT 2 AS part, ${b}.item_no, ${row} AS item FROM ${this.sql.elements(ROWS, b)}`;
                const all = this.sql.comparable(
                    json(this.sql.aggregateList(`${g}.item`, `${g}.part, ${g}.item_no`), { ordered: true })
                );
                this.emit(`SELECT ${all} INTO ${gathered} FROM (${both}) ${g};`);
            }
        });
        if (returned) {
            this.emit(`${ROWS} := ${gathered};`);
            this.restore(new Map([...before, ...returnedKinds]), new Map([...carriedBefore, ...returnedCarried]));
        } else {
            this.emit(`${ROWS} := ${kept};`);
            this.restore(before, carriedBefore);
        }
        this.unread = undefined;
        this.nesting--;
    }

    /**
     * Writes `body` for each row of `rows`, a variable of the procedure, alone in `ROWS` in turn, as a graph engine
     * writes a `FOREACH` or a `CALL { … }` for each row: what one row writes is there for the next to read.
     */
    private eachRow(rows: string, body: () => void): void {
        const r = this.alias('r');
        this.emit(`FOR ${RECORD} IN (SELECT ${r}.item FROM ${this.sql.elements(rows, r)} ORDER BY ${r}.item_no) LOOP`);
        this.depth++;
        this.assign(ROWS, this.sql.appended(this.sql.literalJson([]), `${RECORD}.item`));
        this.unread = undefined;
        body();
        this.depth--;
        this.emit('END LOOP;');
    }

    /** `clauses` without an importing `WITH` of variables alone that opens them: every variable of the row is seen. */
    private imported(clauses: Clause[]): Clause[] {
        const first = clauses[0];
        if (first?.kind !== 'With') {
            return clauses;
        }
        const projection = first.projection;
        const importing =
            first.where === undefined &&
            !projection.distinct &&
            projection.orderBy.length === 0 &&
            projection.skip === undefined &&
            projection.limit === undefined &&
            projection.items.every((it) => it.expression.kind === 'Variable' && it.expression.name === it.name);
        return importing ? clauses.slice(1) : clauses;
    }

    /**
     * A `FOREACH` over the rows in `ROWS`: its list unwound over them, its clauses written for each row and item alone,
     * in turn, then the rows put back as they were, for a `FOREACH` leaves them as it found them.
     */
    private foreach(foreach: Foreach): void {
        if (this.nesting === NESTING) {
            unsupported(`A FOREACH or CALL { … } that writes nested more than ${NESTING} deep`);
        }
        if (foreach.clauses.some((it) => it.kind === 'Call')) {
            throw new DrivineError('A CALL { … } is not written in a FOREACH, as in Cypher.');
        }
        const saved = `${SAVED}${++this.nesting}`;
        const items = `${GATHERED}${this.nesting}`;
        const before = new Map(this.kinds);
        const carriedBefore = new Map(this.carried);
        this.emit(`${saved} := ${ROWS};`);
        const unwound = this.rows();
        this.unwind(unwound, { kind: 'Unwind', list: foreach.list, variable: foreach.variable });
        this.carry(unwound);
        this.emit(`${items} := ${ROWS};`);
        this.eachRow(items, () => {
            let select = this.rows();
            for (const clause of this.creates(foreach.clauses)) {
                select = this.next(select, clause);
            }
        });
        this.emit(`${ROWS} := ${saved};`);
        this.restore(before, carriedBefore);
        this.unread = undefined;
        this.nesting--;
    }

    /**
     * The rows' variables put back as they were, `before` of each its kind and `carriedBefore` its value, where a
     * `FOREACH` or a `CALL { … }` leaves the rows as it found them: a variable it bound again within is not of its kind.
     */
    private restore(before: Map<string, Kind>, carriedBefore: Map<string, JsonValue>): void {
        this.kinds.clear();
        before.forEach((kind, variable) => this.kinds.set(variable, kind));
        this.carried.clear();
        carriedBefore.forEach((value, variable) => this.carried.set(variable, value));
    }

    /** The row in `ROW` kept, as a row of what the write leaves. */
    private keep(): void {
        this.assign(OUT, this.sql.appended(OUT, ROW));
    }

    /**
     * Makes `pattern` for the row in `ROW`: each node not bound before it, and each relationship, with the row given the
     * ids of those it names. With `merging`, an undirected relationship is made from the pattern's earlier node, as a
     * `MERGE` makes it.
     */
    private create(pattern: Pattern, merging: boolean): void {
        if (pattern.variable !== undefined) {
            unsupported('A path variable in CREATE or MERGE');
        }
        if (pattern.shortest) {
            unsupported('A shortest path in CREATE');
        }
        const ids = pattern.nodes.map((node) => this.createNode(node));
        pattern.relationships.forEach((relationship, i) => {
            if (relationship.group) {
                unsupported('A quantified path pattern in CREATE or MERGE');
            }
            if (relationship.range) {
                unsupported('A variable-length relationship in CREATE or MERGE');
            }
            if (relationship.types.length !== 1) {
                throw new DrivineError('A relationship that CREATE or MERGE makes has one type.');
            }
            if (relationship.variable !== undefined && this.kinds.has(relationship.variable)) {
                unsupported('A relationship variable bound before its pattern');
            }
            let ends: [string, string];
            if (relationship.direction === 'OUTGOING') {
                ends = [ids[i], ids[i + 1]];
            } else if (relationship.direction === 'INCOMING') {
                ends = [ids[i + 1], ids[i]];
            } else if (merging) {
                ends = [ids[i], ids[i + 1]];
            } else {
                throw new DrivineError('A relationship that CREATE makes has a direction.');
            }
            this.evaluate(VALUE, [relationship.properties], (scope) => this.written(relationship.properties, scope));
            this.emit(
                `INSERT INTO ${this.sql.edges} (src, dst, type, props) VALUES (${ends[0]}, ${ends[1]}, ${literal(
                    relationship.types[0]
                )}, ` + `${this.sql.stripNulls(VALUE)}) RETURNING eid INTO ${ID};`
            );
            this.made(relationship.variable, 'RELATIONSHIP');
        });
    }

    /** The id of a node of a pattern `CREATE` or `MERGE` makes: one bound before it, or one it makes. */
    private createNode(node: NodePattern): string {
        const kind = node.variable !== undefined ? this.kinds.get(node.variable) : undefined;
        if (kind === 'NODE') {
            if (node.labels.length > 0 || node.properties !== undefined) {
                throw new DrivineError(
                    `${node.variable} is bound already, so a CREATE or MERGE makes no node of it with labels or properties.`
                );
            }
            return this.sql.idOf(ROW, this.key(node.variable!));
        }
        if (kind !== undefined) {
            throw new DrivineError(`${node.variable} is not a node, and is used as one in a pattern.`);
        }
        this.evaluate(VALUE, [node.properties], (scope) => this.written(node.properties, scope));
        this.emit(
            `INSERT INTO ${this.sql.nodes} (labels, props, stamp) VALUES (${this.sql.literalJson(node.labels)}, ` +
                `${this.sql.stripNulls(this.unstamped(VALUE))}, ${this.stampOf(VALUE)}) RETURNING nid INTO ${ID};`
        );
        return this.made(node.variable, 'NODE');
    }

    /** The properties a pattern writes, as JSON: none where it gives none. */
    private written(properties: Expression | undefined, scope: Scope): string {
        return properties
            ? this.sql.comparable(this.asJson(this.expression(properties, scope)))
            : this.sql.literalJson({});
    }

    /** The id in `ID` of what was made, held in the row at `variable`'s key, or at a key of its own for one of no variable. */
    private made(variable: string | undefined, kind: Kind): string {
        const key = variable !== undefined ? this.key(variable) : `a${++this.counter}`;
        this.assign(ROW, this.sql.withEntries(ROW, [[key, this.sql.scalar(ID)]]));
        if (variable !== undefined) {
            this.kinds.set(variable, kind);
        }
        return this.sql.idOf(ROW, key);
    }

    /**
     * A `MERGE` for the row in `ROW`: a row for each way its pattern is found, with `ON MATCH SET` written to it, or
     * where it is not found, the pattern made, with `ON CREATE SET`.
     */
    private merge(merge: Merge): void {
        if (merge.pattern.variable !== undefined) {
            unsupported('A path variable in CREATE or MERGE');
        }
        const select = this.row(variablesOfPattern(merge.pattern));
        this.patterns(select, [merge.pattern]);
        const found = [...select.bound].filter(([variable]) => !this.kinds.has(variable));
        const before = new Map(this.kinds);
        const entries = found.map(([variable, value]): [string, string] => [this.key(variable), this.held(value)]);
        const match = [
            `SELECT ${this.sql.withEntries(ROW, entries)} AS item`,
            ...this.from(select),
            ...optional(select.whereClause())
        ];
        this.emit(`${FOUND} := FALSE;`);
        this.emit(`FOR ${MATCHED} IN (\n${indent(match.join('\n'))}\n) LOOP`);
        this.depth++;
        this.emit(`${FOUND} := TRUE;`);
        this.emit(`${ROW} := ${MATCHED}.item;`);
        found.forEach(([variable, value]) => this.kinds.set(variable, value.kind === 'Node' ? 'NODE' : 'RELATIONSHIP'));
        merge.onMatch.forEach((it) => this.set(it));
        this.keep();
        this.depth--;
        this.emit('END LOOP;');
        this.kinds.clear();
        before.forEach((kind, variable) => this.kinds.set(variable, kind));
        this.emit(`IF NOT ${FOUND} THEN`);
        this.depth++;
        this.create(merge.pattern, true);
        merge.onCreate.forEach((it) => this.set(it));
        this.keep();
        this.depth--;
        this.emit('END IF;');
    }

    /** The table `variable`'s node or relationship is a row of, its key column, and its id in `ROW`. */
    private target(variable: string, writing: string): [string, string, string] {
        const kind = this.kinds.get(variable);
        if (kind === 'NODE') {
            return [this.sql.nodes, 'nid', this.sql.idOf(ROW, this.key(variable))];
        }
        if (kind === 'RELATIONSHIP') {
            return [this.sql.edges, 'eid', this.sql.idOf(ROW, this.key(variable))];
        }
        if (kind !== undefined) {
            throw new DrivineError(`${variable} is not a node or a relationship, and ${writing} writes to one.`);
        }
        return this.undefinedVariable(variable);
    }

    private set(item: SetItem): void {
        const [table, id, row] = this.target(item.variable, 'SET');
        const nodes = this.sql.nodes;
        switch (item.kind) {
            case 'Property':
                this.evaluate(VALUE, [item.value], (scope) =>
                    this.sql.comparable(this.asJson(this.expression(item.value, scope)))
                );
                if (table === nodes && item.key === Stamps.PROPERTY) {
                    this.emit(`UPDATE ${nodes} SET stamp = ${this.sql.text(VALUE)} WHERE nid = ${row};`);
                } else {
                    const map = this.sql.jsonObject([[item.key, VALUE]]);
                    this.emit(`UPDATE ${table} SET props = ${this.sql.merged('props', map)} WHERE ${id} = ${row};`);
                }
                return;
            case 'Replace':
                this.evaluate(VALUE, [item.value], (scope) => this.properties(this.expression(item.value, scope)));
                if (table === nodes) {
                    const props = this.sql.stripNulls(this.unstamped(this.orEmpty(VALUE)));
                    this.emit(
                        `UPDATE ${nodes} SET props = ${props}, stamp = ${this.stampOf(VALUE)} WHERE nid = ${row};`
                    );
                } else {
                    this.emit(
                        `UPDATE ${table} SET props = ${this.sql.stripNulls(this.orEmpty(VALUE))} WHERE ${id} = ${row};`
                    );
                }
                return;
            case 'Add':
                this.evaluate(VALUE, [item.value], (scope) => this.properties(this.expression(item.value, scope)));
                if (table === nodes) {
                    // The stamp is kept where the map has no entry for it, and removed where its entry is null.
                    const stamp = `CASE WHEN ${this.sql.propertyOf(
                        VALUE,
                        Stamps.PROPERTY
                    )} IS NULL THEN stamp ELSE ${this.stampOf(VALUE)} END`;
                    const props = this.sql.merged('props', this.unstamped(this.orEmpty(VALUE)));
                    this.emit(`UPDATE ${nodes} SET props = ${props}, stamp = ${stamp} WHERE nid = ${row};`);
                } else {
                    this.emit(
                        `UPDATE ${table} SET props = ${this.sql.merged(
                            'props',
                            this.orEmpty(VALUE)
                        )} WHERE ${id} = ${row};`
                    );
                }
                return;
            default:
                if (table !== nodes) {
                    throw new DrivineError(`${item.variable} is not a node, and a label is set on one.`);
                }
                item.labels.forEach((label) => {
                    const labels = this.sql.appended('labels', this.sql.literalJson(label));
                    this.emit(
                        `UPDATE ${nodes} SET labels = ${labels} WHERE ${id} = ${row} AND NOT ${this.sql.hasLabel(
                            'labels',
                            label
                        )};`
                    );
                });
        }
    }

    private remove(item: RemoveItem): void {
        const [table, id, row] = this.target(item.variable, 'REMOVE');
        const nodes = this.sql.nodes;
        if (item.kind === 'Property') {
            if (table === nodes && item.key === Stamps.PROPERTY) {
                this.emit(`UPDATE ${nodes} SET stamp = NULL WHERE nid = ${row};`);
            } else {
                const map = this.sql.jsonObject([[item.key, this.sql.literalJson(null)]]);
                this.emit(`UPDATE ${table} SET props = ${this.sql.merged('props', map)} WHERE ${id} = ${row};`);
            }
            return;
        }
        if (table !== nodes) {
            throw new DrivineError(`${item.variable} is not a node, and a label is removed from one.`);
        }
        item.labels.forEach((label) =>
            this.emit(`UPDATE ${nodes} SET labels = ${this.sql.withoutLabel('labels', label)} WHERE ${id} = ${row};`)
        );
    }

    /** What `SET n = …` and `SET n += …` write: a node's properties, its stamp among them, a relationship's, or a map. */
    private properties(value: Value): string {
        return value.kind === 'Relationship' ? value.props : this.sql.comparable(this.asJson(value));
    }

    /** The JSON `json`, or an empty map where it is null. */
    private orEmpty(jsonSql: string): string {
        return `COALESCE(${this.sql.nullIfJsonNull(jsonSql)}, ${this.sql.literalJson({})})`;
    }

    /** The JSON map `json` with its entry for the stamp null: a node's stamp is a column of its row, and no property of its map. */
    private unstamped(jsonSql: string): string {
        return this.sql.withEntries(jsonSql, [[Stamps.PROPERTY, this.sql.literalJson(null)]]);
    }

    /** The stamp the JSON map `json` gives a node, as the text its column holds. */
    private stampOf(jsonSql: string): string {
        return this.sql.text(this.sql.propertyOf(jsonSql, Stamps.PROPERTY));
    }

    /**
     * A `DELETE` for the row in `ROW`: its relationships first, then its nodes, each with its relationships where it is
     * `DETACH`; without, a node is gathered in `DOOMED` and deleted once the rows are done.
     */
    private delete(clause: Delete): void {
        const targets = clause.expressions.map((expression) => {
            const variable =
                expression.kind === 'Variable' ? expression.name : unsupported('A DELETE of anything but a variable');
            return this.target(variable, 'DELETE');
        });
        targets
            .filter(([table]) => table === this.sql.edges)
            .forEach(([, , row]) => this.emit(`DELETE FROM ${this.sql.edges} WHERE eid = ${row};`));
        targets
            .filter(([table]) => table === this.sql.nodes)
            .forEach(([, , row]) => {
                if (clause.detach) {
                    this.emit(`DELETE FROM ${this.sql.nodes} WHERE nid = ${row};`);
                } else {
                    this.assign(DOOMED, this.sql.appended(DOOMED, this.sql.scalar(row)));
                }
            });
    }

    // ----- Projection -----

    /**
     * The query a `WITH` or a `RETURN` makes of `select`: its items as columns, grouped where it aggregates, then
     * ordered, skipped and limited. Rows it does not order, group or keep distinct stay in the order `select` reads them,
     * as a graph engine keeps them.
     */
    private project(select: Select, projection: Projection, final: boolean): Projected {
        const items: ProjectionItem[] = [
            // As in Neo4j, a star gives the variables in the order of their names, before the items named after it.
            ...(projection.star
                ? [...select.bound.keys()]
                      .sort()
                      .map((it): ProjectionItem => ({ expression: { kind: 'Variable', name: it }, name: it }))
                : []),
            ...projection.items
        ];
        if (items.length === 0) {
            throw new DrivineError('A projection has at least one item.');
        }
        // Before aggregatesFirst, which names each variable it groups by as an item of its own.
        this.requireExplicitGrouping(items);
        const first = this.workedOutFirst(select, projection, items);
        if (first) {
            return this.project(first[0], first[1], final);
        }
        if (final && items.length > 1) {
            this.logger.warn(
                `The statement returns ${items.length} items (${items
                    .map((it) => it.name)
                    .join(', ')}). Prefer returning a ` +
                    'single map or value, such as RETURN { key1: val1, key2: val2 }: on Oracle and Postgres it is returned as a ' +
                    'list of its items, as Drivine gives a row of several columns.'
            );
        }
        this.rowOrder = this.orderOf(select);
        const compiled = items.map((item): [string, Value] => [
            item.name,
            this.carriedOut(this.aggregating(item.expression, () => this.expression(item.expression, select.scope)))
        ]);
        const aggregating = items.some((it) => contains(it.expression, isAggregate));
        // Where rows are compared (DISTINCT, GROUP BY), JSON is compared as what compares.
        const compared = projection.distinct || aggregating;
        const itemColumns = compiled.map(([, value], i): [string, Value] => [
            `c${i + 1}`,
            compared && value.kind === 'Json' && value.ordered
                ? { ...value, sql: this.sql.comparable(value), ordered: false }
                : value
        ]);
        const selectList = itemColumns.flatMap(([column, value]) => columns(value, column));
        const name = this.alias('p');
        const { sorts, after, sorted, anew }: Sorted = this.sorts(
            select,
            projection,
            items,
            compiled,
            itemColumns,
            selectList,
            name,
            compared
        );
        const groupBy = aggregating ? this.groupBy(select, items, itemColumns) : [];
        const inner = [
            `SELECT ${projection.distinct ? 'DISTINCT ' : ''}${selectList.join(',\n       ')}`,
            ...select.from(),
            ...optional(select.whereClause()),
            ...(groupBy.length > 0 ? [`GROUP BY ${groupBy.join(', ')}`] : [])
        ].join('\n');
        // What sorts a term in the query that reads this one: worked out there, of the column carried out, or that column.
        const sortedBy = (column: string): string =>
            after.get(column) ?? sorted.get(column)?.(`${name}.${column}`) ?? `${name}.${column}`;
        const outerColumns = this.outerColumns(final, itemColumns, name, sorts, sortedBy);
        const ordered = sorts.map(([column, descending]) => `${sortedBy(column)}${descending ? ' DESC' : ''}`);
        const outer = [
            `SELECT ${outerColumns}`,
            `FROM (\n${indent(anew ? this.sql.once(inner) : inner)}\n) ${name}`,
            ...(sorts.length > 0 ? [`ORDER BY ${ordered.join(', ')}`] : []),
            ...this.page(projection)
        ].join('\n');
        // What each item is bound to in the query that reads this one: its columns, which that query names.
        const scope: Scope = new Map(
            items.map((item, i) => [item.name, columnsOf(itemColumns[i][1], PENDING, itemColumns[i][0])])
        );
        return { sql: outer, scope, order: sorts };
    }

    /**
     * The rows `select` reads with what the projection reads of them worked out first, in a `WITH` of its own, and the
     * projection over that: see {@link casesFirst}, {@link aggregatesFirst} and {@link heldFirst}. Undefined where none
     * is.
     */
    private workedOutFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        return (
            this.casesFirst(select, projection, items) ??
            this.aggregatesFirst(select, projection, items) ??
            this.heldFirst(select, projection, items)
        );
    }

    /** `value` as a projection carries it out: without its identity where none is carried (see {@link identities}). */
    private carriedOut(value: Value): Value {
        return value.kind === 'Json' && !this.identities && value.identity !== undefined
            ? { ...value, identity: undefined }
            : value;
    }

    /**
     * The columns of the query a projection makes: of a `RETURN`, its one value a row, as JSON; of a `WITH`, its items'
     * columns, which the query after it reads, and its order terms.
     */
    private outerColumns(
        final: boolean,
        itemColumns: [string, Value][],
        name: string,
        sorts: [string, boolean][],
        sortedBy: (column: string) => string
    ): string {
        if (final) {
            const values = itemColumns.map(([column, value]) => this.asJson(columnsOf(value, name, column)));
            return `${values.length === 1 ? values[0].sql : this.sql.jsonArray(values.map((it) => it.sql))} AS result`;
        }
        return [
            ...itemColumns.flatMap(([column, value]) =>
                columns(value, column).map((it) => `${name}.${it.substring(it.lastIndexOf(' AS ') + 4)}`)
            ),
            ...sorts.map(([column]) => `${sortedBy(column)} AS ${column}`)
        ].join(', ');
    }

    /** The `OFFSET` and `LIMIT` of a projection. */
    private page(projection: Projection): string[] {
        return this.sql.page(
            projection.skip ? this.count(projection.skip) : undefined,
            projection.limit ? this.count(projection.limit) : undefined
        );
    }

    /**
     * The order terms of a projection, each a column and whether it descends, added to its `selectList`; where rows are
     * compared, an order term of the items that is no item is read over their columns, once compared, `after` the
     * query: a group is keyed by an item, and by no part of one. An order is written over the items' names, and where
     * nothing is grouped or kept distinct, the variables too.
     */
    private sorts(
        select: Select,
        projection: Projection,
        items: ProjectionItem[],
        compiled: [string, Value][],
        itemColumns: [string, Value][],
        selectList: string[],
        name: string,
        compared: boolean
    ): Sorted {
        const byName: Scope = new Map(
            items.map((item, i) => [item.name, columnsOf(itemColumns[i][1], name, itemColumns[i][0])])
        );
        const after = new Map<string, string>();
        // A term worked out in the query is sorted by in the query that reads it: the value carried out as a column, and
        // what sorts it (JSON's null as SQL's) worked out of that column. Oracle (23.26), sorting by a value that reads
        // the row more than once beside a variable-length walk, closes the session.
        const sorted = new Map<string, (column: string) => string>();
        // An item made anew for each row, randomUUID(), is sorted by of its column, as it is given, not made again: see
        // SqlCypherCompiler.once.
        const madeAnew = new Set(items.filter((it) => contains(it.expression, isAnew)).map((it) => it.name));
        let anew = false;
        const carried = (column: string, value: () => Value, aggregates: Expression): void => {
            const [carriedValue, sorts] = this.aggregating(aggregates, () => this.sortTerm(value()));
            selectList.push(`${carriedValue} AS ${column}`);
            sorted.set(column, sorts);
        };
        const sorts = projection.orderBy.map((sort, i): [string, boolean] => {
            const column = `s${i + 1}`;
            // An order term that is an item, as written, is that item: so it may be ordered by where rows are compared.
            const item = items.findIndex((it) => sameExpression(it.expression, sort.expression));
            if (
                contains(sort.expression, (it) => it.kind === 'Variable' && madeAnew.has(it.name)) &&
                [...variablesIn(sort.expression)].every((it) => byName.has(it))
            ) {
                after.set(column, this.sortable(this.expression(sort.expression, byName)));
                anew = true;
            } else if (item >= 0) {
                carried(column, () => compiled[item][1], sort.expression);
            } else if (
                compared &&
                !contains(
                    sort.expression,
                    (it) => isAggregate(it) || (it.kind === 'Variable' && it.name.startsWith('#aggregate'))
                )
            ) {
                after.set(column, this.sortable(this.expression(sort.expression, byName)));
            } else {
                // One that aggregates reads the rows it aggregates, as an item does; so does one that reads an aggregate
                // aggregatesFirst worked out first, which no item is. Beside a variable-length walk it binds no value in a
                // subquery: carried out of a WITH's query, one so bound closes Oracle's (23.26) session (ORA-03113), as
                // `WITH b ORDER BY toString(coalesce(b.name, b.title))` did, its argument long enough to be bound. Elsewhere
                // it does, so operations nested in it compile to a statement that grows with them, not exponentially.
                const scope = new Map([...select.scope, ...compiled]);
                const term = (): void =>
                    carried(column, () => this.expression(sort.expression, scope), sort.expression);
                if (select.walks) {
                    this.unshared(term);
                } else {
                    term();
                }
            }
            return [column, sort.descending];
        });
        if (sorts.length > 0 || compared) {
            return { sorts, after, sorted, anew };
        }
        return {
            sorts: select.order.map(([term, descending], i): [string, boolean] => {
                const column = `o${i + 1}`;
                selectList.push(`${term} AS ${column}`);
                return [column, descending];
            }),
            after,
            sorted,
            anew
        };
    }

    /** What a projection that aggregates is grouped by: what its items hold outside their aggregates. */
    private groupBy(select: Select, items: ProjectionItem[], itemColumns: [string, Value][]): string[] {
        const keys: string[] = [];
        const scope = select.scope;
        items.forEach((item, i) => {
            if (!contains(item.expression, isAggregate)) {
                keys.push(...groupKeys(itemColumns[i][1]));
            } else {
                variablesOutsideAggregates(item.expression).forEach((variable) => {
                    const value = scope.get(variable);
                    if (value) {
                        keys.push(...groupKeys(value));
                    }
                });
            }
        });
        return [...new Set(keys)];
    }

    /**
     * On a store that aggregates no `CASE` holding a subquery (`aggregatesCaseSubqueries`), the rows `select` reads with
     * each aggregate's argument that is such a `CASE` worked out first, in a `WITH *` of its own, and the projection with
     * the aggregate of that argument read from there: Oracle (23.26) fails `collect(CASE WHEN … THEN [r] ELSE [m.title] END)`
     * with ORA-00979, or closes the session (ORA-03113). Undefined where there is none.
     */
    private casesFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        if (this.sql.aggregatesCaseSubqueries) {
            return undefined;
        }
        const argumentsOf = new Map<string, Expression>();
        // Those of a collect whose list is read, not only counted by size(): see below.
        const gathered = new Map<string, Expression>();
        [...items.map((it) => it.expression), ...projection.orderBy.map((it) => it.expression)].forEach((term) => {
            const sized: Expression[] = [];
            contains(term, (e) => {
                if (e.kind === 'Function' && e.name.toLowerCase() === 'size') {
                    sized.push(...e.arguments);
                }
                if (isAggregate(e) && e.kind === 'Function') {
                    e.arguments
                        .filter(
                            (argument) =>
                                contains(argument, (it) => it.kind === 'Case') &&
                                /select/i.test(
                                    this.unshared(() => this.asJson(this.expression(argument, select.scope)).sql)
                                )
                        )
                        .forEach((argument) => {
                            argumentsOf.set(expressionKey(argument), argument);
                            if (e.name.toLowerCase() === 'collect' && !sized.some((it) => it === e)) {
                                gathered.set(expressionKey(argument), argument);
                            }
                        });
                }
                return false;
            });
        });
        if (argumentsOf.size === 0) {
            return undefined;
        }
        // Gathered by collect, a list of nodes or relationships beside a value of another kind, or the null of a CASE with
        // no ELSE, closes Oracle's (23.26) session (ORA-03113) wherever the CASE is worked out: refused, as Oracle gave an
        // error of its own for it (ORA-00979) before. Counted, by count() or the size() of the collect, it is read.
        gathered.forEach((argument) =>
            contains(argument, (e) => {
                if (e.kind === 'Case') {
                    const kinds = [
                        ...[...e.alternatives.map(([, result]) => result), ...optional(e.otherwise)].map(
                            (it) => this.unshared(() => this.expression(it, select.scope)).kind === 'Entities'
                        ),
                        ...(e.otherwise === undefined ? [false] : [])
                    ];
                    if (kinds.some((it) => it) && !kinds.every((it) => it)) {
                        unsupported(
                            'On Oracle, an aggregate of a CASE that gives a list of nodes or relationships beside a value of another kind'
                        );
                    }
                }
                return false;
            })
        );
        // Named as no variable is, unless quoted so.
        const names = new Map([...argumentsOf.keys()].map((key) => [key, `#case${++this.counter}`]));
        const withProjection: Projection = {
            distinct: false,
            star: true,
            items: [...argumentsOf].map(([key, argument]) => ({ expression: argument, name: names.get(key)! })),
            orderBy: []
        };
        const cased = (expression: Expression): Expression =>
            replaced(expression, (it) => {
                const name = names.get(expressionKey(it));
                return name !== undefined ? { kind: 'Variable', name } : undefined;
            });
        const kept: Projection = {
            ...projection,
            star: false,
            items: items.map((it) => ({ ...it, expression: cased(it.expression) })),
            orderBy: projection.orderBy.map((it) => ({ ...it, expression: cased(it.expression) }))
        };
        // Kept apart, or Oracle merges it back into the query that aggregates.
        return [this.with(select, { kind: 'With', projection: withProjection }, new Map(), true), kept];
    }

    /**
     * Where a projection that aggregates would group by an item whose SQL holds a subquery, which Oracle groups by no
     * subquery, or a parameter, each mention of which the driver binds as a marker of its own, so the item in the select
     * list is not the one grouped by, the rows `select` reads with each such item worked out first, in a `WITH *` of its
     * own, and the projection with those items read from there, as variables a group is keyed by; undefined where there
     * is none.
     */
    private heldFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        if (!items.some((it) => contains(it.expression, isAggregate))) {
            return undefined;
        }
        const held = items.filter(
            (item) =>
                !contains(item.expression, isAggregate) &&
                (contains(item.expression, (it) => it.kind === 'Parameter') ||
                    groupKeys(this.expression(item.expression, select.scope)).some((it) => /select/i.test(it)))
        );
        if (held.length === 0) {
            return undefined;
        }
        // Named as no variable is, unless quoted so.
        const names = new Map(held.map((it) => [expressionKey(it.expression), `#key${++this.counter}`]));
        const withProjection: Projection = {
            distinct: false,
            star: true,
            items: held.map((it) => ({ expression: it.expression, name: names.get(expressionKey(it.expression))! })),
            orderBy: []
        };
        const keyed = (expression: Expression): Expression => {
            const name = names.get(expressionKey(expression));
            return name !== undefined ? { kind: 'Variable', name } : expression;
        };
        const keyedProjection: Projection = {
            ...projection,
            star: false,
            items: items.map((it) => ({ ...it, expression: keyed(it.expression) })),
            orderBy: projection.orderBy.map((it) => ({ ...it, expression: keyed(it.expression) }))
        };
        return [this.with(select, { kind: 'With', projection: withProjection }), keyedProjection];
    }

    /**
     * Where a projection holds `collect(DISTINCT …)`, or reads an aggregate item by item (a comprehension, a quantifier or
     * a reduce over `collect(…)`, `IN collect(…)`, a slice of it…), the rows `select` reads grouped first, in a `WITH` of
     * their own:
     * each item that does not aggregate a key of its own; each variable an aggregating item names beside its aggregates,
     * in a body, a pattern or a subquery it holds too, and each key an aggregating order term names; and each aggregate,
     * the items' and the order terms', `collect(DISTINCT …)` collected without its `DISTINCT`. Then the projection, over
     * those, keeps each item of such a collection once, where it is first, as a graph engine does: by its id for a node
     * or a relationship, not its properties. An order term, or a part of one, that is an item is read by the item's name.
     * A store dedupes no aggregate in the query that makes it, and Oracle's `LISTAGG`, which does, gives at most 4,000
     * bytes; and Oracle reads no aggregate of the query it is in from a subquery, which reading a list item by item is.
     * Undefined where the projection does neither.
     */
    private aggregatesFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        const collectsDistinct = (expression: Expression): boolean =>
            expression.kind === 'Function' && expression.distinct && expression.name.toLowerCase() === 'collect';
        const iteratesAggregate = (expression: Expression): boolean =>
            iterated(expression).some((it) => contains(it, isAggregate));
        const terms = [...items.map((it) => it.expression), ...projection.orderBy.map((it) => it.expression)];
        if (!terms.some((it) => contains(it, collectsDistinct) || contains(it, iteratesAggregate))) {
            return undefined;
        }
        // Named as no variable is, unless quoted so.
        const keys = new Map<string, [Expression, string]>();
        items
            .filter((it) => !contains(it.expression, isAggregate))
            .forEach((it) => keys.set(expressionKey(it.expression), [it.expression, `#group${++this.counter}`]));
        const aggregates = new Map<string, [Expression, string]>();
        terms.forEach((term) =>
            contains(term, (it) => {
                if (isAggregate(it) && !aggregates.has(expressionKey(it))) {
                    aggregates.set(expressionKey(it), [it, `#aggregate${++this.counter}`]);
                }
                return false;
            })
        );
        const keyed = [...keys.values()].flatMap(([expression]) =>
            expression.kind === 'Variable' ? [expression.name] : []
        );
        // A comprehension's, a quantifier's or a reduce's body is kept as it is, so a variable it names outside its own is
        // kept too, and so is a pattern's or a subquery's. A subquery may name any variable: each the projection groups by
        // is kept.
        const own = (names: string[], ...bound: string[]): string[] => names.filter((it) => !bound.includes(it));
        const inner = (expression: Expression): string[] => {
            switch (expression.kind) {
                case 'ListComprehension':
                    return own(
                        [expression.where, expression.projection].flatMap((it) => (it ? named(it) : [])),
                        expression.variable
                    );
                case 'Quantifier':
                    return own(expression.where ? named(expression.where) : [], expression.variable);
                case 'Reduce':
                    return own(named(expression.expression), expression.accumulator, expression.variable);
                case 'PatternComprehension':
                case 'PatternPredicate':
                case 'Exists':
                    return [...variablesIn(expression)];
                case 'Subquery':
                    return keyed;
                default:
                    return [];
            }
        };
        const named = (expression: Expression): string[] =>
            isAggregate(expression)
                ? []
                : [
                      ...new Set([
                          ...variablesOutsideAggregates(expression),
                          ...inner(expression),
                          ...children(expression).flatMap(named)
                      ])
                  ];
        const aggregating = (expression: Expression): boolean => contains(expression, isAggregate);
        // An order term that aggregates may name a key too, by the variable the projection groups by.
        const beside = [
            ...new Set([
                ...items.filter((it) => aggregating(it.expression)).flatMap((it) => named(it.expression)),
                ...projection.orderBy
                    .filter((it) => aggregating(it.expression))
                    .flatMap((it) => named(it.expression))
                    .filter((it) => keyed.includes(it))
            ])
        ].filter((it) => select.scope.has(it));
        const grouped: Projection = {
            distinct: false,
            star: false,
            items: [
                ...[...keys.values()].map(([expression, name]): ProjectionItem => ({ expression, name })),
                ...beside.map((it): ProjectionItem => ({ expression: { kind: 'Variable', name: it }, name: it })),
                ...[...aggregates.values()].map(
                    ([aggregate, name]): ProjectionItem => ({
                        expression:
                            collectsDistinct(aggregate) && aggregate.kind === 'Function'
                                ? { ...aggregate, distinct: false }
                                : aggregate,
                        name
                    })
                )
            ],
            orderBy: []
        };
        const kept = (term: Expression): Expression | undefined => {
            const key = keys.get(expressionKey(term));
            if (key) {
                return { kind: 'Variable', name: key[1] };
            }
            const aggregate = aggregates.get(expressionKey(term));
            if (!aggregate) {
                return undefined;
            }
            return collectsDistinct(term)
                ? {
                      kind: 'Function',
                      name: DISTINCT_ITEMS,
                      distinct: false,
                      arguments: [{ kind: 'Variable', name: aggregate[1] }]
                  }
                : { kind: 'Variable', name: aggregate[1] };
        };
        // An order term, or a part of one, that is an item is read by the item's name, as over a DISTINCT projection it
        // can only be; a variable an item is named after is that item, not the variable of that name before it.
        const itemNames = new Map(items.map((it) => [expressionKey(it.expression), it.name]));
        const aliases = new Set(items.map((it) => it.name));
        const keptProjection: Projection = {
            ...projection,
            star: false,
            items: items.map((it) => ({ ...it, expression: replaced(it.expression, kept) })),
            orderBy: projection.orderBy.map((sort) => ({
                ...sort,
                expression: replaced(sort.expression, (term) => {
                    if (term.kind === 'Variable' && aliases.has(term.name)) {
                        return term;
                    }
                    const item = itemNames.get(expressionKey(term));
                    return item !== undefined ? { kind: 'Variable', name: item } : kept(term);
                })
            }))
        };
        return [this.with(select, { kind: 'With', projection: grouped }), keptProjection];
    }

    /** `work`, with no value bound in a subquery where `expression` aggregates: see {@link SqlCypherCompiler.sharing}. */
    private aggregating<T>(expression: Expression, work: () => T): T {
        return contains(expression, isAggregate) ? this.unshared(work) : work();
    }

    /** `work`, with no value bound in a subquery: see {@link SqlCypherCompiler.sharing}. */
    private unshared<T>(work: () => T): T {
        const was = this.sql.sharing;
        this.sql.sharing = false;
        try {
            return work();
        } finally {
            this.sql.sharing = was;
        }
    }

    /**
     * Refuses what Cypher refuses: an item that aggregates and names a variable outside its aggregates, where that
     * variable is not an item of its own, which a graph engine would have to group by without being told.
     */
    private requireExplicitGrouping(items: ProjectionItem[]): void {
        const keys = new Set(
            items
                .filter((it) => !contains(it.expression, isAggregate))
                .flatMap((it) => (it.expression.kind === 'Variable' ? [it.expression.name] : []))
        );
        items
            .filter((it) => contains(it.expression, isAggregate))
            .forEach((item) => {
                const implicit = [...variablesOutsideAggregates(item.expression)].filter((it) => !keys.has(it));
                if (implicit.length > 0) {
                    throw new DrivineError(
                        `${item.name} aggregates, and names ${implicit.join(
                            ', '
                        )} outside its aggregates, which no other item is: ` +
                            'Cypher would group by it without being told. Aggregate in a WITH first, ' +
                            `as in WITH ${implicit.join(', ')}, collect(…) AS items RETURN { … }.`
                    );
                }
            });
    }

    /** A `SKIP` or `LIMIT`: a whole number, or a parameter bound to one. */
    private count(expression: Expression): string {
        if (expression.kind === 'Literal') {
            if (typeof expression.value === 'number') {
                return String(expression.value);
            }
            throw new DrivineError(`SKIP and LIMIT take a whole number, not ${String(expression.value)}.`);
        }
        if (expression.kind === 'Parameter') {
            return this.parameters.count(expression.name);
        }
        return unsupported('SKIP or LIMIT of an expression');
    }

    // ----- Expressions -----

    private expression(expression: Expression, scope: Scope): Value {
        return this.expressions[expression.kind](expression, scope);
    }

    private undefinedVariable(name: string): never {
        throw new DrivineError(
            `${name} is not defined: a variable is bound by a pattern, a WITH or an UNWIND before it is used.`
        );
    }

    private listLiteral(list: ListLiteral, scope: Scope): Value {
        const items = list.items.map((it) => this.expression(it, scope));
        // A null written among nodes or relationships is an item of a list of them, as a node that is null is.
        const entities = items.filter((_, i) => !isNullLiteral(list.items[i]));
        const ids = (relationships: boolean): EntitiesValue => {
            const listed = items.map((item) => {
                if (item.kind === 'Node') {
                    return this.sql.scalar(item.nid);
                }
                return item.kind === 'Relationship' ? this.sql.scalar(item.eid) : this.asJson(item).sql;
            });
            return {
                kind: 'Entities',
                ids: this.sql.comparable(json(this.sql.jsonArray(listed), { ordered: true })),
                relationships
            };
        };
        if (entities.length > 0 && entities.every((it) => it.kind === 'Node')) {
            return ids(false);
        }
        if (entities.length > 0 && entities.every((it) => it.kind === 'Relationship')) {
            return ids(true);
        }
        return json(this.sql.jsonArray(items.map((it) => this.asJson(it).sql)), {
            ordered: true,
            items: this.kindOf(list.items.map((it, i) => [it, items[i]])),
            identity: this.identityHolding(items, (ids) => this.sql.jsonArray(ids)),
            list: true,
            itemLists: entities.length > 0 && entities.every((it) => this.isList(it)),
            texts: items.every((it) => this.isText(it))
        });
    }

    private index(index: Index, scope: Scope): Value {
        let listedValue: Value | undefined;
        const listed = (): Value => (listedValue ??= this.expression(index.subject, scope));
        const subject = (): string => this.sql.comparable(this.asJson(listed()));
        const at = this.sql.comparable(this.asJson(this.expression(index.index, scope)));
        // An index written, or bound to a parameter, is known: a text is the property of that name, a number an item.
        const known = this.known(index.index);
        if (typeof known === 'string') {
            const inParameter = this.inParameter(index);
            return inParameter !== undefined
                ? json(inParameter)
                : this.property(this.expression(index.subject, scope), known);
        }
        // An item of a list of nodes or relationships is the node or the relationship, so it is compared by its id; of one
        // collect gathers in this query, its properties, for a store reads no aggregate from a subquery. A pattern
        // comprehension gathers its properties too, but in a subquery of its own, so its item is read by id.
        const value = listed();
        if (value.kind === 'Entities' && !contains(index.subject, isAggregate)) {
            return this.entityAt(value, at);
        }
        // An item of a list that holds a node or a relationship holds it by identity too: see JsonValue.identity.
        if (typeof known === 'number' || typeof known === 'bigint' || known instanceof CypherFloat) {
            const item = this.sql.element(subject(), at);
            return json(item, {
                temporal: this.itemsOf(value),
                identity: this.identityTaken(value, item, true, (it) => this.sql.element(it, at)),
                list: this.holdsLists(value),
                text: this.holdsTexts(value)
            });
        }
        const take = (list: string): string =>
            this.sql.shared([list, at], ([map, key]) => {
                // A store that reads no key an expression gives reads a list's item alone.
                const keyed = this.sql.keyed(map, key);
                const byKey = keyed !== undefined ? ` WHEN 'string' THEN ${keyed}` : '';
                return `CASE ${this.sql.typeOf(key)} WHEN 'number' THEN ${this.sql.element(map, key)}${byKey} END`;
            });
        const taken = take(subject());
        return json(taken, {
            temporal: this.itemsOf(value),
            identity: this.identityTaken(value, taken, true, take),
            list: this.holdsLists(value),
            text: this.holdsTexts(value)
        });
    }

    /**
     * `list[from..to]`: the items from the one at `from` up to the one before `to`, each counted from the end where it is
     * negative, a bound left out the list's end; null where the list or a bound given is. A slice of nodes or
     * relationships is a list of them.
     */
    private slice(slice: Slice, scope: Scope): Value {
        const listed = this.expression(slice.subject, scope);
        const bounds = [slice.from, slice.to]
            .filter((it): it is Expression => it !== undefined)
            .map((it) => this.sql.comparable(this.asJson(this.expression(it, scope))));
        const list = listed.kind === 'Entities' ? listed.ids : this.sql.comparable(this.asJson(listed));
        const sliced = (of: string): string =>
            this.sql.shared([of, ...bounds], (values) => {
                const x = values[0];
                let i = 1;
                const from = slice.from !== undefined ? values[i++] : undefined;
                const to = slice.to !== undefined ? values[i] : undefined;
                const e = this.alias('e');
                const v = this.alias('v');
                // A bound counted from the end where it is negative, as an index is: past either end, the end it is past.
                const bound = (b: string): string =>
                    `CASE WHEN ${this.sql.number(b)} < 0 THEN ${v}.cnt + ${this.sql.number(b)} ELSE ${this.sql.number(
                        b
                    )} END`;
                const within = [
                    ...(from !== undefined ? [`${v}.item_no > ${bound(from)}`] : []),
                    ...(to !== undefined ? [`${v}.item_no <= ${bound(to)}`] : [])
                ];
                const items = `SELECT ${e}.item AS item, ${e}.item_no AS item_no, COUNT(*) OVER () AS cnt FROM ${this.sql.elements(
                    x,
                    e
                )}`;
                const listedItems = this.sql.comparable(
                    json(this.sql.aggregateList(`${v}.item`, `${v}.item_no`), { ordered: true })
                );
                const query =
                    `SELECT ${listedItems} FROM (${items}) ${v}` +
                    (within.length > 0 ? ` WHERE ${within.join(' AND ')}` : '');
                const present = [
                    `${this.sql.typeOf(x)} = 'array'`,
                    ...[from, to]
                        .filter((it): it is string => it !== undefined)
                        .map((it) => `NOT ${this.sql.isJsonNull(it)}`)
                ].join(' AND ');
                return `CASE WHEN ${present} THEN (${query}) END`;
            });
        // A slice of a list that holds a node or a relationship holds it by identity too: see JsonValue.identity.
        if (listed.kind === 'Entities') {
            return { kind: 'Entities', ids: sliced(list), relationships: listed.relationships };
        }
        const taken = sliced(list);
        return json(taken, {
            items: this.itemsOf(listed),
            identity: this.identityTaken(listed, taken, false, sliced),
            list: true,
            itemLists: this.holdsLists(listed),
            texts: this.holdsTexts(listed)
        });
    }

    /** The value of an index, where the statement writes it or binds it to a parameter: `-1` is a negated number. */
    private known(index: Expression): unknown {
        if (index.kind === 'Literal') {
            return index.value;
        }
        if (index.kind === 'Parameter') {
            return this.parameters.value(index.name);
        }
        if (index.kind === 'Unary' && index.operator === 'NEGATE' && index.operand.kind === 'Literal') {
            const value = index.operand.value;
            return typeof value === 'number' || value instanceof CypherFloat ? value : undefined;
        }
        return undefined;
    }

    /**
     * The node or the relationship at `at` in `entities`: its id read from the list, and its columns from its row, so it is
     * compared by its id as a node bound by a pattern is. Null where the list has no such item.
     */
    private entityAt(entities: EntitiesValue, at: string): Value {
        const id = this.sql.idOf(this.sql.element(entities.ids, at));
        const row = this.alias(entities.relationships ? 'e' : 'n');
        const [table, key] = entities.relationships ? [this.sql.edges, 'eid'] : [this.sql.nodes, 'nid'];
        const column = (name: string): string =>
            `(SELECT ${row}.${name} FROM ${table} ${row} WHERE ${row}.${key} = ${id})`;
        return entities.relationships
            ? {
                  kind: 'Relationship',
                  eid: column('eid'),
                  src: column('src'),
                  dst: column('dst'),
                  type: column('type'),
                  props: column('props')
              }
            : {
                  kind: 'Node',
                  nid: column('nid'),
                  labels: column('labels'),
                  props: column('props'),
                  stamp: column('stamp')
              };
    }

    /**
     * The rows of the list of ids `ids`, as a `FROM` names them under `name`, each joined to the row of its node or, of
     * `relationships`, its relationship; and the item each row is, that node or relationship.
     */
    private entityItems(ids: string, relationships: boolean, name: string): [string, Value] {
        const row = this.alias(relationships ? 'e' : 'n');
        const [table, key, item] = relationships
            ? [this.sql.edges, 'eid', relationshipOf(row)]
            : [this.sql.nodes, 'nid', nodeOf(row)];
        return [
            `FROM ${this.sql.elements(ids, name)} LEFT JOIN ${table} ${row} ON ${row}.${key} = ${this.sql.idOf(
                `${name}.item`
            )}`,
            item
        ];
    }

    private listComprehension(comprehension: ListComprehension, scope: Scope): Value {
        const listed = this.expression(comprehension.list, scope);
        return listed.kind === 'Entities'
            ? this.entityComprehension(comprehension, listed, scope)
            : this.valueComprehension(comprehension, listed, scope);
    }

    /**
     * A list comprehension over a list of nodes or relationships: each item is the node or the relationship, and what it
     * keeps of them, with no projection or one of nodes or relationships, is a list of them.
     */
    private entityComprehension(comprehension: ListComprehension, listed: EntitiesValue, scope: Scope): Value {
        const name = this.alias('x');
        let kind: Value | undefined;
        const list = this.sql.shared([listed.ids], ([ids]) => {
            const [from, item] = this.entityItems(ids, listed.relationships, name);
            const inner: Scope = new Map([...scope, [comprehension.variable, item]]);
            const projected = comprehension.projection ? this.expression(comprehension.projection, inner) : item;
            kind = projected;
            const filter = comprehension.where
                ? ` WHERE ${this.condition(this.expression(comprehension.where, inner))}`
                : '';
            const value =
                projected.kind === 'Node'
                    ? this.sql.scalar(projected.nid)
                    : projected.kind === 'Relationship'
                    ? this.sql.scalar(projected.eid)
                    : this.asJson(projected).sql;
            // Of null, null, as in Cypher, and not an empty list.
            return `CASE WHEN ${ids} IS NOT NULL THEN (SELECT ${this.sql.aggregateList(
                value,
                `${name}.item_no`
            )} ${from}${filter}) END`;
        });
        const projected = kind as Value | undefined;
        if (projected?.kind === 'Node' || projected?.kind === 'Relationship') {
            return {
                kind: 'Entities',
                ids: this.sql.comparable(json(list, { ordered: true })),
                relationships: projected.kind === 'Relationship'
            };
        }
        return json(list, {
            ordered: true,
            items: projected?.kind === 'Json' ? projected.temporal : undefined,
            list: true,
            itemLists: projected !== undefined && this.isList(projected)
        });
    }

    /** A list comprehension over a list of values. */
    private valueComprehension(comprehension: ListComprehension, listed: Value, scope: Scope): Value {
        const list = this.sql.comparable(this.asJson(listed));
        const name = this.alias('x');
        const inner: Scope = new Map([
            ...scope,
            [comprehension.variable, json(`${name}.item`, { temporal: this.itemsOf(listed) })]
        ]);
        const projected = comprehension.projection ? this.expression(comprehension.projection, inner) : undefined;
        const projection = projected ? this.asJson(projected).sql : `${name}.item`;
        const filter = comprehension.where
            ? ` WHERE ${this.condition(this.expression(comprehension.where, inner))}`
            : '';
        // Of null, null, as in Cypher, and not an empty list.
        return json(
            this.sql.shared(
                [list],
                ([items]) =>
                    `CASE WHEN NOT ${this.sql.isJsonNull(items)} THEN (SELECT ${this.sql.aggregateList(
                        projection,
                        `${name}.item_no`
                    )} ` + `FROM ${this.sql.elements(items, name)}${filter}) END`
            ),
            {
                ordered: true,
                items: projected ? (projected.kind === 'Json' ? projected.temporal : undefined) : this.itemsOf(listed),
                list: true,
                itemLists: projected ? this.isList(projected) : this.holdsLists(listed)
            }
        );
    }

    private reduce(reduce: Reduce, scope: Scope): Value {
        const initial = this.sql.comparable(this.asJson(this.expression(reduce.initial, scope)));
        const listed = this.expression(reduce.list, scope);
        const list = this.sql.comparable(this.asJson(listed));
        const own = [reduce.accumulator, reduce.variable];
        // What the step reads of the row and of the parameters, for a store that works it out where it reads neither.
        const read = [...variablesIn(reduce.expression)].filter((it) => !own.includes(it) && scope.has(it));
        const given = [...parametersIn(reduce.expression)];
        const context = (): string => {
            // A path is no JSON a function may be given.
            if (read.some((it) => scope.get(it)!.kind === 'Path')) {
                throw new DrivineError(
                    'A path read in the step of reduce() does not run on Oracle: its function is given the row as JSON.'
                );
            }
            const entries: [string, string][] = [
                ...read.map((it): [string, string] => [it, this.asJson(scope.get(it)!).sql]),
                ...given.map((it): [string, string] => [`$${it}`, this.parameters.json(it)])
            ];
            return this.sql.comparable(json(this.sql.jsonObject(entries), { ordered: true }));
        };
        const step = (accumulator: string, item: string, outer: Scope): string => {
            const inner: Scope = new Map([
                ...outer,
                [reduce.accumulator, json(accumulator)],
                [reduce.variable, json(item, { temporal: this.itemsOf(listed) })]
            ]);
            return this.sql.comparable(this.asJson(this.expression(reduce.expression, inner)));
        };
        return json(
            this.sql.reduce(
                this.alias('f'),
                initial,
                list,
                (accumulator, item) => step(accumulator, item, scope),
                context,
                (accumulator, item, map) => {
                    // A value read from the map is of the kind the statement made it.
                    const outer: Scope = new Map(
                        read.map((it): [string, Value] => {
                            const was = scope.get(it);
                            const of = was?.kind === 'Json' ? was : undefined;
                            return [
                                it,
                                json(this.sql.propertyOf(map, it), { temporal: of?.temporal, items: of?.items })
                            ];
                        })
                    );
                    const was = this.givenParameters;
                    this.givenParameters = new Map(
                        given.map((it): [string, Value] => [
                            it,
                            json(this.sql.propertyOf(map, `$${it}`), {
                                temporal: Temporal.ofValue(this.parameters.value(it))
                            })
                        ])
                    );
                    try {
                        return step(accumulator, item, outer);
                    } finally {
                        this.givenParameters = was;
                    }
                }
            )
        );
    }

    private patternComprehension(comprehension: PatternComprehension, scope: Scope): Value {
        const inner = new Select(scope);
        this.patterns(inner, [comprehension.pattern]);
        if (comprehension.where) {
            inner.where.push(this.condition(this.expression(comprehension.where, inner.scope)));
        }
        const projected = this.expression(comprehension.projection, inner.scope);
        const gathered = (value: string): string =>
            `(${[`SELECT ${this.sql.aggregateList(value)}`, ...inner.from(), ...optional(inner.whereClause())].join(
                ' '
            )})`;
        // A comprehension of nodes or relationships is a list of them, so a write to an item of it reaches them.
        if (projected.kind === 'Node' || projected.kind === 'Relationship') {
            const id = projected.kind === 'Node' ? projected.nid : projected.eid;
            return {
                kind: 'Entities',
                ids: this.sql.comparable(json(gathered(this.sql.scalar(id)), { ordered: true })),
                relationships: projected.kind === 'Relationship',
                gathered: gathered(this.asJson(projected).sql)
            };
        }
        return json(gathered(this.asJson(projected).sql), {
            ordered: true,
            items: projected.kind === 'Json' ? projected.temporal : undefined,
            list: true,
            itemLists: this.isList(projected)
        });
    }

    private quantifier(quantifier: Quantifier, scope: Scope): Value {
        const listed = this.expression(quantifier.list, scope);
        const name = this.alias('q');
        const quantified = (from: string, item: Value): string => {
            const inner: Scope = new Map([...scope, [quantifier.variable, item]]);
            const condition = quantifier.where ? this.condition(this.expression(quantifier.where, inner)) : 'TRUE';
            const tests = {
                ANY: `EXISTS (SELECT 1 ${from} WHERE ${condition})`,
                ALL: `NOT EXISTS (SELECT 1 ${from} WHERE NOT (${condition}))`,
                NONE: `NOT EXISTS (SELECT 1 ${from} WHERE ${condition})`,
                SINGLE: `(SELECT count(*) ${from} WHERE ${condition}) = 1`
            };
            return tests[quantifier.of];
        };
        // Over a list of nodes or relationships, each item is the node or the relationship, read from its table.
        if (listed.kind === 'Entities') {
            return bool(
                this.sql.shared([listed.ids], ([ids]) =>
                    quantified(...this.entityItems(ids, listed.relationships, name))
                )
            );
        }
        return bool(
            quantified(
                `FROM ${this.sql.elements(this.sql.comparable(this.asJson(listed)), name)}`,
                json(`${name}.item`, { temporal: this.itemsOf(listed) })
            )
        );
    }

    private exists(patterns: Pattern[], where: Expression | undefined, scope: Scope): BoolValue {
        const inner = new Select(scope);
        this.patterns(inner, patterns);
        if (where) {
            inner.where.push(this.condition(this.expression(where, inner.scope)));
        }
        return bool(`EXISTS (${['SELECT 1', ...inner.from(), ...optional(inner.whereClause())].join(' ')})`);
    }

    /**
     * A value in a parameter that is a map, `$p.text`, `$p.a.b` or `$p['text']`, read at once from the text the parameter
     * is bound as, where the store reads it so (see {@link Parameters.jsonAt}); undefined otherwise. Oracle crashed the
     * session where a statement took a parameter past 32 KB as JSON, then the value from it, for each of two rows.
     */
    private inParameter(value: Property | Index): string | undefined {
        const keys: string[] = [];
        let subject: Expression = value;
        for (;;) {
            const key =
                subject.kind === 'Property'
                    ? subject.key
                    : subject.kind === 'Index'
                    ? this.known(subject.index)
                    : undefined;
            if (typeof key !== 'string') {
                break;
            }
            keys.unshift(key);
            subject = (subject as Property | Index).subject;
        }
        if (subject.kind !== 'Parameter' || this.givenParameters?.has(subject.name)) {
            return undefined;
        }
        return this.parameters.jsonAt(subject.name, keys);
    }

    private property(subject: Value, key: string): Value {
        switch (subject.kind) {
            case 'Entities':
                throw new DrivineError('A list has no properties.');
            case 'Node':
                return json(
                    key === Stamps.PROPERTY ? this.sql.scalar(subject.stamp) : this.sql.propertyOf(subject.props, key)
                );
            case 'Relationship':
                return json(this.sql.propertyOf(subject.props, key));
            case 'Json': {
                const field = this.temporalField(subject, key);
                if (field) {
                    return field;
                }
                const taken = this.sql.propertyOf(this.sql.comparable(subject), key);
                return json(taken, {
                    identity: this.identityTaken(subject, taken, true, (it) => this.sql.propertyOf(it, key))
                });
            }
            case 'Bool':
                throw new DrivineError('A truth value has no properties.');
            default:
                throw new DrivineError('A path has no properties.');
        }
    }

    /**
     * The temporal kind the statement makes each of `values`, as each is written and compiled, where it makes every one
     * of the same kind, a null written among them aside: a `CASE`, a `coalesce` or a list of dates is a date, or a list
     * of them. Undefined where they are of different kinds or of none.
     */
    private kindOf(values: [Expression, Value][]): Temporal | undefined {
        return single(
            values
                .filter(([written]) => !isNullLiteral(written))
                .map(([, value]) => (value.kind === 'Json' ? value.temporal : undefined))
        );
    }

    /** Whether the statement makes `value` a list: see {@link JsonValue.list}. */
    private isList(value: Value): boolean {
        return value.kind === 'Entities' || (value.kind === 'Json' && value.list === true);
    }

    /** Whether the statement makes `value` a list whose every item is a list: see {@link JsonValue.itemLists}. */
    private holdsLists(value: Value): boolean {
        return value.kind === 'Json' && value.itemLists === true;
    }

    /** Whether the statement makes `value` a text, or null: see {@link JsonValue.text}. */
    private isText(value: Value): boolean {
        return value.kind === 'Json' && value.text === true;
    }

    /** Whether the statement makes `value` a list whose every item is a text, or null: see {@link JsonValue.texts}. */
    private holdsTexts(value: Value): boolean {
        return value.kind === 'Json' && value.texts === true;
    }

    /** The temporal kind the statement makes each item of the list `list`: see {@link JsonValue.items}. */
    private itemsOf(list: Value): Temporal | undefined {
        return list.kind === 'Json' ? list.items : undefined;
    }

    /**
     * A field of a temporal value, `d.year` or `dur.days`: of the kind the statement makes it, or of the kind a text's
     * shape tells, where a map's is its entry of that name; undefined for a name no temporal value has.
     */
    private temporalField(subject: JsonValue, key: string): Value | undefined {
        if (!this.temporals.fieldNames.includes(key)) {
            return undefined;
        }
        if (subject.temporal) {
            const field = this.temporals.field(this.sql.text(this.sql.comparable(subject)), subject.temporal, key);
            return field ? json(this.sql.scalar(field.sql)) : json(this.sql.literalJson(null));
        }
        return json(
            this.sql.shared([this.sql.comparable(subject)], ([x]) => {
                const kinds = Temporal.entries.filter((it) => this.temporals.field('NULL', it, key) !== undefined);
                const read = this.temporals.byKind(
                    this.sql.text(x),
                    (kind, t) => this.sql.scalar(this.temporals.field(t, kind, key)!.sql),
                    kinds
                );
                return `CASE WHEN ${this.sql.typeOf(x)} = 'string' THEN ${read} ELSE ${this.sql.propertyOf(
                    x,
                    key
                )} END`;
            })
        );
    }

    /**
     * Temporal arithmetic and comparison, where the statement makes either side of a temporal kind: a moment and a
     * duration added or taken away, two durations added, a duration scaled, two moments compared as the moments they
     * are. Undefined where neither side is of a temporal kind, or the operator is no such one.
     */
    private temporalBinary(operator: BinaryOperator, left: Value, right: Value): Value | undefined {
        const l = left.kind === 'Json' ? left.temporal : undefined;
        const r = right.kind === 'Json' ? right.temporal : undefined;
        if (!l && !r) {
            return undefined;
        }
        const [jsonA, jsonB] = [this.sql.comparable(this.asJson(left)), this.sql.comparable(this.asJson(right))];
        const a = this.sql.text(jsonA);
        const b = this.sql.text(jsonB);
        if (operator === 'ADD' || operator === 'SUBTRACT') {
            return this.temporalSum(operator === 'ADD' ? 1 : -1, l, r, jsonA, jsonB, a, b);
        }
        if (operator === 'MULTIPLY' || operator === 'DIVIDE') {
            return this.temporalScaled(operator, l, r, left, right, a, b);
        }
        const comparison = COMPARISONS[operator];
        return comparison ? bool(this.temporals.compare(a, b, (l ?? r)!, comparison)) : undefined;
    }

    /** A duration scaled: times a number, either way round, or divided by one. */
    private temporalScaled(
        operator: BinaryOperator,
        l: Temporal | undefined,
        r: Temporal | undefined,
        left: Value,
        right: Value,
        a: string,
        b: string
    ): Value | undefined {
        const duration = Temporal.DURATION;
        const of = (text: string): Value => json(this.sql.scalar(text), { temporal: duration });
        if (operator === 'DIVIDE') {
            return l === duration ? of(this.temporals.times(a, `(1.0 / ${this.numberOf(right)})`)) : undefined;
        }
        if (l === duration) {
            return of(this.temporals.times(a, this.numberOf(right)));
        }
        return r === duration ? of(this.temporals.times(b, this.numberOf(left))) : undefined;
    }

    /** A temporal sum, or with `sign` -1 a difference: see {@link temporalBinary}. */
    private temporalSum(
        sign: number,
        l: Temporal | undefined,
        r: Temporal | undefined,
        jsonA: string,
        jsonB: string,
        a: string,
        b: string
    ): Value | undefined {
        const duration = Temporal.DURATION;
        const temporals = this.temporals;
        const of = (text: string, kind: Temporal): Value => json(this.sql.scalar(text), { temporal: kind });
        // A side read from the store: `temporal` of the two texts, null where neither is of a kind it reads; then, in an
        // addition, the two added as any two values are, as Cypher adds a temporal value to a list or to a text.
        const read = (kind: Temporal | undefined, temporal: (x: string, y: string) => string): Value =>
            json(
                this.sql.shared([jsonA, jsonB], ([x, y]) => {
                    const value = this.sql.scalar(
                        this.sql.shared([this.sql.text(x), this.sql.text(y)], ([tx, ty]) => temporal(tx, ty))
                    );
                    return sign > 0 ? `COALESCE(${value}, ${this.sql.add(x, y)})` : value;
                }),
                { temporal: kind }
            );
        // Each side a duration (D), a moment or a time of day (I), or a value read from the store, its kind told by its text (?).
        const side = (kind: Temporal | undefined): string => (kind === undefined ? '?' : kind === duration ? 'D' : 'I');
        switch (`${side(l)}+${side(r)}`) {
            case 'D+D':
                return of(temporals.sum(a, b, sign), duration);
            case 'I+D':
                return of(temporals.add(a, l!, b, sign), l!);
            case 'D+I':
                return sign > 0 ? of(temporals.add(b, r!, a, 1), r!) : undefined;
            // A value read from the store and a duration the statement gives.
            case '?+D':
                return read(
                    undefined,
                    (x, y) =>
                        `CASE WHEN ${temporals.isKind(x, duration)} THEN ${temporals.sum(
                            x,
                            y,
                            sign
                        )} ELSE ${temporals.addToAny(x, y, sign)} END`
                );
            // A duration the statement gives, and a value read from the store: added to it, or taken from a duration read.
            // A difference is of no kind, for what is read may be a list or a text, which the moment is added to as any
            // value is.
            case 'D+?':
                return sign > 0
                    ? read(
                          undefined,
                          (x, y) =>
                              `CASE WHEN ${temporals.isKind(y, duration)} THEN ${temporals.sum(
                                  x,
                                  y,
                                  1
                              )} ELSE ${temporals.addToAny(y, x, 1)} END`
                      )
                    : read(
                          duration,
                          (x, y) => `CASE WHEN ${temporals.isKind(y, duration)} THEN ${temporals.sum(x, y, sign)} END`
                      );
            // A duration read from the store, added to a moment the statement gives or taken from it.
            case 'I+?':
                return read(
                    sign < 0 ? l : undefined,
                    (x, y) => `CASE WHEN ${temporals.isKind(y, duration)} THEN ${temporals.add(x, l!, y, sign)} END`
                );
            case '?+I':
                return sign > 0
                    ? read(
                          undefined,
                          (x, y) => `CASE WHEN ${temporals.isKind(x, duration)} THEN ${temporals.add(y, r!, x, 1)} END`
                      )
                    : undefined;
            default:
                return undefined;
        }
    }

    /** A temporal value of `kind` made by its function of `call`'s arguments: the moment, a text, or a map of its fields. */
    private temporal(kind: Temporal, call: Invocation): Value {
        const of = (text: string): Value => json(this.sql.scalar(text), { temporal: kind });
        const name = call.fn.name;
        if (call.arguments.length === 0) {
            if (kind === Temporal.DURATION) {
                throw new DrivineError('duration() takes a text or a map of its fields.');
            }
            return of(this.temporals.now(kind));
        }
        if (call.arguments.length !== 1) {
            throw new DrivineError(`${name}() takes a text or a map of its fields.`);
        }
        const written = call.fn.arguments[0];
        // A text the statement writes is worked out here, as the store would work it out.
        if (written.kind === 'Literal' && typeof written.value === 'string') {
            return json(this.sql.literalJson(this.canonical(written.value, kind, name)), { temporal: kind });
        }
        if (written.kind === 'MapLiteral') {
            return of(this.temporalOfFields(kind, written.entries, call));
        }
        const given = call.arguments[0];
        if (given.kind !== 'Json') {
            throw new DrivineError(`${name}() takes a text or a map of its fields.`);
        }
        const text = this.sql.text(this.sql.comparable(given));
        if (kind === Temporal.DURATION) {
            return of(this.temporals.durationOf(text));
        }
        return given.temporal?.instant
            ? of(this.temporals.convert(text, given.temporal, kind))
            : of(this.temporals.convertAny(text, kind));
    }

    /** The text of a temporal value of `kind` made of the fields `entries` of a map the statement writes. */
    private temporalOfFields(kind: Temporal, entries: [string, Expression][], call: Invocation): string {
        const fields = new Map(
            entries.map(([key, value]): [string, Value] => [key, this.expression(value, call.scope)])
        );
        const known = kind === Temporal.DURATION ? DURATION_MAP_FIELDS : INSTANT_MAP_FIELDS;
        const unknown = [...fields.keys()].find((it) => !known.includes(it));
        if (unknown !== undefined) {
            unsupported(`${call.fn.name}() of a map with ${unknown}`);
        }
        const numbers: Record<string, string> = {};
        fields.forEach((value, key) => {
            if (key !== 'timezone') {
                numbers[key] = this.numberOf(value);
            }
        });
        if (kind === Temporal.DURATION) {
            return this.temporals.duration(numbers);
        }
        const timezone = fields.get('timezone');
        return this.temporals.of(numbers, timezone ? this.textOf(timezone) : undefined, kind);
    }

    /** The canonical text of `kind` of the text `value` the statement writes, refused where it is none. */
    private canonical(value: string, kind: Temporal, name: string): string {
        let canonical: string | undefined;
        try {
            canonical = Temporals.canonical(value, kind);
        } catch (e) {
            if (e instanceof RangeError) {
                throw new DrivineError(`'${value}' is no ${name}: ${e.message}`, e);
            }
            if (e instanceof SyntaxError) {
                throw new DrivineError(`'${value}' is no ${name}.`, e);
            }
            throw e;
        }
        if (canonical === undefined) {
            throw new DrivineError(`'${value}' is no ${name}.`);
        }
        return canonical;
    }

    private mapProjection(projection: MapProjection, scope: Scope): Value {
        const subject = scope.get(projection.variable);
        if (!subject) {
            throw new DrivineError(`${projection.variable} is not defined.`);
        }
        const values = projection.elements.flatMap((element): [string, Value][] => {
            switch (element.kind) {
                case 'Selected':
                    return [[element.key, this.property(subject, element.key)]];
                case 'Entry':
                    return [[element.key, this.expression(element.value, scope)]];
                case 'Variable': {
                    const value = scope.get(element.name);
                    if (!value) {
                        throw new DrivineError(`${element.name} is not defined.`);
                    }
                    return [[element.name, value]];
                }
                default:
                    return [];
            }
        });
        const entries = values.map(([key, value]): [string, string] => [key, this.asJson(value).sql]);
        // A projection of null is null, as in Cypher, and not a map of nulls.
        const present = (map: string): string => `CASE WHEN NOT (${this.isNull(subject)}) THEN ${map} END`;
        if (!projection.elements.some((it) => it.kind === 'All')) {
            const identity = this.identityHolding(
                values.map(([, value]) => value),
                (ids) => present(this.sql.jsonObject(values.map(([key], i) => [key, ids[i]])))
            );
            return json(present(this.sql.jsonObject(entries)), { ordered: true, identity });
        }
        // Every property, then the entries over them.
        return json(present(this.sql.withEntries(this.sql.comparable(this.asJson(subject)), entries)));
    }

    private binary(binary: Binary, scope: Scope): Value {
        if (binary.operator === 'AND' || binary.operator === 'OR' || binary.operator === 'XOR') {
            const left = this.condition(this.expression(binary.left, scope));
            const right = this.condition(this.expression(binary.right, scope));
            if (binary.operator === 'AND') {
                return bool(`(${left} AND ${right})`);
            }
            // Each side whole: a condition may be several, and `a = b <> c` is no SQL.
            return bool(binary.operator === 'OR' ? `(${left} OR ${right})` : `((${left}) <> (${right}))`);
        }
        const [left, right] = this.compared(
            this.expression(binary.left, scope),
            this.expression(binary.right, scope),
            binary
        );
        const temporal = this.temporalBinary(binary.operator, left, right);
        if (temporal) {
            return temporal;
        }
        const a = this.sql.comparable(this.asJson(left));
        const b = this.sql.comparable(this.asJson(right));
        return this.operation(binary, left, right, a, b);
    }

    /**
     * `left` and `right`, the sides of `binary`, as compared: where one holds a node or a relationship by identity and the
     * other may hold one without it (an item taken from a list, a collect, a variable), both by their properties, as
     * before identities: only a value the statement writes out or is given, all the way down (a literal, a parameter, a
     * map, a list or a map projection of such, a `CASE` that gives one), holds none where it carries no identity, so
     * `[{x: r}][0] = {x: r}` is true, and `{x: r} = {x: {}}` false.
     */
    private compared(left: Value, right: Value, binary: Binary): [Value, Value] {
        // Written all the way down: `{a: ms[0]}` and `n {.*, x: r}` hold what may be a node without its identity.
        const written = (expression: Expression): boolean => {
            switch (expression.kind) {
                case 'Literal':
                case 'Parameter':
                    return true;
                case 'MapLiteral':
                    return expression.entries.every(([, value]) => written(value));
                case 'ListLiteral':
                    return expression.items.every(written);
                case 'MapProjection':
                    return expression.elements.every(
                        (it) => it.kind === 'Selected' || (it.kind === 'Entry' && written(it.value))
                    );
                case 'Case':
                    return [
                        ...expression.alternatives.map(([, result]) => result),
                        ...optional(expression.otherwise)
                    ].every(written);
                default:
                    return false;
            }
        };
        const held = (value: Value): boolean => value.kind === 'Json' && value.identity !== undefined;
        const plain = (value: Value): Value => (value.kind === 'Json' ? { ...value, identity: undefined } : value);
        if (held(left) && right.kind === 'Json' && !held(right) && !written(binary.right)) {
            return [plain(left), right];
        }
        if (held(right) && left.kind === 'Json' && !held(left) && !written(binary.left)) {
            return [left, plain(right)];
        }
        return [left, right];
    }

    /** An operator of two values, not a logical one, neither of them temporal: its operands `a` and `b` as JSON. */
    private operation(binary: Binary, left: Value, right: Value, a: string, b: string): Value {
        const sql = this.sql;
        const comparison = COMPARISONS[binary.operator];
        if (binary.operator === 'EQUALS') {
            return bool(this.equality(left, right, binary.right));
        }
        if (binary.operator === 'NOT_EQUALS') {
            return bool(`NOT (${this.equality(left, right, binary.right)})`);
        }
        if (comparison) {
            // Values of two kinds are not ordered, as in Cypher: the comparison is null.
            return bool(
                sql.shared(
                    [a, b],
                    ([x, y]) =>
                        `CASE WHEN ${sql.typeOf(x)} = ${sql.typeOf(y)} AND ${sql.typeOf(
                            x
                        )} IN ('number', 'string', 'boolean') THEN ${x} ${comparison} ${y} END`
                )
            );
        }
        const operations: Partial<Record<BinaryOperator, () => Value>> = {
            ADD: () => {
                // Two lists of nodes, or of relationships, are together a list of them.
                if (
                    left.kind === 'Entities' &&
                    right.kind === 'Entities' &&
                    left.relationships === right.relationships
                ) {
                    const gathered =
                        left.gathered !== undefined || right.gathered !== undefined
                            ? sql.shared([a, b], ([x, y]) => sql.add(x, y))
                            : undefined;
                    return {
                        kind: 'Entities',
                        ids: sql.shared([left.ids, right.ids], ([x, y]) => sql.add(x, y)),
                        relationships: left.relationships,
                        gathered
                    };
                }
                // Two lists of items of one kind are, together, a list of that kind. A side the statement makes a text, not
                // given, is written as its own text; a text put together with a text, or a number given, is a text.
                const items = this.itemsOf(left);
                const [l, r] = [this.summand(binary.left, left), this.summand(binary.right, right)];
                const given: [unknown, unknown] = [l.passed, r.passed];
                return json(
                    sql.shared([a, b], ([x, y]) => sql.add(x, y, given)),
                    {
                        items: items !== undefined && items === this.itemsOf(right) ? items : undefined,
                        list: this.isList(left) || this.isList(right),
                        itemLists: this.holdsLists(left) && (this.holdsLists(right) || !this.isList(right)),
                        ...this.summedTexts(l, r)
                    }
                );
            },
            SUBTRACT: () => json(sql.shared([a, b], ([x, y]) => sql.arithmetic(x, y, '-'))),
            MULTIPLY: () => json(sql.shared([a, b], ([x, y]) => sql.arithmetic(x, y, '*'))),
            // A whole number divided by one is a whole number, as in Cypher.
            DIVIDE: () =>
                json(
                    sql.shared(
                        [a, b],
                        ([x, y]) =>
                            `CASE WHEN ${sql.integral(x)} AND ${sql.integral(y)} THEN ${sql.scalar(
                                `trunc(${sql.number(x)} / ${sql.number(y)})`
                            )} ` + `ELSE ${sql.arithmetic(x, y, '/')} END`
                    )
                ),
            MODULO: () => json(sql.scalar(sql.modulo(sql.number(a), sql.number(b)))),
            POWER: () => json(sql.scalar(sql.float(`power(${sql.number(a)}, ${sql.number(b)})`))),
            IN: () => {
                const i = this.alias('i');
                // A node or a relationship is in a list of them where its id is.
                if (right.kind === 'Entities') {
                    const id =
                        left.kind === 'Node' && !right.relationships
                            ? sql.scalar(left.nid)
                            : left.kind === 'Relationship' && right.relationships
                            ? sql.scalar(left.eid)
                            : undefined;
                    if (id !== undefined) {
                        return bool(`EXISTS (SELECT 1 FROM ${sql.elements(right.ids, i)} WHERE ${i}.item = ${id})`);
                    }
                }
                // A map or a list that holds a node or a relationship is in a list where an item holds the same, by identity.
                if (
                    (left.kind === 'Json' && left.identity !== undefined) ||
                    (right.kind === 'Json' && right.identity !== undefined)
                ) {
                    return bool(
                        `EXISTS (SELECT 1 FROM ${sql.elements(this.identified(right), i)} WHERE ${sql.identityEquals(
                            `${i}.item`,
                            this.identified(left)
                        )})`
                    );
                }
                return bool(`EXISTS (SELECT 1 FROM ${sql.elements(b, i)} WHERE ${i}.item = ${a})`);
            },
            STARTS_WITH: () => bool(sql.shared([sql.text(a), sql.text(b)], ([x, y]) => sql.startsWith(x, y))),
            MATCHES: () => bool(sql.matches(sql.text(a), sql.text(b))),
            ENDS_WITH: () => bool(sql.shared([sql.text(a), sql.text(b)], ([x, y]) => sql.endsWith(x, y))),
            CONTAINS: () => bool(sql.containsText(sql.text(a), sql.text(b)))
        };
        return operations[binary.operator]!();
    }

    /**
     * Whether two values are equal: as JSON, so `'7'` is not `7` and `1` is `1.0`. A node is equal to a node by its
     * row. Where a property is compared with `written`, a text or a truth value the statement is given, a test an index
     * answers stands beside it, where the store has one: such a value's text is equal where its JSON is, and a number's
     * is not (`1` and `1.0`).
     */
    private equality(left: Value, right: Value, written?: Expression): string {
        const temporal = this.temporalBinary('EQUALS', left, right);
        if (temporal?.kind === 'Bool') {
            return temporal.sql;
        }
        const identical = this.identityEquality(left, right);
        if (identical !== undefined) {
            return identical;
        }
        const [a, b] = this.equated(left, right);
        const given = written ? this.given(written) : undefined;
        const indexed =
            typeof given === 'string' || typeof given === 'boolean' ? this.sql.indexedEquality(a, b) : undefined;
        // Null is equal to nothing, itself included: the comparison is null, as in Cypher. A value the statement is given
        // that is not null needs no test of its own, and a property that is not there is SQL's null.
        const equal =
            given !== null && given !== undefined
                ? `${a} = ${b}`
                : this.sql.shared(
                      [a, b],
                      ([x, y]) =>
                          `CASE WHEN NOT ${this.sql.isJsonNull(x)} AND NOT ${this.sql.isJsonNull(
                              y
                          )} THEN ${x} = ${y} END`
                  );
        return indexed !== undefined ? `(${indexed} AND ${equal})` : equal;
    }

    /**
     * Whether `left` and `right` are equal by identity: two nodes, or two relationships, by their rows; and where either is
     * a map or a list that holds a node or a relationship, where what it holds is. Undefined where neither is so.
     */
    private identityEquality(left: Value, right: Value): string | undefined {
        if (left.kind === 'Node' && right.kind === 'Node') {
            return `${left.nid} = ${right.nid}`;
        }
        if (left.kind === 'Relationship' && right.kind === 'Relationship') {
            return `${left.eid} = ${right.eid}`;
        }
        if (
            (left.kind !== 'Json' || left.identity === undefined) &&
            (right.kind !== 'Json' || right.identity === undefined)
        ) {
            return undefined;
        }
        return this.sql.shared(
            [this.identified(left), this.identified(right)],
            ([x, y]) =>
                `CASE WHEN NOT ${this.sql.isJsonNull(x)} AND NOT ${this.sql.isJsonNull(
                    y
                )} THEN ${this.sql.identityEquals(x, y)} END`
        );
    }

    /**
     * `value` as JSON that compares by identity: a node or a relationship as its id, under a key no property of the graph
     * has (`" node"`, `" relationship"`), a list of them as the list of their ids so written, and a map or a list that
     * holds one as its {@link JsonValue.identity}. Undefined where the value holds none.
     */
    private identityOf(value: Value): string | undefined {
        const token = (key: string, id: string): string =>
            `CASE WHEN ${id} IS NOT NULL THEN ${this.sql.comparable(
                json(this.sql.jsonObject([[key, this.sql.scalar(id)]]), { ordered: true })
            )} END`;
        switch (value.kind) {
            case 'Node':
                return token(' node', value.nid);
            case 'Relationship':
                return token(' relationship', value.eid);
            // Each id as the node or relationship it is, so a list of them is the same as one that holds them among other values.
            case 'Entities':
                return this.sql.idTokens(value.ids, value.relationships ? ' relationship' : ' node');
            case 'Json':
                return value.identity;
            default:
                return undefined;
        }
    }

    /**
     * What `take` takes of `list`'s identity, where it holds a node or a relationship by one: an item, a key's value, a
     * slice; `taken` is what it takes of the value. Taken from a node or a relationship, a property holds neither, so its
     * identity is `taken` itself. `item` says whether it takes one value, not a slice.
     */
    private identityTaken(
        list: Value,
        taken: string,
        item: boolean,
        take: (identity: string) => string
    ): string | undefined {
        if (list.kind !== 'Json' || list.identity === undefined) {
            return undefined;
        }
        if (!item) {
            return take(list.identity);
        }
        return this.sql.shared([list.identity, taken], ([i, t]) => {
            // A map's key, not a list's items' keys, as Oracle's lax path reads them.
            const holds = `COALESCE(${this.sql.propertyOf(i, ' node')}, ${this.sql.propertyOf(i, ' relationship')})`;
            return `CASE WHEN ${this.sql.typeOf(i)} = 'object' AND ${holds} IS NOT NULL THEN ${t} ELSE ${take(i)} END`;
        });
    }

    /** `value` as JSON that compares by identity where it holds a node or a relationship, and as itself where it does not: see {@link identityOf}. */
    private identified(value: Value): string {
        return this.identityOf(value) ?? this.sql.comparable(this.asJson(value));
    }

    /**
     * The identity of a map or a list of `values`, built by `build` of each value's: see {@link JsonValue.identity}.
     * Undefined where none of them holds a node or a relationship.
     */
    private identityHolding(values: Value[], build: (identities: string[]) => string): string | undefined {
        const identities = values.map((it) => this.identityOf(it));
        if (identities.every((it) => it === undefined)) {
            return undefined;
        }
        return this.sql.comparable(
            json(build(values.map((it, i) => identities[i] ?? this.asJson(it).sql)), { ordered: true })
        );
    }

    /** What {@link equality} compares of two values: two lists of nodes, or of relationships, their ids, item by item. */
    private equated(left: Value, right: Value): [string, string] {
        if (left.kind === 'Entities' && right.kind === 'Entities' && left.relationships === right.relationships) {
            return [left.ids, right.ids];
        }
        return [this.sql.comparable(this.asJson(left)), this.sql.comparable(this.asJson(right))];
    }

    /**
     * A side of a `+`, `expression`, whose value is `value`: what the statement gives it as, where it does; whether it
     * makes it a text, given or not, or a list of texts; and what `add` is given for it, {@link MADE_TEXT} where it
     * makes it a text without giving it.
     */
    private summand(expression: Expression, value: Value): Summand {
        const given = this.given(expression);
        const text = this.isText(value) || typeof given === 'string';
        return { given, text, texts: this.holdsTexts(value), passed: given ?? (text ? MADE_TEXT : undefined) };
    }

    /** Whether a `+` of `l` and `r` is a text (a text and a text, or a number given), or a list of texts. */
    private summedTexts(l: Summand, r: Summand): { text: boolean; texts: boolean } {
        return {
            text: (l.text && (r.text || isGivenNumber(r.given))) || (r.text && isGivenNumber(l.given)),
            texts: (l.texts && (r.texts || r.text)) || (l.text && r.texts)
        };
    }

    /**
     * The value `expression` is where the statement gives it: written, or bound to a parameter or a parameter's key;
     * undefined where it is not given, or is null.
     */
    private given(expression: Expression): unknown {
        if (expression.kind === 'Literal') {
            return expression.value;
        }
        if (expression.kind === 'Parameter') {
            return this.parameters.value(expression.name);
        }
        if (expression.kind === 'Property' && expression.subject.kind === 'Parameter') {
            const map = this.parameters.value(expression.subject.name);
            return map !== null && typeof map === 'object' && !Array.isArray(map) && !(map instanceof Date)
                ? map[expression.key]
                : undefined;
        }
        return undefined;
    }

    private unary(unary: Unary, scope: Scope): Value {
        const operand = this.expression(unary.operand, scope);
        switch (unary.operator) {
            case 'NOT':
                return bool(`(NOT (${this.condition(operand)}))`);
            case 'NEGATE':
                // Taken from 0, so a floating-point number stays one where the store keeps the kind apart.
                return json(
                    this.sql.shared([this.sql.comparable(this.asJson(operand))], ([x]) =>
                        this.sql.arithmetic(this.sql.literalJson(0), x, '-')
                    )
                );
            case 'IS_NULL':
                return bool(`(${this.isNull(operand)})`);
            default:
                return bool(`(NOT ${this.isNull(operand)})`);
        }
    }

    private isNull(value: Value): string {
        switch (value.kind) {
            case 'Entities':
                return `${value.ids} IS NULL`;
            case 'Node':
                return `${value.nid} IS NULL`;
            case 'Relationship':
                return `${value.eid} IS NULL`;
            case 'Bool':
                return `(${value.sql}) IS NULL`;
            case 'Path':
                return `${value.nids} IS NULL`;
            default:
                // A property stored as JSON's null is no property, as on a graph engine.
                return this.sql.isJsonNull(this.sql.comparable(value));
        }
    }

    private caseOf(expression: Case, scope: Scope): Value {
        const subject = expression.subject ? this.expression(expression.subject, scope) : undefined;
        const results = [...expression.alternatives.map(([, result]) => result), ...optional(expression.otherwise)].map(
            (it): [Expression, Value] => [it, this.expression(it, scope)]
        );
        const conditions = expression.alternatives.map(([key]) =>
            subject ? this.equality(subject, this.expression(key, scope)) : this.condition(this.expression(key, scope))
        );
        const written = (value: (result: Value, i: number) => string): string => {
            const alternatives = conditions
                .map((condition, i) => `WHEN ${condition} THEN ${value(results[i][1], i)}`)
                .join(' ');
            const last = results.length - 1;
            const otherwise = expression.otherwise ? ` ELSE ${value(results[last][1], last)}` : '';
            return `CASE ${alternatives}${otherwise} END`;
        };
        // Where a result holds a node or a relationship, the CASE holds it by identity too.
        const identity = results.some(([, it]) => this.identityOf(it) !== undefined)
            ? written((it) => this.identified(it))
            : undefined;
        // On Oracle a list of nodes or relationships, read from their rows in a subquery, beside a result that reads the
        // row, as `CASE WHEN … THEN [r] ELSE [m.title] END`, closes the session (ORA-03113): its results are worked out in
        // a subquery first. Not a CASE that reads an aggregate, which the subquery would aggregate again, over its one row.
        const values = (): string[] => results.map(([, it]) => this.sql.comparable(this.asJson(it)));
        const sql =
            this.sql.aggregatesCaseSubqueries ||
            !results.some(([, it]) => it.kind === 'Entities') ||
            contains(expression, isAggregate)
                ? written((it) => this.sql.comparable(this.asJson(it)))
                : this.sql.bound(values(), (bound) => written((_, i) => bound[i]));
        return json(sql, {
            temporal: this.kindOf(results),
            identity,
            list: results.every(([, it]) => this.isList(it)),
            itemLists: results.every(([, it]) => this.holdsLists(it)),
            text: results.every(([, it]) => this.isText(it)),
            texts: results.every(([, it]) => this.holdsTexts(it))
        });
    }

    private function(fn: FunctionCall, scope: Scope): Value {
        const values = fn.arguments.map((it) => this.expression(it, scope));
        const name = fn.name.toLowerCase();
        const call: Invocation = {
            fn,
            arguments: values,
            scope,
            name,
            distinct: fn.distinct ? 'DISTINCT ' : '',
            one: () => {
                if (values.length !== 1) {
                    throw new DrivineError(`${fn.name}() takes one argument.`);
                }
                return values[0];
            }
        };
        if (Object.prototype.hasOwnProperty.call(this.functions, name)) {
            return this.functions[name](call);
        }
        const kind = Temporal.ofFunction(name);
        if (kind) {
            return this.temporal(kind, call);
        }
        // The moment the statement runs, however it is asked for: one statement is one moment here.
        if (TEMPORAL_NOW.includes(name)) {
            const now = Temporal.ofFunction(name.substring(0, name.indexOf('.')))!;
            return json(this.sql.scalar(this.temporals.now(now)), { temporal: now });
        }
        if (TEMPORAL_TRUNCATE.includes(name)) {
            return this.truncated(call);
        }
        // A function the store has no SQL for is named before its arguments are counted.
        if (this.sql.function(name, 'NULL') === undefined) {
            unsupported(`The function ${fn.name}()`);
        }
        const one = call.one();
        const argument = this.sql.comparable(this.asJson(one));
        const result = this.sql.shared([argument], ([x]) => this.sql.function(name, x)!);
        // An item taken from a list is of the kind its items are.
        if (name === 'head' || name === 'last') {
            return json(result, {
                temporal: this.itemsOf(one),
                identity: this.identityTaken(one, result, true, (list) =>
                    this.sql.shared([list], ([x]) => this.sql.function(name, x)!)
                ),
                list: this.holdsLists(one),
                text: this.holdsTexts(one)
            });
        }
        return json(result, { text: TEXT_FUNCTIONS.includes(name) });
    }

    private idFunction(call: Invocation): Value {
        const subject = call.one();
        if (subject.kind === 'Node') {
            return json(this.sql.scalar(subject.nid));
        }
        if (subject.kind === 'Relationship') {
            return json(this.sql.scalar(subject.eid));
        }
        throw new DrivineError(`${call.fn.name}() takes a node or a relationship.`);
    }

    /** The one argument of `call`, a path, which `name` takes. */
    private path(call: Invocation, name: string): { nids: string; eids: string } {
        const subject = call.one();
        if (subject.kind !== 'Path') {
            throw new DrivineError(`${name}() takes a path.`);
        }
        return subject;
    }

    /** `collect`. collect(DISTINCT …) is collected in a `WITH` of its own, then kept once each: see {@link aggregatesFirst}. */
    private collectFunction(call: Invocation): Value {
        if (call.fn.distinct) {
            throw new Error('collect(DISTINCT …) is gathered by aggregatesFirst');
        }
        const gathered = call.one();
        // Nodes or relationships are gathered as their ids, so a list of them is still of them.
        if (gathered.kind === 'Node' || gathered.kind === 'Relationship') {
            const id = gathered.kind === 'Node' ? gathered.nid : gathered.eid;
            return {
                kind: 'Entities',
                ids: this.gatheredIds(`CASE WHEN ${id} IS NOT NULL THEN ${this.sql.scalar(id)} END`),
                relationships: gathered.kind === 'Relationship',
                gathered: this.collected(gathered)
            };
        }
        // What holds a node or a relationship, a map or a list of them, is gathered beside its identity too.
        const identity = this.identityOf(gathered);
        return json(this.collected(gathered), {
            ordered: true,
            items: gathered.kind === 'Json' ? gathered.temporal : undefined,
            list: true,
            itemLists: this.isList(gathered),
            texts: this.isText(gathered),
            identity:
                identity !== undefined
                    ? this.sql.comparable(json(this.sql.collect(identity, this.rowOrder), { ordered: true }))
                    : undefined
        });
    }

    /** The items of a list once each, where each is first: nodes or relationships by their ids, not their properties. */
    private distinctItemsFunction(call: Invocation): Value {
        const list = call.one();
        if (list.kind === 'Entities') {
            return {
                kind: 'Entities',
                ids: this.sql.comparable(json(this.sql.distinctItems(list.ids), { ordered: true })),
                relationships: list.relationships
            };
        }
        if (list.kind !== 'Json') {
            return json(this.sql.distinctItems(this.sql.comparable(this.asJson(list))), { ordered: true });
        }
        // What holds a node or a relationship once each by its identity, not its properties.
        if (list.identity !== undefined) {
            return json(this.sql.firstOfEach(this.sql.comparable(list), list.identity), {
                ordered: true,
                items: list.items,
                identity: this.sql.comparable(json(this.sql.distinctItems(list.identity), { ordered: true })),
                list: true,
                itemLists: list.itemLists,
                texts: list.texts
            });
        }
        return json(this.sql.distinctItems(this.sql.comparable(list)), {
            ordered: true,
            items: list.items,
            list: true,
            itemLists: list.itemLists,
            texts: list.texts
        });
    }

    /**
     * `min` or `max`: zoned values as the moments they are, whatever their offsets; of a temporal kind, still of it. A list
     * the statement makes item by item, as an `ORDER BY` sorts it: a store's JSON may put the shorter list first.
     */
    private extreme(call: Invocation, min: boolean): Value {
        const value = this.asJson(call.one());
        const temporal = value.temporal;
        const key = temporal?.zoned
            ? this.temporals.moment(this.sql.text(this.sql.comparable(value)), temporal)
            : this.sql.extremesByListKey && this.isList(call.one())
            ? this.sql.listSortKey(this.sql.comparable(value))
            : undefined;
        return json(this.sql.extreme(this.sql.comparable(value), min, key), { temporal, text: this.isText(value) });
    }

    /**
     * `round(value)`, `round(value, precision)` or `round(value, precision, mode)`. The precision is read as a whole number
     * toward zero, as Neo4j reads it: 1.7 places is 1.
     */
    private round(call: Invocation): Value {
        if (call.arguments.length === 3) {
            const mode = this.roundingMode(call.fn.arguments[2]);
            if (mode === undefined) {
                return json(this.sql.literalJson(null));
            }
            return json(
                this.sql.scalar(
                    this.sql.float(
                        this.sql.roundTo(
                            this.numberOf(call.arguments[0]),
                            this.precisionOf(call.arguments[1], call.fn.arguments[1]),
                            mode
                        )
                    )
                )
            );
        }
        if (call.arguments.length === 2) {
            return json(
                this.sql.scalar(
                    this.sql.float(
                        `ROUND(${this.numberOf(call.arguments[0])}, ${this.precisionOf(
                            call.arguments[1],
                            call.fn.arguments[1]
                        )})`
                    )
                )
            );
        }
        return json(this.sql.scalar(this.sql.float(`FLOOR(${this.numberOf(call.one())} + 0.5)`)));
    }

    /**
     * The mode `mode` a `round()` names, as Java's `BigDecimal` names it, as Neo4j takes it: undefined where it is null,
     * as the rounding then is. Written, or a parameter's value: the SQL is worked out for the one mode.
     */
    private roundingMode(mode: Expression): RoundingMode | undefined {
        if (mode.kind !== 'Literal' && mode.kind !== 'Parameter') {
            unsupported('A rounding mode an expression gives');
        }
        const name = this.given(mode);
        if (name === null || name === undefined) {
            return undefined;
        }
        const known = ROUNDING_MODES.find((it) => it === name);
        if (known === undefined) {
            throw new DrivineError(
                `round() rounds by CEILING, FLOOR, UP, DOWN, HALF_EVEN, HALF_UP, HALF_DOWN or UNNECESSARY, not ${String(
                    name
                )}.`
            );
        }
        // It fails where rounding would change the number, which SQL has no way to say in a query.
        if (known === 'UNNECESSARY') {
            unsupported('round() by UNNECESSARY');
        }
        return known;
    }

    /** `e()` or `pi()`: Java's constant `value`, which takes no argument. */
    private constant(call: Invocation, value: number): Value {
        if (call.arguments.length > 0) {
            throw new DrivineError(`${call.fn.name}() takes no argument.`);
        }
        return json(this.sql.literalJson(new CypherFloat(value)));
    }

    private numeric(call: Invocation): Value {
        return json(this.sql.scalar(this.sql.float(`${call.name.toUpperCase()}(${this.numberOf(call.one())})`)));
    }

    private leftOrRight(call: Invocation): Value {
        if (call.arguments.length !== 2) {
            throw new DrivineError(`${call.fn.name}() takes a text and a length.`);
        }
        const [text, count] = this.textAndCount(call.arguments);
        return json(
            this.sql.scalar(call.name === 'left' ? `SUBSTR(${text}, 1, ${count})` : this.sql.rightText(text, count)),
            { text: true }
        );
    }

    private truncated(call: Invocation): Value {
        const fn = call.fn;
        const to = Temporal.ofFunction(call.name.substring(0, call.name.indexOf('.')))!;
        if (call.arguments.length !== 2) {
            throw new DrivineError(`${fn.name}() takes a unit and a value.`);
        }
        const written = fn.arguments[0];
        const unit =
            written.kind === 'Literal' && typeof written.value === 'string'
                ? written.value
                : unsupported('A truncation to a unit an expression gives');
        const given = call.arguments[1];
        if (given.kind !== 'Json') {
            throw new DrivineError(`${fn.name}() takes a unit and a value.`);
        }
        const cut = (text: string, from: Temporal): string => {
            const truncated = this.temporals.truncate(unit, text, from, to);
            if (truncated === undefined) {
                throw new DrivineError(
                    `${fn.name}() truncates to year, quarter, month, week, day, hour, minute, second or millisecond, not ${unit}.`
                );
            }
            return truncated;
        };
        const text = this.sql.text(this.sql.comparable(given));
        const from = given.temporal?.instant ? given.temporal : undefined;
        return json(this.sql.scalar(from ? cut(text, from) : this.temporals.byKind(text, (kind, t) => cut(t, kind))), {
            temporal: to
        });
    }

    private between(call: Invocation): Value {
        const fn = call.fn;
        if (call.arguments.length !== 2) {
            throw new DrivineError(`${fn.name}() takes two temporal values.`);
        }
        const units: Record<string, string> = {
            'duration.inmonths': 'months',
            'duration.indays': 'days',
            'duration.inseconds': 'seconds'
        };
        const unit = units[call.name];
        const [from, to] = call.arguments.map((it) => {
            if (it.kind !== 'Json') {
                throw new DrivineError(`${fn.name}() takes two temporal values.`);
            }
            return it;
        });
        const [a, b] = [this.sql.text(this.sql.comparable(from)), this.sql.text(this.sql.comparable(to))];
        // A value whose kind the statement does not make is taken to be of the other's.
        const [fromKind, toKind] = [from, to].map((side) => (side.temporal?.instant ? side.temporal : undefined));
        const kind = fromKind ?? toKind;
        const between = kind
            ? this.temporals.between(a, b, kind, unit, toKind ?? kind)
            : this.sql.shared([b], ([y]) => this.temporals.byKind(a, (k, x) => this.temporals.between(x, y, k, unit)));
        return json(this.sql.scalar(between), { temporal: Temporal.DURATION });
    }

    /** A function's text, its first argument, and a whole number, its second. */
    private textAndCount(values: Value[]): [string, string] {
        return [this.textOf(values[0]), this.whole(values[1])];
    }

    /** A value as a SQL whole number. */
    private whole(value: Value): string {
        return `CAST(${this.numberOf(value)} AS INTEGER)`;
    }

    /** A value as a SQL whole number with its fraction cut off, toward zero, as Neo4j reads `round()`'s precision. */
    private truncatedWhole(value: Value): string {
        return `CAST(TRUNC(${this.numberOf(value)}) AS INTEGER)`;
    }

    /**
     * `round()`'s precision `value`, written in the statement as `written`, as a whole number toward zero: -0.5 is 0
     * places. One below 0 is refused, as Neo4j refuses it: when compiling, where it is written, negated or not, or a
     * parameter's value, a bigint or the Neo4j driver's Integer too; and else when the row is read, by the store's
     * `failure`.
     */
    private precisionOf(value: Value, written: Expression): string {
        const negated = written.kind === 'Unary' && written.operator === 'NEGATE';
        const precision = this.given(negated ? (written as Unary).operand : written);
        const given =
            precision instanceof CypherFloat
                ? precision.value
                : typeof precision === 'bigint' || isInt(precision)
                ? Number(precision.toString())
                : precision;
        if (typeof given === 'number') {
            if (Math.trunc(negated ? -given : given) < 0) {
                throw new DrivineError(NEGATIVE_PRECISION);
            }
            return this.truncatedWhole(value);
        }
        return this.sql.shared(
            [`TRUNC(${this.numberOf(value)})`],
            ([places]) =>
                `CASE WHEN ${places} < 0 THEN ${this.sql.failure(NEGATIVE_PRECISION, places)} ` +
                `ELSE CAST(${places} AS INTEGER) END`
        );
    }

    /** A value as a SQL number, where it is one. */
    private numberOf(value: Value): string {
        return this.sql.number(this.sql.comparable(this.asJson(value)));
    }

    /** A value as SQL text, where it is a string. */
    private textOf(value: Value): string {
        return this.sql.text(this.sql.comparable(this.asJson(value)));
    }

    /** The values `value` of a group, gathered as `collect` gathers them, as JSON. */
    private collected(value: Value): string {
        return this.sql.collect(this.collectable(value), this.rowOrder);
    }

    /** The ids `id` of a group, gathered as `collect` gathers them, as JSON that compares. */
    private gatheredIds(id: string): string {
        return this.sql.comparable(json(this.sql.collect(id, this.rowOrder), { ordered: true }));
    }

    /** What `count` counts of a value: a node by its row, anything else by its value, nulls not counted. */
    private countable(value: Value): string {
        switch (value.kind) {
            case 'Node':
                return value.nid;
            case 'Relationship':
                return value.eid;
            case 'Path':
                return value.nids;
            case 'Entities':
                return value.ids;
            default:
                // What holds a node or a relationship by its identity, so `count(DISTINCT {x: r})` counts each relationship.
                return this.sql.nullIfJsonNull(this.identified(value));
        }
    }

    /**
     * What `collect` gathers of a value: nulls are left out, as Cypher's `collect` leaves them out, JSON's null among
     * them, as a list's item or a map's entry may be.
     */
    private collectable(value: Value): string {
        if (value.kind === 'Node') {
            return `CASE WHEN ${value.nid} IS NOT NULL THEN ${this.asJson(value).sql} END`;
        }
        if (value.kind === 'Json' && !value.ordered) {
            return this.sql.nullIfJsonNull(value.sql);
        }
        return this.asJson(value).sql;
    }

    // ----- Conversions -----

    /** A value as JSON, for a projection or a comparison. A node is its properties, its stamp among them, as Drivine gives a node. */
    private asJson(value: Value): JsonValue {
        switch (value.kind) {
            case 'Json':
                return value;
            case 'Bool':
                return json(this.sql.scalar(value.sql));
            case 'Node':
                return json(this.sql.nodeJson(value));
            case 'Relationship':
                return json(`CASE WHEN ${value.eid} IS NOT NULL THEN ${value.props} END`);
            case 'Entities':
                return json(this.entitiesJson(value), { ordered: true, list: true });
            default:
                // Each graph engine's driver gives a path as a value of its own, so a path is given by its parts.
                throw new DrivineError(
                    'A path is not a value drivine gives the same on each store: use nodes(p), relationships(p) and length(p).'
                );
        }
    }

    /** A value as a condition: a boolean as itself, JSON's `true` and `false` as theirs, anything else as null. */
    private condition(value: Value): string {
        if (value.kind === 'Bool') {
            return value.sql;
        }
        if (value.kind === 'Json') {
            return this.sql.boolOf(this.sql.comparable(value));
        }
        throw new DrivineError('A node, a relationship or a path is not a condition.');
    }

    /**
     * What an order sorts a value by: JSON's order for a value, a node by its properties. JSON's null, as a map or a
     * list the statement builds holds it, is SQL's null, which comes last, as a graph engine orders null.
     */
    private sortable(value: Value): string {
        const [carried, sorts] = this.sortTerm(value);
        return sorts(carried);
    }

    /** What {@link sortable} sorts `value` by, in two: the value as a column carries it, and what sorts it, of that column. */
    private sortTerm(value: Value): [string, (column: string) => string] {
        if (value.kind === 'Bool') {
            return [value.sql, (it) => it];
        }
        // A zoned value the statement makes sorts as the moment it is, whatever its offset.
        if (value.kind === 'Json' && value.temporal?.zoned) {
            const temporal = value.temporal;
            return [this.sql.comparable(value), (it) => this.temporals.moment(this.sql.text(it), temporal)];
        }
        // A list the statement makes sorts as Cypher sorts lists, item by item; any other value as the store sorts its JSON.
        if (this.isList(value)) {
            return [this.sql.comparable(this.asJson(value)), (it) => this.sql.listSortKey(it)];
        }
        return [this.sql.comparable(this.asJson(value)), (it) => this.sql.nullIfJsonNull(it)];
    }
}

/** The kind of variable a row holds `value` as. */
function heldKind(value: Value): Kind {
    switch (value.kind) {
        case 'Node':
            return 'NODE';
        case 'Relationship':
            return 'RELATIONSHIP';
        case 'Entities':
            return value.relationships ? 'RELATIONSHIPS' : 'NODES';
        case 'Path':
            return 'PATH';
        default:
            return 'VALUE';
    }
}

function reversed(relationship: RelationshipPattern): RelationshipPattern {
    const directions = { OUTGOING: 'INCOMING', INCOMING: 'OUTGOING', EITHER: 'EITHER' } as const;
    return { ...relationship, direction: directions[relationship.direction] };
}
