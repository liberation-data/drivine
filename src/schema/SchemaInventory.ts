/**
 * The prefix of an inventory entry for an item ensured at runtime (`SchemaManager.ensure`): drivine4j's. An inventory
 * key starts with its kind, never with this.
 */
export const RUNTIME_PREFIX = 'runtime:';

/** The prefix of an entry for an item ensured at runtime that is to be recreated when it is next ensured. */
export const STALE_RUNTIME_PREFIX = 'runtime-stale:';

/**
 * What an owner's marker recorded: the key of every item applied, which of them were ensured at runtime rather than
 * declared by a catalog, and which of those are to be recreated when next ensured, because the owner was recreated
 * while their specs were not known.
 */
export interface RecordedInventory {
    keys: string[];
    runtime: Set<string>;
    stale: Set<string>;
}

/** Reads a marker's inventory entries, as a backend's `markerItems` gives them; undefined for none recorded. */
export function readInventory(entries: string[] | undefined): RecordedInventory | undefined {
    if (entries === undefined) {
        return undefined;
    }
    const recorded: RecordedInventory = { keys: [], runtime: new Set(), stale: new Set() };
    for (const entry of entries) {
        if (entry.startsWith(STALE_RUNTIME_PREFIX)) {
            const key = entry.slice(STALE_RUNTIME_PREFIX.length);
            recorded.keys.push(key);
            recorded.runtime.add(key);
            recorded.stale.add(key);
        } else if (entry.startsWith(RUNTIME_PREFIX)) {
            const key = entry.slice(RUNTIME_PREFIX.length);
            recorded.keys.push(key);
            recorded.runtime.add(key);
        } else {
            recorded.keys.push(entry);
        }
    }
    return recorded;
}

/**
 * The marker's `items` for an inventory: a key to a line, those in `runtime` prefixed `runtime:` and those in `stale`
 * `runtime-stale:`, so the marker keeps its shape on every engine.
 */
export function inventoryEntries(
    keys: string[],
    runtime: ReadonlySet<string> = new Set(),
    stale: ReadonlySet<string> = new Set()
): string {
    return keys
        .map((key) => (stale.has(key) ? STALE_RUNTIME_PREFIX + key : runtime.has(key) ? RUNTIME_PREFIX + key : key))
        .join('\n');
}
