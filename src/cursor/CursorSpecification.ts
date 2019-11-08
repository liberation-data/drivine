import { QuerySpecification } from '@/query/QuerySpecification';
import { Statement } from '@/query/Statement';

export class CursorSpecification<T> extends QuerySpecification<T> {
    public batch: number = 100;

    public constructor(statement?: string | Statement) {
        super(statement);
    }

    public batchSize(size: number): this {
        this.batch = size;
        return this;
    }
}
