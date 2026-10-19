/**
 * How a connection to an engine without multi-statement transactions (such as FalkorDB) handles `@Transactional`
 * boundaries. Engines that do support transactions ignore it.
 */
export enum TransactionMode {
    /**
     * Default. Starting and committing a transaction do nothing, and rolling back logs a warning: every statement
     * has already been committed as it ran.
     */
    WARN = 'WARN',

    /**
     * Starting a transaction throws, so a `@Transactional` method fails at its first statement. Use this to make
     * sure no code path relies on multi-statement transactions against the engine.
     */
    STRICT = 'STRICT'
}
