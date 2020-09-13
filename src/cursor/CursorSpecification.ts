import { QuerySpecification } from '@/query/QuerySpecification';
import { QueryLanguage, toPlatformDefault } from '@/query';

export class CursorSpecification<T> extends QuerySpecification<T> {
    batch: number = 100;

    batchSize(size: number): this {
        this.batch = size;
        return this;
    }


    finalizedCopy(language: QueryLanguage): CursorSpecification<T> {
        return Object.freeze(new CursorSpecification<T>()
            .withStatement(toPlatformDefault(language, this.statement))
            .batchSize(this.batch)
            .skip(this._skip)
            .limit(this._limit)
            .bind(this.parameters)
            .addPostProcessors(...this.postProcessors));
    }
}
