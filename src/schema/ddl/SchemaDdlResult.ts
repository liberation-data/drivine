import { SchemaSpec } from '@/schema/SchemaCatalog';
import { UniquenessConstraintSpec } from '@/schema/SchemaSpecs';

/**
 * Neo4j's TEXT index over one property, which `CREATE TEXT INDEX` reads as. Drivine's schema API makes none, and the SQL
 * stores refuse it when it is applied: it is read so that the refusal names it.
 */
export interface TextIndexDdlSpec {
    kind: 'TEXT';
    label: string;
    properties: [string];
}

/** What `CREATE … INDEX` or `CREATE CONSTRAINT` reads as: a spec of Drivine's schema API, or Neo4j's TEXT index. */
export type DdlSpec = SchemaSpec | TextIndexDdlSpec;

/**
 * What `SchemaDdl.translate` makes of a statement: Neo4j's schema DDL as Drivine's schema specs, a refusal, or not DDL
 * at all.
 *
 * - `NOT_DDL`: the statement is not schema DDL. It is Cypher, or anything else, to be run or compiled as it is.
 * - `CREATE`: `CREATE … INDEX` or `CREATE CONSTRAINT`, as `spec`. The spec is unnamed, so the name the schema API gives
 *   it (`itemName`) is the name it is made under. A name the DDL gave that differs from that one is `alias`, kept beside
 *   the item so that a `DROP` of it finds the item. A full-text index's `analyzer` is the one its OPTIONS name.
 * - `DROP`: `DROP INDEX` or `DROP CONSTRAINT` of the item `name`s, by the schema API's name or by an alias.
 * - `AWAIT_INDEXES`: `CALL db.awaitIndexes(…)` or `CALL db.awaitIndex(…)`. An index on a SQL store is made whole as it
 *   is created, so nothing is waited for.
 * - `RESERVED`: a uniqueness constraint on one of Drivine's own nodes, the schema marker's `scope` or the store stamp's
 *   `key`, by any name. It is ensured as Drivine ensures it for itself, and recorded in no owner's inventory.
 * - `REFUSED`: schema DDL that a SQL store cannot honour, or that is not well formed, and why.
 */
export type SchemaDdlResult =
    | { type: 'NOT_DDL' }
    | { type: 'CREATE'; spec: DdlSpec; alias?: string; ifNotExists: boolean; analyzer?: string }
    | { type: 'DROP'; kind: 'INDEX' | 'CONSTRAINT'; name: string; ifExists: boolean }
    | { type: 'AWAIT_INDEXES' }
    | { type: 'RESERVED'; spec: UniquenessConstraintSpec }
    | { type: 'REFUSED'; message: string };
