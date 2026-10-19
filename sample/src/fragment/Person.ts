import { NodeFragment, NodeId } from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person', 'Mapped'] })
export class Person {
    @NodeId() uuid: string;
    name: string;
    bio?: string;
}
