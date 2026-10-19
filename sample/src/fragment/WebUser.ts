import { NodeFragment, NodeId } from '@liberation-data/drivine';

/**
 * A web user. Abstract: a node of it loads as the subclass whose labels it carries (TypeScript's stand-in for
 * drivine4j's sealed class).
 */
@NodeFragment({ labels: ['WebUser'] })
export abstract class WebUser {
    @NodeId() uuid: string;
    displayName: string;
}
