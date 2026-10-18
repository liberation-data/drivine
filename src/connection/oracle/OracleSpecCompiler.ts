import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';

/**
 * Compiles a specification for Oracle: `$name` parameters become `:name` binds, and skip and limit an
 * `OFFSET … FETCH`. A list or a map is bound as JSON text, which a statement reads with `JSON(:name)` or `JSON_TABLE`.
 */
export class OracleSpecCompiler extends QuerySpecificationCompiler {
    constructor(spec: QuerySpecification<any>) {
        super(spec);
        if (this.spec.statement.language !== 'SQL') {
            throw new DrivineError(`${this.spec.statement.language} is not supported on Oracle.`);
        }
        if (Array.isArray(this.spec.parameters) && this.spec.parameters.length) {
            throw new DrivineError('Oracle takes named parameters ($name), not a list of them.');
        }
    }

    /** Every `$name` the parameters hold becomes `:name`; a name is never matched as the prefix of a longer one. */
    formattedStatement(): string {
        const names = new Set(Object.keys(this.named()));
        return this.appliedStatement().replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match: string, name: string) =>
            names.has(name) ? `:${name}` : match
        );
    }

    formattedParams(): Record<string, any> {
        const statement = this.spec.statement.text;
        const params: Record<string, any> = {};
        for (const [name, value] of Object.entries(this.named())) {
            // Oracle refuses a bind the statement doesn't name.
            if (new RegExp(`\\$${name}(?![A-Za-z0-9_])`).test(statement)) {
                params[name] = bindable(value);
            }
        }
        return params;
    }

    protected skipClause(): string {
        return this.spec._skip ? `OFFSET ${this.spec._skip} ROWS` : '';
    }

    protected limitClause(): string {
        return this.spec._limit ? `FETCH NEXT ${this.spec._limit} ROWS ONLY` : '';
    }

    /** The parameters by name: a specification with none holds an empty list. */
    private named(): Record<string, any> {
        return Array.isArray(this.spec.parameters) ? {} : this.spec.parameters ?? {};
    }
}

function bindable(value: any): any {
    if (value === undefined) {
        return null;
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
        return JSON.stringify(value);
    }
    return value;
}
