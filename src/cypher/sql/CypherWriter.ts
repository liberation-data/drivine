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
    ANEW,
    bracketed,
    children,
    chunked,
    contains,
    DISTINCT_ITEMS,
    holdsAnew,
    holdsSubquery,
    imports,
    indent,
    isAggregate,
    isAnew,
    isGivenNumber,
    isSeeded,
    iterated,
    literal,
    MADE_TEXT,
    MATH_FUNCTIONS,
    MOST_ARGUMENTS,
    ROUNDING_MODES,
    RoundingMode,
    parametersIn,
    plainWith,
    queryHoldsAnew,
    replaced,
    seeded,
    TEXT_FUNCTIONS,
    unsupported,
    variablesIn,
    variablesOfPattern,
    variablesOutsideAggregates,
    writes
} from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { Parameters } from '@/cypher/sql/Parameters';
import { Select } from '@/cypher/sql/Select';
import { Procedure, Walk, Walked } from '@/cypher/sql/Procedure';
import type { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { Temporal } from '@/cypher/sql/Temporal';
import { TRUNCATION_UNITS } from '@/cypher/sql/TemporalSql';
import { Overrides, Temporals } from '@/cypher/sql/Temporals';
import {
    bool,
    BoolValue,
    capitalNounOf,
    EntitiesValue,
    json,
    JsonValue,
    Known,
    knownOf,
    NodeValue,
    nodeOf,
    nounOf,
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
 * What `x IN list` compares, as `CypherWriter.membership` reads it: the `list` and the value `x`, as SQL; how an item of
 * the list `matches` the value, and how `equals` compares two values that hold no null; and where the value is a node or
 * a relationship in a list of them, its `id`, which is `x`; and how the `elements` of the list, or of what binds it, are
 * read as rows.
 */
interface Member {
    list: string;
    x: string;
    id?: string;
    equals: (a: string, b: string) => string;
    matches: (item: string, value: string) => string;
    elements: (list: string, alias: string) => string;
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
    /** The terms each is sorted by, in turn: see {@link SqlCypherCompiler.openSortKey}. */
    after: Map<string, string[]>;
    /** The terms that sort each term carried out of the query as a column, of that column. */
    sorted: Map<string, (column: string) => string[]>;
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

/** A call of `randomUUID()`, as a statement writes one. */
const RANDOM_UUID: Expression = { kind: 'Function', name: 'randomUUID', distinct: false, arguments: [] };

/** What `round()` fails with, as Neo4j fails it, a precision below 0 or past `MAX_COUNT`. */
const PRECISION_OUT_OF_RANGE = 'round() takes a precision from 0 to 2147483647, as in Neo4j.';

/**
 * The greatest start or length `substring()`, `left()` and `right()` take, and the greatest precision `round()` takes,
 * as Neo4j takes them: Java's greatest `int`.
 */
const MAX_COUNT = 2147483647;

/** The greatest and least long, Java's, as `cutTowardZero` holds a number to. */
const LONG_MAX = BigInt('9223372036854775807');
const LONG_MIN = BigInt('-9223372036854775808');

/** The functions of a temporal kind that truncate a value to a unit. */
const TEMPORAL_TRUNCATE = TEMPORAL_KINDS.map((it) => `${it}.truncate`);

/** The fields of a date a truncation's map may give, as Neo4j takes them. */
const TRUNCATION_DATE_FIELDS = [
    'year',
    'month',
    'day',
    'dayOfWeek',
    'week',
    'weekYear',
    'quarter',
    'dayOfQuarter',
    'ordinalDay'
];

/** The fields of a time of day a truncation's map may give, as Neo4j takes them. */
const TRUNCATION_TIME_FIELDS = ['hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond'];

/** The fields a truncation's map may give that the stores have no SQL for yet: nanoseconds, and the fields of a week or a quarter. */
const TRUNCATION_FIELDS_NOT_COMPILED = ['nanosecond', 'week', 'weekYear', 'quarter', 'dayOfQuarter', 'ordinalDay'];

/** The values each field a truncation's map gives may take, as Neo4j takes them, but for the year, which runs past what a store's text holds. */
const TRUNCATION_RANGES: Partial<Record<string, [number, number]>> = {
    month: [1, 12],
    day: [1, 31],
    dayOfWeek: [1, 7],
    hour: [0, 23],
    minute: [0, 59],
    second: [0, 59],
    millisecond: [0, 999],
    microsecond: [0, 999999]
};

/** The least of each field a truncation's map gives that is not 0, which a field given as null is. */
const TRUNCATION_LEAST: Partial<Record<string, number>> = { month: 1, day: 1, dayOfWeek: 1 };

/**
 * Refuses `written`, the value a `SET` gives a property, where it is a map written, or a list written that holds one or
 * a list: no property, as Neo4j refuses it, and as drivine's saves do.
 */
function propertyOfKind(written: Expression): void {
    if (
        written.kind === 'MapLiteral' ||
        (written.kind === 'ListLiteral' &&
            written.items.some((it) => it.kind === 'MapLiteral' || it.kind === 'ListLiteral'))
    ) {
        throw new DrivineError(
            `A property is a number, a text, a truth value, a temporal value or a list of them, not ${
                written.kind === 'MapLiteral' ? 'a map' : 'a list of maps or lists'
            }, as in Neo4j.`
        );
    }
}

/** Whether the statement writes `value` as a value of a kind other than a map ({@link JsonValue.known}), which has no properties. */
function knownNoMap(value: JsonValue): boolean {
    return value.known !== undefined && value.known !== 'MAP';
}

/** A truncation's fields as a message names them, where it is not `a <field>`. */
const TRUNCATION_FIELD_NAMES: Partial<Record<string, string>> = { dayOfWeek: 'a day of the week', hour: 'an hour' };

/**
 * The keys of `entries`, a truncation's map of fields given `fn`, which truncates to `kind`: refused where Neo4j refuses
 * one, as a field of no such value or a day or a month beside a day of the week, or where no store has SQL for it yet.
 */
function truncationKeys(fn: FunctionCall, kind: Temporal, entries: [string, Expression][]): Set<string> {
    const takes = new Set([
        ...(kind !== Temporal.LOCAL_TIME && kind !== Temporal.TIME ? TRUNCATION_DATE_FIELDS : []),
        ...(kind !== Temporal.DATE ? TRUNCATION_TIME_FIELDS : []),
        ...(kind.zoned ? ['timezone'] : [])
    ]);
    entries.forEach(([key]) => {
        if (!takes.has(key)) {
            throw new DrivineError(`${fn.name}() takes no field ${key}.`);
        }
        if (TRUNCATION_FIELDS_NOT_COMPILED.includes(key)) {
            unsupported(`${fn.name}() of a map with ${key}`);
        }
    });
    const keys = new Set(entries.map(([key]) => key));
    ['day', 'month'].forEach((it) => {
        if (keys.has(it) && keys.has('dayOfWeek')) {
            throw new DrivineError(`${fn.name}() takes a ${it} or a day of the week, not both.`);
        }
    });
    return keys;
}

/**
 * `literal`, written as the field `key` of a truncation of `fn`, where it is a whole number in the field's range (see
 * {@link TRUNCATION_RANGES}); with `millis`, a millisecond is given or kept, beside which a microsecond runs to 999.
 */
function truncationWhole(fn: FunctionCall, key: string, literal: unknown, millis: boolean): number {
    if (typeof literal !== 'number' || !Number.isInteger(literal)) {
        const shown = typeof literal === 'string' ? `'${literal}'` : String(literal);
        throw new DrivineError(`${fn.name}() takes a whole number for ${key}, not ${shown}.`);
    }
    const beside = key === 'microsecond' && millis;
    const range: [number, number] | undefined = beside ? [0, 999] : TRUNCATION_RANGES[key];
    if (range !== undefined && (literal < range[0] || literal > range[1])) {
        const name = TRUNCATION_FIELD_NAMES[key] ?? `a ${key}`;
        throw new DrivineError(
            `${fn.name}() takes ${name} from ${range[0]} to ${range[1]}${
                beside ? ' beside a millisecond' : ''
            }, not ${literal}.`
        );
    }
    return literal;
}

/**
 * The value `value` is written as, where it is a literal or a negated whole number, `-1`, which is written as much as
 * `1` is: undefined for any other expression.
 */
function writtenNumber(value: Expression): unknown {
    if (value.kind === 'Literal') {
        return value.value;
    }
    const negated = value.kind === 'Unary' && value.operator === 'NEGATE' ? value.operand : undefined;
    return negated?.kind === 'Literal' && typeof negated.value === 'number' ? -negated.value : undefined;
}

/**
 * The offset a truncation's `timezone` field, `value`, gives `fn`, as SQL text. Neo4j takes an offset written as `Z` or
 * `+01:00` alone, as Java's ZoneOffset does (up to 18 hours, and 0 is UTC's, `Z`), and a zone by name, which no store's
 * text holds yet, so it is refused as not compiled yet.
 */
function truncationZone(fn: FunctionCall, value: Expression): string {
    if (isNullLiteral(value)) {
        throw new DrivineError(`${fn.name}() takes a time zone, not null.`);
    }
    if (value.kind !== 'Literal' || typeof value.value !== 'string') {
        return unsupported('A truncation to a time zone an expression gives');
    }
    const zone = value.value;
    const offset = offsetText(zone);
    if (offset !== undefined) {
        return offset;
    }
    if (!/^[+-]/.test(zone) && namedZone(zone)) {
        return unsupported(`The time zone '${zone}'`);
    }
    throw new DrivineError(`'${zone}' is no time zone.`);
}

/** The SQL text of the offset `zone` writes, `Z` or `+01:00`, as Java's ZoneOffset takes it: undefined where it is none. */
function offsetText(zone: string): string | undefined {
    if (zone === 'Z') {
        return "'Z'";
    }
    const offset = /^[+-]([0-9]{2}):([0-9]{2})$/.exec(zone);
    if (!offset) {
        return undefined;
    }
    const [hours, minutes] = [Number(offset[1]), Number(offset[2])];
    if (minutes >= 60 || hours > 18 || (hours === 18 && minutes > 0)) {
        return undefined;
    }
    return hours === 0 && minutes === 0 ? "'Z'" : `'${zone}'`;
}

/** Whether `zone` names a time zone, as `Europe/Stockholm` does. */
function namedZone(zone: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** The kinds of expression whose value, null aside, is a number, a text, a truth value or a temporal value: no list or map. */
const SCALAR_KINDS: ReadonlySet<Expression['kind']> = new Set<Expression['kind']>([
    'Literal',
    'Unary',
    'HasLabels',
    'CountStar',
    'PatternPredicate',
    'Exists',
    'Subquery',
    'Quantifier'
]);

/** The functions whose value, null aside, is a number, a text, a truth value or a temporal value: no list or map. */
const SCALAR_FUNCTIONS: ReadonlySet<string> = new Set([
    'size',
    'length',
    'count',
    'sum',
    'avg',
    'tostring',
    'tointeger',
    'tofloat',
    'toboolean',
    'tolower',
    'toupper',
    'trim',
    'ltrim',
    'rtrim',
    'substring',
    'left',
    'right',
    'replace',
    'id',
    'elementid',
    'type',
    'round',
    'floor',
    'ceil',
    'sign',
    'atan2',
    'e',
    'pi',
    'randomuuid',
    'timestamp',
    'isempty',
    'date',
    'localtime',
    'time',
    'localdatetime',
    'datetime',
    'duration',
    'duration.between',
    'duration.inmonths',
    'duration.indays',
    'duration.inseconds',
    ...MATH_FUNCTIONS,
    ...TEMPORAL_NOW,
    ...TEMPORAL_TRUNCATE
]);

/** The functions whose value holds no null in a list or a map: see {@link JsonValue.flat}. */
const FLAT_FUNCTIONS: ReadonlySet<string> = new Set([
    ...SCALAR_FUNCTIONS,
    'labels',
    'keys',
    'nodes',
    'relationships',
    'range',
    'split'
]);

/** The functions whose value holds a null in a list or a map only where an argument does: see {@link JsonValue.flat}. */
const CARRYING_FUNCTIONS: ReadonlySet<string> = new Set([
    'collect',
    'min',
    'max',
    'coalesce',
    'head',
    'last',
    'tail',
    'reverse',
    'properties',
    DISTINCT_ITEMS
]);

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
 * Each text `value`, a statement as read or any part of it, holds anywhere, as far as its first space: each of its
 * variables' names, and more (a label, a key, a text it gives), which is as much as a name made for it, with no space,
 * needs to keep clear of: see `CypherWriter.anewVariable`.
 */
function textsIn(value: unknown, texts: Set<string> = new Set()): Set<string> {
    if (typeof value === 'string') {
        const space = value.indexOf(' ');
        texts.add(space < 0 ? value : value.slice(0, space));
    } else if (value !== null && typeof value === 'object') {
        Object.values(value).forEach((it) => textsIn(it, texts));
    }
    return texts;
}

/**
 * `value`, a parameter's, as the JSON text it is bound as reads (see `jsonText`): a list, or any other iterable but
 * bytes, as an array; a map as an object of its entries, those undefined left out; null and undefined as null, and so
 * a number JSON has no text for (`NaN`, `Infinity`). Any other value (a number, a text, a date, bytes) is itself.
 */
function jsonTree(value: any): unknown {
    if (boundAsNull(value)) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map(jsonTree);
    }
    if (
        typeof value !== 'object' ||
        value instanceof Date ||
        value instanceof CypherFloat ||
        value instanceof Uint8Array ||
        value instanceof Int8Array ||
        isInt(value)
    ) {
        return value;
    }
    if (typeof value[Symbol.iterator] === 'function') {
        return Array.from(value as Iterable<unknown>).map(jsonTree);
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, jsonTree(item)])
    );
}

/** Whether `value` is bound as JSON's null (see `jsonText`): null, undefined, or a number JSON has no text for. */
function boundAsNull(value: any): boolean {
    return value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value));
}

/** Whether `tree`, a value {@link jsonTree} gives, is a map. */
function isJsonMap(tree: unknown): tree is Record<string, unknown> {
    return tree !== null && typeof tree === 'object' && Object.getPrototypeOf(tree) === Object.prototype;
}

/** Whether `tree`, a value {@link jsonTree} gives, is a list or a map. */
function isContainer(tree: unknown): boolean {
    return Array.isArray(tree) || isJsonMap(tree);
}

/** Whether `tree`, a value {@link jsonTree} gives, holds no null in a list or a map, at any depth. */
function holdsNoNull(tree: unknown): boolean {
    if (Array.isArray(tree)) {
        return tree.every((it) => it !== null && holdsNoNull(it));
    }
    return !isJsonMap(tree) || Object.values(tree).every((it) => it !== null && holdsNoNull(it));
}

/** Whether `tree`, a value {@link jsonTree} gives, holds no map, at any depth. */
function arrays(tree: unknown): boolean {
    return !isJsonMap(tree) && (!Array.isArray(tree) || tree.every(arrays));
}

/**
 * The most bytes of JSON's text, in UTF-8, an item of a parameter's list is written in the statement in, as
 * `givenItemwise` writes it: Oracle takes no text literal past 4,000 bytes (ORA-01704), a text's JSON is written in a
 * literal of its own, and each quote in it is doubled there.
 */
const LITERAL_BYTES = 1000;

/**
 * Whether each text, number and truth value `tree`, a list {@link jsonTree} gives that holds no map, holds is short
 * enough to write in the statement: see {@link LITERAL_BYTES}.
 */
function short(tree: unknown): boolean {
    return Array.isArray(tree) ? tree.every(short) : Buffer.byteLength(jsonText(tree), 'utf8') <= LITERAL_BYTES;
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

    /** Whether the expression being compiled is read by a `WHERE` for its truth alone: see {@link keeps}. */
    private filtering = false;

    /** Whether the expression `expression` has begun is read by a `WHERE` for its truth alone, as {@link filtering} said as it began. */
    private filtered = false;

    /** Each parameter's value as the JSON it is bound as, by name, as {@link parameterTree} reads it. */
    private readonly parameterTrees: Map<string, unknown> = new Map();

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

    /**
     * The variables made here for a randomUUID() made first, for each row: no variable of the statement's, though one may
     * be quoted as named alike: see {@link anewVariable}.
     */
    private readonly madeAnew = new Set<string>();

    /**
     * The queries given to compile, {@link query} and {@link procedure}, whose names {@link anewVariable} keeps clear of,
     * not yet in {@link queryTexts}.
     */
    private readonly queries: Query[] = [];

    /** Each text of the queries given to compile, as far as its first space, gathered when {@link anewVariable} needs it. */
    private readonly queryTexts = new Set<string>();

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
                ),
                temporals: entries.some(([, value]) => this.hasTemporals(value))
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

    /**
     * Whether the value of each kind of expression, but those of {@link SCALAR_KINDS}, is known to hold no null in a list
     * or a map: see {@link flat}. A kind not here may hold one.
     */
    private readonly flatness: Partial<Record<Expression['kind'], (expression: any, scope: Scope) => boolean>> = {
        Parameter: (it) => holdsNoNull(this.parameterTree(it.name)),
        Variable: (it, scope) => {
            const value = scope.get(it.name);
            return value !== undefined && this.isFlat(value);
        },
        // A property of a node or a relationship holds no null, as a graph engine stores none in a list; a parameter's
        // map's, as it is bound.
        Property: (it, scope) => {
            if (it.subject.kind !== 'Parameter') {
                return this.flat(it.subject, scope);
            }
            const map = this.parameterTree(it.subject.name);
            return !isJsonMap(map) || holdsNoNull(map[it.key] ?? null);
        },
        ListLiteral: (it, scope) =>
            (it.items as Expression[]).every((item) => this.present(item) && this.flat(item, scope)),
        MapLiteral: (it, scope) =>
            (it.entries as [string, Expression][]).every(([, value]) => this.present(value) && this.flat(value, scope)),
        // A list and an item that may be null are a list that holds it.
        Binary: (it: Binary, scope) =>
            it.operator !== 'ADD' ||
            (this.flat(it.left, scope) &&
                this.flat(it.right, scope) &&
                (this.present(it.left) || this.presentScalar(it.right, scope)) &&
                (this.present(it.right) || this.presentScalar(it.left, scope))),
        Index: (it, scope) => this.flat(it.subject, scope),
        Slice: (it, scope) => this.flat(it.subject, scope),
        Function: (it: FunctionCall, scope) => {
            const name = it.name.toLowerCase();
            return (
                FLAT_FUNCTIONS.has(name) ||
                (CARRYING_FUNCTIONS.has(name) && it.arguments.every((argument) => this.flat(argument, scope)))
            );
        },
        Case: (it: Case, scope) =>
            [...it.alternatives.map(([, result]) => result), ...optional(it.otherwise)].every((result) =>
                this.flat(result, scope)
            )
    };

    /** How each function is compiled, by its name in lower case, where it is none the store compiles alone. */
    private readonly functions: Record<string, (call: Invocation) => Value> = {
        properties: (call) => {
            const subject = call.one();
            if (subject.kind === 'Node' || subject.kind === 'Relationship') {
                return this.asJson(subject);
            }
            this.requireKind(
                subject,
                'MAP',
                (kind) => `properties() takes a node, a relationship or a map, not ${kind}, as in Neo4j.`
            );
            return subject;
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
        coalesce: (call) => {
            const written = call.fn.arguments.map((it, i): [Expression, Value] => [it, call.arguments[i]]);
            return json(
                `COALESCE(${call.arguments
                    .map((it) => this.sql.nullIfJsonNull(this.sql.comparable(this.asJson(it))))
                    .join(', ')})`,
                {
                    temporal: this.kindOf(written),
                    // A list of one kind where each is, or is null or an empty list written, as `coalesce(l, [])`: so Oracle reads its
                    // items by their places, as it reads l's (#347).
                    items: this.listKindOf(written, (it) => this.itemsOf(it)),
                    itemItems: this.listKindOf(written, (it) => this.itemItemsOf(it)),
                    temporals: call.arguments.some((it) => this.hasTemporals(it)),
                    text: call.arguments.every((it) => this.isText(it)),
                    texts: call.arguments.every((it) => this.holdsTexts(it))
                }
            );
        },
        count: (call) => json(this.sql.scalar(`count(${call.distinct}${this.countable(call.one())})`)),
        collect: (call) => this.collectFunction(call),
        [DISTINCT_ITEMS]: (call) => this.distinctItemsFunction(call),
        sum: (call) => json(this.sql.sum(this.sql.comparable(this.asJson(call.one())), call.distinct)),
        avg: (call) => json(this.sql.scalar(this.sql.float(`avg(${call.distinct}${this.numberOf(call.one())})`))),
        min: (call) => this.extreme(call, true),
        max: (call) => this.extreme(call, false),
        range: (call) => {
            if (call.arguments.length < 2 || call.arguments.length > 3) {
                throw new DrivineError('range() takes a start, an end and a step.');
            }
            call.arguments.forEach((it) =>
                this.requireKind(it, 'INTEGER', (kind) => `range() takes integers, not ${kind}, as in Neo4j.`)
            );
            // A step written or given as 0 would never reach the end.
            const written = call.fn.arguments[2];
            const given = written !== undefined ? this.known(written) : undefined;
            if (given === 0 || given === BigInt(0) || (isInt(given) && given.isZero())) {
                throw new DrivineError('range() takes a step other than 0, as in Neo4j.');
            }
            const [from, to] = call.arguments.map((it) => this.numberOf(it));
            const step = call.arguments[2];
            return json(this.sql.range(from, to, step ? this.numberOf(step) : '1'), { list: true });
        },
        split: (call) => {
            if (call.arguments.length !== 2) {
                throw new DrivineError('split() takes a text and a separator.');
            }
            return json(
                this.sql.texts(
                    call.arguments.map((it) => this.jsonOf(it)),
                    ([text, separator]) => this.sql.split(text, separator)
                ),
                { list: true, texts: true }
            );
        },
        reverse: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const e = this.alias('e');
                    const reversed = this.sql.comparable(
                        json(this.sql.aggregateList(`${e}.item`, `${e}.item_no DESC`), { ordered: true })
                    );
                    return (
                        `CASE ${this.sql.typeOf(x)} WHEN 'string' THEN ${this.sql.texts([x], ([t]) =>
                            this.sql.reversedText(t)
                        )} ` + `WHEN 'array' THEN (SELECT ${reversed} FROM ${this.listElements(call.one(), x, e)}) END`
                    );
                }),
                {
                    items: this.itemsOf(call.one()),
                    itemItems: this.itemItemsOf(call.one()),
                    list: this.isList(call.one()),
                    itemLists: this.holdsLists(call.one()),
                    text: this.isText(call.one()),
                    texts: this.holdsTexts(call.one()),
                    temporals: this.holdsTemporals(call.one())
                }
            ),
        tail: (call) =>
            json(
                this.sql.shared([this.sql.comparable(this.asJson(call.one()))], ([x]) => {
                    const e = this.alias('e');
                    const rest = this.sql.comparable(
                        json(this.sql.aggregateList(`${e}.item`, `${e}.item_no`), { ordered: true })
                    );
                    return `CASE WHEN ${this.sql.typeOf(x)} = 'array' THEN (SELECT ${rest} FROM ${this.listElements(
                        call.one(),
                        x,
                        e
                    )} WHERE ${e}.item_no > 1) END`;
                }),
                {
                    items: this.itemsOf(call.one()),
                    itemItems: this.itemItemsOf(call.one()),
                    list: this.isList(call.one()),
                    itemLists: this.holdsLists(call.one()),
                    texts: this.holdsTexts(call.one()),
                    temporals: this.holdsTemporals(call.one())
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
        sign: (call) => json(this.sql.scalar(this.sql.signOf(this.numberOf(call.one())))),
        ltrim: (call) =>
            json(
                this.sql.texts([this.jsonOf(call.one())], ([t]) => this.sql.scalar(`LTRIM(${t})`)),
                { text: true }
            ),
        rtrim: (call) =>
            json(
                this.sql.texts([this.jsonOf(call.one())], ([t]) => this.sql.scalar(`RTRIM(${t})`)),
                { text: true }
            ),
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
            const substring = this.sql.texts([this.jsonOf(call.arguments[0])], ([read]) =>
                this.sql.scalar(
                    this.sql.shared([read], ([text]) => {
                        const start = this.countOf(call, 1, 'start', text);
                        const length = call.arguments.length === 3 ? `, ${this.countOf(call, 2, 'length', text)}` : '';
                        // The greatest start is past any text, so it is kept as it is rather than counted past Postgres's integer.
                        const position = this.sql.shared(
                            [start],
                            ([s]) => `CASE WHEN ${s} < ${MAX_COUNT} THEN ${s} + 1 ELSE ${s} END`
                        );
                        return `SUBSTR(${text}, ${position}${length})`;
                    })
                )
            );
            return json(substring, { text: true });
        },
        left: (call) => this.leftOrRight(call),
        right: (call) => this.leftOrRight(call),
        replace: (call) => {
            if (call.arguments.length !== 3) {
                throw new DrivineError('replace() takes a text, what to replace, and what with.');
            }
            // How long what to replace, and what with, are, in bytes, where the statement gives them.
            const [searchBytes, replacementBytes] = call.fn.arguments.slice(1).map((it) => {
                const given = this.given(it);
                return typeof given === 'string' ? Buffer.byteLength(given, 'utf8') : undefined;
            });
            return json(
                this.sql.texts(
                    call.arguments.map((it) => this.jsonOf(it)),
                    ([text, search, replacement]) =>
                        this.sql.scalar(this.sql.replaceText(text, search, replacement, searchBytes, replacementBytes))
                ),
                { text: true }
            );
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

    /**
     * Holds `query` among the {@link queries}: as {@link query} and {@link procedure} do, or first, for the queries of a
     * `UNION` compiled one by one, so a name made in one is named as no later one's variable is.
     */
    give(query: Query): void {
        this.queries.push(query);
    }

    /** The query `query` is, which reads and ends with a `RETURN`. */
    query(query: Query): string {
        this.give(query);
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
        this.give(query);
        let select = new Select(new Map());
        for (const clause of this.creates(query.clauses)) {
            if (clause.kind === 'Return') {
                this.sql
                    .returnRows(this.sql.planned(this.project(select, clause.projection, true).sql))
                    .forEach((it) => this.emit(it));
            } else {
                select = this.next(select, clause);
            }
        }
        return this.body;
    }

    private alias(prefix: string): string {
        return `${prefix}${++this.counter}`;
    }

    /**
     * A variable of {@link madeAnew}'s, new: named as no variable of the statement's is, nor begins, so one quoted alike,
     * `` `#anew2` `` or `` `#anew2 row` ``, is not taken for it, hidden from a star or read as its UUID.
     */
    private anewVariable(): string {
        textsIn(this.queries.splice(0), this.queryTexts);
        let name = this.alias(ANEW);
        while (this.queryTexts.has(name)) {
            name = this.alias(ANEW);
        }
        this.madeAnew.add(name);
        return name;
    }

    // ----- Clauses -----

    /**
     * A reading clause over the rows `select` reads, and the rows the clauses after it read: a `WITH` is a query of its
     * own. `outer` is what a subquery reads from the row it is in.
     */
    private read(select: Select, clause: Clause, outer: Scope = new Map()): Select {
        switch (clause.kind) {
            case 'Match':
                return this.match(select, clause);
            case 'Unwind': {
                const [rows, [list]] = this.anewBefore(select, [clause.list], true) ?? [select, [clause.list]];
                this.unwind(rows, { ...clause, list });
                return rows;
            }
            case 'With':
                return this.with(select, clause, outer);
            case 'Call':
                return this.anewCall(select, clause);
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
        const anew = clause.projection.items.some((item) => holdsAnew(item.expression));
        const sql = anew ? this.sql.once(projected.sql) : projected.sql;
        next.source(`(\n${indent(apart ? this.sql.called(sql) : sql)}\n) ${name}`);
        projected.scope.forEach((value, variable) => next.bind(variable, columnsOf(value, name)));
        projected.order.forEach(([column, descending]) => next.order.push([`${name}.${column}`, descending]));
        return clause.where ? this.filteredRows(next, clause.where) : next;
    }

    /**
     * The rows `select` reads kept where `where` holds; each randomUUID() it reads (`anew` tells one) made first, for each
     * row, as {@link anewBefore} makes it, then the condition over those rows.
     */
    private filteredRows(
        select: Select,
        where: Expression,
        anew: (expression: Expression) => boolean = isAnew
    ): Select {
        const [rows, [read]] = this.anewBefore(select, [where], true, anew) ?? [select, [where]];
        rows.where.push(this.keeps(read, rows.scope));
        return rows;
    }

    /**
     * The rows `select` reads with a UUID made for each, in a `WITH *` of its own, and its variable's name, which is no
     * variable of the statement's: see {@link project}.
     */
    private seededRows(select: Select): [Select, string] {
        const seed = this.anewVariable();
        const made: Projection = {
            distinct: false,
            star: true,
            items: [{ expression: RANDOM_UUID, name: seed }],
            orderBy: []
        };
        return [this.with(select, { kind: 'With', projection: made }, this.around(select), true), seed];
    }

    /** What `select` reads from around it: the variables of its scope it does not bind itself. */
    private around(select: Select): Scope {
        return new Map([...select.scope].filter(([variable]) => !select.bound.has(variable)));
    }

    /**
     * A `CALL { … }` over the rows `select` reads; one whose query holds a randomUUID() ({@link queryHoldsAnew}) first
     * given a UUID made for each row, in a `WITH *` of its own, which its query unwinds before its own clauses. A query
     * that reads nothing of the row it is joined to is worked out once for the statement, by each store, and every row
     * was given the same UUID (drivine4j#412): so it reads the row. That UUID, and the variable its query unwinds it to,
     * are no variables of the statement's: see {@link project}, and {@link calledScope}, which carries them into the query
     * whatever it imports.
     */
    private anewCall(select: Select, call: Call): Select {
        if (!queryHoldsAnew(call.query)) {
            this.call(select, call);
            return select;
        }
        const [rows, seed] = this.seededRows(select);
        const row = `${seed} row`;
        this.madeAnew.add(row);
        const read = (clauses: Clause[]): Clause[] => [
            { kind: 'Unwind', list: { kind: 'ListLiteral', items: [{ kind: 'Variable', name: seed }] }, variable: row },
            ...clauses
        ];
        const query: Query = {
            ...call.query,
            clauses: read(call.query.clauses),
            unions: call.query.unions.map((it) => ({ ...it, clauses: read(it.clauses) }))
        };
        this.call(rows, { ...call, query });
        return rows;
    }

    /**
     * A `MATCH` over the rows `select` reads. Each randomUUID() its condition reads is made for each row it finds, first
     * ({@link filteredRows}). An `OPTIONAL MATCH` finds its rows in a lateral query, which reads nothing of the row where its
     * pattern does not: Oracle worked it out once for the statement, and kept every row's match or none (drivine4j#412).
     * There each is read beside a UUID made first for the row ({@link seededRows}, {@link seeded}), so the lateral query
     * reads the row, then made for each row it finds. A shortest path's condition is met where its paths are found, in a
     * lateral query too, which Postgres worked out once where each row joins the same two nodes: each is read beside the
     * row's UUID there as well, and made in the condition.
     */
    private match(select: Select, match: Match): Select {
        // A shortest path is the shortest of the paths that meet the WHERE, as Cypher finds it: the WHERE is met where they are found.
        const shortestWhere =
            match.patterns[match.patterns.length - 1].shortest !== undefined ? match.where : undefined;
        const where = shortestWhere === undefined ? match.where : undefined;
        const seededFirst =
            match.where !== undefined && holdsAnew(match.where) && (match.optional || shortestWhere !== undefined);
        const [row, seed] = seededFirst ? this.seededRows(select) : [select, undefined];
        const metByPaths =
            shortestWhere !== undefined && seed !== undefined ? seeded(shortestWhere, seed, true) : shortestWhere;
        if (!match.optional) {
            this.patterns(row, match.patterns, metByPaths);
            return where ? this.filteredRows(row, where) : row;
        }
        return this.optionalMatch(row, match.patterns, metByPaths, where, seed);
    }

    /**
     * An `OPTIONAL MATCH` of `patterns` over the rows `row` reads, those of a shortest path's meeting `metByPaths` and
     * all of them `where`: what it finds read by a lateral query, joined to keep the row when it finds nothing. With
     * `seed`, the variable of a UUID made first for each row, each randomUUID() of `where` is read beside it.
     */
    private optionalMatch(
        row: Select,
        patterns: Pattern[],
        metByPaths: Expression | undefined,
        where: Expression | undefined,
        seed: string | undefined
    ): Select {
        let inner = new Select(row.scope);
        this.patterns(inner, patterns, metByPaths);
        if (where) {
            inner =
                seed === undefined
                    ? this.filteredRows(inner, where)
                    : this.filteredRows(inner, seeded(where, seed, true), isSeeded);
        }
        const outer = row.scope;
        const found = [...inner.bound].filter(([variable]) => !outer.has(variable) && !this.madeAnew.has(variable));
        if (found.length === 0 && inner.sources.length === 0) {
            return row;
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
        row.join(this.sql.lateral(text.join('\n'), name, true));
        named.forEach(([variable, value, column]) => row.bind(variable, columnsOf(value, name, column)));
        return row;
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
                ? this.calledPart(select, call, clauses, undefined, false)
                : this.calledUnion(select, call);
        this.rowOrder = order;
        this.redeclared([...projected.scope.keys()], [...select.bound.keys()]);
        const name = this.alias('c');
        select.join(this.sql.lateral(this.sql.called(projected.sql), name, call.optional));
        projected.scope.forEach((value, variable) =>
            // A value taken from a write's row is null here where the call finds nothing: it is read as returned.
            select.bind(
                variable,
                columnsOf(call.optional && value.kind === 'Json' ? { ...value, rowKeys: undefined } : value, name)
            )
        );
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
     * One query of `call`, `clauses`, for the row `select` reads: its returned items in the order `names` lists them,
     * where a `UNION` names them so, and kept distinct with `distinct`. It sees only the variables of the row it imports
     * ({@link calledScope}): any other name in it is a new variable, as in Cypher (#473). What its brackets import it
     * sees throughout, after a `WITH` that does not pass it on too, as Neo4j has it; what a leading `WITH` imports is gone
     * after one.
     */
    private calledPart(
        select: Select,
        call: Call,
        clauses: Clause[],
        names: string[] | undefined,
        distinct: boolean
    ): Projected {
        const imported = this.calledScope(call, clauses, select.scope);
        let inner = new Select(imported);
        const apart = this.importsApart(imported, clauses);
        if (apart) {
            inner.source(apart.source);
            apart.imports.forEach((value, variable) => inner.bind(variable, value));
        }
        const outer: Scope = bracketed(call) ? imported : new Map();
        clauses.slice(0, -1).forEach((it) => (inner = this.read(inner, it, outer)));
        const projection = (clauses[clauses.length - 1] as Return).projection;
        const items = names ? names.map((name) => projection.items.find((it) => it.name === name)!) : projection.items;
        return this.project(inner, { ...projection, items, distinct: distinct || projection.distinct }, false);
    }

    /**
     * The variables of the row, `scope`, that the query `clauses` of `call` sees: those it imports ({@link imports}), and
     * each the compiler made for it, whatever it imports. Those are no variables of the statement's: the UUID made for
     * each row that {@link anewCall} unwinds before the clauses, so a query holding a randomUUID() reads the row
     * (drivine4j#412). Imports are read from the clauses after that `UNWIND`, as the statement wrote them, so a leading
     * `WITH` imports still.
     */
    private calledScope(call: Call, clauses: Clause[], scope: Scope): Scope {
        const first = clauses.findIndex((it) => !(it.kind === 'Unwind' && this.madeAnew.has(it.variable)));
        const written = first < 0 ? [] : clauses.slice(first);
        const imported = imports(
            call,
            written,
            [...scope.keys()].filter((it) => !this.madeAnew.has(it))
        );
        return new Map([...scope].filter(([variable]) => imported.has(variable) || this.madeAnew.has(variable)));
    }

    /**
     * Where the query `clauses` of a `CALL { … }` aggregates, the variables of the row it is in, `scope`, read from a
     * query of no table of their own in the call's rows: that query, as a source, and the variables as read from it;
     * undefined where it aggregates nothing. Read from the row, a variable is of the row's query, not the call's: Postgres
     * takes an aggregate of it alone, `count(o)`, as one of the row's query, which it refuses in a FROM; Oracle's
     * aggregate reads a variable of an unwound row as null there, so `sum(i + o)` gave 0 (#429). Kept apart with
     * `boundSelect`, or Oracle merges it back. Bound as the call's own, so a `WITH *` a projection works out first carries
     * them: not a name the call binds itself, as a CALL within it yields one, and not where its `RETURN` and each `WITH`
     * is `*`, which would return them: a `WITH` of named items before a `RETURN *` passes on only those, as it does
     * without them.
     */
    private importsApart(scope: Scope, clauses: Clause[]): { source: string; imports: Scope } | undefined {
        const projections = clauses.flatMap((it) =>
            it.kind === 'With' || it.kind === 'Return' ? [it.projection] : []
        );
        const aggregates = (p: Projection): boolean =>
            [...p.items.map((it) => it.expression), ...p.orderBy.map((it) => it.expression)].some((it) =>
                contains(it, isAggregate)
            );
        if (!projections.some(aggregates) || projections.every((it) => it.star)) {
            return undefined;
        }
        const declared = new Set(
            clauses.flatMap((clause) => {
                switch (clause.kind) {
                    case 'Unwind':
                        return [clause.variable];
                    case 'Call':
                        return [clause.query.clauses, ...clause.query.unions.map((it) => it.clauses)].flatMap((it) => {
                            const last = it[it.length - 1];
                            return last.kind === 'Return' ? last.projection.items.map((item) => item.name) : [];
                        });
                    default:
                        return [];
                }
            })
        );
        const named = [...scope]
            .filter(([variable]) => !declared.has(variable))
            .map(([variable, value]): [string, Value, string] => [variable, value, this.alias('v')]);
        if (named.length === 0) {
            return undefined;
        }
        const name = this.alias('i');
        const selected = named.flatMap(([, value, column]) => columns(value, column));
        return {
            source: `(${this.sql.boundSelect(selected.join(', '))}) ${name}`,
            imports: new Map(named.map(([variable, value, column]) => [variable, columnsOf(value, name, column)]))
        };
    }

    /** A `UNION` in a `CALL { … }`: each query's rows, the same items of the same kinds, matched by name as Cypher matches them. */
    private calledUnion(select: Select, call: Call): Projected {
        const query = call.query;
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
        let projected = parts.map((it) => this.calledPart(select, call, it, names, distinct));
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
                projected = parts.map((it) => this.calledPart(select, call, it, names, distinct));
            } finally {
                this.identities = was;
            }
        }
        const sql = projected
            .map((it) => `SELECT * FROM (\n${indent(it.sql)}\n) ${this.alias('q')}`)
            .join(distinct ? '\nUNION\n' : '\nUNION ALL\n');
        // A value is of a temporal kind where each query makes it of that one. It is at keys of a write's row (`rowKeys`)
        // only where each query takes it from those: a property of it is read from the row there, which would read the
        // first query's value for every query's rows. It is read from an unwound item (`fromList`) only where each query
        // reads it from one.
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
                        rowKeys:
                            single(all.map((it) => (it?.rowKeys ? JSON.stringify(it.rowKeys) : undefined))) !==
                            undefined
                                ? value.rowKeys
                                : undefined,
                        fromList: all.every((it) => it?.fromList === true),
                        temporal: single(all.map((it) => it?.temporal)),
                        items: single(all.map((it) => it?.items)),
                        itemItems: single(all.map((it) => it?.itemItems)),
                        temporals: all.some((it) => it?.temporals === true),
                        text: all.every((it) => it?.text === true),
                        texts: all.every((it) => it?.texts === true),
                        // Its kind is known only where each query writes it as a value of that one.
                        known: single(all.map((it) => it?.known))
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
        select.source(this.listElements(list, items, name));
        // An item of a list of texts, or of a text, is a text; an item of a list that holds no null holds none.
        select.bind(
            unwind.variable,
            json(`${name}.item`, {
                temporal: this.itemsOf(list),
                items: this.itemItemsOf(list),
                temporals: this.itemTemporalsOf(list),
                list: this.holdsLists(list),
                text: this.holdsTexts(list) || this.isText(list),
                flat: this.isFlat(list),
                fromList: true
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
            inner.where.push(this.keeps(where, inner.scope));
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
        select.join(this.sql.lateral(text, name, false));
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
                ...(group.where ? [this.keeps(group.where, within)] : [])
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
                .map(([key, value]) => {
                    // A property holds no null, as a graph engine stores none in a list.
                    const compiled = this.expression(value, scope);
                    return this.equality(
                        json(this.sql.propertyOf(props, key), { flat: true }),
                        compiled,
                        value,
                        this.scalarValued(value, scope) || this.isFlat(compiled)
                    );
                })
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
        this.selectInto(`SELECT ${sql} INTO ${variable}`);
    }

    /** The query `query`, a `SELECT … INTO`, as a statement of the procedure, with what the store's planner is told of it. */
    private selectInto(query: string): void {
        this.emit(`${this.sql.planned(query)};`);
    }

    /** The head of a loop over each row of the query `query`, as `RECORD`, with what the store's planner is told of it. */
    private loop(query: string): void {
        this.emit(`FOR ${RECORD} IN (${this.sql.planned(query)}) LOOP`);
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
        this.selectInto(
            [`SELECT ${list} INTO ${ROWS}`, ...this.from(select), ...optional(select.whereClause())].join('\n')
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
    private row(needed?: Set<string>, written: boolean = false): Select {
        const select = new Select(new Map());
        this.bindRow(select, ROW, needed, written);
        return select;
    }

    /**
     * Binds into `select` each variable the row `row` holds, of `needed` where given: a node or a relationship is read
     * from its table, as it is now. With `written`, `row` is `ROW`, and a value and each property of it are read as
     * {@link SqlCypherCompiler.rowValue} reads them, for a statement that works out what a write writes. Each is of its
     * kind in `held`, and a value as it was carried in `values`: those of the rows now, but for a row held from before.
     */
    private bindRow(
        select: Select,
        row: string,
        needed?: Set<string>,
        written: boolean = false,
        held: Map<string, Kind> = this.kinds,
        values: Map<string, JsonValue> = this.carried
    ): void {
        held.forEach((kind, variable) => {
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
                const was = values.get(variable);
                select.bind(
                    variable,
                    json(written ? this.sql.rowValue([key]) : this.sql.propertyOf(row, key), {
                        temporal: was?.temporal,
                        items: was?.items,
                        itemItems: was?.itemItems,
                        temporals: was?.temporals,
                        list: was?.list,
                        itemLists: was?.itemLists,
                        text: was?.text,
                        texts: was?.texts,
                        flat: was?.flat,
                        rowKeys: written ? [key] : undefined,
                        fromList: !written,
                        known: was?.known
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
            read.some(holdsSubquery) ? undefined : new Set(read.flatMap((it) => [...variablesIn(it)])),
            true
        );
        this.selectInto([`SELECT ${value(select.scope)} INTO ${variable}`, ...this.from(select)].join('\n'));
    }

    /** One write: made for each row of `ROWS` in turn, and the rows it leaves put back there. */
    private write(clause: Clause): void {
        this.assign(OUT, this.sql.literalJson([]));
        const deleting = clause.kind === 'Delete' && !clause.detach;
        if (deleting) {
            this.assign(DOOMED, this.sql.literalJson([]));
        }
        const r = this.alias('r');
        this.loop(`SELECT ${r}.item FROM ${this.sql.elements(ROWS, r)} ORDER BY ${r}.item_no`);
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
            this.selectInto(
                `SELECT count(*) INTO ${COUNT} FROM ${this.sql.edges} WHERE src IN (${doomed}) OR dst IN (${doomed})`
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
        // Only what the call imports is seen in it: any other name in it is a new variable, as in Cypher (#473).
        const imported = imports(call, call.query.clauses, before.keys());
        const clauses = this.imported(call, imported);
        // Read again after each WITH, where brackets import them: see below.
        const rebound = bracketed(call) && clauses.some((it) => it.kind === 'With');
        const importedOf = <T>(all: Map<string, T>): Map<string, T> =>
            new Map([...all].filter(([variable]) => imported.has(variable)));
        this.eachRow(kept, () => {
            if (returned || rebound) {
                this.emit(`${caller} := ${RECORD}.item;`);
            }
            this.restore(importedOf(before), importedOf(carriedBefore));
            let select = this.rows();
            for (const clause of clauses) {
                if (clause.kind === 'Return') {
                    select = this.with(select, { kind: 'With', projection: clause.projection });
                } else if (clause.kind === 'With' && rebound) {
                    // What brackets import is seen throughout the call, as Neo4j has it, after a WITH that does not pass
                    // it on too: read again from the row the call is written for, so `CALL (a) { WITH 1 AS one CREATE
                    // (a)-[:R]->() }` joins the row's a, not a new node. Its WHERE reads them too, so it is met after.
                    const w = this.with(select, { ...clause, where: undefined });
                    const dropped = new Set([...imported].filter((it) => !w.scope.has(it)));
                    this.bindRow(w, caller, dropped, false, before, carriedBefore);
                    select = clause.where ? this.filteredRows(w, clause.where) : w;
                } else {
                    select = this.next(select, clause);
                }
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
                this.selectInto(`SELECT ${all} INTO ${gathered} FROM (${both}) ${g}`);
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
        this.loop(`SELECT ${r}.item FROM ${this.sql.elements(rows, r)} ORDER BY ${r}.item_no`);
        this.depth++;
        this.assign(ROWS, this.sql.appended(this.sql.literalJson([]), `${RECORD}.item`));
        this.unread = undefined;
        body();
        this.depth--;
        this.emit('END LOOP;');
    }

    /**
     * The clauses of `call` without a `WITH` that opens them and passes on variables it `imports` alone, as they are:
     * the row holds those already, and what brackets import is seen after it anyway, as Neo4j has it, so
     * `CALL (a, b) { WITH a SET b.x = 1 }` sets b's.
     */
    private imported(call: Call, imports: Set<string>): Clause[] {
        const clauses = call.query.clauses;
        const first = clauses[0];
        if (first?.kind !== 'With') {
            return clauses;
        }
        const projection = first.projection;
        const importing =
            plainWith(first) &&
            projection.items.every((it) => it.expression.kind === 'Variable' && it.expression.name === it.name) &&
            (projection.star || projection.items.every((it) => imports.has(it.name)));
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
        this.emit(`FOR ${MATCHED} IN (\n${indent(this.sql.planned(match.join('\n')))}\n) LOOP`);
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
            case 'Property': {
                propertyOfKind(item.value);
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
            }
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
            // As in Neo4j, a star gives the variables in the order of their names, before the items named after it: not
            // a randomUUID() made first for a CALL or a condition (see anewCall), which the statement never named.
            ...(projection.star
                ? [...select.bound.keys()]
                      .filter((it) => !this.madeAnew.has(it))
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
            this.carriedOut(this.aggregating(item.expression, () => this.item(item.expression, select)))
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
            compared,
            aggregating
        );
        const groupBy = aggregating ? this.groupBy(select, items, itemColumns) : [];
        const inner = [
            `SELECT ${projection.distinct ? 'DISTINCT ' : ''}${selectList.join(',\n       ')}`,
            ...select.from(),
            ...optional(select.whereClause()),
            ...(groupBy.length > 0 ? [`GROUP BY ${groupBy.join(', ')}`] : [])
        ].join('\n');
        // What sorts a term in the query that reads this one: worked out there, of the column carried out, or that column.
        // Each is named for the query after it, which sorts by them in turn: the last by the term's column, any before it,
        // where its kind comes (openSortKey), by that column with a number after it.
        const sortedBy = (column: string): [string, string][] => {
            const terms = after.get(column) ?? sorted.get(column)?.(`${name}.${column}`) ?? [`${name}.${column}`];
            return terms.map((term, i): [string, string] => [
                i === terms.length - 1 ? column : `${column}_${i + 1}`,
                term
            ]);
        };
        const order = sorts.flatMap(([column, descending]) =>
            sortedBy(column).map(([named]): [string, boolean] => [named, descending])
        );
        const outerColumns = this.outerColumns(final, itemColumns, name, sorts, sortedBy);
        const ordered = sorts.flatMap(([column, descending]) =>
            sortedBy(column).map(([, term]) => `${term}${descending ? ' DESC' : ''}`)
        );
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
        return { sql: outer, scope, order };
    }

    /**
     * The rows `select` reads with what the projection reads of them worked out first, in a `WITH` of its own, and the
     * projection over that: see {@link anewFirst}, {@link casesFirst}, {@link sharedFirst}, {@link aggregatesFirst} and {@link heldFirst}. Undefined where none
     * is.
     */
    private workedOutFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        return (
            this.anewFirst(select, projection, items) ??
            this.casesFirst(select, projection, items) ??
            // After casesFirst, which refuses what it must of an aggregate's CASE before working it out first.
            this.sharedFirst(select, projection, items) ??
            this.aggregatesFirst(select, projection, items) ??
            this.heldFirst(select, projection, items)
        );
    }

    /**
     * The rows `select` reads with each randomUUID() that a term of the projection reads inside a larger expression made
     * first ({@link anewBefore}), and the projection with the term reading that UUID's column; undefined where there is
     * none. A term that is a randomUUID() alone is a column of the projection already. Two items written alike are given
     * a UUID each, as in Neo4j; an order term written as an item reads that item's, as Neo4j sorts by the item.
     */
    private anewFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        const itemTerms = items.map((it) => it.expression);
        const orderTerms = new Map<string, Expression>();
        projection.orderBy.forEach((sort) => {
            if (!itemTerms.some((it) => sameExpression(it, sort.expression))) {
                orderTerms.set(expressionKey(sort.expression), sort.expression);
            }
        });
        const made = this.anewBefore(select, [...itemTerms, ...orderTerms.values()], false);
        if (!made) {
            return undefined;
        }
        const [rows, read] = made;
        const reads = new Map<string, Expression>();
        [...itemTerms, ...orderTerms.values()].forEach((term, i) => {
            const key = expressionKey(term);
            if (!reads.has(key)) {
                reads.set(key, read[i]);
            }
        });
        const kept: Projection = {
            ...projection,
            star: false,
            items: items.map((item, i) => ({ ...item, expression: read[i] })),
            orderBy: projection.orderBy.map((it) => ({ ...it, expression: reads.get(expressionKey(it.expression))! }))
        };
        return [rows, kept];
    }

    /**
     * The rows `select` reads with each randomUUID() that `terms` read made first, for each row, in a `WITH *` of its own,
     * and each term as it reads that UUID's column, in their order; undefined where there is none, or, where not `whole`,
     * where each is a term alone. Worked out in the term, the UUID could be bound in a subquery that reads nothing of the
     * row ({@link SqlCypherCompiler.shared}), or read in a comprehension's subquery that reads nothing of it either, and
     * each store works such a subquery out once for the statement: every row was given the same UUID (drivine4j#412).
     * Made first, it is a column of the row, as a `WITH`'s own randomUUID() is ({@link SqlCypherCompiler.once}). One in a
     * comprehension's, a quantifier's, a reduce's or a pattern comprehension's own expressions is made again for each
     * item there, as in Neo4j: it is read beside a UUID made first for the row ({@link seeded}), so that subquery reads
     * the row. Each call is a UUID of its own, in two terms written alike too, as in Neo4j, where
     * `randomUUID() = randomUUID()` is false. `anew` tells a call: see {@link match} for another.
     */
    private anewBefore(
        select: Select,
        terms: Expression[],
        whole: boolean,
        anew: (expression: Expression) => boolean = isAnew
    ): [Select, Expression[]] | undefined {
        // A call read beside a row's UUID already (isSeeded) reads the row: left as it is, as a call alone is.
        const alone = (term: Expression): boolean => anew(term) || isSeeded(term);
        const holds = (e: Expression): boolean => anew(e) || (!isSeeded(e) && children(e).some(holds));
        const inBodies = terms.some((it) => !sameExpression(seeded(it, ANEW), it));
        if (!inBodies && !terms.some((it) => (whole || !alone(it)) && holds(it))) {
            return undefined;
        }
        const made: ProjectionItem[] = [];
        let seed: string | undefined;
        if (inBodies) {
            seed = this.anewVariable();
            made.push({ expression: RANDOM_UUID, name: seed });
        }
        const reads = terms.map((term) => {
            if (!whole && alone(term)) {
                return term;
            }
            const read = replaced(term, (e): Expression | undefined => {
                if (anew(e)) {
                    const name = this.anewVariable();
                    made.push({ expression: e, name });
                    return { kind: 'Variable', name };
                }
                return isSeeded(e) ? e : undefined;
            });
            return seed === undefined ? read : seeded(read, seed);
        });
        const projection: Projection = { distinct: false, star: true, items: made, orderBy: [] };
        // Kept apart, as sharedFirst keeps its own, so no store merges it back into the query that reads it.
        return [this.with(select, { kind: 'With', projection }, this.around(select), true), reads];
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
        sortedBy: (column: string) => [string, string][]
    ): string {
        if (final) {
            const values = itemColumns.map(([column, value]) => this.asJson(columnsOf(value, name, column)));
            return `${values.length === 1 ? values[0].sql : this.sql.jsonArray(values.map((it) => it.sql))} AS result`;
        }
        return [
            ...itemColumns.flatMap(([column, value]) =>
                columns(value, column).map((it) => `${name}.${it.substring(it.lastIndexOf(' AS ') + 4)}`)
            ),
            ...sorts.flatMap(([column]) => sortedBy(column).map(([named, term]) => `${term} AS ${named}`))
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
        compared: boolean,
        aggregating: boolean
    ): Sorted {
        const byName: Scope = new Map(
            items.map((item, i) => [item.name, columnsOf(itemColumns[i][1], name, itemColumns[i][0])])
        );
        const after = new Map<string, string[]>();
        // A term worked out in the query is sorted by in the query that reads it: the value carried out as a column, and
        // what sorts it (JSON's null as SQL's) worked out of that column. Oracle (23.26), sorting by a value that reads
        // the row more than once beside a variable-length walk, closes the session.
        const sorted = new Map<string, (column: string) => string[]>();
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
            const overItems = aggregating ? this.overItems(sort.expression, items, byName) : undefined;
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
            } else if (overItems !== undefined) {
                // Where rows are grouped, so is one whose every aggregate and key is an item, each such part read by its
                // item's name, as aggregatesFirst reads it: worked out in the query, each key is read again as the GROUP BY
                // reads it (keysRead), on Oracle through its text (itemProperty), at each level of an operation over it, and
                // `me.age + count(you.age)` compiled to twice what it did before (liberation-data/drivine4j#413).
                after.set(column, this.sortable(this.expression(overItems, byName)));
            } else {
                // One that aggregates reads the rows it aggregates, as an item does; so does one that reads an aggregate
                // aggregatesFirst worked out first, which no item is. Beside a variable-length walk it binds no value in a
                // subquery: carried out of a WITH's query, one so bound closes Oracle's (23.26) session (ORA-03113), as
                // `WITH b ORDER BY toString(coalesce(b.name, b.title))` did, its argument long enough to be bound. Elsewhere
                // it does, so operations nested in it compile to a statement that grows with them, not exponentially.
                // Where rows are grouped, a part of it that is an item keying the groups reads that item's column value, as
                // the GROUP BY does: Oracle refuses another read of the key (ORA-00979), as `me.age` read from the
                // properties beside `me.age AS age` read through its text (itemProperty) was (liberation-data/drivine4j#413).
                const [read, keys] = aggregating
                    ? this.keysRead(sort.expression, items, itemColumns)
                    : [sort.expression, new Map<string, Value>()];
                const scope = new Map([...select.scope, ...compiled, ...keys]);
                const term = (): void => carried(column, () => this.expression(read, scope), sort.expression);
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

    /**
     * `term`, an order term of a grouping projection, with each part of it that is one of `items` read by that item's
     * name, where so it reads no aggregate, no subquery and nothing but the items, `byName`; undefined where it does. A
     * variable an item is named after is that item, not the variable of that name before it.
     */
    private overItems(term: Expression, items: ProjectionItem[], byName: Scope): Expression | undefined {
        const read = replaced(term, (part): Expression | undefined => {
            if (part.kind === 'Variable' && byName.has(part.name)) {
                return part;
            }
            const named = items.find((it) => sameExpression(it.expression, part))?.name;
            return named !== undefined ? { kind: 'Variable', name: named } : undefined;
        });
        return !holdsSubquery(read) &&
            !contains(read, isAggregate) &&
            [...variablesIn(read)].every((it) => byName.has(it))
            ? read
            : undefined;
    }

    /**
     * `term`, each part of it that is an item of a grouping projection keying the groups, one of `items`, read by a name
     * no variable has, and what each such name is bound to: the item's value among `itemColumns`, as it is grouped by.
     * {@link replaced} reads no comprehension's, quantifier's or reduce's own expressions, so a part it reads is never one
     * whose variables such a one binds again: a key is read beside `[me IN [1] | me]` as anywhere else.
     */
    private keysRead(
        term: Expression,
        items: ProjectionItem[],
        itemColumns: [string, Value][]
    ): [Expression, Map<string, Value>] {
        const keys = new Map<string, number>();
        items.forEach((item, i) => {
            const key = expressionKey(item.expression);
            if (!contains(item.expression, isAggregate) && variablesIn(item.expression).size > 0) {
                keys.set(key, i);
            }
        });
        const bound = new Map<string, Value>();
        const read = replaced(term, (part): Expression | undefined => {
            const i = keys.get(expressionKey(part));
            if (i === undefined) {
                return undefined;
            }
            // Named as no variable is, unless quoted so.
            const name = `#key ${i + 1}`;
            bound.set(name, itemColumns[i][1]);
            return { kind: 'Variable', name };
        });
        return [read, bound];
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
     * The rows `select` reads with each aggregate's argument that {@link SqlCypherCompiler.shared} would bind a value in
     * worked out first, in a `WITH *` of its own, and the projection with the aggregate of that argument read from there;
     * undefined where there is none. An aggregate's argument is compiled with no value bound ({@link aggregating}): bound
     * in a subquery around the aggregate, a value would be taken from the group the aggregate reads, which no store reads
     * from a subquery's FROM. Unbound, an operation that reads its operands more than once writes them out again at each
     * level, and `count(t + duration({minutes: i}))` compiled to megabytes (drivine4j#333). Worked out first, for each
     * row, the argument binds its values as any item does, and the aggregate reads its column, as it does where a `WITH`
     * works it out first in the statement itself.
     */
    private sharedFirst(
        select: Select,
        projection: Projection,
        items: ProjectionItem[]
    ): [Select, Projection] | undefined {
        if (!this.sql.sharing) {
            return undefined;
        }
        // Order terms too, beside a variable-length walk as well: there `sorts` binds no value in one that is none of the
        // items, so worked out here, in a WITH's item, is the only place its aggregate's argument binds one.
        const terms = [...items.map((it) => it.expression), ...projection.orderBy.map((it) => it.expression)];
        const argumentsOf = new Map<string, Expression>();
        terms.forEach((term) =>
            contains(term, (e) => {
                if (isAggregate(e) && e.kind === 'Function') {
                    e.arguments.forEach((argument) => {
                        const key = expressionKey(argument);
                        if (!argumentsOf.has(key) && this.binds(argument, select)) {
                            argumentsOf.set(key, argument);
                        }
                    });
                }
                return false;
            })
        );
        if (argumentsOf.size === 0) {
            return undefined;
        }
        // Named as no variable is, unless quoted so.
        const names = new Map([...argumentsOf.keys()].map((key) => [key, `#shared${++this.counter}`]));
        const withProjection: Projection = {
            distinct: false,
            star: true,
            items: [...argumentsOf].map(([key, argument]) => ({ expression: argument, name: names.get(key)! })),
            orderBy: []
        };
        const shared = (expression: Expression): Expression =>
            replaced(expression, (term) =>
                isAggregate(term) && term.kind === 'Function'
                    ? {
                          ...term,
                          arguments: term.arguments.map((argument) => {
                              const name = names.get(expressionKey(argument));
                              return name !== undefined ? { kind: 'Variable', name } : argument;
                          })
                      }
                    : undefined
            );
        const kept: Projection = {
            ...projection,
            star: false,
            items: items.map((it) => ({ ...it, expression: shared(it.expression) })),
            orderBy: projection.orderBy.map((it) => ({ ...it, expression: shared(it.expression) }))
        };
        // Kept apart, as casesFirst keeps its own, so no store merges it back into the query that aggregates.
        const outer: Scope = new Map([...select.scope].filter(([variable]) => !select.bound.has(variable)));
        return [this.with(select, { kind: 'With', projection: withProjection }, outer, true), kept];
    }

    /**
     * Whether {@link SqlCypherCompiler.shared} binds a value in `expression`, compiled over the rows `select` reads.
     * Compiled only to see: the names it takes and the functions it declares (a `reduce`'s on Oracle) are given back, so
     * a statement whose aggregates bind nothing compiles as it did.
     */
    private binds(expression: Expression, select: Select): boolean {
        const counter = this.counter;
        try {
            return this.sql.binds(() => this.expression(expression, select.scope));
        } finally {
            this.counter = counter;
        }
    }

    /**
     * Whether an operation over an aggregate's result in `term`, which is no aggregate itself, would bind a value in a
     * subquery ({@link SqlCypherCompiler.boundIn}): each aggregate in it compiled as it is, with nothing bound
     * ({@link aggregating}), and the operations over them with {@link SqlCypherCompiler.shared} on. Compiled only to see,
     * as {@link binds} is. An order term reads each item it names, in `named`, by its name: the item's value, compiled
     * over the rows `select` reads as `project` compiles it, is bound to that name, so a comprehension's own name hides it
     * as it hides any variable, and the item's expression is never read where a comprehension binds its variables.
     */
    private bindsOverAggregates(term: Expression, select: Select, named: Map<string, Expression> = new Map()): boolean {
        if (isAggregate(term) || !contains(term, isAggregate)) {
            return false;
        }
        const counter = this.counter;
        try {
            return this.sql.toSee(() => {
                // Each item compiled as `project` compiles it, with shared on where it does not aggregate, lest one nested
                // deep be written out again at each level; what it binds is its own, not the term's.
                const variables = variablesIn(term);
                const items: [string, Value][] = [...named]
                    .filter(([name]) => variables.has(name))
                    .map(([name, item]) => [name, this.aggregating(item, () => this.expression(item, select.scope))]);
                const results: [string, Value][] = [];
                // Named as no variable is, unless quoted so.
                const over = replaced(term, (part) => {
                    if (!isAggregate(part)) {
                        return undefined;
                    }
                    const name = `#over${results.length + 1}`;
                    results.push([name, this.unshared(() => this.expression(part, select.scope))]);
                    return { kind: 'Variable', name };
                });
                const scope: Scope = new Map([...select.scope, ...items, ...results]);
                return this.sql.boundIn(() => this.expression(over, scope));
            });
        } finally {
            this.counter = counter;
        }
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
     * So too where an operation over an aggregate's result would bind a value ({@link bindsOverAggregates}): in the query
     * that aggregates, nothing is bound ({@link aggregating}), so `max(n.title) + ': ' + max(n.first) + ' ' + max(n.last)`
     * wrote each aggregate out again at every level, past the longest text JavaScript holds on Oracle, and
     * `head(collect(n.t)) CONTAINS $x` read the aggregate from the subquery Oracle's search of a long text binds
     * (ORA-00937); over the aggregates' columns, the operation binds its values as any item does (#414). Undefined where
     * the projection does none of these.
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
        // An order term reads an item by its name.
        const byName = new Map(items.map((it) => [it.name, it.expression]));
        if (
            !terms.some((it) => contains(it, collectsDistinct) || contains(it, iteratesAggregate)) &&
            !items.some((it) => this.bindsOverAggregates(it.expression, select)) &&
            !projection.orderBy.some((it) => this.bindsOverAggregates(it.expression, select, byName))
        ) {
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
        const keptProjection: Projection = {
            ...projection,
            star: false,
            items: items.map((it) => ({ ...it, expression: replaced(it.expression, kept) })),
            orderBy: projection.orderBy.map((sort) => ({
                ...sort,
                expression: replaced(sort.expression, (term) => {
                    if (term.kind === 'Variable' && byName.has(term.name)) {
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

    /**
     * `where`, a condition that keeps the rows it is true of, as SQL: within it, a comparison whose truth is all a `WHERE`
     * reads (one of its conditions joined by `AND` or `OR`) may be false where Cypher's is null, as neither keeps a row.
     */
    private keeps(where: Expression, scope: Scope): string {
        this.filtering = true;
        try {
            return this.condition(this.expression(where, scope));
        } finally {
            this.filtering = false;
        }
    }

    /**
     * The value `expression` gives in `scope`, marked {@link JsonValue.flat} where it is known to hold no null in a list
     * or a map, and with its {@link JsonValue.known} kind where the statement writes it as a value of one.
     */
    private expression(expression: Expression, scope: Scope): Value {
        const outer = this.filtering;
        // Only a condition joined by AND or OR is read for its truth alone: NOT, a CASE or a function reads null apart from false.
        this.filtering =
            outer && expression.kind === 'Binary' && (expression.operator === 'AND' || expression.operator === 'OR');
        this.filtered = outer;
        let value: Value;
        try {
            value = this.expressions[expression.kind](expression, scope);
        } finally {
            this.filtering = outer;
        }
        if (value.kind === 'Json' && value.known === undefined) {
            const known = this.knownKind(expression, scope);
            if (known !== undefined) {
                value = { ...value, known };
            }
        }
        if ((value.kind === 'Json' || value.kind === 'Entities') && !value.flat && this.flat(expression, scope)) {
            return { ...value, flat: true };
        }
        return value;
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
            itemItems: this.itemKindOf(list.items.map((it, i) => [it, items[i]])),
            temporals: items.some((it) => this.hasTemporals(it)),
            list: true,
            itemLists: entities.length > 0 && entities.every((it) => this.isList(it)),
            texts: items.every((it) => this.isText(it))
        });
    }

    private index(index: Index, scope: Scope): Value {
        this.indexOfKind(index, scope);
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
                items: this.itemItemsOf(value),
                identity: this.identityTaken(value, item, true, (it) => this.sql.element(it, at)),
                list: this.holdsLists(value),
                text: this.holdsTexts(value),
                temporals: this.itemTemporalsOf(value)
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
            items: this.itemItemsOf(value),
            identity: this.identityTaken(value, taken, true, take),
            list: this.holdsLists(value),
            text: this.holdsTexts(value),
            temporals: this.itemTemporalsOf(value)
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
                const items = `SELECT ${e}.item AS item, ${e}.item_no AS item_no, COUNT(*) OVER () AS cnt FROM ${this.listElements(
                    listed,
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
            itemItems: this.itemItemsOf(listed),
            list: true,
            itemLists: this.holdsLists(listed),
            texts: this.holdsTexts(listed),
            temporals: this.holdsTemporals(listed)
        });
    }

    /**
     * The kind of value `expression` is in `scope`, where the statement writes it as one ({@link JsonValue.known}): a
     * literal, a negated number, a list or a map written, or a variable bound to one. Read from the statement alone,
     * compiling nothing, so a check may run before its operand is compiled. Undefined where the kind is left open, as it is
     * for a property, a parameter or a function's value: Neo4j checks those when the row is read.
     */
    private knownKind(expression: Expression, scope: Scope): Known | undefined {
        switch (expression.kind) {
            case 'Literal':
                return knownOf(expression.value);
            case 'Unary': {
                const operand = this.knownKind(expression.operand, scope);
                return expression.operator === 'NEGATE' && (operand === 'INTEGER' || operand === 'FLOAT')
                    ? operand
                    : undefined;
            }
            case 'ListLiteral':
                return 'LIST';
            case 'MapLiteral':
                return 'MAP';
            case 'Variable': {
                const value = scope.get(expression.name);
                return value?.kind === 'Json' ? value.known : undefined;
            }
            default:
                return undefined;
        }
    }

    /**
     * Refuses `index`, `subject[index]`, where the statement writes its subject as a value that is no list or map, or its
     * index as a value of a kind its subject is not indexed by ({@link knownKind}): a list by an integer, a map by a text.
     * As Neo4j refuses it; where the subject's kind is left open, it is compiled as before. An index given as a parameter
     * is of its value's kind: the statement is compiled for each call, and its SQL is already made by that value, a text
     * read as a property and a number as an item, so one of the other kind would be read as neither.
     */
    private indexOfKind(index: Index, scope: Scope): void {
        const subject = this.knownKind(index.subject, scope);
        if (subject === undefined) {
            return;
        }
        if (subject !== 'LIST' && subject !== 'MAP') {
            throw new DrivineError(
                `${capitalNounOf(subject)} is not a list or a map, and is indexed as one, as in Neo4j.`
            );
        }
        const by: Known = subject === 'LIST' ? 'INTEGER' : 'TEXT';
        const kind =
            this.knownKind(index.index, scope) ??
            (index.index.kind === 'Parameter' ? knownOf(this.known(index.index)) : undefined);
        if (kind !== undefined && kind !== by) {
            throw new DrivineError(
                `${capitalNounOf(subject)} is indexed by ${nounOf(by)}, not ${nounOf(kind)}, as in Neo4j.`
            );
        }
    }

    /** Refuses `binary` where it is `IN` a value the statement writes as one of a kind other than a list ({@link knownKind}), as Neo4j refuses it. */
    private inOfKind(binary: Binary, scope: Scope): void {
        const kind = binary.operator === 'IN' ? this.knownKind(binary.right, scope) : undefined;
        if (kind !== undefined && kind !== 'LIST') {
            throw new DrivineError(`IN takes a list, not ${nounOf(kind)}, as in Neo4j.`);
        }
    }

    /** Refuses `expression`, an operand of `operator`, where its kind is known ({@link knownKind}) to be other than a truth value, as Neo4j refuses it. */
    private requireCondition(expression: Expression, scope: Scope, operator: string): void {
        const kind = this.knownKind(expression, scope);
        if (kind !== undefined && kind !== 'BOOLEAN') {
            throw new DrivineError(`${operator} takes a truth value, not ${nounOf(kind)}, as in Neo4j.`);
        }
    }

    /**
     * Refuses `value`, an argument, where the statement writes it as a value of a kind ({@link JsonValue.known}) other than
     * `allowed`, with the `message` of that kind's noun, as Neo4j refuses it when it plans the statement. A value whose kind
     * the statement leaves open is compiled as before.
     */
    private requireKind(value: Value, allowed: Known, message: (noun: string) => string): void {
        const kind = value.kind === 'Json' ? value.known : undefined;
        if (kind !== undefined && kind !== allowed) {
            throw new DrivineError(message(nounOf(kind)));
        }
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
            const filter = comprehension.where ? ` WHERE ${this.keeps(comprehension.where, inner)}` : '';
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
            itemItems: projected !== undefined ? this.itemsOf(projected) : undefined,
            list: true,
            itemLists: projected !== undefined && this.isList(projected),
            temporals: projected !== undefined && this.hasTemporals(projected)
        });
    }

    /** A list comprehension over a list of values. */
    private valueComprehension(comprehension: ListComprehension, listed: Value, scope: Scope): Value {
        const list = this.sql.comparable(this.asJson(listed));
        const name = this.alias('x');
        const inner: Scope = new Map([
            ...scope,
            [
                comprehension.variable,
                json(`${name}.item`, {
                    temporal: this.itemsOf(listed),
                    items: this.itemItemsOf(listed),
                    temporals: this.itemTemporalsOf(listed),
                    list: this.holdsLists(listed)
                })
            ]
        ]);
        const projected = comprehension.projection ? this.expression(comprehension.projection, inner) : undefined;
        const projection = projected ? this.asJson(projected).sql : `${name}.item`;
        const filter = comprehension.where ? ` WHERE ${this.keeps(comprehension.where, inner)}` : '';
        // Of null, null, as in Cypher, and not an empty list.
        return json(
            this.sql.shared(
                [list],
                ([items]) =>
                    `CASE WHEN NOT ${this.sql.isJsonNull(items)} THEN (SELECT ${this.sql.aggregateList(
                        projection,
                        `${name}.item_no`
                    )} ` + `FROM ${this.listElements(listed, items, name)}${filter}) END`
            ),
            {
                ordered: true,
                items: projected ? (projected.kind === 'Json' ? projected.temporal : undefined) : this.itemsOf(listed),
                itemItems: projected ? this.itemsOf(projected) : this.itemItemsOf(listed),
                temporals: projected ? this.hasTemporals(projected) : this.holdsTemporals(listed),
                list: true,
                itemLists: projected ? this.isList(projected) : this.holdsLists(listed)
            }
        );
    }

    private reduce(reduce: Reduce, scope: Scope): Value {
        const start = this.expression(reduce.initial, scope);
        const initial = this.sql.comparable(this.asJson(start));
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
                [
                    reduce.variable,
                    json(item, { temporal: this.itemsOf(listed), temporals: this.itemTemporalsOf(listed) })
                ]
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
                                json(this.sql.propertyOf(map, it), {
                                    temporal: of?.temporal,
                                    items: of?.items,
                                    known: of?.known
                                })
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
            ),
            // It may hold what its start, its list or a value of the row its step reads holds (#347).
            {
                temporals:
                    this.hasTemporals(start) ||
                    this.hasTemporals(listed) ||
                    read.some((it) => this.hasTemporals(scope.get(it)!))
            }
        );
    }

    private patternComprehension(comprehension: PatternComprehension, scope: Scope): Value {
        const inner = new Select(scope);
        this.patterns(inner, [comprehension.pattern]);
        if (comprehension.where) {
            inner.where.push(this.keeps(comprehension.where, inner.scope));
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
            itemItems: this.itemsOf(projected),
            list: true,
            itemLists: this.isList(projected),
            temporals: this.hasTemporals(projected)
        });
    }

    private quantifier(quantifier: Quantifier, scope: Scope): Value {
        // Read by a WHERE for its truth alone, a quantifier that is null may be false, as neither keeps a row.
        const filter = this.filtered;
        const listed = this.expression(quantifier.list, scope);
        const name = this.alias('q');
        const quantified = (from: string, item: Value, listNull: string): string => {
            const inner: Scope = new Map([...scope, [quantifier.variable, item]]);
            const exists = (condition: string): string => `EXISTS (SELECT 1 ${from} WHERE ${condition})`;
            const kind = quantifier.of;
            const where = quantifier.where;
            let value: string;
            if (filter && kind !== 'SINGLE') {
                // any() is true where an item's condition is true, and all() where each one's is: each is kept where its condition
                // is true, as a WHERE keeps a row, so an IN in it is false where it is null. none() is true where each one's is false.
                const condition = !where
                    ? 'TRUE'
                    : kind === 'NONE'
                    ? this.condition(this.expression(where, inner))
                    : this.keeps(where, inner);
                value =
                    kind === 'ANY'
                        ? exists(condition)
                        : kind === 'ALL'
                        ? `NOT ${exists(`CASE WHEN ${condition} THEN 0 ELSE 1 END = 1`)}`
                        : `NOT ${exists(`CASE WHEN NOT (${condition}) THEN 0 ELSE 1 END = 1`)}`;
            } else {
                // Cypher's quantifiers are three-valued: an item whose condition is null decides nothing, and leaves null one no
                // item decides. Each item's is read once, in one pass, and counted: 1 is true, 0 false, and null null.
                const condition = where ? this.condition(this.expression(where, inner)) : 'TRUE';
                const counts = this.alias('q');
                const [t, f, u] = [`${counts}.v`, `NOT ${counts}.v`, `${counts}.v IS NULL`].map(
                    (it) => `count(CASE WHEN ${it} THEN 1 END)`
                );
                const counted = {
                    ANY: `WHEN ${t} > 0 THEN 1 WHEN ${u} > 0 THEN NULL ELSE 0`,
                    ALL: `WHEN ${f} > 0 THEN 0 WHEN ${u} > 0 THEN NULL ELSE 1`,
                    NONE: `WHEN ${t} > 0 THEN 0 WHEN ${u} > 0 THEN NULL ELSE 1`,
                    // Two items whose condition is true make single() false, whatever the others' are.
                    SINGLE: `WHEN ${t} > 1 THEN 0 WHEN ${u} > 0 THEN NULL WHEN ${t} = 1 THEN 1 ELSE 0`
                }[kind];
                value = `(SELECT CASE ${counted} END FROM (SELECT ${condition} AS v ${from}) ${counts}) = 1`;
            }
            // Of a null list, null, as in Cypher, and its items are not read, where it may be one.
            return this.present(quantifier.list) ? value : `CASE WHEN NOT (${listNull}) THEN ${value} END`;
        };
        // Over a list of nodes or relationships, each item is the node or the relationship, read from its table.
        if (listed.kind === 'Entities') {
            return bool(
                this.sql.shared([listed.ids], ([ids]) =>
                    quantified(...this.entityItems(ids, listed.relationships, name), `${ids} IS NULL`)
                )
            );
        }
        return bool(
            this.sql.shared([this.sql.comparable(this.asJson(listed))], ([items]) =>
                quantified(
                    `FROM ${this.listElements(listed, items, name)}`,
                    json(`${name}.item`, { temporal: this.itemsOf(listed), temporals: this.itemTemporalsOf(listed) }),
                    this.sql.isJsonNull(items)
                )
            )
        );
    }

    private exists(patterns: Pattern[], where: Expression | undefined, scope: Scope): BoolValue {
        const inner = new Select(scope);
        this.patterns(inner, patterns);
        if (where) {
            inner.where.push(this.keeps(where, inner.scope));
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

    /**
     * The item `expression` of a `RETURN` or a `WITH` over `select`: a property of a node or a relationship, the item
     * itself, read as {@link SqlCypherCompiler.itemProperty} reads it, and a property of an unwound item
     * ({@link JsonValue.fromList}) as {@link SqlCypherCompiler.itemValue} reads it, but beside a variable-length walk;
     * anything else as elsewhere. A node or a relationship is compiled once here: compiling the item over it again lost
     * the rows of statements that match a relationship.
     */
    private item(expression: Expression, select: Select): Value {
        if (expression.kind === 'Property' && !select.walks) {
            // A property of a node or a relationship holds no null in a list, as expression() marks it (see flat).
            const subject = this.expression(expression.subject, select.scope);
            if (subject.kind === 'Node' && expression.key !== Stamps.PROPERTY) {
                return json(this.sql.itemProperty(subject.props, expression.key), { flat: true });
            }
            if (subject.kind === 'Relationship') {
                return json(this.sql.itemProperty(subject.props, expression.key), { flat: true });
            }
            // A value of an unwound item, but a temporal value's field, and one a write reads from its row as rowValue does.
            // It may hold temporal values deeper, as property() has it, so that a list of them is read by its places
            // (liberation-data/drivine4j#369).
            if (
                subject.kind === 'Json' &&
                subject.fromList &&
                subject.temporal === undefined &&
                subject.rowKeys === undefined &&
                !this.temporals.fieldNames.includes(expression.key) &&
                // One of a kind known other than a map is left to property(), which refuses it.
                !knownNoMap(subject)
            ) {
                return json(this.sql.itemValue(this.sql.comparable(subject), expression.key), {
                    temporals: subject.temporals
                });
            }
        }
        return this.expression(expression, select.scope);
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
                // A value the statement writes as one of a kind other than a map has none, as Neo4j says when it plans the statement.
                if (knownNoMap(subject)) {
                    throw new DrivineError(`${capitalNounOf(subject.known!)} has no properties.`);
                }
                const field = this.temporalField(subject, key);
                if (field) {
                    return field;
                }
                if (subject.rowKeys) {
                    const keys = [...subject.rowKeys, key];
                    return json(this.sql.rowValue(keys), { rowKeys: keys });
                }
                const taken = this.sql.propertyOf(this.sql.comparable(subject), key);
                return json(taken, {
                    identity: this.identityTaken(subject, taken, true, (it) => this.sql.propertyOf(it, key)),
                    temporals: subject.temporals
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

    /** The temporal kind the statement makes each item of each item of the list `list`: see {@link JsonValue.itemItems}. */
    private itemItemsOf(list: Value): Temporal | undefined {
        return list.kind === 'Json' ? list.itemItems : undefined;
    }

    /**
     * The items of the JSON list `json`, the value `list`, as rows named `alias`: by {@link SqlCypherCompiler.temporalElements}
     * where it holds temporal values at any depth.
     */
    private listElements(list: Value, json: string, alias: string): string {
        return this.sql.elementsOf(json, alias, this.holdsTemporals(list));
    }

    /**
     * Whether the statement makes the list or map `list` hold, at any depth, temporal values, as its items or deeper: see
     * {@link SqlCypherCompiler.temporalElements}. A list of other values, or of lists of them, is read as `elements` reads it.
     */
    private holdsTemporals(list: Value): boolean {
        return (
            this.itemsOf(list) !== undefined ||
            this.itemItemsOf(list) !== undefined ||
            (list.kind === 'Json' && list.temporals === true)
        );
    }

    /** Whether the statement makes `value` a temporal value, or a list or a map that holds one at any depth: see {@link JsonValue.temporals}. */
    private hasTemporals(value: Value): boolean {
        return (value.kind === 'Json' && value.temporal !== undefined) || this.holdsTemporals(value);
    }

    /** Whether an item taken from the list `list` may hold temporal values at any depth: not where it is of a temporal kind itself. */
    private itemTemporalsOf(list: Value): boolean {
        return list.kind === 'Json' && list.temporals === true && list.items === undefined;
    }

    /** The temporal kind the statement makes each item of each of `values`, lists all, as {@link kindOf} tells it of values. */
    private itemKindOf(values: [Expression, Value][]): Temporal | undefined {
        return this.listKindOf(values, (it) => this.itemsOf(it));
    }

    /**
     * The kind `of` gives each of `values`, lists all, where it gives every one the same: a null written among them aside, and
     * an empty list written, which holds no item of another kind. Undefined where they are of different kinds or of none.
     */
    private listKindOf(
        values: [Expression, Value][],
        of: (value: Value) => Temporal | undefined
    ): Temporal | undefined {
        const listed = values.filter(
            ([written]) => !isNullLiteral(written) && !(written.kind === 'ListLiteral' && written.items.length === 0)
        );
        return listed.length > 0 && listed.every(([, value]) => this.isList(value))
            ? single(listed.map(([, value]) => of(value)))
            : undefined;
    }

    /**
     * A field of a temporal value, `d.year` or `dur.days`: of the kind the statement makes it, or of the kind a text's
     * shape tells, where a map's is its entry of that name; undefined for a name no temporal value has. A map's entry
     * may hold what the map holds, as `{minute: l}.minute` does: see {@link JsonValue.temporals}.
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
            }),
            { temporals: subject.temporals }
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
        // addition, the two added as any two values are, as Cypher adds a temporal value to a list or to a text. Bound as
        // a sum's sides are, so a stored text past 32 KB beside a long duration leaves Oracle's session open
        // (liberation-data/drivine4j#370).
        const read = (kind: Temporal | undefined, temporal: (x: string, y: string) => string): Value =>
            json(
                this.sql.sharedSum(jsonA, jsonB, ([x, y]) => {
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
        const temporals = values.some(([, value]) => this.hasTemporals(value));
        if (!projection.elements.some((it) => it.kind === 'All')) {
            const identity = this.identityHolding(
                values.map(([, value]) => value),
                (ids) => present(this.sql.jsonObject(values.map(([key], i) => [key, ids[i]])))
            );
            return json(present(this.sql.jsonObject(entries)), { ordered: true, identity, temporals });
        }
        // Every property, then the entries over them.
        return json(present(this.sql.withEntries(this.sql.comparable(this.asJson(subject)), entries)), {
            temporals: temporals || this.holdsTemporals(subject)
        });
    }

    private binary(binary: Binary, scope: Scope): Value {
        const filter = this.filtered;
        if (binary.operator === 'AND' || binary.operator === 'OR' || binary.operator === 'XOR') {
            [binary.left, binary.right].forEach((it) => this.requireCondition(it, scope, binary.operator));
            const left = this.condition(this.expression(binary.left, scope));
            const right = this.condition(this.expression(binary.right, scope));
            if (binary.operator === 'AND') {
                return bool(`(${left} AND ${right})`);
            }
            // Each side whole: a condition may be several, and `a = b <> c` is no SQL.
            return bool(binary.operator === 'OR' ? `(${left} OR ${right})` : `((${left}) <> (${right}))`);
        }
        this.inOfKind(binary, scope);
        const itemwise = this.itemwise(binary, scope);
        if (itemwise !== undefined) {
            return bool(binary.operator === 'NOT_EQUALS' ? `(NOT ${itemwise})` : itemwise);
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
        const compared = this.comparison(binary, left, right, scope, filter);
        if (compared !== undefined) {
            return bool(compared);
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
     * `[{x: r}][0] = {x: r}` is true, and `{x: r} = {x: {}}` false. A node or a relationship compared with such a value
     * is compared by its identity, so `r = {}` is false.
     */
    private compared(left: Value, right: Value, binary: Binary): [Value, Value] {
        const held = (value: Value): boolean => value.kind === 'Json' && value.identity !== undefined;
        const plain = (value: Value): Value => (value.kind === 'Json' ? { ...value, identity: undefined } : value);
        const entity = (value: Value): boolean => value.kind === 'Node' || value.kind === 'Relationship';
        const identity = (value: Value): Value =>
            json(this.asJson(value).sql, { identity: this.identityOf(value), flat: true });
        // Each side as compared with the other, `other`, written as `written`.
        const as = (value: Value, other: Value, written: Expression): Value => {
            if (other.kind !== 'Json' || held(other)) {
                return value;
            }
            if (entity(value) && this.writtenOut(written)) {
                return identity(value);
            }
            return held(value) && !this.writtenOut(written) ? plain(value) : value;
        };
        const leftAs = as(left, right, binary.right);
        return leftAs !== left ? [leftAs, right] : [left, as(right, left, binary.left)];
    }

    /**
     * Whether `expression` is written all the way down (a literal, a parameter, a map, a list or a map projection of such,
     * a `CASE` that gives one), so holds no node or relationship without its identity: `{a: ms[0]}` and `n {.*, x: r}`
     * hold what may be one.
     */
    private writtenOut(expression: Expression): boolean {
        switch (expression.kind) {
            case 'Literal':
            case 'Parameter':
                return true;
            case 'MapLiteral':
                return expression.entries.every(([, value]) => this.writtenOut(value));
            case 'ListLiteral':
                return expression.items.every((it) => this.writtenOut(it));
            case 'MapProjection':
                return expression.elements.every(
                    (it) => it.kind === 'Selected' || (it.kind === 'Entry' && this.writtenOut(it.value))
                );
            case 'Case':
                return [
                    ...expression.alternatives.map(([, result]) => result),
                    ...optional(expression.otherwise)
                ].every((it) => this.writtenOut(it));
            default:
                return false;
        }
    }

    /**
     * An operator of two values, neither a logical one nor an equality nor an `IN`, and neither of them temporal: its
     * operands `a` and `b` as JSON.
     */
    private operation(binary: Binary, left: Value, right: Value, a: string, b: string): Value {
        const sql = this.sql;
        const comparison = COMPARISONS[binary.operator];
        if (comparison) {
            // Values of two kinds are not ordered, as in Cypher: the comparison is null. Two lists are, item by item.
            if (this.listed(left, right)) {
                return bool(this.listCompared(left, a, right, b, comparison));
            }
            return bool(
                sql.shared(
                    [a, b],
                    ([x, y]) =>
                        `CASE WHEN ${sql.typeOf(x)} = ${sql.typeOf(y)} AND ${sql.typeOf(
                            x
                        )} IN ('number', 'string', 'boolean') THEN ${sql.ordered(x, comparison, y)} END`
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
                // Two lists of items of one kind are, together, a list of that kind, and so of lists of items of one kind. A
                // side the statement makes a text, not given, is written as its own text; a text put together with a text, or
                // a number given, is a text.
                const items = this.itemsOf(left);
                const [l, r] = [this.summand(binary.left, left), this.summand(binary.right, right)];
                const given: [unknown, unknown] = [l.passed, r.passed];
                return json(
                    sql.sharedSum(a, b, ([x, y]) => sql.add(x, y, given)),
                    {
                        items: items !== undefined && items === this.itemsOf(right) ? items : undefined,
                        itemItems: single([this.itemItemsOf(left), this.itemItemsOf(right)]),
                        temporals: this.hasTemporals(left) || this.hasTemporals(right),
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
            STARTS_WITH: () => bool(sql.texts([a, b], (texts) => sql.shared(texts, ([x, y]) => sql.startsWith(x, y)))),
            // A pattern is short: only the text is read as a long one where it is.
            MATCHES: () => bool(sql.texts([a], ([x]) => sql.matches(x, sql.text(b)))),
            ENDS_WITH: () => bool(sql.texts([a, b], (texts) => sql.shared(texts, ([x, y]) => sql.endsWith(x, y)))),
            CONTAINS: () => bool(sql.texts([a, b], ([x, y]) => sql.containsText(x, y)))
        };
        return operations[binary.operator]!();
    }

    /**
     * Whether `<`, `<=`, `>` or `>=` of `left` and `right` compares two lists, item by item: where the statement makes
     * either a list, of values (a list of nodes or of relationships compares as before). Any other comparison is written
     * as it was.
     */
    private listed(left: Value, right: Value): boolean {
        return left.kind === 'Json' && right.kind === 'Json' && (left.list === true || right.list === true);
    }

    /**
     * `<`, `<=`, `>` or `>=`, `operator`, of `left` and `right`, whose JSON is `a` and `b`: where both are lists, as
     * {@link SqlCypherCompiler.listOrder} orders them, their temporal items as {@link comparedItems} gives them; else null,
     * as a list and a value of another kind are not ordered.
     */
    private listCompared(left: Value, a: string, right: Value, b: string, operator: string): string {
        const sql = this.sql;
        const [x, y] = this.comparedItems(left, a, right, b);
        return sql.shared(
            [x, y],
            ([p, q]) =>
                `CASE WHEN ${sql.typeOf(p)} = 'array' AND ${sql.typeOf(q)} = 'array' THEN ${sql.listOrder(
                    p,
                    q
                )} ${operator} 0 END`
        );
    }

    /**
     * `a` and `b`, the JSON of the lists `left` and `right`, as {@link SqlCypherCompiler.listOrder} compares them, where the
     * statement makes the items of both, or the items of their items, temporal: a zoned value as the moment it is, whatever
     * its offset, as `ORDER BY` sorts it (see {@link SqlCypherCompiler.momentsKey}); a duration as a map of it alone, equal
     * where it is equal and else not ordered, as in Cypher; and a value of one kind beside one of another as a map of its
     * kind, so the two are not ordered, as is one beside a text, where the statement makes the other list's items texts. A
     * local value is its ISO text, which orders as it does. Each as it is otherwise: a list of temporal values beside one of
     * values of several kinds, a list whose temporal values are deeper, or one whose items the statement does not know,
     * compares its ISO texts. Their items are read by their places ({@link SqlCypherCompiler.temporalElements}), as Oracle
     * must read a list of temporal values.
     */
    private comparedItems(left: Value, a: string, right: Value, b: string): [string, string] {
        const kind = (list: Value): [Temporal, number] | undefined => {
            const items = this.itemsOf(list);
            if (items !== undefined) {
                return [items, 1];
            }
            const itemItems = this.itemItemsOf(list);
            return itemItems !== undefined && this.holdsLists(list) ? [itemItems, 2] : undefined;
        };
        const [l, r] = [kind(left), kind(right)];
        // A temporal value beside a text: its ISO text would order where Cypher does not.
        if (l?.[1] === 1 && r === undefined && this.holdsTexts(right)) {
            return [this.mappedItems(a, 1, this.kindWrapped(l[0])), b];
        }
        if (r?.[1] === 1 && l === undefined && this.holdsTexts(left)) {
            return [a, this.mappedItems(b, 1, this.kindWrapped(r[0]))];
        }
        const each = l !== undefined && r !== undefined && l[1] === r[1] ? this.comparedItem(l[0], r[0]) : undefined;
        return each === undefined ? [a, b] : [this.mappedItems(a, l![1], each[0]), this.mappedItems(b, l![1], each[1])];
    }

    /**
     * How {@link comparedItems} gives each item of a list of `kind` beside one of `other`, as a pair for the two lists:
     * undefined where it gives them as they are, as it does local values of one kind.
     */
    private comparedItem(
        kind: Temporal,
        other: Temporal
    ): [(item: string) => string, (item: string) => string] | undefined {
        if (kind !== other || kind === Temporal.DURATION) {
            return [this.kindWrapped(kind), this.kindWrapped(other)];
        }
        if (!kind.zoned) {
            return undefined;
        }
        const moment = (item: string): string =>
            this.sql.scalar(this.sql.temporalSql.sortable(this.temporals.moment(this.sql.text(item), kind)));
        return [moment, moment];
    }

    /** A temporal value of `kind`, an item of a list, as a map of it alone at its kind's name, so it is ordered by no other kind. */
    private kindWrapped(kind: Temporal): (item: string) => string {
        return (item) =>
            this.sql.comparable(json(this.sql.jsonObject([[kind.name.toLowerCase(), item]]), { ordered: true }));
    }

    /** The JSON list `jsonSql` with each item at `depth`, 1 its own items and 2 theirs, that is not null as `each` gives it. */
    private mappedItems(jsonSql: string, depth: number, each: (item: string) => string): string {
        const sql = this.sql;
        return sql.shared([jsonSql], ([x]) => {
            const over = (list: string, at: number): string => {
                const e = this.alias('lc');
                const item = `${e}.item`;
                const mapped =
                    at === 1
                        ? each(item)
                        : `CASE WHEN ${sql.typeOf(item)} = 'array' THEN ${over(item, at - 1)} ELSE ${item} END`;
                const items = sql.aggregateList(
                    `CASE WHEN ${sql.isJsonNull(item)} THEN ${sql.literalJson(null)} ELSE ${mapped} END`,
                    `${e}.item_no`
                );
                return sql.comparable(
                    json(`(SELECT ${items} FROM ${sql.temporalElements(list, e)})`, { ordered: true })
                );
            };
            return `CASE WHEN ${sql.typeOf(x)} = 'array' THEN ${over(x, depth)} END`;
        });
    }

    /**
     * Whether two values are equal: as JSON, so `'7'` is not `7` and `1` is `1.0`. A node is equal to a node by its
     * row. Where a property is compared with `written`, a text or a truth value the statement is given, a test an index
     * answers stands beside it, where the store has one: such a value's text is equal where its JSON is, and a number's
     * is not (`1` and `1.0`). `left` is `stored` where it is a property read from the store, which is SQL's null where it
     * is not there, and so needs no test of its own beside such a value. Where neither is `plain`, either may hold a
     * null: see {@link plain}.
     */
    private equality(
        left: Value,
        right: Value,
        written?: Expression,
        plain: boolean = true,
        stored: boolean = true
    ): string {
        const temporal = this.temporalBinary('EQUALS', left, right);
        if (temporal?.kind === 'Bool') {
            return temporal.sql;
        }
        const identical = this.identityEquality(left, right, plain);
        if (identical !== undefined) {
            return identical;
        }
        const [a, b] = this.equated(left, right);
        // Either may hold a null, which makes the comparison null where no item or entry differs.
        if (!plain) {
            return this.nullableEquals(a, b, (x, y) => this.sql.jsonEquals(x, y));
        }
        const given = written ? this.given(written) : undefined;
        const indexed =
            typeof given === 'string' || typeof given === 'boolean' ? this.sql.indexedEquality(a, b) : undefined;
        // Null is equal to nothing, itself included: the comparison is null, as in Cypher. A value the statement is given
        // that is not null needs no test of its own where the other is a property, which is SQL's null where it is not there.
        const equal =
            given !== null && given !== undefined
                ? stored
                    ? this.sql.jsonEquals(a, b)
                    : `CASE WHEN NOT ${this.sql.isJsonNull(a)} THEN ${this.sql.jsonEquals(a, b)} END`
                : this.sql.shared(
                      [a, b],
                      ([x, y]) =>
                          `CASE WHEN NOT ${this.sql.isJsonNull(x)} AND NOT ${this.sql.isJsonNull(
                              y
                          )} THEN ${this.sql.jsonEquals(x, y)} END`
                  );
        return indexed !== undefined ? `(${indexed} AND ${equal})` : equal;
    }

    /**
     * Whether `left` and `right` are equal by identity: two nodes, or two relationships, by their rows; and where either is
     * a map or a list that holds a node or a relationship, where what it holds is, as {@link nullableEquals} compares
     * them where neither is `plain`. Undefined where neither is so.
     */
    private identityEquality(left: Value, right: Value, plain: boolean): string | undefined {
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
        if (!plain) {
            return this.nullableEquals(this.identified(left), this.identified(right), (x, y) =>
                this.sql.identityEquals(x, y)
            );
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
     * Whether the JSON values `x` and `y` are equal, as Cypher compares values that may hold a null: null where either is
     * null, and as the store's `nullsEqual` compares them where one holds one; else as `equals` compares them.
     */
    private nullableEquals(x: string, y: string, equals: (x: string, y: string) => string): string {
        return this.sql.shared([x, y], ([a, b]) => {
            const held = `${this.sql.holdsNull(a)} OR ${this.sql.holdsNull(b)}`;
            const equal = `CASE WHEN ${held} THEN ${this.sql.nullsEqual(a, b, equals)} ELSE ${equals(a, b)} END`;
            return `CASE WHEN NOT ${this.sql.isJsonNull(a)} AND NOT ${this.sql.isJsonNull(b)} THEN ${equal} END`;
        });
    }

    /**
     * Whether the sides `leftWritten` and `rightWritten` of a comparison, compiled as `left` and `right`, compare as JSON:
     * where one is no list or map, or neither holds a null in one (see {@link JsonValue.flat}). Else a null they hold
     * makes the comparison null where no item or entry differs, as in Cypher.
     */
    private plain(leftWritten: Expression, rightWritten: Expression, left: Value, right: Value, scope: Scope): boolean {
        return (
            this.scalarValued(leftWritten, scope) ||
            this.scalarValued(rightWritten, scope) ||
            (this.isFlat(left) && this.isFlat(right))
        );
    }

    /** Whether `expression` is a property of a node or a relationship in `scope`, read from the store: SQL's null where it is not there. */
    private stored(expression: Expression, scope: Scope): boolean {
        if (expression.kind !== 'Property' || expression.subject.kind !== 'Variable') {
            return false;
        }
        const subject = scope.get(expression.subject.name);
        return subject?.kind === 'Node' || subject?.kind === 'Relationship';
    }

    /** Whether `value` is known to hold no null in a list or a map: see {@link JsonValue.flat}. A node or a relationship is compared by its id. */
    private isFlat(value: Value): boolean {
        switch (value.kind) {
            case 'Json':
            case 'Entities':
                return value.flat === true;
            case 'Path':
                return false;
            default:
                return true;
        }
    }

    /** Whether `expression` is never null: a value the statement writes, a list or a map among them, or a parameter bound to one. */
    private present(expression: Expression): boolean {
        switch (expression.kind) {
            case 'Literal':
                return expression.value !== null && expression.value !== undefined;
            case 'Parameter':
                return this.parameterTree(expression.name) !== null;
            case 'ListLiteral':
            case 'MapLiteral':
                return true;
            default:
                return false;
        }
    }

    /** Whether `expression` is a number, a text or a truth value the statement writes, or a parameter bound to one: never null, and no list or map. */
    private presentScalar(expression: Expression, scope: Scope): boolean {
        return this.present(expression) && this.scalarValued(expression, scope);
    }

    /** Whether the value `expression` gives in `scope` is known to be no list or map: it may be null. */
    private scalarValued(expression: Expression, scope: Scope): boolean {
        if (SCALAR_KINDS.has(expression.kind)) {
            return true;
        }
        switch (expression.kind) {
            case 'Parameter':
                return !isContainer(this.parameterTree(expression.name));
            case 'Variable':
                return scope.get(expression.name)?.kind === 'Bool';
            // A sum is a list where either side is; every other operator gives a number, a text, a temporal value or a truth value.
            case 'Binary':
                return (
                    expression.operator !== 'ADD' ||
                    (this.scalarValued(expression.left, scope) && this.scalarValued(expression.right, scope))
                );
            case 'Function':
                return SCALAR_FUNCTIONS.has(expression.name.toLowerCase());
            default:
                return false;
        }
    }

    /**
     * Whether the value `expression` gives in `scope` is known to hold no null in a list or a map, at any depth: see
     * {@link JsonValue.flat}. Read from what is written, and what `scope` holds, so it compiles nothing.
     */
    private flat(expression: Expression, scope: Scope): boolean {
        return SCALAR_KINDS.has(expression.kind) || (this.flatness[expression.kind]?.(expression, scope) ?? false);
    }

    /** The parameter `name`'s value as the JSON it is bound as (see {@link jsonTree}); null where it is null. */
    private parameterTree(name: string): unknown {
        if (!this.parameterTrees.has(name)) {
            this.parameterTrees.set(name, jsonTree(this.parameters.value(name)));
        }
        return this.parameterTrees.get(name);
    }

    /**
     * `binary`, an equality or an `IN`, compared item by item where its sides are lists or maps the statement writes out,
     * `[a, b] = [c, d]`, `{x: a} = {x: b}`, `x IN [a, b]`, and one of them may hold a null: each pair compared, and the
     * comparisons taken together as SQL's `AND` (`OR` for an `IN`) takes them, which is as Cypher takes them: false where
     * one is false, else null where one is null. Lists of different lengths, and maps of different keys, are not equal.
     * Undefined where the sides are not so written, or hold no null, and so compare whole, as JSON, or `binary` is
     * another operator.
     */
    private itemwise(binary: Binary, scope: Scope): string | undefined {
        if (!['EQUALS', 'NOT_EQUALS', 'IN'].includes(binary.operator)) {
            return undefined;
        }
        const left = binary.left;
        const right = binary.right;
        if (this.flat(left, scope) && this.flat(right, scope)) {
            return undefined;
        }
        const joined = (pairs: [Expression, Expression][]): string =>
            grouped(
                pairs.map(([a, b]) =>
                    this.condition(this.binary({ kind: 'Binary', operator: 'EQUALS', left: a, right: b }, scope))
                ),
                'AND'
            );
        if (binary.operator === 'IN') {
            return this.itemwiseIn(left, right, scope);
        }
        if (left.kind === 'ListLiteral' && right.kind === 'ListLiteral') {
            return left.items.length !== right.items.length
                ? 'FALSE'
                : joined(left.items.map((it, i): [Expression, Expression] => [it, right.items[i]]));
        }
        if (left.kind === 'MapLiteral' && right.kind === 'MapLiteral') {
            const l = new Map(left.entries);
            const r = new Map(right.entries);
            if (l.size !== r.size || [...l.keys()].some((key) => !r.has(key))) {
                return 'FALSE';
            }
            return joined([...l].map(([key, value]): [Expression, Expression] => [value, r.get(key)!]));
        }
        return undefined;
    }

    /** `left IN right`, item by item, where `right` is a list written out with items: see {@link itemwise}. */
    private itemwiseIn(left: Expression, right: Expression, scope: Scope): string | undefined {
        if (right.kind !== 'ListLiteral' || right.items.length === 0) {
            return undefined;
        }
        // The item compiled once, and compared with each of the list's.
        const item = this.expression(left, scope);
        return grouped(
            right.items.map((listed) => {
                const equals: Binary = { kind: 'Binary', operator: 'EQUALS', left, right: listed };
                const [l, r] = this.compared(item, this.expression(listed, scope), equals);
                return this.equality(l, r, listed, this.plain(left, listed, l, r, scope), this.stored(left, scope));
            }),
            'OR'
        );
    }

    /**
     * `binary`, an equality or an `IN` of `left` and `right`, compiled already, as SQL: undefined where it is another
     * operator. An `IN` read by a `WHERE` for its truth alone is `filter`: see {@link membership}.
     */
    private comparison(binary: Binary, left: Value, right: Value, scope: Scope, filter: boolean): string | undefined {
        if (binary.operator === 'IN') {
            return this.membership(binary, left, right, scope, filter);
        }
        if (binary.operator !== 'EQUALS' && binary.operator !== 'NOT_EQUALS') {
            return undefined;
        }
        const plain = this.plain(binary.left, binary.right, left, right, scope);
        const equal =
            (plain ? undefined : this.givenItemwise(binary.left, left, binary.right, right)) ??
            this.equality(left, right, binary.right, plain, this.stored(binary.left, scope));
        return binary.operator === 'EQUALS' ? equal : `NOT (${equal})`;
    }

    /**
     * An equality of `left` and `right`, written as `leftWritten` and `rightWritten`, where one is a parameter bound to a
     * list that holds a null, lists within it among its items and no map: the other compared with it item by item, each
     * item as the statement is compiled with it, as {@link itemwise} compares a list written out, so no store walks the
     * two. Undefined where neither is such a parameter, or where an item is too long to write in the statement (see
     * {@link short}): such a list is walked as any other.
     */
    private givenItemwise(
        leftWritten: Expression,
        left: Value,
        rightWritten: Expression,
        right: Value
    ): string | undefined {
        const given = (expression: Expression): unknown[] | undefined => {
            if (expression.kind !== 'Parameter') {
                return undefined;
            }
            const tree = this.parameterTree(expression.name);
            return Array.isArray(tree) && !holdsNoNull(tree) && arrays(tree) && short(tree) ? tree : undefined;
        };
        const other = (value: Value): JsonValue | undefined =>
            value.kind === 'Json' && value.identity === undefined && value.temporal === undefined ? value : undefined;
        const [rightList, leftOther] = [given(rightWritten), other(left)];
        if (rightList !== undefined && leftOther !== undefined) {
            return this.itemsEqual(this.sql.comparable(leftOther), rightList);
        }
        const [leftList, rightOther] = [given(leftWritten), other(right)];
        if (leftList !== undefined && rightOther !== undefined) {
            return this.itemsEqual(this.sql.comparable(rightOther), leftList);
        }
        return undefined;
    }

    /**
     * Whether the JSON value `jsonSql` is equal to `given`, a list that may hold a null and lists, as Cypher compares them:
     * the same length, and each item equal, false where one is not, else null where one is null. A text, a number or a
     * truth value is compared as JSON.
     */
    private itemsEqual(jsonSql: string, given: unknown): string {
        return this.sql.shared([jsonSql], ([x]) => {
            if (!Array.isArray(given)) {
                return `CASE WHEN NOT ${this.sql.isJsonNull(x)} THEN ${this.sql.jsonEquals(
                    x,
                    this.sql.literalJson(given)
                )} END`;
            }
            const checks = given
                .map((item, i): [unknown, number] => [item, i])
                .filter(([item]) => item !== null)
                .map(([item, i]) => this.itemsEqual(this.sql.itemAt(x, i), item));
            const nulls = given.some((it) => it === null);
            // A null item makes the whole null where every other item is equal.
            const items = !nulls
                ? checks.length === 0
                    ? 'TRUE'
                    : `(${checks.join(' AND ')})`
                : checks.length === 0
                ? 'NULL'
                : `CASE WHEN NOT (${checks.join(' AND ')}) THEN FALSE END`;
            // Its size read only of a list, in the order a CASE reads its conditions.
            return (
                `CASE WHEN ${this.sql.isJsonNull(x)} THEN NULL WHEN ${this.sql.typeOf(x)} <> 'array' THEN FALSE ` +
                `WHEN ${this.sql.listSize(x)} <> ${given.length} THEN FALSE ELSE ${items} END`
            );
        });
    }

    /**
     * `x IN list`, of `left` and `right`, the sides of `binary`, as Cypher has it: null where the list is null; else true
     * where an item is equal to the value, else null where a comparison with one is null (the value is null, an item is,
     * or holds a null where the value holds another), else false. A value that holds no null, in a list that holds none,
     * is in it where an item is equal to it; read by a `WHERE` for its truth alone (`filter`), it is not in it where it
     * is null, as before.
     */
    private membership(binary: Binary, left: Value, right: Value, scope: Scope, filter: boolean): string {
        const member = this.member(left, right);
        const within = this.isFlat(right);
        // A node, a relationship or a value of one kind holds no null; nor does an item of a list that holds none.
        const whole = member.id !== undefined || this.scalarValued(binary.left, scope) || this.isFlat(left);
        const leftPresent = this.present(binary.left);
        const rightPresent = this.present(binary.right);
        // Null and false keep no row alike, and a value that holds no null is null beside such a list only where it is
        // null: beside any list, read by a WHERE for its truth alone, it is equal as JSON only to an item Cypher finds equal.
        if (whole && (filter || (leftPresent && rightPresent && within))) {
            return this.filteredMembership(binary.left, member, within, scope);
        }
        // A value that may be null, in a list that is not and holds none: in where an item is equal, null where the value
        // is null, else not, written so the store still answers the first as it did, as a semi-join.
        if (rightPresent && within && whole && this.filled(binary.right)) {
            return this.found(
                member,
                (found, v) => `(${found} OR CASE WHEN NOT ${this.sql.isJsonNull(v)} THEN FALSE END)`
            );
        }
        return this.undecidedMembership(member, {
            nullList: !rightPresent,
            nullValue: !leftPresent,
            filled: this.filled(binary.right),
            whole,
            within
        });
    }

    /**
     * What {@link membership} compares of `left IN right`: the list, the value, and how an item of the list `matches` the
     * value, as `equals` compares two values that hold no null. A node or a relationship in a list of them is its `id`.
     */
    private member(left: Value, right: Value): Member {
        const sql = this.sql;
        // A node or a relationship is in a list of them where its id is.
        const id = this.memberId(left, right);
        const identities =
            (left.kind === 'Json' && left.identity !== undefined) ||
            (right.kind === 'Json' && right.identity !== undefined);
        const equals = identities
            ? (a: string, b: string): string => sql.identityEquals(a, b)
            : (a: string, b: string): string => sql.jsonEquals(a, b);
        const matches = (item: string, value: string): string =>
            id !== undefined ? `${item} = ${value}` : equals(item, value);
        const elements = (list: string, alias: string): string => this.listElements(right, list, alias);
        if (id !== undefined) {
            return { list: (right as EntitiesValue).ids, x: id, id, equals, matches, elements };
        }
        // A map or a list that holds a node or a relationship is in a list where an item holds the same, by identity.
        if (identities) {
            return { list: this.identified(right), x: this.identified(left), equals, matches, elements };
        }
        return {
            list: sql.comparable(this.asJson(right)),
            x: sql.comparable(this.asJson(left)),
            equals,
            matches,
            elements
        };
    }

    /**
     * Whether `member`'s value, written as `value`, which holds no null, is in its list, which holds none where it is
     * `within`, as a semi-join: read for its truth alone, or where neither may be null, it is equal as JSON only to an
     * item Cypher finds equal. But JSON's null is equal as JSON to an item that is, so a value that may be JSON's null,
     * in a list that may hold a null, is in it only where it is not null. A node or a relationship, a value the statement
     * writes or is given, and a property read from the store, which is SQL's null where it is not there, are never
     * JSON's null.
     */
    private filteredMembership(value: Expression, member: Member, within: boolean, scope: Scope): string {
        if (within || member.id !== undefined || this.present(value) || this.stored(value, scope)) {
            return this.found(member);
        }
        return this.found(member, (found, v) => `(${found} AND NOT ${this.sql.isJsonNull(v)})`);
    }

    /**
     * Whether an item of `member`'s list matches its value, as a semi-join the store answers: `EXISTS`, or with `around`
     * that test and the value, each read once.
     */
    private found(member: Member, around?: (found: string, value: string) => string): string {
        const i = this.alias('i');
        const exists = (list: string, value: string): string =>
            `EXISTS (SELECT 1 FROM ${member.elements(list, i)} WHERE ${member.matches(`${i}.item`, value)})`;
        if (around === undefined) {
            return exists(member.list, member.x);
        }
        return this.sql.shared([member.list, member.x], ([l, v]) => around(exists(l, v), v));
    }

    /** The id of `left`, a node or a relationship, where `right` is a list of such: undefined where they are not so. */
    private memberId(left: Value, right: Value): string | undefined {
        if (right.kind !== 'Entities') {
            return undefined;
        }
        if (left.kind === 'Node' && !right.relationships) {
            return this.sql.scalar(left.nid);
        }
        return left.kind === 'Relationship' && right.relationships ? this.sql.scalar(left.eid) : undefined;
    }

    /** Whether `list` is a list written out with items, or a parameter bound to a list or a map with them. */
    private filled(list: Expression): boolean {
        if (list.kind === 'ListLiteral') {
            return list.items.length > 0;
        }
        const given = list.kind === 'Parameter' ? this.parameterTree(list.name) : undefined;
        return (Array.isArray(given) && given.length > 0) || (isJsonMap(given) && Object.keys(given).length > 0);
    }

    /**
     * `x IN list` of `member`, where the value or an item may hold a null, as a `CASE`: null where the list is null and
     * may be (`nullList`); null where the value is null and may be (`nullValue`), in a list that is not empty, which a
     * list written out with items, or a parameter bound to one, is (`filled`); true where an item is equal to the value,
     * which holds no null where it is `whole`; null where a comparison with an item is null, which none is where the value
     * is `whole` and the list holds no null (`within`); else false.
     */
    private undecidedMembership(
        member: Member,
        of: { nullList: boolean; nullValue: boolean; filled: boolean; whole: boolean; within: boolean }
    ): string {
        const sql = this.sql;
        const matches = member.matches;
        const equals = member.equals;
        return sql.shared([member.list, member.x], ([l, v]) => {
            const i = this.alias('i');
            const cases: string[] = of.nullList ? [`WHEN ${sql.isJsonNull(l)} THEN NULL`] : [];
            // Null is compared with each item, and is in no empty list.
            if (of.nullValue) {
                const j = this.alias('i');
                const empty = `CASE WHEN EXISTS (SELECT 1 FROM ${member.elements(l, j)}) THEN NULL ELSE FALSE END`;
                cases.push(`WHEN ${sql.isJsonNull(v)} THEN ${of.filled ? 'NULL' : empty}`);
            }
            // A value that holds a null is equal to no item.
            const held = of.whole ? '' : `NOT (${sql.holdsNull(v)}) AND `;
            cases.push(
                `WHEN ${held}EXISTS (SELECT 1 FROM ${member.elements(l, i)} WHERE ${matches(`${i}.item`, v)}) THEN TRUE`
            );
            if (!of.within || !of.whole) {
                const k = this.alias('i');
                const undecided =
                    member.id !== undefined
                        ? sql.isJsonNull(`${k}.item`)
                        : `(${this.nullableEquals(`${k}.item`, v, equals)}) IS NULL`;
                cases.push(`WHEN EXISTS (SELECT 1 FROM ${member.elements(l, k)} WHERE ${undecided}) THEN NULL`);
            }
            return `CASE ${cases.join(' ')} ELSE FALSE END`;
        });
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
        if (unary.operator === 'NOT') {
            this.requireCondition(unary.operand, scope, 'NOT');
        }
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
        const conditions = expression.alternatives.map(([key]) => {
            if (!subject) {
                return this.condition(this.expression(key, scope));
            }
            const value = this.expression(key, scope);
            return this.equality(
                subject,
                value,
                undefined,
                this.plain(expression.subject!, key, subject, value, scope)
            );
        });
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
        // a subquery first. Not a CASE that reads an aggregate, which the subquery would aggregate again, over its one row,
        // nor one that reads an aggregate's result bindsOverAggregates put in its place, which it reads so.
        const values = (): string[] => results.map(([, it]) => this.sql.comparable(this.asJson(it)));
        const sql =
            this.sql.aggregatesCaseSubqueries ||
            !results.some(([, it]) => it.kind === 'Entities') ||
            contains(expression, (it) => isAggregate(it) || (it.kind === 'Variable' && it.name.startsWith('#over')))
                ? written((it) => this.sql.comparable(this.asJson(it)))
                : this.sql.bound(values(), (bound) => written((_, i) => bound[i]));
        return json(sql, {
            temporal: this.kindOf(results),
            items: this.itemKindOf(results),
            identity,
            temporals: results.some(([, it]) => this.hasTemporals(it)),
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
        if (name === 'tostring') {
            this.textOfKind(fn, one);
        }
        const argument = this.sql.comparable(this.asJson(one));
        const result = this.sql.shared([argument], ([x]) => this.sql.function(name, x)!);
        // An item taken from a list is of the kind its items are.
        if (name === 'head' || name === 'last') {
            return json(result, {
                temporal: this.itemsOf(one),
                items: this.itemItemsOf(one),
                identity: this.identityTaken(one, result, true, (list) =>
                    this.sql.shared([list], ([x]) => this.sql.function(name, x)!)
                ),
                list: this.holdsLists(one),
                text: this.holdsTexts(one),
                temporals: this.itemTemporalsOf(one)
            });
        }
        return json(result, { text: TEXT_FUNCTIONS.includes(name) });
    }

    /**
     * Refuses `toString` of `value`, the argument of `fn`, where the statement makes it a list or a map: Neo4j refuses it
     * when it plans the statement. A value whose kind the statement leaves open is compiled as before.
     */
    private textOfKind(fn: FunctionCall, value: Value): void {
        const written = fn.arguments[0];
        const kind = this.isList(value)
            ? 'list'
            : written.kind === 'MapLiteral' || written.kind === 'MapProjection'
            ? 'map'
            : undefined;
        if (kind !== undefined) {
            throw new DrivineError(
                `${fn.name}() takes a number, a text, a truth value or a temporal value, not a ${kind}, as in Neo4j.`
            );
        }
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
            itemItems: this.itemsOf(gathered),
            list: true,
            itemLists: this.isList(gathered),
            texts: this.isText(gathered),
            temporals: this.hasTemporals(gathered),
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
                itemItems: list.itemItems,
                list: true,
                itemLists: list.itemLists,
                texts: list.texts,
                temporals: list.temporals
            });
        }
        return json(this.sql.distinctItems(this.sql.comparable(list), this.holdsTemporals(list)), {
            ordered: true,
            items: list.items,
            itemItems: list.itemItems,
            list: true,
            itemLists: list.itemLists,
            texts: list.texts,
            temporals: list.temporals
        });
    }

    /**
     * `min` or `max`: zoned values as the moments they are, whatever their offsets, and lists of them item by item so; of a
     * temporal kind, still of it, and a list of the kinds of list it was. A list the statement makes item by item, as an
     * `ORDER BY` sorts it: a store's JSON may put the shorter list first.
     */
    private extreme(call: Invocation, min: boolean): Value {
        const value = this.asJson(call.one());
        const temporal = value.temporal;
        const items = value.items;
        const itemItems = value.itemItems;
        const key = temporal?.zoned
            ? this.temporals.moment(this.sql.text(this.sql.comparable(value)), temporal)
            : items?.zoned && value.list
            ? this.sql.momentsKey(this.sql.comparable(value), items)
            : itemItems?.zoned && value.itemLists
            ? this.sql.momentsKey(this.sql.comparable(value), itemItems, 2)
            : this.sql.extremesByListKey && this.isList(call.one())
            ? this.sql.listSortKey(this.sql.comparable(value))
            : undefined;
        return json(this.sql.extreme(this.sql.comparable(value), min, key), {
            temporal,
            items,
            itemItems,
            list: value.list,
            itemLists: value.itemLists,
            text: this.isText(value),
            temporals: value.temporals
        });
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
            return json(this.sql.scalar(this.sql.float(this.rounded(call, (n, p) => this.sql.roundTo(n, p, mode)))));
        }
        if (call.arguments.length === 2) {
            // To 0 places Neo4j rounds as round(x) does, half toward +infinity, as Java's Math.round; to more, half away
            // from zero.
            return json(
                this.sql.scalar(
                    this.sql.float(
                        this.rounded(
                            call,
                            (n, p) => this.sql.roundPlaces(n, p),
                            (n) => this.sql.roundWhole(n)
                        )
                    )
                )
            );
        }
        return json(this.sql.scalar(this.sql.float(this.sql.roundWhole(this.numberOf(call.one())))));
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
        const counted = this.sql.texts([this.jsonOf(call.arguments[0])], ([read]) =>
            this.sql.scalar(
                this.sql.shared([read], ([text]) => {
                    const count = this.countOf(call, 1, 'length', text);
                    return call.name === 'left' ? `SUBSTR(${text}, 1, ${count})` : this.sql.rightText(text, count);
                })
            )
        );
        return json(counted, { text: true });
    }

    private truncated(call: Invocation): Value {
        const fn = call.fn;
        const to = Temporal.ofFunction(call.name.substring(0, call.name.indexOf('.')))!;
        if (call.arguments.length < 2) {
            throw new DrivineError(`${fn.name}() takes a unit and a value.`);
        }
        if (call.arguments.length > 3) {
            throw new DrivineError(`${fn.name}() takes a unit, a value and a map of fields.`);
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
        const fields =
            fn.arguments[2] !== undefined
                ? this.truncationFields(fn, unit, to, fn.arguments[2], call.scope)
                : undefined;
        const cut = (text: string, from: Temporal): string => {
            const truncated = this.temporals.truncate(unit, text, from, to, fields);
            if (truncated === undefined) {
                const units = TRUNCATION_UNITS.slice(0, -1).join(', ');
                throw new DrivineError(
                    `${fn.name}() truncates to ${units} or ${
                        TRUNCATION_UNITS[TRUNCATION_UNITS.length - 1]
                    }, not ${unit}.`
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

    /**
     * The fields the map `written`, the third argument of `fn`, gives the value of `kind` it truncates, in place of its
     * own, as Neo4j takes them. A field of no such value, a day or a month beside a day of the week, a number that is not
     * whole, or a number written past its field's range (see {@link TRUNCATION_RANGES}; a microsecond beside a millisecond
     * given or kept by a cut to `unit` runs to 999), fails, where a store would carry it into the next field or fail on it
     * at its own time. A field that is null is given as its least, as a map that leaves it out makes a value: the year 0,
     * the first month, day or day of the week, and no time; a time zone that is null fails. Fields the stores have no SQL
     * for yet (nanoseconds, the fields of a week or a quarter, a time zone by name) are refused. As drivine4j's #468.
     */
    private truncationFields(
        fn: FunctionCall,
        unit: string,
        kind: Temporal,
        written: Expression,
        scope: Scope
    ): Overrides {
        // Null gives no fields, as Neo4j has it.
        if (isNullLiteral(written)) {
            return { fields: {} };
        }
        if (written.kind !== 'MapLiteral') {
            return unsupported("A truncation's fields that an expression gives");
        }
        const keys = truncationKeys(fn, kind, written.entries);
        const millis = keys.has('millisecond') || unit === 'millisecond';
        let timezone: string | undefined;
        const fields: Record<string, string> = {};
        for (const [key, value] of written.entries) {
            if (key === 'timezone') {
                timezone = truncationZone(fn, value);
            } else {
                fields[key] = this.truncationNumber(fn, key, value, millis, scope);
            }
        }
        return { fields, timezone };
    }

    /**
     * The SQL number of the field `key` of a truncation of `fn`, which `value` gives: see {@link truncationFields}. With
     * `millis`, a millisecond is given or kept, beside which a microsecond runs to 999.
     */
    private truncationNumber(fn: FunctionCall, key: string, value: Expression, millis: boolean, scope: Scope): string {
        const least = TRUNCATION_LEAST[key] ?? 0;
        const literal = writtenNumber(value);
        if (literal === null) {
            return `${least}`;
        }
        if (literal === undefined) {
            return `COALESCE(${this.numberOf(this.expression(value, scope))}, ${least})`;
        }
        return `${truncationWhole(fn, key, literal, millis)}`;
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

    /**
     * The start or length `what` of `substring()`, `left()` or `right()`, its argument `index`, as a SQL whole number,
     * as Neo4j reads it. A float written in the statement, even a whole one such as 2.0, is refused, whatever the text,
     * as Neo4j refuses an argument it knows to be a float; one bound to a parameter or read from data is cut toward
     * zero, as Neo4j cuts it: 2.7 is 2, and -0.5 is 0. A number then below 0 or past 2147483647 is refused where the
     * text, `text` in SQL, is not null: when compiling, where the number and the text are given; and else when the row
     * is read, by the store's `failure`, on every store alike.
     */
    private countOf(call: Invocation, index: number, what: string, text: string): string {
        const outOfRange = `${call.fn.name}() takes a ${what} from 0 to ${MAX_COUNT}, as in Neo4j.`;
        const count = call.fn.arguments[index];
        const negated = count.kind === 'Unary' && count.operator === 'NEGATE';
        const written = negated ? (count as Unary).operand : count;
        const given = this.given(written);
        if (written.kind === 'Literal' && given instanceof CypherFloat) {
            throw new DrivineError(`${call.fn.name}() takes an integer for its ${what}, not a float, as in Neo4j.`);
        }
        const cut = cutTowardZero(given);
        if (cut !== undefined) {
            const whole = negated ? -cut : cut;
            if (whole >= BigInt(0) && whole <= BigInt(MAX_COUNT)) {
                return `CAST(${whole} AS INTEGER)`;
            }
            const subject = call.fn.arguments[0];
            // Where the text is given, it is null, so the function gives null, or it is refused.
            if (isGiven(subject)) {
                if (this.given(subject) == null) {
                    return 'CAST(NULL AS INTEGER)';
                }
                throw new DrivineError(outOfRange);
            }
            // A failure of constants alone may be worked out before any row: this one reads the text.
            const failure = this.sql.failure(outOfRange, `CASE WHEN ${text} IS NOT NULL THEN ${whole} END`);
            return `CASE WHEN ${text} IS NOT NULL THEN ${failure} END`;
        }
        // Read only beside a text that is not null, so a number past SQL's integer beside a null text is null, and a
        // constant out of range is not worked out before any row.
        return this.sql.shared(
            [`CASE WHEN ${text} IS NOT NULL THEN TRUNC(${this.numberOf(call.arguments[index])}) END`],
            ([n]) =>
                `CASE WHEN ${n} < 0 OR ${n} > ${MAX_COUNT} THEN ${this.sql.failure(outOfRange, n)} ` +
                `ELSE CAST(${n} AS INTEGER) END`
        );
    }

    /** A value as a SQL whole number with its fraction cut off, toward zero, as Neo4j reads `round()`'s precision. */
    private truncatedWhole(value: Value): string {
        return `CAST(TRUNC(${this.numberOf(value)}) AS INTEGER)`;
    }

    /**
     * `round()`'s precision, written in the statement as `written`, as a whole number toward zero where it is known when
     * compiling: written, negated or not, or a parameter's value, a bigint or the Neo4j driver's Integer too. Undefined
     * where it comes from data.
     */
    private givenPlaces(written: Expression): number | undefined {
        const negated = written.kind === 'Unary' && written.operator === 'NEGATE';
        const precision = this.given(negated ? (written as Unary).operand : written);
        const given =
            precision instanceof CypherFloat
                ? precision.value
                : typeof precision === 'bigint' || isInt(precision)
                ? Number(precision.toString())
                : precision;
        return typeof given === 'number' ? Math.trunc(negated ? -given : given) : undefined;
    }

    /**
     * `round(value, precision)` of the invocation `call`, by `places` over the value as a SQL number and the precision as
     * a whole number toward zero: -0.5 is 0 places. Given `whole`, to 0 places it rounds by that instead. A precision
     * below 0 or past `MAX_COUNT` fails, as Neo4j fails it: only on a row that rounds a number by it, by the store's
     * `failure`, on every store alike, whether it is written, negated or not, a parameter's value, a bigint or the Neo4j
     * driver's Integer too, or read from data. Neo4j reads the precision only when it rounds, so a null value rounds to
     * null by any precision, and with no row, nothing fails.
     *
     * Places known when compiling pick the rounding then: under an aggregate, where nothing is bound, a CASE of both
     * would write the number out in each, at each round() nested in another. Places from data are told apart as the
     * statement runs, in one CASE over the value and the places, where places out of range are failed before either
     * rounding, so the precision each rounding writes out, more than once on a store, is the places alone.
     */
    private rounded(
        call: Invocation,
        places: (number: string, precision: string) => string,
        whole?: (number: string) => string
    ): string {
        const given = this.givenPlaces(call.fn.arguments[1]);
        if (given !== undefined) {
            // Not "given in 0..MAX_COUNT", which NaN fails: Neo4j casts NaN to 0 places, as Java casts it to a long.
            if (given < 0 || given > MAX_COUNT) {
                const named = Number.isFinite(given) ? BigInt(given).toString() : String(given);
                return this.outOfPlaces(this.sql.comparable(this.asJson(call.arguments[0])), literal(named));
            }
            const number = this.numberOf(call.arguments[0]);
            // Not "given < 1", which a NaN parameter fails: Neo4j casts NaN to 0 places. NaN is no SQL number, as it is
            // bound as JSON text, so its places are written as that 0.
            return whole !== undefined && !(given >= 1)
                ? whole(number)
                : places(number, Number.isNaN(given) ? '0' : this.truncatedWhole(call.arguments[1]));
        }
        const value = this.sql.comparable(this.asJson(call.arguments[0]));
        return this.sql.shared([value, `TRUNC(${this.numberOf(call.arguments[1])})`], ([x, t]) => {
            // Out of range, places are not cast, which Postgres's integer would fail on beside a null value.
            const toWhole = whole !== undefined ? `WHEN ${t} = 0 THEN ${whole(this.sql.number(x))} ` : '';
            return (
                `CASE ${toWhole}WHEN ${t} NOT BETWEEN 0 AND ${MAX_COUNT} THEN ${this.outOfPlaces(x, t)} ` +
                `ELSE ${places(this.sql.number(x), `CAST(${t} AS INTEGER)`)} END`
            );
        });
    }

    /**
     * `round()` of the JSON value `x` to `precision` places out of range: it fails where `x` is a number, and is null
     * where it is not, as a null rounds to null by any precision in Neo4j. Asked of its kind, whose test writes the value
     * out fewer times than the number does.
     */
    private outOfPlaces(x: string, precision: string): string {
        const failed = this.sql.failure(PRECISION_OUT_OF_RANGE, precision);
        return `CASE WHEN ${this.sql.typeOf(x)} = 'number' THEN ${failed} END`;
    }

    /** A value as a SQL number, where it is one. */
    private numberOf(value: Value): string {
        return this.sql.number(this.sql.comparable(this.asJson(value)));
    }

    /** A value as SQL text, where it is a string. */
    private textOf(value: Value): string {
        return this.sql.text(this.jsonOf(value));
    }

    /** A value as JSON, as it compares: what {@link SqlCypherCompiler.texts} reads a text from. */
    private jsonOf(value: Value): string {
        return this.sql.comparable(this.asJson(value));
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

    /**
     * A value as a condition: a boolean as itself, JSON's `true` and `false` as theirs, anything else as null. One the
     * statement writes as a value of another kind ({@link JsonValue.known}) is refused, as Neo4j refuses it when it plans
     * the statement.
     */
    private condition(value: Value): string {
        if (value.kind === 'Bool') {
            return value.sql;
        }
        if (value.kind === 'Json') {
            if (value.known !== undefined && value.known !== 'BOOLEAN') {
                throw new DrivineError(`${capitalNounOf(value.known)} is not a condition, as in Neo4j.`);
            }
            return this.sql.boolOf(this.sql.comparable(value));
        }
        throw new DrivineError('A node, a relationship or a path is not a condition.');
    }

    /**
     * What an order sorts a value by: JSON's order for a value, a node by its properties. JSON's null, as a map or a
     * list the statement builds holds it, is SQL's null, which comes last, as a graph engine orders null.
     */
    private sortable(value: Value): string[] {
        const [carried, sorts] = this.sortTerm(value);
        return sorts(carried);
    }

    /**
     * What {@link sortable} sorts `value` by, in two: the value as a column carries it, and the terms that sort it, of
     * that column. A value whose kind the statement leaves open sorts as {@link SqlCypherCompiler.openSortKey} has it,
     * where its kind comes first; one it makes a truth value, a temporal value, a text, a list or a node is of one kind,
     * and sorts by one term alone: a zoned value or a list of them by its moments, another list by {@link SqlCypherCompiler.listSortKey}, any other by {@link SqlCypherCompiler.sortKey}.
     */
    private sortTerm(value: Value): [string, (column: string) => string[]] {
        if (value.kind === 'Bool') {
            return [value.sql, (it) => [it]];
        }
        // A zoned value the statement makes sorts as the moment it is, whatever its offset.
        if (value.kind === 'Json' && value.temporal?.zoned) {
            const temporal = value.temporal;
            return [this.sql.comparable(value), (it) => [this.temporals.moment(this.sql.text(it), temporal)]];
        }
        const byMoments = this.momentsTerm(value);
        if (byMoments) {
            return byMoments;
        }
        // A list the statement makes sorts as Cypher sorts lists, item by item; any other value as the store sorts it.
        if (this.isList(value)) {
            return [this.sql.comparable(this.asJson(value)), (it) => [this.sql.listSortKey(it)]];
        }
        if (value.kind !== 'Json' || value.temporal !== undefined || this.isText(value)) {
            return [this.sql.comparable(this.asJson(value)), (it) => [this.sql.sortKey(it)]];
        }
        return [this.sql.comparable(this.asJson(value)), (it) => this.sql.openSortKey(it)];
    }

    /**
     * {@link sortTerm} of a list of zoned values the statement makes, or of a list of lists of them: item by item as the
     * moments they are. Of one kind, a list, it needs no rank of its kind. Undefined for any other value.
     */
    private momentsTerm(value: Value): [string, (column: string) => string[]] | undefined {
        if (value.kind !== 'Json') {
            return undefined;
        }
        const items = value.items;
        if (value.list && items?.zoned) {
            return [this.sql.comparable(value), (it) => [this.sql.momentsKey(it, items)]];
        }
        const itemItems = value.itemItems;
        if (value.itemLists && itemItems?.zoned) {
            return [this.sql.comparable(value), (it) => [this.sql.momentsKey(it, itemItems, 2)]];
        }
        return undefined;
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

/**
 * A given number cut toward zero, as Java casts a double to a long and Neo4j so reads a start or length: NaN is 0, and
 * a number past a long, an infinity too, the greatest or least long, so no store is given a literal past its number. A
 * whole number, a bigint or the Neo4j driver's Integer, is kept as it is within a long. Undefined where `value` is no
 * number.
 */
function cutTowardZero(value: unknown): bigint | undefined {
    const number = value instanceof CypherFloat ? value.value : value;
    let cut: bigint;
    if (typeof number === 'bigint') {
        cut = number;
    } else if (isInt(number)) {
        cut = BigInt(number.toString());
    } else if (typeof number !== 'number') {
        return undefined;
    } else if (Number.isNaN(number)) {
        return BigInt(0);
    } else if (!Number.isFinite(number)) {
        return number > 0 ? LONG_MAX : LONG_MIN;
    } else {
        cut = BigInt(Math.trunc(number));
    }
    return cut > LONG_MAX ? LONG_MAX : cut < LONG_MIN ? LONG_MIN : cut;
}

/** Whether the statement gives the value of `expression`, as `CypherWriter.given` reads it, null or not. */
function isGiven(expression: Expression): boolean {
    return (
        expression.kind === 'Literal' ||
        expression.kind === 'Parameter' ||
        (expression.kind === 'Property' && expression.subject.kind === 'Parameter')
    );
}

/**
 * The conditions `terms` joined by `operator`, in parentheses. SQLite reads `a OR b OR c` as an expression as deep as it
 * is long, and refuses one deeper than 1,000 (liberation-data/drivine4j#332): past `MOST_ARGUMENTS` terms, each run of
 * them is joined in parentheses of its own, and the runs joined so in turn. Postgres takes such a chain at any length
 * (100,000 terms tried); it is grouped here too, as drivine4j groups it, so the libraries compile it alike.
 */
function grouped(terms: string[], operator: string): string {
    return terms.length <= MOST_ARGUMENTS
        ? `(${terms.join(` ${operator} `)})`
        : grouped(
              chunked(terms, MOST_ARGUMENTS).map((it) => grouped(it, operator)),
              operator
          );
}

function reversed(relationship: RelationshipPattern): RelationshipPattern {
    const directions = { OUTGOING: 'INCOMING', INCOMING: 'OUTGOING', EITHER: 'EITHER' } as const;
    return { ...relationship, direction: directions[relationship.direction] };
}
