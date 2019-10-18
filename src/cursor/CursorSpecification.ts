import { QuerySpecification } from '@/query/QuerySpecification';

export class CursorSpecification<T> extends QuerySpecification<T> {
    public batch: number = 100;

    public constructor(public statement?: string) {
        super(statement);
    }

    public batchSize(size: number): this {
        this.batch = size;
        return this;
    }
}
