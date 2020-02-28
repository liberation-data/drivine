export type PersistenceManagerType = 'TRANSACTIONAL' | 'NON_TRANSACTIONAL';

export interface PersistenceManagerOptions {
    type?: PersistenceManagerType;
    database?: string;
}

export interface Keyed {
    key: string;
}
