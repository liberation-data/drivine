import { GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { Person } from '../fragment/Person';
import { WorkHistory } from '../fragment/WorkHistory';

/** A person with the properties of each WORKS_FOR relationship and the organization it leads to. */
@GraphView()
export class PersonCareer {
    @Root() person: Person;
    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    employmentHistory: WorkHistory[] = [];
}
