import { DatabaseType } from '@/connection/DatabaseType';
import * as assert from 'assert';

export interface ConnectionProperties {
    databaseType: DatabaseType;
    host: string;
    port?: number;
    userName?: string;
    password?: string;
    idleTimeout?: number;
    connectionTimeout?: number;
    poolMax?: number;
    databaseName?: string;
    defaultGraphPath?: string;
    protocol?: string;
}

/**
 * Returns connection properties for named (or default) connection in environment or throws.
 * @param connectionName
 * @constructor
 * @throws DatabaseError if required properties do not exist.
 */
export function ConnectionPropertiesFromEnv(connectionName?: string): ConnectionProperties {
    const prefix = connectionName ? `${connectionName}_` : '';

    const stringOrFromEnv = (envVar: string): string | undefined => process.env[`${prefix}${envVar}`];
    const numberFromEnv = (envVar: string): number | undefined => {
        const setting = process.env[`${prefix}${envVar}`] as string | undefined;
        if (setting === undefined) {
            return undefined;
        }

        const number = Number(setting);
        assert(!isNaN(number), `${envVar} could not be parsed to number`);

        return number;
    };

    const databaseType = <DatabaseType>stringOrFromEnv('DATABASE_TYPE');
    const host = stringOrFromEnv('DATABASE_HOST');
    // Optionals
    const port = numberFromEnv('DATABASE_PORT');
    const userName = stringOrFromEnv('DATABASE_USER');
    const password = stringOrFromEnv('DATABASE_PASSWORD');
    const idleTimeout = numberFromEnv('DATABASE_IDLE_TIMEOUT');
    const connectionTimeout = numberFromEnv('DATABASE_CONNECTION_TIMEOUT');
    const databaseName = stringOrFromEnv('DATABASE_NAME');
    const defaultGraphPath = stringOrFromEnv('DATABASE_DEFAULT_GRAPH_PATH');
    const protocol = stringOrFromEnv('DATABASE_PROTOCOL');
    const poolMax = numberFromEnv('DATABASE_POOL_MAX');

    assert(databaseType, `${prefix}DATABASE_TYPE for named connection is required.`);
    assert(host, `${prefix}DATABASE_HOST for named connection is required.`);

    if (databaseType === DatabaseType.AGENS_GRAPH) {
        assert(databaseName, `${prefix}DATABASE_NAME for named connection is required.`);
    }

    return <ConnectionProperties>{
        databaseType,
        host,
        port,
        userName,
        password,
        idleTimeout,
        connectionTimeout,
        databaseName,
        defaultGraphPath,
        protocol,
        poolMax
    };
}
