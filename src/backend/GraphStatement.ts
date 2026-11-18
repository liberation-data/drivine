import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * The stored functions of the Oracle graph `graph` a statement calls, as the shared module's fragments in it say
 * (`SqlFragments.callsStoredNullsEqual`, `callsStoredEra`): the connection makes sure the session may call them before it
 * runs the statement (see OracleConnection).
 */
export interface StoredFunctionCalls {
    graph: string;
    nullsEqual: boolean;
    era: boolean;
}

/**
 * A statement a backend generated, and the parameters it binds.
 */
export class GraphStatement {
    constructor(
        readonly text: string,
        readonly bindings: Record<string, any> = {},
        /** The stored functions it calls, on Oracle, where it calls any. */
        readonly calls?: StoredFunctionCalls
    ) {}

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        // Drivine's own statement: its JSON keeps a whole number's digits where the store reads it so.
        const spec = new QuerySpecification<T>(this.text).bind({ ...this.bindings, ...more }).exactIntegers();
        return this.calls ? spec.callsStoredFunctions(this.calls) : spec;
    }
}
