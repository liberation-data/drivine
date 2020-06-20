import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { DrivineError } from '@/DrivineError';

// TODO: Map named parameters to index parameters.
export class AgensGraphSpecCompiler extends QuerySpecificationCompiler {

    formattedStatement(): string {
        return this.appliedStatement();
    }

    formattedParams(): any {
        if (this.spec.statement.language === 'CYPHER') {
            return this.spec.parameters.map((it) => JSON.stringify(it));
        } else if (this.spec.statement.language === 'SQL') {
            return this.spec.parameters;
        } else {
            throw new DrivineError(`${this.spec.statement.language} is not supported on AgensGraph`);
        }
    }

}
