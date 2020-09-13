import { QuerySpecification } from '@/query/index';
import { CompiledQuery } from '@/query/CompiledQuery';

export abstract class QuerySpecificationCompiler {

    protected constructor(readonly spec: QuerySpecification<any>) {
    }

    compile(): CompiledQuery {

        return <CompiledQuery> {
            statement: this.formattedStatement().trim(),
            parameters: this.formattedParams()
        }
    }

    protected appliedStatement(): string {
        return `${this.spec.statement.text} ${this.skipClause()} ${this.limitClause()}`;
    }

    protected skipClause(): string {
        if (this.spec._skip) {
            return `${this.spec.statement.language === 'CYPHER' ? `SKIP` : `OFFSET`} ${this.spec._skip}`;
        }
        return ``;
    }

    protected limitClause(): string {
        return this.spec._limit ? `LIMIT ${this.spec._limit}` : ``;
    }

    abstract formattedStatement(): string;

    abstract formattedParams(): any;

}
