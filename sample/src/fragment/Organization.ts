import { NodeFragment, NodeId } from '@liberation-data/drivine';

@NodeFragment({ labels: ['Organization'] })
export class Organization {
    @NodeId() uuid: string;
    name: string;
}
