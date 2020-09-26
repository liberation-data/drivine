import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QueryLanguage } from '@liberation-data/drivine';

export class Neo4jSpecCompiler extends QuerySpecificationCompiler {

    supportedQueryLanguages(): QueryLanguage[] {
        return ['CYPHER'];
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
