import { NodeFragment, NodeId, NodeStamp } from '@liberation-data/drivine';

/** A note whose stamp is a field: a query over `stamp` reads the property the stamp is stored under. */
@NodeFragment({ labels: ['StampedNote'] })
export class StampedNote {
    @NodeId() id: string;
    text: string;
    @NodeStamp() stamp?: string;
}
