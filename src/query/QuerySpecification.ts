import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { Statement } from '@/query/Statement';
import * as assert from 'assert';

export type ClassType<T> = new (...args: any[]) => T;

export class QuerySpecification<T> {
    statement: Statement;
    parameters: any[] = [];
    mapper?: (result: any) => T;
    transformType?: ClassType<T>;
    _skip: number;
    _limit: number;

    constructor(statement?: string | Statement) {
        this.parameters = [];
        if (statement) {
            this.withStatement(statement);
        }
    }

    withStatement(statement: string | Statement): this {
        if (typeof statement === 'string') {
            // TODO: Resolve default QueryLanguage from bootstrap params
            this.statement = <Statement>{ text: statement, language: 'CYPHER' };
        } else {
            assert(statement.text, 'statement text is required');
            assert(statement.language, 'statement language is require');
            this.statement = statement;
        }
        return this;
    }

    /**
     * Bind parameters to the query.
     * @param parameters. If parameters are undefined or empty, does nothing.
     */
    bind(parameters?: any[]): this {
        if (parameters && parameters.length > 0) {
            this.parameters = parameters;
        }
        return this;
    }

    map(mapper: (result: any) => T): this {
        this.mapper = mapper;
        return this;
    }

    transform(type: ClassType<T>): this {
        this.transformType = type;
        return this;
    }

    skip(results: number): this {
        this._skip = results;
        return this;
    }

    limit(results: number): this {
        this._limit = results;
        return this;
    }

    finalize(): this {
        Object.freeze(this);
        return this;
    }

}
