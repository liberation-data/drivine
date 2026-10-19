import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { Organization } from '../fragment/Organization';
import { Person } from '../fragment/Person';

@GraphView()
export class PersonContext {
    @Root() person: Person;
    @GraphRelationship({ type: 'WORKS_FOR', direction: Direction.OUTGOING, target: () => Organization })
    worksFor: Organization[] = [];
}
