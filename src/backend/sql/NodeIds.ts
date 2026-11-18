import type { GraphBackend } from '@/backend/GraphBackend';
import { idSql, SharedStore } from '@/cypher/SharedCypherCompiler';
import { heldKey } from '@/cypher/ValueLayout';
import { DrivineLogger } from '@/logger/DrivineLogger';
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

/** ISO 8601 text of a date, or of a date and time: what a `Date` id is given as. */
const ISO_DATE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(T(\d{2}):\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

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
 * JavaScript rolls into the next (`2024-02-30` is 1 March), as drivine4j's strict ISO reading refuses them.
 */
function dateOf(text: string): unknown {
    const parts = ISO_DATE.exec(text);
    if (!parts || Number(parts[5] ?? 0) > 23 || !isCalendarDay(Number(parts[1]), Number(parts[2]), Number(parts[3]))) {
        return NO_NODE;
    }
    const date = new Date(text);
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
 * The id a lookup of a node of `model` by `given` binds on `backend`: on a SQL store `given` read as the id's type
 * ({@link typedId}), and {@link NO_NODE} where it finds no node, which the caller runs no statement for, logging why at
 * DEBUG; on a graph engine `given` as it is, as the engine compares it.
 */
export function lookupId(backend: GraphBackend, model: FragmentModel, given: unknown): unknown {
    if (!isSqlBackend(backend)) {
        return given;
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
 * as this reads both.
 */
export function readBackKey(id: unknown, model?: FragmentModel): unknown {
    const typed = model && typeof id === 'string' ? typedId(model, id) : id;
    const it = typed === NO_NODE ? id : typed;
    if (it instanceof Date) {
        return Number.isNaN(it.getTime()) ? String(it) : it.toISOString();
    }
    return typeof it === 'bigint' && Number.isSafeInteger(Number(it)) ? Number(it) : it;
}
