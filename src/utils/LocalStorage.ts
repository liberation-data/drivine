
export interface LocalStorage {
    
    run(fn: (...args: any[]) => void): void;
    runAndReturn<T>(fn: (...args: any[]) => T): T;
    runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T>;

    get<T>(key: string): T;
    set<T>(key: string, object: T): void;

    tearDown(): void;
}
