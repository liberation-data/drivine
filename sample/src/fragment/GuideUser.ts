import { NodeFragment, NodeId } from '@liberation-data/drivine';

/** A user of a guide, which may be linked to a WebUser by IS_WEB_USER. */
@NodeFragment({ labels: ['GuideUser'] })
export class GuideUser {
    @NodeId() uuid: string;
    guideProgress: number = 0;
}
