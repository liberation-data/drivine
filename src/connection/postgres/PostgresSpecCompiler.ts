import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';

const assert = require('assert');

export class PostgresSpecCompiler extends QuerySpecificationCompiler {
    private readonly paramKeys: string[] = [];

    /**
     * Params from the specification converted to an indexed array, if necessary.
     */
    private readonly indexParams: any[];

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(
            this.spec.statement.language === 'SQL',
            `${this.spec.statement.language} is not supported on Postgres.`
        );

        if (!Array.isArray(this.spec.parameters)) {
            this.paramKeys = Object.keys(this.spec.parameters).sort();
            this.indexParams = this.paramKeys.map((it) => this.spec.parameters[it]);
        } else {
            this.indexParams = this.spec.parameters;
        }
    }

    /**
     * Rewrites named parameters ($name) to positional ones ($1). Every occurrence is rewritten, and a name is never
     * matched as the prefix of a longer one ($id does not match $idList).
     */
    formattedStatement(): string {
        const result = this.appliedStatement();
        if (this.paramKeys.length === 0) {
            return result;
        }
        return result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match: string, key: string) => {
            const index = this.paramKeys.indexOf(key);
            return index >= 0 ? `$${index + 1}` : match;
        });
    }

    formattedParams(): any {
        return this.indexParams;
    }
}
