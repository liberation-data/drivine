/**
 * Represents a query whereby the statement and parameters have been formatted for the target database platform.
 */
export interface CompiledQuery {
    statement: string;
    parameters: any | undefined;
}
