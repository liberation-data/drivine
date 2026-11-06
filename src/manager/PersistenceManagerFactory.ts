import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { DatabaseType } from '@/connection/DatabaseType';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';
import { DelegatingPersistenceManager } from '@/manager/DelegatingPersistenceManager';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { SchemaCommands } from '@/schema/ddl/SchemaCommands';
import { SCHEMA_DDL_STORES } from '@/schema/ddl/SchemaDdl';

interface PersistenceManagerEntry {
    transactional: TransactionalPersistenceManager;
    nonTransactional: NonTransactionalPersistenceManager;
    delegating: DelegatingPersistenceManager;
}

export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManagerEntry> = new Map<string, PersistenceManagerEntry>();

    /**
     * The schema commands of each SQL store's database, by its registered name: one per database, so the managers asked
     * for by 'default' and by the database's own name run DDL in one queue, with one record of what DDL ensured.
     */
    private readonly schemaCommands = new Map<string, SchemaCommands>();

    /** The object managers schema commands apply DDL through, made when first asked for. */
    private objects?: GraphObjectManagerFactory;

    constructor(
        readonly registry: DatabaseRegistry = DatabaseRegistry.getInstance(),
        readonly contextHolder: TransactionContextHolder = TransactionContextHolder.getInstance()
    ) {}

    /**
     * Returns a PersistenceManager for the database registered under the specified name.
     * @param database Unique name for the registered database.
     * @param type Either TRANSACTIONAL, NON_TRANSACTION or (default) delegating persistence manager. The latter
     * will decide at runtime, depending whether a transaction is in flight, ie whether the current context of execution
     * is @Transactional().
     */
    get(database: string = 'default', type: PersistenceManagerType = 'DELEGATING'): PersistenceManager {
        if (!this.managers.get(database)) {
            this.register(database);
        }
        switch (type) {
            case 'TRANSACTIONAL':
                return this.managers.get(database)!.transactional;
            case 'NON_TRANSACTIONAL':
                return this.managers.get(database)!.nonTransactional;
            case 'DELEGATING':
                return this.managers.get(database)!.delegating;
            default:
                throw new DrivineError(`Invalid PersistenceManagerType: ${type}`);
        }
    }

    private register(name: string): void {
        const connectionProvider = this.registry.connectionProvider(name);
        if (!connectionProvider) {
            throw new DrivineError(`No database is registered under name: ${name}`);
        }

        this.managers.set(name, <PersistenceManagerEntry>{
            transactional: new TransactionalPersistenceManager(this.contextHolder, name, connectionProvider.type),
            nonTransactional: new NonTransactionalPersistenceManager(
                connectionProvider,
                name,
                connectionProvider.type,
                this.schemaCommandsOf(connectionProvider.name, connectionProvider.type)
            ),
            delegating: new DelegatingPersistenceManager(name, connectionProvider.type, this.contextHolder, this)
        });
    }

    /** The schema commands of the database registered as `database`, on a SQL store; none on a graph engine. */
    private schemaCommandsOf(database: string, type: DatabaseType): SchemaCommands | undefined {
        if (!SCHEMA_DDL_STORES.includes(type)) {
            return undefined;
        }
        let commands = this.schemaCommands.get(database);
        if (!commands) {
            commands = new SchemaCommands(database, type, () => {
                this.objects ??= new GraphObjectManagerFactory(this);
                return this.objects;
            });
            this.schemaCommands.set(database, commands);
        }
        return commands;
    }
}
