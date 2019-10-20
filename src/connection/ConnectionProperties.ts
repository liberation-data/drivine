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
    const prefix = connectionName ? `${connectionName}_` : '';

    const databaseType = <DatabaseType>process.env[`${prefix}DATABASE_TYPE`];
    const host = process.env[`${prefix}DATABASE_HOST`];
    const port = Number(process.env[`${prefix}DATABASE_PORT`]!);
    const userName = process.env[`${prefix}DATABASE_USER`]!;
    const password = process.env[`${prefix}DATABASE_PASSWORD`]!;
    const idleTimeout = Number(process.env[`${prefix}DATABASE_IDLE_TIMEOUT`]!);
    const databaseName = process.env[`${prefix}DATABASE_NAME`]!;
    const defaultGraphPath = process.env[`${prefix}DATABASE_DEFAULT_GRAPH_PATH`]!;

    assert(databaseType, `${prefix}DATABASE_TYPE for named connection is required.`);
    assert(host, `${prefix}DATABASE_HOST for named connection is required.`);

    if (databaseType === DatabaseType.AGENS_GRAPH) {
        assert(databaseName, `${prefix}DATABASE_NAME for named connection is required.`);
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
