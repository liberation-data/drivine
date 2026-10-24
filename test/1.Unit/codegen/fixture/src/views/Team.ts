import { GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { Person } from '../fragments/Person';
import { PersonCareer } from './PersonCareer';

@GraphView()
export class Team {
    @Root() lead: Person;
    @GraphRelationship({ type: 'IN', target: () => Team, maxDepth: 2 }) teams: Team[];
    @GraphRelationship({ type: 'LEADS', target: () => PersonCareer }) careers: PersonCareer[];
}
