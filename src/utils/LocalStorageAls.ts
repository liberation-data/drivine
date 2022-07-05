import { LocalStorage } from './LocalStorage';
import { AsyncLocalStorage } from 'async_hooks';

export class LocalStorageAls implements LocalStorage {
    asyncLocalStorage = new AsyncLocalStorage<Map<string, any>>();

    run(fn: (...args: any[]) => void): void {
        this.asyncLocalStorage.run(new Map(), fn);
    }

    runAndReturn<T>(fn: (...args: any[]) => T): T {
        this.asyncLocalStorage.enterWith(new Map());
        const result = fn();
        this.asyncLocalStorage.exit(() => {
            // nothing to do
        });
        return result;
    }

    async runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T> {
        let result;
        // types are wrong. It supports Promises: https://nodejs.org/api/async_hooks.html#async_hooks_usage_with_async_await
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        await this.asyncLocalStorage.run(new Map(), async () => {
            result = await fn();
            return result;
        });
        return result as any;
    }

    isInsideRun(): boolean {
        return this.asyncLocalStorage.getStore() !== undefined;
    }

    get<T>(key: string): T {
        return this.asyncLocalStorage.getStore()?.get(key);
    }

    set<T>(key: string, object: T): void {
        if (!this.isInsideRun()) {
            throw new Error(
                `Trying to write to LocalStorage outside "run" method. Use LocalStorage inside "run" methods, or check and ignore this write using "isInsideRun()".`
            );
        }
        const store = this.asyncLocalStorage.getStore();
        // eslint-disable-next-line no-unused-expressions
        store?.set(key, object);
    }

    tearDown(): void {
        this.asyncLocalStorage.disable();
    }
}
