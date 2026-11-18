import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { storeStatements } from '@/backend/StoreStatements';

/** What a session's check needs of a connection: node-oracledb's `execute`. */
export interface Executes {
    execute(sql: string): Promise<unknown>;
}

/**
 * Whether a session may call the functions a graph's store keeps beside its tables (see `OracleGraph.functions`). A
 * store made by an earlier version lacks those added since until the graph is ensured again, and a user who may not
 * make a function (`CREATE PROCEDURE`) has none at all: a Cypher statement is then compiled to call none of those it
 * lacks, and says so once for each graph and function. drivine4j's `OracleStoredFunctions`.
 *
 * Asked only by a statement that would call one. A session that may call it is remembered for the database, its user
 * and the graph, for as long as the process runs: a function dropped after that is not noticed, and a statement that
 * calls it fails until the process restarts. One that may not is remembered for {@link ABSENT_FOR_MS}, or until the
 * graph is ensured in this process (see `OracleGraph.ensure`), so a store without the function is not asked on every
 * statement, and a graph ensured later still gains it.
 */
export class OracleStoredFunctions {
    /** How long a session found to call no function is taken to call none before it is asked again. */
    static readonly ABSENT_FOR_MS = 60_000;

    private static readonly logger = new DrivineLogger(OracleStoredFunctions.name);

    /** The function, and the database, user and graph, of each session found to call it. */
    private static readonly callable = new Set<string>();

    /** The function, and the database, user and graph, of each session found to call none, and when ({@link clock}) to ask again. */
    private static readonly absent = new Map<string, number>();

    /** The function, and the database, user and graph, of each session that was said to have none. */
    private static readonly warned = new Set<string>();

    /** Milliseconds, as `performance.now()` counts them: replaced by a test that lets {@link ABSENT_FOR_MS} pass. */
    static clock: () => number = () => performance.now();

    /**
     * Whether `connection` may call the function the graph `graph` compares two values that may hold a null by. It
     * calls the function: one another user's store keeps, read through a synonym, is called as the graph's tables are.
     * A query that fails rolls back only itself, so a transaction open on `connection` is left as it was.
     *
     * @param database the database and the user the session is of, which with the graph keys what is remembered
     * @throws where calling it fails for any reason but there being no function it may call
     */
    static async nullsEqual(connection: Executes, database: string, graph: string): Promise<boolean> {
        return this.asked(
            connection,
            database,
            graph,
            `${graph}_nulls_equal`,
            probe(graph, 'nullsEqualStored'),
            'Until the graph is ensured by such a user, a Cypher statement that writes, or the step of a reduce(), ' +
                'compares two lists or maps that hold a null and differ as JSON as false, where Cypher may give null.'
        );
    }

    /**
     * Whether `connection` may call both the functions the graph `graph` renumbers a year that may be BC by, as
     * {@link nullsEqual} asks of its own. They are asked of together, as a statement that calls either is compiled to
     * call neither where the session may not call one: the graph is made with both at once, and a store that has neither
     * gives the same rows, planned more slowly. They are asked of apart from {@link nullsEqual}'s, which a store made by
     * a version before them has.
     *
     * @param database the database and the user the session is of, which with the graph keys what is remembered
     * @throws where calling them fails for any reason but there being no function it may call
     */
    static async era(connection: Executes, database: string, graph: string): Promise<boolean> {
        return this.asked(
            connection,
            database,
            graph,
            `${graph}_era, ${graph}_era_date and ${graph}_temporal_key`,
            probe(graph, 'eraStored'),
            'Until the graph is ensured by such a user, Oracle takes longer to plan a Cypher statement that reads or ' +
                'writes a date or a moment whose year may be before 1000; it gives the same rows.'
        );
    }

    /**
     * Whether `connection` may call the function the graph `graph` works out `+`, `-`, `*` and `/` of a temporal value
     * read from the store by, as {@link nullsEqual} asks of its own: asked of apart, as a store made by a version before
     * it has the others.
     *
     * @param database the database and the user the session is of, which with the graph keys what is remembered
     * @throws where calling it fails for any reason but there being no function it may call
     */
    static async temporalArithmetic(connection: Executes, database: string, graph: string): Promise<boolean> {
        return this.asked(
            connection,
            database,
            graph,
            `${graph}_temporal_arith`,
            probe(graph, 'temporalArithmeticStored'),
            "Until the graph is ensured by such a user, an order of the query DSL by arithmetic of a property's value " +
                'is refused.'
        );
    }

    /** Asks again, of every session, whether it may call the functions of `graph`: it has just been ensured. */
    static ensured(graph: string): void {
        for (const key of [...this.absent.keys()]) {
            if (key.endsWith(`|${graph}`)) {
                this.absent.delete(key);
            }
        }
    }

    /**
     * Whether `connection` may call `name`, the function or functions of `graph` that `query` calls, saying `lost`, what
     * a statement does without them, once where it may not. Remembered by the function, as well as the database, the
     * user and the graph: a store made by an earlier version may have one function and not another.
     */
    private static async asked(
        connection: Executes,
        database: string,
        graph: string,
        name: string,
        query: string,
        lost: string
    ): Promise<boolean> {
        const key = `${name}|${database}|${graph}`;
        if (this.callable.has(key)) {
            return true;
        }
        const now = this.clock();
        const until = this.absent.get(key);
        if (until !== undefined && now < until) {
            return false;
        }
        let found: boolean;
        try {
            await connection.execute(query);
            found = true;
        } catch (e) {
            if (!noFunction(graph).includes((e as { errorNum?: number }).errorNum ?? -1)) {
                throw e;
            }
            found = false;
        }
        if (found) {
            this.callable.add(key);
            this.absent.delete(key);
            return true;
        }
        this.absent.set(key, now + this.ABSENT_FOR_MS);
        if (!this.warned.has(key)) {
            this.warned.add(key);
            this.logger.warn(
                `The Oracle graph '${graph}' has no function ${name}, which the graph is made with where its user may ` +
                    `make a function (CREATE PROCEDURE, which the RESOURCE role grants). ${lost}`
            );
        }
        return false;
    }
}

/** The module's statement that finds whether a session may call the functions the compiler flag `flag` names. */
function probe(graph: string, flag: string): string {
    const statement = storeStatements('oracle', graph).storedFunctions?.probes[flag];
    if (statement === undefined) {
        throw new DrivineError(`The shared module has no statement that finds whether a session may call ${flag}.`);
    }
    return statement;
}

/**
 * The Oracle error numbers that mean a probe's function may not be called, as the module gives them: ORA-00904 where
 * there is no such function (Oracle says the same of one it may not execute, and of a synonym for one that is gone),
 * ORA-06575 where it is not valid, and ORA-00942 or ORA-01031 where something it reads is not granted. Any other error,
 * a connection lost among them, is the statement's to report.
 */
function noFunction(graph: string): number[] {
    return storeStatements('oracle', graph).storedFunctions?.noFunction ?? [];
}
