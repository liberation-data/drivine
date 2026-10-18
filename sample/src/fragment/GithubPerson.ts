import { NodeFragment, NodeId } from '@liberation-data/drivine';

/** A person with the labels of a GitHub user too: not a subclass of Person, as in drivine4j's sample. */
@NodeFragment({ labels: ['Person', 'Mapped', 'GithubPerson'] })
export class GithubPerson {
    @NodeId() uuid: string;
    name: string;
    bio?: string;
    githubId: string;
}
