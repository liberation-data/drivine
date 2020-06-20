import { QuerySpecification } from '@/query/index';
import { CompiledQuerySpecification } from '@/query/CompiledQuerySpecification';

export abstract class QuerySpecificationCompiler {

    protected constructor(readonly spec: QuerySpecification<any>) {
        this.spec.finalize();
    }

    compile(): CompiledQuerySpecification {

        return <CompiledQuerySpecification> {
            statement: this.formattedStatement(),
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
