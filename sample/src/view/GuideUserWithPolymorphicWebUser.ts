import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { GuideUser } from '../fragment/GuideUser';
import { WebUser } from '../fragment/WebUser';

/** A WebUser loaded as the subclass its labels say. */
@GraphView()
export class GuideUserWithPolymorphicWebUser {
    @Root() core: GuideUser;
    @GraphRelationship({ type: 'IS_WEB_USER', direction: Direction.OUTGOING, target: () => WebUser })
    webUser?: WebUser;
}
