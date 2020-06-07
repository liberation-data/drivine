import { QuerySpecification } from '@/query';

export class CursorSpecification<T> extends QuerySpecification<T> {
    batch: number = 100;

    batchSize(size: number): this {
        this.batch = size;
        return this;
    }
}
