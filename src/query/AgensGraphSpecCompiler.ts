import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { DrivineError } from '@/DrivineError';
import { QuerySpecification } from '@liberation-data/drivine';
const assert = require('assert');

// TODO: Map named parameters to index parameters.
export class AgensGraphSpecCompiler extends QuerySpecificationCompiler {

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(['CYPHER', 'SQL'].includes(this.spec.statement.language),
            `${this.spec.statement.language} is not supported on AgensGraph.`);
    }

    formattedStatement(): string {
        return this.appliedStatement();
    }

    formattedParams(): any {
        assert(Array.isArray(this.spec.parameters), `Named parameters on AgensGraph are not supported in this version`);
        if (this.spec.statement.language === 'CYPHER') {
            return this.spec.parameters.map((it) => JSON.stringify(it));
        } else if (this.spec.statement.language === 'SQL') {
            return this.spec.parameters;
        } else {
            throw new DrivineError(`${this.spec.statement.language} is not supported on AgensGraph`);
        }
    }



}
