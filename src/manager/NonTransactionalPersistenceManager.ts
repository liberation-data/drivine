import { DrivineError } from '@/DrivineError';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Cursor } from '@/cursor/Cursor';
import { FinderOperations } from '@/manager/FinderOperations';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { DrivineLogger } from '@/logger';
import { DatabaseType } from '@/connection';
import { schemaDdlOf } from '@/schema/ddl/SchemaDdl';
import type { SchemaCommands } from '@/schema/ddl/SchemaCommands';

export class NonTransactionalPersistenceManager implements PersistenceManager {
    private logger = new DrivineLogger(NonTransactionalPersistenceManager.name);
    private finderOperations: FinderOperations;

    constructor(
        readonly connectionProvider: ConnectionProvider,
        readonly database: string,
        readonly type: DatabaseType,
        /**
         * What runs Neo4j schema DDL given as Cypher to a SQL store: the one PersistenceManagerFactory made for the
         * database, whatever name it is asked for by.
         */
        private readonly schemaCommands?: SchemaCommands
    ) {
        this.finderOperations = new FinderOperations(this);
    }

    /**
     * Runs a statement. Neo4j schema DDL (`CREATE INDEX`, `CREATE CONSTRAINT`, `DROP …`, `db.awaitIndexes`) given as
     * Cypher to Postgres, Oracle or SQLite is applied through Drivine's schema machinery, and gives no rows: see
     * SchemaCommands. A graph engine is sent it as it is.
     */
    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const ddl = schemaDdlOf(this.type, spec);
        if (ddl) {
            if (!this.schemaCommands) {
                throw new DrivineError(
                    'Schema DDL is run by a persistence manager a PersistenceManagerFactory made.',
                    undefined,
                    spec
                );
            }
            await this.schemaCommands.run(ddl);
            return [];
        }
        const connection = await this.connectionProvider.connect();
        try {
            const result = await connection.query(spec);
            await connection.release();
            return result;
        } catch (e) {
            await connection.release(e as Error);
            throw DrivineError.withRootCause(e as Error, spec);
        }
    }

    async execute(spec: QuerySpecification<void>): Promise<void> {
        await this.query(spec);
    }

    async getOne<T>(spec: QuerySpecification<T>): Promise<T> {
        return await this.finderOperations.getOne(spec);
    }

    async maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined> {
        return await this.finderOperations.maybeGetOne(spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        this.logger.verbose(`Open consumer for ${spec}`);
        return new Promise((resolve, reject) => {
            reject(new DrivineError(`Not implemented yet, please use TransactionalPersistenceManager`));
        });
    }
}
