import { LocalStorage } from "./LocalStorage";
import { Namespace } from "cls-hooked";
import * as cls  from 'cls-hooked';
import { v4 } from 'uuid';

export class LocalStorageClsHooked implements LocalStorage {

    readonly namespace: Namespace;

    constructor() {
        const namespaceName = `__local_storage_${v4()}__`;
        this.namespace = cls.createNamespace(namespaceName);
    }

    run(fn: (...args: any[]) => void): void {
        return this.namespace.run(fn);
    }

    runAndReturn<T>(fn: (...args: any[]) => T): T {
        return this.namespace.runAndReturn(fn);
    }

    async runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T> {
        return this.namespace.runPromise(fn);
    }

    isInsideRun(): boolean {
        return !!this.namespace.active;
    }

    get<T>(key: string): T {
        return this.namespace.get(key);
    }

    set<T>(key: string, object: T): void {
        this.namespace.set(key, object);
    }

    tearDown(): void {
        /*
         * Zeroing _contexts as heaviest part of namespace in case we 
         * have leak and Namespace or ContextHolder is not released, even we manually called "tearDown"
         */
        this.namespace['_contexts'] = null;

        const namespaceName = this.namespace['name'];
        cls.destroyNamespace(namespaceName);
    }

}