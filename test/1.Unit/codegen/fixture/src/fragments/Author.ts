import { Default, EmptyWhenAbsent, NodeFragment, NodeLabels, NodeStamp, PropertyBag } from '@liberation-data/drivine';
import { Person, Role } from './Person';

@NodeFragment({ labels: ['Author'] })
export class Author extends Person {
    @NodeStamp() stamp: number;
    @NodeLabels(Role) roles: Set<string>;
    @PropertyBag({ prefix: 'meta', delimiter: '_' }) meta: Record<string, string>;
    @PropertyBag({ flat: true }) rest: Record<string, number>;
    @Default() rank: number = 1;
    @EmptyWhenAbsent() books: string[];
}
