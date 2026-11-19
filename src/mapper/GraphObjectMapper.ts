import { plainToInstance } from 'class-transformer';
import { Stamps } from '@/model/Stamps';
import { ModelRegistry } from '@/model/ModelRegistry';
import { emptyCollection, FieldMapping } from '@/model/FieldMapping';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { parseExactIntegers } from '@/utils/ExactIntegers';
import { dateOf, NO_NODE } from '@/backend/sql/NodeIds';
import { isTag, tagsHeldBy } from '@/cypher/ValueLayout';
import { DrivineError } from '@/DrivineError';
import { ObjectUtils } from '@/utils/ObjectUtils';

/**
 * Keys a row's properties are never copied under: a property bag's entry or a field named `__proto__` would otherwise
 * give the object it is copied onto a prototype of the store's choosing.
 */
export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Property names beginning with this are Drivine's own, and are never mapped onto an object. */
export const RESERVED_PREFIX = '__drivine.';

/**
 * The properties a flat bag doesn't take on load, as they are named on the node: those of the fields the class
 * decorates or initializes, and the id.
 */
export function knownProperties(type: Function, mapping: FieldMapping, fragment: FragmentModel): Set<string> {
    return new Set<string>([
        ...mapping.graphProperties.values(),
        ...mapping.transientFields,
        ...mapping.jsonPacked,
        ...mapping.defaults,
        ...mapping.emptyWhenAbsent.keys(),
        ...[fragment.nodeIdProperty, fragment.stampField].filter((it): it is string => !!it),
        // A @CaseInsensitive field is declared by its decorator, whether or not the class initializes it.
        ...(fragment.lowerCopied ?? []),
        ...Object.keys(plainToInstance(type as any, {}) as object)
    ]);
}

/**
 * The text each @JsonPacked property held when a load made the fragment, and the list each property a load gave a Set
 * held, by stored name: for a save given the fragment as `from`, which compares a packed field as the node held it, not
 * as its value packed again, and a set as the list it was loaded from, which may hold an item twice. Kept for stamped
 * fragments with a packed or Set field only, and only as long as the fragment is.
 */
const packedAsHeld = new WeakMap<object, Record<string, any>>();

/**
 * Internal: the text a load read for each @JsonPacked property of the fragment, and the list for each property it gave a
 * Set, by stored name; undefined for a fragment no load made.
 */
export function packedTextOf(fragment: object): Record<string, any> | undefined {
    return packedAsHeld.get(fragment);
}

/**
 * The fields of an object a load made whose property a SQL store held a temporal tag in (#811), each with its value as
 * the load gave it, copied, and what the store held, as plain JSON (see ValueLayout's tagsHeldBy). The load gives a tag
 * as its text where no field declares a `Date`, so a save of the text would write a string over the date; a save writes
 * a field still as loaded as the store held it instead (see SaveStatementBuilder's propsOf). Kept for fragments and
 * relationship fragments a load made from a SQL store's row, and only as long as the object is.
 */
const tagsAsLoaded = new WeakMap<object, Map<string, { value: any; held: any }>>();

/**
 * Internal: of each field of `object` whose property held a temporal tag when a load made it, the value the load gave
 * it and what the store held (see tagsAsLoaded); undefined for an object no load from a SQL store made.
 */
export function heldTagsOf(object: object): Map<string, { value: any; held: any }> | undefined {
    return tagsAsLoaded.get(object);
}

/**
 * A node as a fragment load returns it: its properties, and its labels apart from them.
 */
export interface FragmentRow {
    props: Record<string, any>;
    labels: string[];
}

/**
 * A view as a view load returns it: its root, and what each relationship field holds.
 */
export interface ViewRow {
    root: FragmentRow;
    rels: Record<string, any>;
}

/**
 * A relationship fragment as a view load returns it: the relationship's properties, and the node it leads to.
 */
export interface RelationshipRow {
    rel: Record<string, any>;
    target: FragmentRow | ViewRow;
}

/**
 * Turns the rows the object manager's statements return into instances of the mapped classes.
 */
export class GraphObjectMapper {
    /**
     * @param registry when given, a node is loaded as the most specific subtype of the expected class whose labels it
     * carries.
     */
    constructor(private readonly registry?: ModelRegistry) {}

    fragment<T>(expected: FragmentModel, row: FragmentRow): T {
        const model = this.registry && row.labels ? this.registry.fragmentFor(expected, row.labels) : expected;
        const instance: any = this.properties(model.type, model, row.props, model);
        if (model.stampField) {
            instance[model.stampField] = row.props?.[Stamps.PROPERTY] ?? undefined;
            const sets = Object.keys(instance).filter((it) => instance[it] instanceof Set);
            if (model.jsonPacked.size || sets.length) {
                const stored = [...new Set([...model.jsonPacked, ...sets])].map(
                    (it) => model.graphProperties.get(it) ?? it
                );
                packedAsHeld.set(instance, Object.fromEntries(stored.map((it) => [it, row.props?.[it]])));
            }
        }
        if (model.nodeLabels) {
            const field = model.nodeLabels;
            const labels = (row.labels ?? []).filter((it) =>
                field.members ? field.members.includes(it) : !model.labels.includes(it)
            );
            instance[field.field] = field.isSet ? new Set(labels) : labels;
        }
        return instance as T;
    }

    view<T>(model: GraphViewModel, row: ViewRow): T {
        const instance: any = plainToInstance(model.type, {});
        instance[model.rootField] = this.fragment(model.root, row.root);
        for (const rel of model.relationships) {
            const value = row.rels?.[rel.field];
            instance[rel.field] = rel.isCollection
                ? sorted(
                      (value ?? []).map((it: any) => this.related(rel, it)),
                      rel.sortedBy
                  )
                : value == null
                ? undefined
                : this.related(rel, value);
        }
        for (const path of model.paths) {
            const value = row.rels?.[path.field];
            instance[path.field] = path.isCollection
                ? (value ?? []).map((it: FragmentRow) => this.fragment(path.target, it))
                : value == null
                ? undefined
                : this.fragment(path.target, value);
        }
        for (const aggregate of model.aggregates) {
            instance[aggregate.field] = wholeNumbers(row.rels?.[aggregate.field] ?? undefined, !!aggregate.bigInt);
        }
        return instance as T;
    }

    /**
     * Splits a node's properties between its property bags and its other fields. A prefixed bag takes the properties
     * in its namespace; a flat bag takes every property no other bag takes and no known field is stored under: a
     * decorated field, or one the class initializes.
     */
    private takeBags(
        type: Function,
        mapping: FieldMapping,
        source: Record<string, any>,
        fragment?: FragmentModel
    ): { props: Record<string, any>; bags: Record<string, Record<string, any>> } {
        if (!fragment?.propertyBags.length) {
            return { props: source, bags: {} };
        }
        const props: Record<string, any> = {};
        const bags: Record<string, Record<string, any>> = {};
        fragment.propertyBags.forEach((bag) => (bags[bag.field] = {}));
        const flat = fragment.propertyBags.find((it) => it.flat);
        const known = flat ? knownProperties(type, mapping, fragment) : new Set<string>();
        for (const [name, value] of Object.entries(source)) {
            const bag = fragment.propertyBags.find((it) => !it.flat && name.startsWith(it.namespace));
            if (FORBIDDEN_KEYS.has(bag ? name.slice(bag.namespace.length) : name)) {
                continue;
            }
            if (bag) {
                bags[bag.field][name.slice(bag.namespace.length)] = value;
            } else if (flat && !name.startsWith(RESERVED_PREFIX) && !known.has(name)) {
                bags[flat.field][name] = value;
            } else {
                props[name] = value;
            }
        }
        return { props, bags };
    }

    private related(rel: RelationshipModel, value: any): any {
        const related = rel.related;
        return related.kind === 'RELATIONSHIP_FRAGMENT'
            ? this.relationshipFragment(related.model, value)
            : this.target(related, value);
    }

    private relationshipFragment(model: RelationshipFragmentModel, row: RelationshipRow): any {
        const instance: any = this.properties(model.type, model, row.rel);
        instance[model.targetField] = this.target(model.target, row.target);
        return instance;
    }

    private target(into: TargetModel, row: any): any {
        return into.kind === 'GRAPH_VIEW' ? this.view(into.model, row) : this.fragment(into.model, row);
    }

    private properties(
        type: Function,
        mapping: FieldMapping,
        source: Record<string, any>,
        fragment?: FragmentModel
    ): any {
        const fields: Record<string, any> = {};
        const { props, bags }: { props: Record<string, any>; bags: Record<string, any> } = this.takeBags(
            type,
            mapping,
            source ?? {},
            fragment
        );
        refuseIdOfAnotherKind(type, fragment, source);
        Object.assign(fields, bags);
        const byGraphName = new Map([...mapping.graphProperties].map(([field, name]) => [name, field]));
        for (const [name, value] of Object.entries(props)) {
            if (name.startsWith(RESERVED_PREFIX)) {
                continue;
            }
            const field = byGraphName.get(name) ?? (mapping.graphProperties.has(name) ? undefined : name);
            if (
                field === undefined ||
                FORBIDDEN_KEYS.has(field) ||
                mapping.transientFields.has(field) ||
                (value == null && mapping.defaults.has(field))
            ) {
                continue;
            }
            fields[field] = mapping.jsonPacked.has(field) ? unpacked(value) : value;
        }
        wholeNumbersAsDeclared(type, mapping, fields);
        datesAsDeclared(type, mapping, fields);
        const instance = plainToInstance(type as any, fields) as any;
        fragment?.propertyBags.forEach((bag) => (instance[bag.field] = instance[bag.field] ?? {}));
        loadCollections(type, mapping, instance, Object.keys(fields));
        recordTagsAsLoaded(instance, source, props, fields, byGraphName, mapping);
        return instance;
    }
}

/**
 * The kind word of each type TypeScript records for a `@NodeId` field that a temporal tag can't load as: a concrete
 * scalar. An id declared `any`, `unknown`, a union or an interface is recorded as `Object`, and one no decorator records
 * isn't recorded at all: neither is refused, as the user didn't type it.
 */
const SCALAR_ID_KINDS = new Map<unknown, string>([
    [String, 'string'],
    [Number, 'number'],
    [BigInt, 'bigint'],
    [Boolean, 'boolean']
]);

/**
 * Refuses a node whose `@NodeId` property a SQL store held as a temporal tag, where the class declares the id a
 * non-temporal scalar (#813). The read gives the tag as its text, but a lookup by that text compares the id's kind as
 * well, so it misses the node: a save of the loaded object would make a second node with the text id. An id declared a
 * `Date` loads as one (#807), whose lookup binds a datetime's tag, and is not refused. Each read that maps a node comes
 * here: a fragment, a view's root, related node and nested view, a relationship fragment's node and a path's node, by
 * every load, search and update. The message is shared with drivine4j and drivine-python.
 */
function refuseIdOfAnotherKind(type: Function, fragment: FragmentModel | undefined, source: any): void {
    const property = fragment?.nodeIdProperty;
    const field = fragment?.nodeIdField;
    if (!property || !field || source == null || typeof source !== 'object') {
        return;
    }
    const held = tagsHeldBy(source)?.get(property);
    if (!isTag(held) || declaredDate(type, fragment!, field)) {
        return;
    }
    const declared = SCALAR_ID_KINDS.get(Reflect.getMetadata('design:type', type.prototype, field));
    if (!declared) {
        return;
    }
    const kind = held.$t;
    throw new DrivineError(
        `${type.name}'s @NodeId ${field} is declared a ${declared}, but the node whose id is '${source[property]}' ` +
            `holds it as a ${kind}: declare ${field} as a ${kind} to load it.`
    );
}

/**
 * Records, of each field of `instance` loaded from a property of `source` in which the store held a temporal tag, the
 * value the field was given, copied, so a change in place is a change, and what the store held (see tagsAsLoaded). A
 * property a bag took is left out: a save writes a bag's entries as they are.
 */
function recordTagsAsLoaded(
    instance: any,
    source: Record<string, any> | undefined,
    props: Record<string, any>,
    fields: Record<string, any>,
    byGraphName: Map<string, string>,
    mapping: FieldMapping
): void {
    const held = source != null && typeof source === 'object' ? tagsHeldBy(source) : undefined;
    if (!held) {
        return;
    }
    const kept = new Map<string, { value: any; held: any }>();
    for (const [name, stored] of held) {
        const field = byGraphName.get(name) ?? (mapping.graphProperties.has(name) ? undefined : name);
        if (
            field === undefined ||
            !Object.prototype.hasOwnProperty.call(props, name) ||
            !Object.prototype.hasOwnProperty.call(fields, field)
        ) {
            continue;
        }
        kept.set(field, { value: ObjectUtils.deepCopy(instance[field]), held: stored });
    }
    if (kept.size) {
        tagsAsLoaded.set(instance, kept);
    }
}

/**
 * Gives each `@EmptyWhenAbsent` field the node holds nothing for, or null, an empty collection of its kind, and each
 * field declared a Set the list the store holds as a Set. A Set field without `@EmptyWhenAbsent` the node holds nothing
 * for, or null, is left as it is: it keeps its initializer, or stays absent.
 */
function loadCollections(type: Function, mapping: FieldMapping, instance: any, loaded: string[]): void {
    mapping.emptyWhenAbsent.forEach((kind, field) => {
        if (instance[field] == null) {
            instance[field] = emptyCollection(kind);
        } else if (kind === 'set') {
            instance[field] = asSet(instance[field]);
        }
    });
    for (const field of loaded) {
        if (instance[field] != null && !mapping.emptyWhenAbsent.has(field) && declaredSet(type, mapping, field)) {
            instance[field] = asSet(instance[field]);
        }
    }
}

/**
 * Whether the field is declared a Set: as the model records it, or as TypeScript records it for a field only another
 * library's decorator marks, which the model doesn't know of.
 */
function declaredSet(type: Function, mapping: FieldMapping, field: string): boolean {
    return mapping.sets.has(field) || Reflect.getMetadata('design:type', type.prototype, field) === Set;
}

/**
 * A set as a store holds it, as a Set: the list it is stored as, or `{}`, which JSON text and Memgraph held for a set
 * saved before sets were stored as lists, without its items. Any other value is left as it is.
 */
function asSet(value: any): any {
    if (Array.isArray(value)) {
        return new Set(value);
    }
    return value?.constructor === Object && Object.keys(value).length === 0 ? new Set() : value;
}

/**
 * Each field's whole numbers as the model declares them, not as their size would have them (#741): a field declared a
 * bigint loads each as one, with the digits the store kept; any other field loads each as a number, past 2^53 the
 * nearest, as it always has.
 */
function wholeNumbersAsDeclared(type: Function, mapping: FieldMapping, fields: Record<string, any>): void {
    for (const field of Object.keys(fields)) {
        fields[field] = wholeNumbers(fields[field], declaredBigInt(type, mapping, field));
    }
}

/**
 * Each field declared a `Date` as one, on every store (#807): a SQL store, and FalkorDB, give one as its ISO 8601 text,
 * where Neo4j's and Memgraph's drivers give a `Date`, which is left as it is ({@link asDate}). A field of a renamed
 * property is the field's own name here, as the properties are by then. A field TypeScript records no type for, one
 * neither decorated nor initialized, or one declared with a union, such as `Date | null`, is left as the store gives it.
 */
function datesAsDeclared(type: Function, mapping: FieldMapping, fields: Record<string, any>): void {
    for (const field of Object.keys(fields)) {
        if (fields[field] != null && declaredDate(type, mapping, field)) {
            fields[field] = asDate(fields[field]);
        }
    }
}

/**
 * Whether the field is declared a bigint: as the model records it, or as TypeScript records it for a field only another
 * library's decorator marks, which the model doesn't know of (as {@link declaredSet}).
 */
function declaredBigInt(type: Function, mapping: FieldMapping, field: string): boolean {
    return mapping.bigInts.has(field) || Reflect.getMetadata('design:type', type.prototype, field) === BigInt;
}

/**
 * Internal: whether the field is declared a `Date`: as the model records it, or as TypeScript records it for a field only another
 * library's decorator marks, which the model doesn't know of (as {@link declaredSet}).
 */
export function declaredDate(type: Function, mapping: FieldMapping, field: string): boolean {
    return mapping.dates.has(field) || Reflect.getMetadata('design:type', type.prototype, field) === Date;
}

/**
 * Internal: a value of a property declared a `Date` as a `Date`: ISO 8601 text, as a SQL store gives one (the module's
 * canonical text, `2026-01-01T00:00:00Z`, at an offset, with nine digits of the second, or a year before 1 or past 9999,
 * `-0044` and `+12345`, as Java writes them), as the instant it names, read as an id's text is ({@link dateOf}): a time
 * with no offset at UTC, and to the millisecond, as a `Date` holds it. A `Date` a graph engine's driver gave is as it
 * is, and so is anything else: a text that isn't ISO 8601, which JavaScript's parser would guess a date of (`'5'`), and
 * a day the month hasn't (`2026-02-30`).
 */
export function asDate(value: any): any {
    if (typeof value !== 'string') {
        return value;
    }
    // dateOf reads a signed year of five or six digits, and a fraction no finer than a millisecond.
    const date = dateOf(value.replace(/^([+-])(\d{4})-/, '$100$2-').replace(/(\.\d{3})\d+/, '$1'));
    return date === NO_NODE ? value : date;
}

/**
 * Internal: `value`'s whole numbers as bigints where `bigInt`, else as numbers, past 2^53 the nearest: a value the model
 * declares no field for, as a group's key or aggregate, as numbers, as before #741.
 */
export function wholeNumbers(value: any, bigInt: boolean): any {
    return bigInt ? asBigInts(value) : asNumbers(value);
}

/**
 * `value` with each whole number in it, at any depth of its lists and plain maps, a bigint: one a store read as a bigint
 * as it is, with its digits, and one it read as a number of that number's value, exact below 2^53, and past it as near as
 * the store's driver read it (Oracle's, #737). A number with a fraction is left as it is.
 */
function asBigInts(value: any): any {
    if (typeof value === 'number') {
        return Number.isInteger(value) ? BigInt(value) : value;
    }
    if (Array.isArray(value)) {
        return value.map(asBigInts);
    }
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, it]) => [key, asBigInts(it)]));
    }
    return value;
}

/** `value` with each bigint in it, at any depth of its lists and plain maps, the nearest JavaScript number. */
function asNumbers(value: any): any {
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (Array.isArray(value)) {
        return value.some(holdsBigInt) ? value.map(asNumbers) : value;
    }
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return holdsBigInt(value)
            ? Object.fromEntries(Object.entries(value).map(([key, it]) => [key, asNumbers(it)]))
            : value;
    }
    return value;
}

/** Whether `value` is a bigint or holds one, at any depth of its lists and plain maps. */
function holdsBigInt(value: any): boolean {
    if (typeof value === 'bigint') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.some(holdsBigInt);
    }
    return (
        value !== null &&
        typeof value === 'object' &&
        Object.getPrototypeOf(value) === Object.prototype &&
        Object.values(value).some(holdsBigInt)
    );
}

/**
 * A packed JSON value, unpacked, a whole number past 2^53 in it a `bigint` of its digits, as it was saved (#741); a
 * value that isn't JSON text is left as it is.
 */
function unpacked(value: any): any {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return parseExactIntegers(value);
    } catch {
        return value;
    }
}

/** The items sorted by a property path, nulls last; as they are without one. */
function sorted(items: any[], by?: { property: string; ascending: boolean }): any[] {
    if (!by) {
        return items;
    }
    const path = by.property.split('.');
    const valueOf = (item: any): any => path.reduce((it, key) => it?.[key], item);
    const direction = by.ascending ? 1 : -1;
    return items.sort((a, b) => {
        const [x, y] = [valueOf(a), valueOf(b)];
        if (x == null || y == null) {
            return x == null ? (y == null ? 0 : 1) : -1;
        }
        return (x < y ? -1 : x > y ? 1 : 0) * direction;
    });
}
