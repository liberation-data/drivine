import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { FalkorDbParameterCoercer } from '@/connection/falkordb/FalkorDbParameterCoercer';

const assert = require('assert');

export class FalkorDbSpecCompiler extends QuerySpecificationCompiler {
    private readonly coercer = new FalkorDbParameterCoercer();

    constructor(spec: QuerySpecification<any>) {
        super(spec);
        assert(
            this.spec.statement.language === 'CYPHER',
            `${this.spec.statement.language} is not supported on FalkorDB.`
        );
    }

    formattedStatement(): string {
        return this.appliedStatement();
    }

    /**
     * Positional parameters ($1, $2) are bound by name, as on Neo4j. FalkorDB names must not start with a digit, so
     * they are rewritten to $p1, $p2 in the statement.
     */
    formattedParams(): Record<string, any> {
        if (Array.isArray(this.spec.parameters)) {
            const named: Record<string, any> = {};
            this.spec.parameters.forEach((it, index) => (named[`p${index + 1}`] = it));
            return this.coercer.coerce(named);
        }
        return this.coercer.coerce(this.spec.parameters ?? {});
    }

    protected appliedStatement(): string {
        const statement = super.appliedStatement();
        return Array.isArray(this.spec.parameters) ? statement.replace(/\$(\d+)\b/g, '$$p$1') : statement;
    }
}
