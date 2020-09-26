import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QueryLanguage } from '@/query/QueryLanguage';
import { DrivineError, QuerySpecification } from '@liberation-data/drivine';

export class RedisGraphSpecCompiler extends QuerySpecificationCompiler {

    constructor(readonly spec: QuerySpecification<any>) {
        super(spec);
        if (this.spec.parameters.length > 0) {
            throw new DrivineError(`Query parameters are not yet supported by RedisGraph`);
        }
    }

    supportedQueryLanguages(): QueryLanguage[] {
        return ['CYPHER'];
    }

    formattedStatement(): string {
        return this.appliedStatement();
    }

    formattedParams(): any {
        return this.spec.parameters;
    }
}
