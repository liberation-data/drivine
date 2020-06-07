import { Connection } from '@/connection';

export interface ConnectionProvider {
    /**
     * Name of database for which connections will be provided.
     */
    name: string;

    connect(): Promise<Connection>;

    end(): Promise<void>;
}
