import { instanceToPlain } from 'class-transformer';
import neo4j from "neo4j-driver";

export interface PrimitivePropsOptions {
    classToPlain: boolean;
    neo4jDateToDateTime: boolean;
}

export class ObjectUtils {
    /**
     * Returns a new object that contains only the 'primitive' properties, or arrays of them, from the source object.
     * @param object
     * @returns {{}}
     */
    static primitiveProps = (
        object: any,
        options: PrimitivePropsOptions = { classToPlain: true, neo4jDateToDateTime: true }
    ): any => {
        const props = {};
        if (object) {
            const source = options.classToPlain ? instanceToPlain(object) : object;
            const strings = Object.keys(source);
            strings.forEach((key: string) => {
                const candidate = source[key];
                // Array of primitives
                if (
                    candidate != undefined &&
                    candidate.constructor === Array &&
                    candidate.filter((it: any) => typeof it === 'object').length === 0
                ) {
                    props[key] = candidate;
                } else if (candidate != undefined && candidate instanceof Date && options.neo4jDateToDateTime) {
                    props[key] = neo4j.types.DateTime.fromStandardDate(candidate);
                } else if (candidate != undefined && typeof candidate !== 'object') {
                    props[key] = candidate;
                }
            });
        }
        return props;
    };
}
