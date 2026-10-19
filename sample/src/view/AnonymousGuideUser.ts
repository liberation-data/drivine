import { Direction, GraphRelationship, GraphView, Root } from '@liberation-data/drivine';
import { GuideUser } from '../fragment/GuideUser';
import { AnonymousWebUser } from '../fragment/AnonymousWebUser';

/** A required anonymous WebUser: only the GuideUsers whose web user carries the Anonymous label. */
@GraphView()
export class AnonymousGuideUser {
    @Root() core: GuideUser;
    @GraphRelationship({
        type: 'IS_WEB_USER',
        direction: Direction.OUTGOING,
        target: () => AnonymousWebUser,
        required: true
    })
    webUser: AnonymousWebUser;
}
