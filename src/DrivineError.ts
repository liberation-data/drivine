import { QuerySpecification } from '@/query/QuerySpecification';

export class DrivineError extends Error {
    public readonly rootCause?: Error;
    public readonly spec?: QuerySpecification<any>;

    public static withRootCause(cause: Error, spec?: QuerySpecification<any>): DrivineError {
        return new DrivineError(undefined, cause, spec);
    }

    public constructor(message?: string, rootCause?: Error, spec?: QuerySpecification<any>) {
        if (!message && rootCause && rootCause.message) {
            super(rootCause.message);
        } else {
            super(message);
        }
        this.rootCause = rootCause;
        this.spec = spec;
    }
}
