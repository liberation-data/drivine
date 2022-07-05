import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { DrivineError } from '@/DrivineError';
import { QuerySpecification } from '@/query/QuerySpecification';

const assert = require('assert');

export class AgensGraphSpecCompiler extends QuerySpecificationCompiler {

    private readonly paramKeys: string[] = [];

    /**
     * Params from the specification converted to an indexed array, if necessary.
     */
    private readonly indexParams: any[];

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(['CYPHER', 'SQL'].includes(this.spec.statement.language),
            `${this.spec.statement.language} is not supported on AgensGraph.`);

        if (!Array.isArray(this.spec.parameters)) {
            this.paramKeys = Object.keys(this.spec.parameters).sort();
            this.indexParams = this.paramKeys.map((it) => this.spec.parameters[it]);
        } else {
            this.indexParams = this.spec.parameters;
        }
    }

    formattedStatement(): string {
        let result = this.appliedStatement();
        for (let i = 0; i < this.paramKeys.length; i++) {
            const key = this.paramKeys[i];
            result = result.replace(`$${key}`, `$${i+1}`)
        }
        return result;
    }

    formattedParams(): any {
        if (this.spec.statement.language === 'CYPHER') {
            return this.indexParams.map((it) => JSON.stringify(it));
        } else if (this.spec.statement.language === 'SQL') {
            return this.indexParams;
        } else {
            throw new DrivineError(`${this.spec.statement.language} is not supported on AgensGraph`);
        }
    }
}
