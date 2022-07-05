import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
const assert = require('assert')

export class Neo4jSpecCompiler extends QuerySpecificationCompiler {

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(this.spec.statement.language === 'CYPHER', `${this.spec.statement.language} is not supported on Neo4j.`);
    }

    formattedStatement(): string {
        return this.appliedStatement();
    }

    formattedParams(): any {
        if (Array.isArray(this.spec.parameters)) {
            const mapped = this.spec.parameters.map((it, index) => ({ [index + 1]: it }));
            return Object.assign({}, ...mapped);
        } else {
            return this.spec.parameters;
        }

    }

}
