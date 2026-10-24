import { RelationshipFragment, TargetNode } from '@liberation-data/drivine';
import { Organization } from './Organization';

@RelationshipFragment()
export class WorkHistory {
    @TargetNode() target: Organization;
    role: string;
    since: Date;
}
