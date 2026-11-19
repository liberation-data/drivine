import type { GraphBackend } from '@/backend/GraphBackend';
import { idSql, SharedStore } from '@/cypher/SharedCypherCompiler';
import { HeldAsLoaded, heldKey } from '@/cypher/ValueLayout';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { ObjectUtils } from '@/utils/ObjectUtils';
import { FragmentModel } from '@/model/FragmentModel';

/**
 * A node's id as a SQL store holds it, in the store layout 2 (liberation-data/drivine-cypher-spec#161), and an id given to
 * find a node by, made into that: drivine4j's `NodeIds`.
 *
 * A node holds its id as JSON: a number as a number, a text as a text, a temporal value as its tag. A range index or a
 * uniqueness constraint is over that JSON (Postgres) or over its class and key (Oracle and SQLite), so a statement that
 * finds a node by its id compares the property with the id's JSON, as the shared module writes the comparison
 * ({@link hasId}), and the index answers it.
 *
 * An id given as text, as a load or a delete by id may give it, is first made a value of the `@NodeId` field's own type
 * ({@link typedId}). Text that is no value of the type, `"abc"` for a number id, finds no node, as on Neo4j, where it is
 * never equal to a number: no statement is run for it.
 */

/** What {@link typedId} gives for an id that finds no node: null, or text that is no value of the id's type. */
export const NO_NODE: unique symbol = Symbol('drivine: no node has this id');

/** A decimal number's text, as JSON writes one: no hexadecimal, no spaces, no empty text. */
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

/** A whole number's text. */
const INTEGER = /^-?(0|[1-9]\d*)$/;

/**
 * ISO 8601 text of a date, or of a date and time: what a `Date` id is given as, and what a SQL store's tag reads one back
 * as, a year past 9999 with five digits (`+12345`), as Java writes it. A fraction of a second no finer than a millisecond,
 * as a `Date` holds no finer one: JavaScript drops the rest (`.1239` is `.123`).
 */
const ISO_DATE = /^([+-]\d{5,6}|\d{4})-(\d{2})-(\d{2})(T(\d{2}):\d{2}(:\d{2}(\.\d{1,3}0*)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * `given` as a node of `model` holds its id: text given for an id of another type read as that type, as TypeScript
 * records the `@NodeId` field's type (`design:type`); a number field's `"6"` is 6, a bigint field's is 6n, a `Date`
 * field's ISO text is that `Date`, and a boolean field's `"true"` is true. Any other value, and text for a `string` id or
 * one whose type isn't recorded, is as it is given. {@link NO_NODE} for null, and for text that is no value of the type.
 */
export function typedId(model: FragmentModel, given: unknown): unknown {
    if (given == null) {
        return NO_NODE;
    }
    if (typeof given !== 'string') {
        return given;
    }
    const type = model.nodeIdField && model.bigInts?.has(model.nodeIdField) ? BigInt : model.nodeIdType;
    const read = READERS.find(([it]) => it === type)?.[1];
    return read ? read(given) : given;
}

/** How text is read as a value of each type an id's text is read as; NO_NODE where it is no value of the type. */
const READERS: [Function, (text: string) => unknown][] = [
    [Number, (text) => (NUMBER.test(text) && Number.isFinite(Number(text)) ? Number(text) : NO_NODE)],
    [BigInt, (text) => (INTEGER.test(text) ? BigInt(text) : NO_NODE)],
    [Date, (text) => dateOf(text)],
    [Boolean, (text) => (text === 'true' ? true : text === 'false' ? false : NO_NODE)]
];

/**
 * ISO text as the `Date` it is; NO_NODE for any other text, and for a day the month hasn't or the hour 24, which
 * JavaScript rolls into the next (`2024-02-30` is 1 March), and for the year -0, which JavaScript reads as another
 * (`-000000-01-01` is 1 January 2001), as drivine4j's strict ISO reading refuses them.
 */
export function dateOf(text: string): unknown {
    const parts = ISO_DATE.exec(text);
    if (
        !parts ||
        Number(parts[5] ?? 0) > 23 ||
        Object.is(Number(parts[1]), -0) ||
        !isCalendarDay(Number(parts[1]), Number(parts[2]), Number(parts[3]))
    ) {
        return NO_NODE;
    }
    // JavaScript reads a signed year of six digits only, and a time with no offset as local time: it is UTC, as a day is.
    const date = new Date(text.replace(/^([+-])(\d{5})-/, '$10$2-') + (parts[4] && !parts[8] ? 'Z' : ''));
    return Number.isNaN(date.getTime()) ? NO_NODE : date;
}

/** Whether the month of the year has the day. */
function isCalendarDay(year: number, month: number, day: number): boolean {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whether `backend` keeps its graph in SQL tables, where an id is found as {@link typedId} reads it. */
export function isSqlBackend(backend: GraphBackend): boolean {
    const store: string = backend.moduleStore.store;
    return store === 'postgres' || store === 'oracle' || store === 'sqlite';
}

const logger: DrivineLogger = new DrivineLogger('NodeIds');

/**
 * Each `Date` a SQL store's load gave as a node's id, with the value it was given, copied, and the temporal tag the store
 * held (see GraphObjectMapper's recordTagsAsLoaded). Kept only as long as the `Date` is.
 */
const idsAsLoaded = new WeakMap<object, { value: any; held: any }>();

/**
 * Internal: records that a SQL store's load gave `id` as a node's id, from the tag `loaded.held`, so a lookup given that
 * value finds the node by the tag (see lookupId). Only an id that is an object, a `Date`, can be told apart from another
 * of its value: text an id declared `any` loaded as is any text.
 */
export function recordIdAsLoaded(id: unknown, loaded: { value: any; held: any }): void {
    if (id !== null && typeof id === 'object') {
        idsAsLoaded.set(id, loaded);
    }
}

/**
 * `given`, a `Date` a SQL store's load gave as an id and unchanged since, as the tag the store held it as, which a lookup
 * binds (#815): a `date`, a `localdatetime`, an offset or a fraction finer than a millisecond, which a `Date` written
 * afresh would miss. Undefined for any other value.
 */
function heldAsLoaded(given: unknown): HeldAsLoaded | undefined {
    const loaded = given !== null && typeof given === 'object' ? idsAsLoaded.get(given) : undefined;
    return loaded && ObjectUtils.deepEqual(given, loaded.value) ? new HeldAsLoaded(given, loaded.held) : undefined;
}

/**
 * The id a lookup of a node of `model` by `given` binds on `backend`: on a SQL store `given` read as the id's type
 * ({@link typedId}), and {@link NO_NODE} where it finds no node, which the caller runs no statement for, logging why at
 * DEBUG; on a graph engine `given` as it is, as the engine compares it. A `Date` a SQL store's load gave as an id, and
 * unchanged since, is the tag the store held it as (#815), so `update`, `patch`, `delete`, a load and a relationship's end
 * given a loaded object's id find its node.
 */
export function lookupId(backend: GraphBackend, model: FragmentModel, given: unknown): unknown {
    if (!isSqlBackend(backend)) {
        return given;
    }
    const held = heldAsLoaded(given);
    if (held) {
        return held;
    }
    const id = typedId(model, given);
    if (id === NO_NODE && given != null) {
        logger.debug(
            `No ${model.type.name} is looked for by the id '${String(given)}': it is no value of ${
                model.nodeIdField
            }'s type, so no node has it.`
        );
    }
    return id;
}

/**
 * Whether the property `property` of the node row `alias` is the id whose JSON, as the node holds it, is `json`, the SQL
 * of a bound value: the shared module's comparison ({@link idSql}), which the store's index over the id answers.
 */
export function hasId(store: SharedStore, alias: string, property: string, json: string): string {
    return idSql(store, 'hasId', alias, heldKey(property), json);
}

/**
 * The id `id` as the text a write plan keys its node by, within the plan, where `layout` is the JSON text the store's
 * layout holds it as: a temporal value's tag (`{"$t": …, "v": …}`) as its text `v`, as the module writes it and reads a
 * stored target's id back as (drivine4j's `NodeIds.temporalText`); undefined for any other id.
 */
export function temporalText(layout: string): string | undefined {
    if (!layout.startsWith('{"$t"')) {
        return undefined;
    }
    const tag = JSON.parse(layout);
    return typeof tag?.v === 'string' ? tag.v : undefined;
}

/**
 * `id` as a store reads a node's id back, where the manager matches what a statement hands back to its objects: a `Date`
 * by its time, as its ISO text; a `bigint` within 2^53 as the number Oracle and Neo4j read it as; and, given the node's
 * `model`, text read as the id's type first ({@link typedId}), as Oracle reads a date back as its tag's text `v` and
 * FalkorDB as the text with nine digits of the second it holds it as. Any other id is as it is. A `Map` finds a `Date` by
 * the object, never by its value, and a `bigint` never by a number, so the object's id and the id read back are matched
 * as this reads both. An id a save binds as held as loaded is its value (see asGiven).
 */
export function readBackKey(given: unknown, model?: FragmentModel): unknown {
    const id = asGiven(given);
    const typed = model && typeof id === 'string' ? typedId(model, id) : id;
    const it = typed === NO_NODE ? id : typed;
    if (it instanceof Date) {
        return Number.isNaN(it.getTime()) ? String(it) : it.toISOString();
    }
    return typeof it === 'bigint' && Number.isSafeInteger(Number(it)) ? Number(it) : it;
}

/**
 * An id as the object holds it: one a save binds as the tag it was loaded from (see SaveStatementBuilder's boundIdOf)
 * as its value, so what a statement hands back for it is matched by the id the object holds.
 */
function asGiven(id: unknown): unknown {
    return id instanceof HeldAsLoaded ? id.value : id;
}

/**
 * `id` as itself, by value: a `Date` by its time, and any other value by its type and value, so that two ids that
 * {@link readBackKey} reads alike (a `Date` and its text, where the id's field takes both) stay apart, as a store that
 * hands each id back as it was given (Postgres, SQLite, Neo4j, Memgraph) holds them apart. An id a save binds as held
 * as loaded is its value (see asGiven).
 */
export function exactKey(given: unknown): unknown {
    const id = asGiven(given);
    if (id instanceof Date) {
        return `date:${id.getTime()}`;
    }
    return id !== null && (typeof id === 'object' || typeof id === 'function') ? id : `${typeof id}:${String(id)}`;
}

/**
 * What a statement hands back for each node, by its id, found by the id an object holds: by the id exactly first
 * ({@link exactKey}), and by {@link readBackKey} only where that misses, as Oracle reads the id from the node and FalkorDB
 * gives a date as its text (drivine-python's `_keyed`).
 */
export class HandedBack<V> {
    private readonly exact = new Map<unknown, V>();
    private readonly read = new Map<unknown, V>();

    constructor(
        private readonly model?: FragmentModel,
        entries: Iterable<[unknown, V]> = []
    ) {
        for (const [id, value] of entries) {
            this.set(id, value);
        }
    }

    set(id: unknown, value: V): void {
        this.exact.set(exactKey(id), value);
        this.read.set(readBackKey(id, this.model), value);
    }

    has(id: unknown): boolean {
        return this.exact.has(exactKey(id)) || this.read.has(readBackKey(id, this.model));
    }

    get(id: unknown): V | undefined {
        const key = exactKey(id);
        return this.exact.has(key) ? this.exact.get(key) : this.read.get(readBackKey(id, this.model));
    }
}
