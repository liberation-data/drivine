import { ClassType } from 'class-transformer/ClassTransformer';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';

export class QuerySpecification<T> {
    public parameters: any[];
    public mapper?: (result: any) => T;
    public transformType?: ClassType<T>;

    public constructor(public statement?: string) {
        this.statement = statement;
        this.parameters = [];
    }

    public withStatement(statement: string): this {
        this.statement = statement;
        return this;
    }

    public bind(parameters: any[]): this {
        this.parameters = parameters;
        return this;
    }

    public map(mapper: (result: any) => T): this {
        this.mapper = mapper;
        return this;
    }

    public transform(type: ClassType<T>): this {
        this.transformType = type;
        return this;
    }

    /**
     * Returns parameters in the format of a supported database type.
     * @param type
     */
    public mapParameters(type: DatabaseType): any {
        const params = this.parameters ? this.parameters : [];
        if (type == DatabaseType.AGENS_GRAPH) {
            return params.map(it => JSON.stringify(it));
        } else if (type == DatabaseType.NEO4J) {
            const mapped = params.map((it, index) => ({ [index + 1]: it }));
            return Object.assign({}, ...mapped);
        } else {
            throw new DrivineError(`Database type ${type} is not supported.`);
        }
    }
}
