import { ClassType } from 'class-transformer/ClassTransformer';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { Statement } from '@/query/Statement';
import * as assert from 'assert';

export class QuerySpecification<T> {
    statement: Statement;
    parameters: any[];
    mapper?: (result: any) => T;
    transformType?: ClassType<T>;
    private _skip: number;
    private _limit: number;

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

    appliedStatement(): string {
        return `${this.statement.text} ${this.skipClause()} ${this.limitClause()}`;
    }

    /**
     * Returns parameters in the format of a supported database type.
     * @param type
     */
    // TODO: Replace with polymorphism
    mapParameters(type: DatabaseType): any {
        const params = this.parameters ? this.parameters : [];
        if (type == DatabaseType.AGENS_GRAPH) {
            if (this.statement.language === 'CYPHER') {
                return params.map(it => JSON.stringify(it));
            } else if (this.statement.language === 'SQL') {
                return params;
            } else {
                throw new DrivineError(`${this.statement.language} is not supported on AgensGraph`);
            }
        } else if (type == DatabaseType.NEO4J) {
            assert(this.statement.language === 'CYPHER', `${this.statement.language} is not supported on Neo4j.`);
            const mapped = params.map((it, index) => ({ [index + 1]: it }));
            return Object.assign({}, ...mapped);
        } else {
            throw new DrivineError(`Database type ${type} is not supported.`);
        }
    }

    private skipClause(): string {
        if (this._skip) {
            return `${this.statement.language === 'CYPHER' ? `SKIP` : `OFFSET`} ${this._skip}`;
        }
        return ``;
    }

    private limitClause(): string {
        return this._limit ? `LIMIT ${this._limit}` : ``;
    }
}
