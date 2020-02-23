import { Inject } from '@nestjs/common';
import { optionsWithDefaults, PersistenceManagerOptions } from '@/manager/PersistenceManagerOptions';

export const transactionalPersistenceManagerInjections: string[] = [];
export const nonTransactionalPersistenceManagerInjections: string[] = [];
export const InjectPersistenceManager = (options?: PersistenceManagerOptions): any => {
    const defaults = optionsWithDefaults(options);
    switch (defaults.type) {
        case 'TRANSACTIONAL':
        default:
            if (!transactionalPersistenceManagerInjections.includes(defaults.database!)) {
                transactionalPersistenceManagerInjections.push(defaults.database!);
            }
            return Inject(`TransactionalPersistenceManager:${defaults.database!}`);
        case 'NON_TRANSACTIONAL':
            if (!nonTransactionalPersistenceManagerInjections.includes(defaults.database!)) {
                nonTransactionalPersistenceManagerInjections.push(defaults.database!);
            }
            return Inject(`NonTransactionalPersistenceManager:${defaults.database!}`);
    }
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
