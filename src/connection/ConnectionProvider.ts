import { Connection } from '@/connection/Connection';
import { DatabaseType } from '@/connection/DatabaseType';

export interface ConnectionProvider {
    /**
     * Name of database for which connections will be provided.
     */
    name: string;

    /**
     * Type of database for which connections will be provided.
     */
    type: DatabaseType;

    /** The graph the store names, where it names one: on Oracle, the property graph and its tables. */
    readonly graphName?: string;

    connect(): Promise<Connection>;

    end(): Promise<void>;
}
