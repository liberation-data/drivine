import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { Issue, IssueCore, IssueStateReason } from '../fragment/IssueCore';
import { Person } from '../fragment/Person';
import { PersonContext } from './PersonContext';

/**
 * An issue with who it's assigned to and who raised it. It is an Issue itself, handing the root's fields on, as
 * drivine4j's `Issue by issue` delegation does.
 */
@GraphView()
export class RaisedAndAssignedIssue implements Issue {
    @Root() issue: IssueCore;
    @GraphRelationship({ type: 'ASSIGNED_TO', direction: Direction.OUTGOING, target: () => Person })
    assignedTo: Person[] = [];
    @GraphRelationship({ type: 'RAISED_BY', direction: Direction.OUTGOING, target: () => PersonContext })
    raisedBy: PersonContext;

    get uuid(): string {
        return this.issue.uuid;
    }

    get id(): number {
        return this.issue.id;
    }

    get state(): string | undefined {
        return this.issue.state;
    }

    get stateReason(): IssueStateReason | undefined {
        return this.issue.stateReason;
    }

    get title(): string | undefined {
        return this.issue.title;
    }

    get body(): string | undefined {
        return this.issue.body;
    }

    get locked(): boolean {
        return this.issue.locked;
    }
}
