import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A statement a backend generated, and the parameters it binds.
 */
export class GraphStatement {
    constructor(
        readonly text: string,
        readonly bindings: Record<string, any> = {}
    ) {}

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        return new QuerySpecification<T>(this.text).bind({ ...this.bindings, ...more });
    }
}
