import { NodeFragment, NodeId } from '@liberation-data/drivine';

export enum IssueStateReason {
    COMPLETED = 'COMPLETED',
    NOT_PLANNED = 'NOT_PLANNED',
    REOPENED = 'REOPENED',
    UNKNOWN = 'UNKNOWN'
}

/** What any issue offers: an IssueCore, or a view of one that hands its fields on (see RaisedAndAssignedIssue). */
export interface Issue {
    readonly uuid: string;
    readonly id: number;
    readonly state?: string;
    readonly stateReason?: IssueStateReason;
    readonly title?: string;
    readonly body?: string;
    readonly locked: boolean;
}

@NodeFragment({ labels: ['Issue'] })
export class IssueCore implements Issue {
    @NodeId() uuid: string;
    id: number;
    state?: string;
    stateReason?: IssueStateReason;
    title?: string;
    body?: string;
    locked: boolean;
}
