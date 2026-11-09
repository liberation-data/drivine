import { DrivineError } from '@/DrivineError';

/**
 * A SQLite graph whose tables an earlier Drivine made: their `INTEGER PRIMARY KEY`, without `AUTOINCREMENT`, gives a
 * new row the id of a deleted one, so an element id could name another node or relationship than the one it was read
 * from (liberation-data/drivine4j#713). Thrown as the graph's tables are looked for, on a provider's first connection
 * and on each one after it, and before an object manager's first statement over the graph, rather than logged as a
 * failure to make the tables is: every statement over the graph could give a wrong answer. There is no migration; the
 * message says what to do instead.
 */
export class ReusedIdsError extends DrivineError {
    constructor(
        /** The graph whose tables were made so. */
        readonly graph: string,
        /** The database file, or empty for a database in memory or a temporary one. */
        readonly path: string
    ) {
        super(
            `The SQLite graph '${graph}' in ${path || 'an in-memory database'} was made by an earlier Drivine, whose ` +
                `node and relationship ids could be reused after a delete. Make a new file and save the graph into it ` +
                `again.`
        );
        this.name = 'ReusedIdsError';
    }
}
