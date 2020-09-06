import { classToPlain } from 'class-transformer';

export interface PrimitivePropsOptions {
    classToPlain: boolean;
}

export class ObjectUtils {
    /**
     * Returns a new object that contains only the 'primitive' properties, or arrays of them, from the source object.
     * @param object
     * @returns {{}}
     */
    static primitiveProps = (object: any, options: PrimitivePropsOptions = { classToPlain: true }): any => {
        const props = {};
        if (object) {
            const source = options.classToPlain ? classToPlain(object) : object
            Object.keys(source).forEach((key: string) => {
                const candidate = object[key];
                // Array of primitives
                if (candidate != undefined && candidate.constructor === Array
                    && candidate.filter((it: any) => typeof (it) === 'object').length === 0) {
                    props[key] = candidate;
                } else if (candidate != undefined && typeof (candidate) !== 'object') {
                    props[key] = candidate;
                }
            });
        }
        return props;
    };
}


