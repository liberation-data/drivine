import { Inject } from '@nestjs/common';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';

export const transactionalPersistenceManagerInjections: string[] = [];
export const nonTransactionalPersistenceManagerInjections: string[] = [];
export const InjectPersistenceManager = (
    type: PersistenceManagerType = PersistenceManagerType.TRANSACTIONAL,
    database: string = 'default'
): any => {
    switch (type) {
        case PersistenceManagerType.TRANSACTIONAL:
        default:
            if (!transactionalPersistenceManagerInjections.includes(database)) {
                transactionalPersistenceManagerInjections.push(database);
            }
            return Inject(`TransactionalPersistenceManager:${database}`);
        case PersistenceManagerType.NON_TRANSACTIONAL:
            if (!nonTransactionalPersistenceManagerInjections.includes(database)) {
                nonTransactionalPersistenceManagerInjections.push(database);
            }
            return Inject(`NonTransactionalPersistenceManager:${database}`);
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
