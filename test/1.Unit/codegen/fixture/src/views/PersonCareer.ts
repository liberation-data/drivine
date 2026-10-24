import {
    Aggregate,
    AggregateFunction,
    Count,
    Direction,
    GraphPath,
    GraphRelationship,
    GraphView,
    hop,
    ReadOnly,
    Root,
    SortedBy
} from '@liberation-data/drivine';
import { Organization } from '../fragments/Organization';
import { Person } from '../fragments/Person';
import { WorkHistory } from '../fragments/WorkHistory';

const MANAGES = 'MANAGES';

@GraphView()
export class PersonCareer {
    @Root() person: Person;
    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory }) history: WorkHistory[];
    @GraphRelationship({ type: MANAGES, direction: Direction.INCOMING, required: true }) manager: Person;
    @SortedBy('name', false)
    @GraphRelationship({ type: 'REPORTS_TO', target: () => Person, maxDepth: 3 })
    chain: Person[];
    @ReadOnly() @GraphRelationship({ type: 'MENTORS' }) mentor?: Person;
    @GraphPath([hop('A'), hop('B', Direction.INCOMING, 'Mid', 'at', false)], { target: () => Organization })
    far: Organization[];
    @Count('WORKS_FOR') jobs: number;
    @Aggregate({ function: AggregateFunction.MAX, type: 'WORKS_FOR', property: 'since', direction: Direction.OUTGOING })
    latest: Date;
}
