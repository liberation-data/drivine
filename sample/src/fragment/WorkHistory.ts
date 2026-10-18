import { JsonPacked, RelationshipFragment, TargetNode } from '@liberation-data/drivine';
import { Organization } from './Organization';

/**
 * A relationship fragment: the properties of a WORKS_FOR relationship, when someone started and in what role, and the
 * organization it leads to. A start date is a calendar date, kept as ISO text (YYYY-MM-DD): TypeScript has no
 * LocalDate.
 */
@RelationshipFragment()
export class WorkHistory {
    startDate: string;
    role: string;
    @JsonPacked() tags?: string[];
    @TargetNode() target: Organization;
}
