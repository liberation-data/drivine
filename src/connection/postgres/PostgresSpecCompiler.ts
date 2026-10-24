import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';

const assert = require('assert');

/**
 * A named parameter, `$name`: the longest name, so `$id` is not read in `$idList`. A name is as Cypher's grammar reads
 * one, past ASCII too (`$größe`), but for the currency symbols it allows after the first character: a `$` ends it.
 */
const PARAMETER = /\$([\p{ID_Start}\p{Pc}]\p{ID_Continue}*)/gu;

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
            // Only the names the statement uses: Postgres refuses a parameter its statement does not name.
            const used = new Set([...this.spec.statement.text.matchAll(PARAMETER)].map((it) => it[1]));
            this.paramKeys = Object.keys(this.spec.parameters)
                .filter((key) => used.has(key))
                .sort();
            this.indexParams = this.paramKeys.map((it) => (this.spec.parameters as Record<string, any>)[it]);
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
        return result.replace(PARAMETER, (match: string, key: string) => {
            const index = this.paramKeys.indexOf(key);
            return index >= 0 ? `$${index + 1}` : match;
        });
    }

    formattedParams(): any {
        return this.indexParams;
    }
}
