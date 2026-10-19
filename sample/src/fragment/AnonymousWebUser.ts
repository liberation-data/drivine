import { NodeFragment } from '@liberation-data/drivine';
import { WebUser } from './WebUser';

/** An anonymous web user: a WebUser with the Anonymous label. */
@NodeFragment({ labels: ['Anonymous'] })
export class AnonymousWebUser extends WebUser {
    anonymousToken: string;
}
