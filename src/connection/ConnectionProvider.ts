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

    connect(): Promise<Connection>;

    end(): Promise<void>;
}
