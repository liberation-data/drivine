export type PersistenceManagerType = 'TRANSACTIONAL' | 'NON_TRANSACTIONAL';

export interface PersistenceManagerOptions {
    type?: PersistenceManagerType;
    database?: string;
}

export interface PersistenceManagerOptionsWithDefaults extends PersistenceManagerOptions {
    type: PersistenceManagerType;
    database: string;
    key: string;
}

export function optionsWithDefaults(
    options: PersistenceManagerOptions | undefined
): PersistenceManagerOptionsWithDefaults {
    const type = options && options.type ? options.type : 'TRANSACTIONAL';
    const database = options && options.database ? options.database : 'default';
    return <PersistenceManagerOptionsWithDefaults>{ type: type, database: database, key: `${type}:${database}` };
}
