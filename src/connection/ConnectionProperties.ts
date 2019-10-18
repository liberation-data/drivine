import { DatabaseType } from '@/connection/DatabaseType';
import * as assert from 'assert';

export interface ConnectionProperties {
    databaseType: DatabaseType;
    host: string;
    port?: number;
    userName?: string;
    password?: string;
    idleTimeout?: number;
    databaseName?: string;
    defaultGraphPath?: string;
}

/**
 * Returns connection properties for named (or default) connection in environment or throws.
 * @param connectionName
 * @constructor
 * @throws DatabaseError if required properties do not exist.
 */
export function ConnectionPropertiesFromEnv(connectionName?: string): ConnectionProperties {
    const suffix = connectionName ? `_${connectionName}` : '';

    const databaseType = <DatabaseType>process.env[`DATABASE_TYPE${suffix}`];
    const host = process.env[`DATABASE_HOST${suffix}`];
    const port = Number(process.env[`DATABASE_PORT${suffix}`]!);
    const userName = process.env[`DATABASE_USER${suffix}`]!;
    const password = process.env[`DATABASE_PASSWORD${suffix}`]!;
    const idleTimeout = Number(process.env[`DATABASE_IDLE_TIMEOUT${suffix}`]!);
    const databaseName = process.env[`DATABASE_NAME${suffix}`]!;
    const defaultGraphPath = process.env[`DATABASE_DEFAULT_GRAPH_PATH${suffix}`]!;

    assert(databaseType, `DATABASE_TYPE for named connection is required.`);
    assert(host, `DATABASE_HOST for named connection is required.`);

    if (databaseType === DatabaseType.AGENS_GRAPH) {
        assert(databaseName, `DATABASE_NAME for named connection is required.`);
    }

    return <ConnectionProperties>{
        databaseType: databaseType,
        host: host,
        port: port,
        userName: userName,
        password: password,
        idleTimeout: idleTimeout,
        databaseName: databaseName,
        defaultGraphPath: defaultGraphPath
    };
}
