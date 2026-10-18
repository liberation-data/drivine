import { ClassType } from '@/query/QuerySpecification';

/**
 * A node of a fragment class, by id: matched, never created. Extra labels narrow the match.
 */
export interface NodeRef {
    type: ClassType;
    id: unknown;
    labels?: string[];
}

export function nodeRef(type: ClassType, id: unknown, ...labels: string[]): NodeRef {
    return { type, id, labels };
}

export enum RelateMode {
    /** A relationship of the type is made only when there is none; its properties are set whether made or found. */
    MERGE = 'MERGE',
    /** Each call makes another. */
    CREATE = 'CREATE'
}
