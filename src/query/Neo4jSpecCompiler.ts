import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
const assert = require('assert')

export class Neo4jSpecCompiler extends QuerySpecificationCompiler {

    formattedStatement(): string {
        // TODO: Map named parameters to index parameters.
        return this.appliedStatement();
    }

    formattedParams(): any {
        assert(this.spec.statement.language === 'CYPHER', `${this.spec.statement.language} is not supported on Neo4j.`);
        const mapped = this.spec.parameters.map((it, index) => ({ [index + 1]: it }));
        return Object.assign({}, ...mapped);
    }

}
