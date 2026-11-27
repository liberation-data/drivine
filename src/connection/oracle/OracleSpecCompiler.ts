import * as oracledb from 'oracledb';
import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
import { jsonText } from '@/utils/JsonText';
import { parameterNames, replaceParameters } from '@/utils/SqlParameters';

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

    /**
     * Every `$name` the parameters hold becomes a bind, `:b0`, `:b1`, … (an Oracle bind name may not begin with `_`, as
     * Drivine's own parameters do); a name is never matched as the prefix of a longer one, nor inside quoted text, such
     * as the JSON path `'$."$t"'`: see [replaceParameters].
     */
    formattedStatement(): string {
        const names = Object.keys(this.named());
        const statement = replaceParameters(this.appliedStatement(), (name) => {
            const index = names.indexOf(name);
            return index >= 0 ? `:b${index}` : undefined;
        });
        // Read from the parameters, not their binds: binding one again would write a list or a map's JSON text again.
        const used = parameterNames(this.spec.statement.text);
        const doubles = names.flatMap((name, index) =>
            used.has(name) && nonFinite(this.named()[name]) ? [`b${index}`] : []
        );
        return doubles.length
            ? `${statement.trimEnd()}\n/* drivine: binary doubles ${doubles.join(',')} */`
            : statement;
    }

    formattedParams(): Record<string, any> {
        const used = parameterNames(this.spec.statement.text);
        const params: Record<string, any> = {};
        Object.entries(this.named()).forEach(([name, value], index) => {
            // Oracle refuses a bind the statement doesn't name.
            if (used.has(name)) {
                params[`b${index}`] = bindable(value);
            }
        });
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

/** Past this many bytes a text is bound as a CLOB: the longest a PL/SQL `VARCHAR2` holds. */
const MAX_STRING = 32_767;

/**
 * A value as Oracle binds it: a list or a map as its JSON text, and a text a `VARCHAR2` can't hold, measured in bytes,
 * as a CLOB, as drivine4j binds one (a Cypher statement's parameters are one JSON text). A number that is NaN or an
 * infinity is bound as a `BINARY_DOUBLE`, which holds them: node-oracledb binds a number as a `NUMBER`, which holds
 * neither, and refused NaN (NJS-105) and bound Infinity as -1 and -Infinity as -101101101101, with no error (#865). A
 * finite number is still a `NUMBER`. drivine-python binds them so too (liberation-data/drivine-python#599); drivine4j
 * refuses them on plain SQL (liberation-data/drivine4j#906).
 *
 * A statement that binds one is kept apart from its `NUMBER`-bound runs by a comment naming those binds (see
 * {@link OracleSpecCompiler.formattedStatement}): shared with one that bound a `NUMBER` for the same name, Oracle's
 * cursor for the text, made for a `BINARY_DOUBLE`, takes the `NUMBER` for its next run, and then reads the next
 * `BINARY_DOUBLE` as a `NUMBER`, failing it with ORA-01426 (liberation-data/drivine-python#575). On a line of its own,
 * so no comment the statement ends with takes it in.
 */
function bindable(value: any): any {
    if (value === undefined) {
        return null;
    }
    if (nonFinite(value)) {
        return { type: oracledb.DB_TYPE_BINARY_DOUBLE, val: value };
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
        return bindable(jsonText(value));
    }
    if (typeof value === 'string' && value.length * 3 > MAX_STRING && Buffer.byteLength(value, 'utf8') > MAX_STRING) {
        return { type: oracledb.CLOB, val: value };
    }
    return value;
}

/** Whether `value` is a number that is NaN or an infinity, which {@link bindable} binds as a `BINARY_DOUBLE`. */
function nonFinite(value: unknown): value is number {
    return typeof value === 'number' && !Number.isFinite(value);
}
