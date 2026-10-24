import { QuerySpecification } from '@/query/QuerySpecification';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';

/** A specification of a Cypher statement compiled to SQL, and what runs before it on the same connection. */
export interface CompiledSpecification<T> {
    spec: QuerySpecification<T>;
    setup: string[];
}

/**
 * The Cypher statement of `spec` compiled to the store's SQL by `compiler`, as a specification of that SQL with the
 * same paging and post-processors: so a statement written for a graph engine runs on a SQL store and gives the same
 * rows. Parameters given by position are named by it, from 1, as a graph engine names them.
 */
export function compiledSpecification<T>(
    spec: QuerySpecification<T>,
    compiler: SqlCypherCompiler
): CompiledSpecification<T> {
    const parameters = Array.isArray(spec.parameters)
        ? Object.fromEntries(spec.parameters.map((it, i) => [String(i + 1), it]))
        : spec.parameters ?? {};
    const compiled = compiler.compile(spec.statement.text, parameters);
    const sql = new QuerySpecification<T>()
        .withStatement({ text: compiled.sql, language: 'SQL' })
        .skip(spec._skip)
        .limit(spec._limit)
        .bind(compiled.parameters)
        .addPostProcessors(...spec.postProcessors);
    return { spec: Object.freeze(sql), setup: compiled.setup };
}
