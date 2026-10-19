import { Statement, toPlatformDefault } from '@/query/Statement';
import * as assert from 'assert';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';
import { MapPostProcessor } from '@/mapper/MapPostProcessor';
import { TransformPostProcessor } from '@/mapper/TransformPostProcessor';
import { FilterPostProcessor } from '@/mapper/FilterPostProcessor';
import { QueryLanguage } from '@/query/QueryLanguage';

/** The count, if it is a whole number of at least 0: a value from a request, say, would otherwise be written as text. */
function wholeNumber(count: number | undefined, what: string): number | undefined {
    assert(
        count === undefined || (Number.isInteger(count) && count >= 0),
        `${what} must be a whole number of at least 0, not ${String(count)}.`
    );
    return count;
}

export type ClassType<T = any> = new (...args: any[]) => T;

/** A class, abstract or not: what the object manager takes to name a mapped class. */
export type ClassRef<T = any> = abstract new (...args: any[]) => T;

export class QuerySpecification<T> {
    statement: Statement;
    parameters: any[];
    postProcessors: ResultPostProcessor[];
    _skip?: number;
    _limit?: number;

    static withStatement<T>(statement?: string | Statement): QuerySpecification<T> {
        return new QuerySpecification<T>(statement);
    }

    constructor(statement?: string | Statement) {
        this.parameters = [];
        this.postProcessors = [];
        if (statement) {
            this.withStatement(statement);
        }
    }

    withStatement(statement: string | Statement): this {
        if (typeof statement === 'string') {
            this.statement = <Statement>{ text: statement, language: 'PLATFORM_DEFAULT' };
        } else {
            assert(statement.text, 'statement text is required');
            assert(statement.language, 'statement language is require');
            this.statement = statement;
        }
        return this;
    }

    /**
     * Bind parameters to the query.
     * @param parameters. If parameters are an array, index parameters are assumed. If an object, then named params.
     * If undefined or empty, does nothing.
     */
    bind(parameters?: any[] | any): this {
        if (parameters) {
            this.parameters = parameters;
        }
        return this;
    }

    addPostProcessors(...postProcessors: ResultPostProcessor[]): this {
        postProcessors.forEach((processor) => {
            this.postProcessors.push(processor);
        });
        return this;
    }

    map(mapper: (result: any) => T): this {
        this.postProcessors.push(new MapPostProcessor(mapper));
        return this;
    }

    transform(type: ClassType<T>): this {
        this.postProcessors.push(new TransformPostProcessor(type));
        return this;
    }

    filter(filter: (results: any) => boolean): this {
        this.postProcessors.push(new FilterPostProcessor(filter));
        return this;
    }

    /** Skips the first results. It is written into the statement, so it must be a whole number of at least 0. */
    skip(results: number | undefined): this {
        this._skip = wholeNumber(results, 'skip');
        return this;
    }

    /** Returns at most this many results. It is written into the statement, so it must be a whole number of at least 0. */
    limit(results: number | undefined): this {
        this._limit = wholeNumber(results, 'limit');
        return this;
    }

    /**
     * Returns a frozen copy, replacing 'PLATFORM_DEFAULT' on the statement's query language to the specified one.
     * @param language
     */
    finalizedCopy(language: QueryLanguage): QuerySpecification<T> {
        return Object.freeze(
            new QuerySpecification<T>()
                .withStatement(toPlatformDefault(language, this.statement))
                .skip(this._skip)
                .limit(this._limit)
                .bind(this.parameters)
                .addPostProcessors(...this.postProcessors)
        );
    }
}
