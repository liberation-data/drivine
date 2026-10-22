import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { QuerySpecification } from '@/query/QuerySpecification';
import { SchemaExecutor } from '@/schema/SchemaExecutor';

/** The methods of a persistence manager that run a statement, and so wait for the store to be made. */
const STATEMENTS = new Set<PropertyKey>(['query', 'execute', 'getOne', 'maybeGetOne', 'openCursor']);

/** The store each database's `ensuring` statement has made, or is making: made once, however many managers ask. */
const made = new Map<string, Promise<void>>();

/**
 * The persistence manager, each of its statements run once `ensuring` has made the store. The statement runs on a
 * connection of its own, outside the transaction a statement may be in, as schema statements run: a transaction that
 * rolled back would take the store with it. One that fails is run again by the next statement.
 */
export function ensuredFirst(persistenceManager: PersistenceManager, ensuring: string): PersistenceManager {
    const ready = async (): Promise<void> => ensureStore(persistenceManager, ensuring);
    return new Proxy(persistenceManager, {
        get(target: any, property: PropertyKey) {
            const value = target[property];
            if (typeof value !== 'function') {
                return value;
            }
            return STATEMENTS.has(property)
                ? async (...args: any[]) => {
                      await ready();
                      return value.apply(target, args);
                  }
                : value.bind(target);
        }
    });
}

/** Makes the store with `ensuring`, once for the persistence manager's database, however many ask. */
export async function ensureStore(persistenceManager: PersistenceManager, ensuring: string): Promise<void> {
    const key = `${persistenceManager.database}\u0000${ensuring}`;
    let making = made.get(key);
    if (!making) {
        making = ensure(persistenceManager, ensuring);
        made.set(key, making);
        making.catch(() => made.delete(key));
    }
    await making;
}

async function ensure(persistenceManager: PersistenceManager, ensuring: string): Promise<void> {
    const provider = DatabaseRegistry.getInstance().connectionProvider(persistenceManager.database);
    if (provider) {
        await new SchemaExecutor(provider).run(ensuring);
    } else {
        await persistenceManager.execute(new QuerySpecification<void>(ensuring));
    }
}
