import { FullTextIndex, NodeFragment, NodeId, RangeIndex, Unique } from '@liberation-data/drivine';

@NodeFragment({ labels: ['Organization'] })
@Unique({ properties: ['name', 'city'] })
@RangeIndex({ properties: ['founded'] })
export class Organization {
    @NodeId() uuid: string;
    @FullTextIndex() name: string;
    city: string;
    founded: Date;
    constructor(readonly motto: string) {}
}
