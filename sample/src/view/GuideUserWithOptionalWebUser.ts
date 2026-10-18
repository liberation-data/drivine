import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { GuideUser } from '../fragment/GuideUser';
import { WebUser } from '../fragment/WebUser';

/** An optional WebUser: every GuideUser, with or without one. */
@GraphView()
export class GuideUserWithOptionalWebUser {
    @Root() core: GuideUser;
    @GraphRelationship({ type: 'IS_WEB_USER', direction: Direction.OUTGOING, target: () => WebUser })
    webUser?: WebUser;
}
