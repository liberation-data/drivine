import { Inject } from '@nestjs/common';
import { PersistenceManagerOptions } from '@/manager/PersistenceManagerOptions';

export const persistenceManagerInjections: string[] = [];
export const InjectPersistenceManager = (options?: PersistenceManagerOptions): any => {
    const key = JSON.stringify(options || {});
    if (!persistenceManagerInjections.includes(key)) {
        persistenceManagerInjections.push(key);
    }
    return Inject(`PersistenceManager:${key}`);
};

export const fileContentInjections: string[] = [];
export const InjectFileContents = (path: string): any => {
    const filename = require.resolve(path);
    if (!fileContentInjections.includes(filename)) {
        fileContentInjections.push(filename);
    }
    return Inject(`FileContents:${filename}`);
};

export const cypherInjections: string[] = [];
export const InjectCypher = (path: string): any => {
    const filename = require.resolve(`${path}.cypher`);
    if (!cypherInjections.includes(filename)) {
        cypherInjections.push(filename);
    }
    return Inject(`CYPHER:${filename}`);
};

export const sqlInjections: string[] = [];
export const InjectSql = (path: string): any => {
    const filename = require.resolve(`${path}.sql`);
    if (!sqlInjections.includes(filename)) {
        sqlInjections.push(filename);
    }
    return Inject(`SQL:${filename}`);
};
