/** The plan stopped: a root is stale, or a node a step needs is not there. Nothing it wrote is kept. */
export class Stopped extends Error {
    constructor(readonly count: number) {
        super('The plan stopped.');
    }
}
