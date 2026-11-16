import { DrivineError } from '@/DrivineError';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';

/** A store as the shared module names one in a `storeStatements` request. */
export type ModuleStore = 'postgres' | 'oracle' | 'sqlite' | 'neo4j' | 'memgraph' | 'falkordb';

/**
 * The statements of each node's stamp, `(:DrivineStore {key: 'singleton'})`, as the module writes them: what makes it
 * where it is not there, what reads every stamp, and what a first connection asks of a graph to judge its layout.
 */
export interface StampStatements {
    /** What makes the table the stamp is written to, on a SQL store; null on a graph engine. */
    prepare: string | null;
    /** Writes the stamp unless one is there: binds what {@link stampParameters} gives. */
    assignIfAbsent: string;
    /** Each stamp, `{id, assignedAt, layout}`, oldest first. */
    readStamps: string;
    /** One row where the graph holds a node other than Drivine's own, none where it doesn't. */
    foreignNodes: string;
    /** Gives the stamp this layout: binds what {@link restampParameters} gives. Null where there is one layout. */
    restampLayout: string | null;
    /** The objects an earlier layout may have left, `{name, type}` each. Null where there is one layout. */
    layoutObjects: string | null;
    /** What keeps the stamp's key unique, in order. */
    constraint: string[];
}

/** The statements of the schema marker, `(:_DrivineSchema {scope})`, as the module writes them. */
export interface MarkerStatements {
    /** What makes the table the marker is written to, on a SQL store; null on a graph engine. */
    prepare: string | null;
    /** The newest marker's `version` or `items` of the scope `$scope`, as text: one row, or none. */
    read: { version: string; items: string };
    /** Writes the scope's marker, making it where there is none: binds what {@link markerParameters} gives. */
    merge: string;
    /** Removes each marker of `$scope` but the newest. */
    deleteAllButNewest: string;
    /** Removes each marker of `$scope`. */
    delete: string;
    /** The scope of every marker, once each; null where the store's Cypher reads them. */
    scopes: string | null;
    /** What a stored inventory opens with, so an empty one reads back empty and not absent: `items:` on Oracle. */
    itemsMark: string;
    /** What keeps a scope's marker one, in order. */
    constraint: string[];
}

/** On Oracle, the statement that finds whether a session may call each of the graph's functions, by compiler flag. */
export interface StoredFunctions {
    probes: Record<string, string>;
    /** The Oracle error numbers that mean a probe's function may not be called. */
    noFunction: number[];
}

/**
 * The store's own statements, as the shared module writes them (its `storeStatements` request, drivine-cypher-spec#107,
 * #135), so TypeScript makes, stamps and marks a store with drivine4j's and drivine-python's statements, byte for byte,
 * and keeps no copy of its own. `store.yaml` and `marker.yaml` pin every one.
 */
export interface StoreStatements {
    /** The store as a stamp names it: `POSTGRES`, `SQLITE`. */
    engine: string;
    /** The store layout a stamp of it records. */
    layout: number;
    /** On a SQL store, what makes the graph's tables, indexes and functions, each safe to run again. */
    ddl?: string[];
    /** On Postgres and Oracle, the block that makes them where the store's version is not the module's. */
    ensuring?: string | null;
    /** On Oracle, what makes each of the graph's functions. */
    functions?: string[];
    /** On Oracle, each function's version, as its `-- drivine:<hash>` says, by name. */
    versions?: Record<string, string>;
    /** On Oracle, see {@link StoredFunctions}. */
    storedFunctions?: StoredFunctions;
    stamp: StampStatements;
    marker: MarkerStatements;
}

/** Each store's statements by store and graph: the module writes them alike each time it is asked. */
const asked = new Map<string, StoreStatements>();

/** The statements of `store`, over the graph named `graph` on a SQL store. */
export function storeStatements(store: ModuleStore, graph?: string): StoreStatements {
    const key = `${store}\u0000${graph ?? ''}`;
    let statements = asked.get(key);
    if (!statements) {
        statements = answer<StoreStatements>(store, graph, {});
        asked.set(key, statements);
    }
    return statements;
}

/**
 * What the stamp's `assignIfAbsent` binds: its key, `storeId`, `assignedAt` and layout, as the module gives them, and the
 * engine `engine`, the manager's own type, which names a store the module writes no statements of too (Neptune), as
 * drivine4j binds it. The module has no clock or random source, so the id and the moment are this process's.
 */
export function stampParameters(
    store: ModuleStore,
    graph: string | undefined,
    storeId: string,
    assignedAt: string,
    engine: string
): Record<string, any> {
    return { ...parameters(store, graph, { stampParameters: { storeId, assignedAt } }), engine };
}

/** What the stamp's `restampLayout` binds. */
export function restampParameters(store: ModuleStore, graph: string | undefined): Record<string, any> {
    return parameters(store, graph, { restamp: true });
}

/**
 * What the marker's `merge` binds: the scope, its version, its inventory `items` (newline-joined keys) as the store holds
 * it, and `appliedAt`, the moment in milliseconds.
 */
export function markerParameters(
    store: ModuleStore,
    graph: string | undefined,
    scope: string,
    version: string | null,
    items: string,
    appliedAt: number
): Record<string, any> {
    return parameters(store, graph, { markerParameters: { scope, version, items, appliedAt } });
}

/** The inventory keys a marker's stored `items` holds, read past its mark; undefined where none was recorded. */
export function markerItems(statements: StoreStatements, stored: string | null | undefined): string[] | undefined {
    if (stored == null) {
        return undefined;
    }
    const mark = statements.marker.itemsMark;
    const items = mark && stored.startsWith(mark) ? stored.slice(mark.length) : stored;
    return items === '' ? [] : items.split('\n');
}

function parameters(store: ModuleStore, graph: string | undefined, asking: Record<string, any>): Record<string, any> {
    return answer<{ parameters: Record<string, any> }>(store, graph, asking).parameters;
}

/** The module's answer to a `storeStatements` request; its error thrown. */
function answer<T>(store: ModuleStore, graph: string | undefined, asking: Record<string, any>): T {
    const request = { storeStatements: { store, ...(graph !== undefined ? { graph } : {}), ...asking } };
    const given = JSON.parse(cypherCompilerModule().compile(JSON.stringify(request)));
    if (given && typeof given === 'object' && 'error' in given) {
        throw new DrivineError(`The shared module wrote no statements for the ${store} store: ${given.error}`);
    }
    return given as T;
}
