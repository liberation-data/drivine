import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { QuerySpecification } from '@/query/QuerySpecification';
import { isRefusal } from '@/schema/ddl/SchemaDdlLexer';
import { Reader } from '@/schema/ddl/SchemaDdlReader';
import { SchemaDdlResult } from '@/schema/ddl/SchemaDdlResult';

export { defaultName, isReserved } from '@/schema/ddl/SchemaDdlReader';

/** The stores whose Cypher is compiled to SQL, where Drivine runs schema DDL itself. */
export const SCHEMA_DDL_STORES: DatabaseType[] = [DatabaseType.POSTGRES, DatabaseType.ORACLE, DatabaseType.SQLITE];

/** Why a schema command is not compiled: it is no query, and a PersistenceManager runs it. */
export const SCHEMA_COMMAND =
    "The statement is a schema command, which is not compiled to SQL: run it through a PersistenceManager, which applies it to the store's schema.";

/**
 * Reads Neo4j's schema DDL as Drivine's schema specs: a pure function of the text, which touches no store.
 *
 * Neo4j's schema commands are not Cypher queries (openCypher's grammar has no rules for them), so they are read here,
 * by hand, and not by the Cypher reader. A statement is taken for DDL only where it opens with one of these sequences
 * of keywords, so that Cypher that merely uses the words, such as `CREATE index = (a)-[:R]->(b)` or a variable named
 * `index`, reads as Cypher still (`NOT_DDL`):
 *
 * - `CREATE [RANGE | BTREE | TEXT | FULLTEXT | VECTOR | POINT | LOOKUP] INDEX`, not followed by `=`;
 * - `CREATE CONSTRAINT`, not followed by `=`;
 * - `DROP INDEX` and `DROP CONSTRAINT`;
 * - `CALL db.awaitIndexes` and `CALL db.awaitIndex`.
 *
 * What it reads:
 *
 * | DDL | Spec |
 * |---|---|
 * | `CREATE [RANGE] INDEX [name] [IF NOT EXISTS] FOR (n:L) ON (n.a, n.b)`, or Neo4j 4's `ON :L(a, b)` | `rangeIndex` |
 * | `CREATE CONSTRAINT [name] [IF NOT EXISTS] FOR (n:L) REQUIRE n.p IS [NODE] UNIQUE`, `REQUIRE (n.a, n.b) IS UNIQUE`, or Neo4j 4's `ON (n:L) ASSERT n.p IS UNIQUE` | `uniquenessConstraint` |
 * | `CREATE FULLTEXT INDEX … FOR (n:L) ON EACH [n.a, …] [OPTIONS {indexConfig: {`fulltext.analyzer`: …}}]` | `fullTextIndex`, and the analyzer |
 * | `CREATE VECTOR INDEX … FOR (n:L) ON n.p OPTIONS {indexConfig: {`vector.dimensions`: …}}` | `vectorIndex` |
 * | `CREATE TEXT INDEX … FOR (n:L) ON (n.p)` | Neo4j's TEXT index, which only Neo4j makes |
 * | `DROP INDEX name [IF EXISTS]`, `DROP CONSTRAINT name [IF EXISTS]` | `DROP` |
 * | `CALL db.awaitIndexes(…)`, `CALL db.awaitIndex(…)` | `AWAIT_INDEXES` |
 *
 * A name is a plain identifier or one in backticks, a doubled backtick in it standing for one. Keywords are read in any
 * case. A statement may end with a `;`.
 *
 * What a SQL store cannot honour is refused by name (`REFUSED`): POINT and LOOKUP indexes, relationship indexes and
 * constraints, an index or constraint over several labels, existence (`IS NOT NULL`), key (`IS NODE KEY`) and type
 * (`IS :: TYPE`) constraints, a vector index over several properties or `WITH` properties to filter by, and one with no
 * `vector.dimensions`; Neo4j 4's `DROP … ON` by label and properties; a name or `OPTIONS` given as a parameter; and any
 * schema for the labels of Drivine's own nodes but their own uniqueness constraints, which read as `RESERVED`.
 *
 * drivine4j's `SchemaDdl` reads the same, and drivine-cypher-spec's `schema.yaml` pins it for the three libraries.
 */
export class SchemaDdl {
    static translate(text: string): SchemaDdlResult {
        const reader = new Reader(text);
        try {
            if (reader.word(0, 'CREATE')) {
                return reader.create();
            }
            if (reader.word(0, 'DROP') && (reader.word(1, 'INDEX') || reader.word(1, 'CONSTRAINT'))) {
                return reader.drop();
            }
            if (reader.word(0, 'CALL')) {
                return reader.call();
            }
            return { type: 'NOT_DDL' };
        } catch (e) {
            if (isRefusal(e)) {
                return { type: 'REFUSED', message: e.message };
            }
            throw e;
        }
    }
}

/**
 * The schema DDL a specification is, run on a store of `type`: undefined where it is none, where the store runs Cypher
 * itself and is sent the statement as it is, or where the statement is not Cypher.
 */
export function schemaDdlOf(type: DatabaseType, spec: QuerySpecification<unknown>): SchemaDdlResult | undefined {
    if (!SCHEMA_DDL_STORES.includes(type) || spec.statement?.language !== 'CYPHER') {
        return undefined;
    }
    const ddl = SchemaDdl.translate(spec.statement.text);
    return ddl.type === 'NOT_DDL' ? undefined : ddl;
}

/** How a SQL store is named in what is said of it. */
export function storeName(type: DatabaseType): string {
    switch (type) {
        case DatabaseType.SQLITE:
            return 'SQLite';
        case DatabaseType.POSTGRES:
            return 'Postgres';
        case DatabaseType.ORACLE:
            return 'Oracle';
        default:
            return String(type);
    }
}

/**
 * Whether the specification, run on a store of `type` inside an open transaction, is `db.awaitIndexes`, which does
 * nothing there; throws for any other schema DDL, which Drivine runs on connections of its own and the transaction's
 * rollback would not undo. False for a statement that is no DDL.
 */
export function refusedInTransaction(type: DatabaseType, spec: QuerySpecification<unknown>): boolean {
    const ddl = schemaDdlOf(type, spec);
    if (!ddl) {
        return false;
    }
    if (ddl.type === 'AWAIT_INDEXES') {
        return true;
    }
    if (ddl.type === 'REFUSED') {
        throw new DrivineError(ddl.message, undefined, spec);
    }
    throw new DrivineError(
        `A schema command is not run inside a transaction on ${storeName(type)}: ` +
            "Drivine applies it on connections of its own, which the transaction's rollback would not undo. " +
            'Run it outside the transaction, with a non-transactional PersistenceManager.',
        undefined,
        spec
    );
}
