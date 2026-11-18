import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { parameterNames, replaceParameters } from '@/utils/SqlParameters';

const assert = require('assert');

export class PostgresSpecCompiler extends QuerySpecificationCompiler {
    private readonly paramKeys: string[] = [];

    /**
     * Params from the specification converted to an indexed array, if necessary.
     */
    private readonly indexParams: any[];

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(this.spec.statement.language === 'SQL', `${this.spec.statement.language} is not supported on Postgres.`);

        if (!Array.isArray(this.spec.parameters)) {
            // Only the names the statement uses outside its quoted text: Postgres refuses a parameter its statement does not name.
            const used = parameterNames(this.spec.statement.text);
            this.paramKeys = Object.keys(this.spec.parameters)
                .filter((key) => used.has(key))
                .sort();
            this.indexParams = this.paramKeys.map((it) => (this.spec.parameters as Record<string, any>)[it]);
        } else {
            this.indexParams = this.spec.parameters;
        }
    }

    /**
     * Rewrites named parameters ($name) to positional ones ($1). Every occurrence outside quoted text is rewritten, and a
     * name is never matched as the prefix of a longer one ($id does not match $idList): see [replaceParameters].
     */
    formattedStatement(): string {
        const result = this.appliedStatement();
        if (this.paramKeys.length === 0) {
            return result;
        }
        return replaceParameters(result, (key) => {
            const index = this.paramKeys.indexOf(key);
            return index >= 0 ? `$${index + 1}` : undefined;
        });
    }

    formattedParams(): any {
        return this.indexParams;
    }
}
