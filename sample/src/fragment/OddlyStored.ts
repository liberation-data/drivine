import { GraphProperty, NodeFragment, NodeId } from '@liberation-data/drivine';

/** Stored names that aren't plain: a dollar, a percent, quotes and a backslash, each queried as it is declared. */
@NodeFragment({ labels: ['OddlyStored'] })
export class OddlyStored {
    @NodeId() id: string;
    @GraphProperty('price$usd') price?: number;
    @GraphProperty('rate%') rate?: number;
    @GraphProperty('say "hi"') greeting?: string;
    @GraphProperty('back\\slash') path?: string;
}
