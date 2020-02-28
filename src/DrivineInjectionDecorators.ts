import { Inject } from '@nestjs/common';

export const persistenceManagerInjections: string[] = [];
export const InjectPersistenceManager = (database: string = 'default'): any => {
    if (!persistenceManagerInjections.includes(database)) {
        persistenceManagerInjections.push(database);
    }
    return Inject(`PersistenceManager:${database}`);
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
