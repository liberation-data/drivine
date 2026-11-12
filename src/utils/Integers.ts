/**
 * Whether `value` is a 64-bit integer as the Neo4j driver gives one: an object with numbers `low` and `high` and a
 * `toNumber` function. Told by its shape, not by importing the driver, so code that runs in a page needs no
 * `neo4j-driver`. A plain map of `low` and `high`, with no `toNumber`, is a map, not an integer.
 */
export function isInt(value: unknown): value is { low: number; high: number; toNumber(): number } {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const it = value as Record<string, unknown>;
    return typeof it.low === 'number' && typeof it.high === 'number' && typeof it.toNumber === 'function';
}
