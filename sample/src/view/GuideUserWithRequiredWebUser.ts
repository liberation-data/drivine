import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { GuideUser } from '../fragment/GuideUser';
import { WebUser } from '../fragment/WebUser';

/** A required WebUser: only the GuideUsers that have one. */
@GraphView()
export class GuideUserWithRequiredWebUser {
    @Root() core: GuideUser;
    @GraphRelationship({ type: 'IS_WEB_USER', direction: Direction.OUTGOING, target: () => WebUser, required: true })
    webUser: WebUser;
}
