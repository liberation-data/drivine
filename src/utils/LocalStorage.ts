export interface LocalStorage {
    run(fn: (...args: any[]) => void): void;
    runAndReturn<T>(fn: (...args: any[]) => T): T;
    runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T>;
    /**
     * Runs `fn` in a store of its own that starts as a copy of the current one: what `fn` sets is seen by it and by
     * what it calls, not by the code beside it. Outside a run, `fn` runs as it is.
     */
    runPromiseInCopy<T>(fn: () => Promise<T>): Promise<T>;

    get<T>(key: string): T;
    set<T>(key: string, object: T): void;

    isInsideRun(): boolean;

    tearDown(): void;
}
