import { NodeFragment } from '@liberation-data/drivine';
import { WebUser } from './WebUser';

/** A registered web user: a WebUser with the Registered label. */
@NodeFragment({ labels: ['Registered'] })
export class RegisteredWebUser extends WebUser {
    email: string;
}
