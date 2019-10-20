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
    const name = connectionName ? `_${connectionName}` : '';

    const databaseType = <DatabaseType>process.env[`DATABASE${name}_TYPE`];
    const host = process.env[`DATABASE${name}_HOST`];
    const port = Number(process.env[`DATABASE${name}_PORT`]!);
    const userName = process.env[`DATABASE${name}_USER`]!;
    const password = process.env[`DATABASE${name}_PASSWORD`]!;
    const idleTimeout = Number(process.env[`DATABASE${name}_IDLE_TIMEOUT`]!);
    const databaseName = process.env[`DATABASE${name}_NAME`]!;
    const defaultGraphPath = process.env[`DATABASE${name}_DEFAULT_GRAPH_PATH`]!;

    assert(databaseType, `DATABASE${name}_TYPE for named connection is required.`);
    assert(host, `DATABASE${name}_HOST for named connection is required.`);

    if (databaseType === DatabaseType.AGENS_GRAPH) {
        assert(databaseName, `DATABASE${name}_NAME for named connection is required.`);
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
