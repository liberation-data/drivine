import { ModuleStore } from '@/backend/StoreStatements';
import type { LowerCopyFiller } from '@/schema/LowerCopyCatalog';
import type { NativeOperation } from '@/schema/SchemaGrammar';
import { SchemaPlan, SchemaPlanning } from '@/schema/SchemaPlan';

/** What a unit test runs a plan's statements on: one that records or answers each, with no store. */
export interface Runs {
    run(statement: string | NativeOperation, parameters?: Record<string, any>): Promise<any[]>;
}

/**
 * The shared module's schema plan of `store`, its statements, the marker's among them, run by `executor`, and its
 * lowercased copies filled in by `copies` where given: what a manager plans with in a unit test.
 */
export function planningOn(
    store: ModuleStore,
    executor: Runs,
    copies?: LowerCopyFiller,
    graph: string | undefined = store === 'postgres' || store === 'oracle' || store === 'sqlite' ? 'drivine' : undefined
): SchemaPlanning {
    return {
        plan: new SchemaPlan(store, graph),
        database: 'default',
        host: {
            run: async (statement, parameters) => executor.run(statement, parameters),
            marker: async (statement, parameters, _compiled, rows) => {
                const answered = await executor.run(statement, parameters);
                return rows ? answered : [];
            },
            ...(copies
                ? {
                      readLowerCopies: async () => Promise.resolve([] as [string, string][]),
                      fillLowerCopies: async (label: string, properties: string[]) =>
                          copies.fillIn(label, properties, true)
                  }
                : {})
        }
    };
}
