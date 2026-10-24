import { GraphProperty, GraphTransient, JsonPacked, NodeFragment, NodeId, VectorIndex } from '@liberation-data/drivine';

export enum Role {
    Admin = 'Admin',
    Editor = 'Editor'
}

export interface Address {
    city: string;
}

@NodeFragment({ labels: ['Person'] })
export class Person {
    static readonly KIND = 'person';
    @NodeId() uuid: string;
    name: string;
    nickname?: string;
    age: number | null;
    @GraphProperty('born_on') born: Date;
    tags: string[];
    @JsonPacked() address: Address;
    @GraphTransient() cache: string;
    role: Role;
    status: 'active' | 'away';
    @VectorIndex({ similarity: 'EUCLIDEAN' }) embedding: number[];
    scores: Map<string, number>;
    big: bigint;
    active: boolean;
}
