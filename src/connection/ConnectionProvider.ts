import { Connection } from '@/connection/Connection';

export interface ConnectionProvider {
    connect(): Promise<Connection>;
}
