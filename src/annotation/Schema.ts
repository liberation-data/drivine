import { definePropertyMetadata } from '@/annotation/Metadata';
import 'reflect-metadata';

export type SchemaSimilarity = 'COSINE' | 'EUCLIDEAN';

/** A schema item a fragment declares: on a field, over that field; on the class, over the properties it names. */
export interface SchemaDeclaration {
    kind: 'RANGE' | 'UNIQUE' | 'VECTOR' | 'FULLTEXT';
    /** Field names: mapped to graph property names when the catalog is built. */
    fields: string[];
    similarity?: SchemaSimilarity;
    dimensions?: number;
}

const SCHEMA_KEY = Symbol('drivine:schema');

/** The schema declarations on a class itself (composite ones), not its fields'. */
export function classSchemaDeclarations(target: Function): SchemaDeclaration[] {
    return Reflect.getOwnMetadata(SCHEMA_KEY, target) ?? [];
}

function declare(
    kind: SchemaDeclaration['kind'],
    options: { properties?: string[]; similarity?: SchemaSimilarity; dimensions?: number }
) {
    return (target: object, property?: string | symbol): void => {
        if (property === undefined) {
            if (!options.properties?.length) {
                throw new Error(`On a class, a ${kind} declaration names its properties: { properties: [...] }.`);
            }
            const type = target as Function;
            Reflect.defineMetadata(
                SCHEMA_KEY,
                [...classSchemaDeclarations(type), { kind, fields: options.properties }],
                type
            );
            return;
        }
        definePropertyMetadata(target, String(property), {
            schema: [
                { kind, fields: [String(property)], similarity: options.similarity, dimensions: options.dimensions }
            ]
        });
    };
}

/** A range index over the field, or on the class over the properties named. */
export function RangeIndex(options: { properties?: string[] } = {}): ClassDecorator & PropertyDecorator {
    return declare('RANGE', options) as ClassDecorator & PropertyDecorator;
}

/** A uniqueness constraint over the field, or on the class over the properties named. */
export function Unique(options: { properties?: string[] } = {}): ClassDecorator & PropertyDecorator {
    return declare('UNIQUE', options) as ClassDecorator & PropertyDecorator;
}

/** A full-text index over the field, or on the class over the properties named. Drives `loadMatching`. */
export function FullTextIndex(options: { properties?: string[] } = {}): ClassDecorator & PropertyDecorator {
    return declare('FULLTEXT', options) as ClassDecorator & PropertyDecorator;
}

/**
 * A vector index over the field. Its dimensions come from the catalog's dimension provider when the catalog is built
 * (they belong to the embedding model, known at runtime), unless given here. Drives `loadNearest`.
 */
export function VectorIndex(options: { similarity?: SchemaSimilarity; dimensions?: number } = {}): PropertyDecorator {
    return declare('VECTOR', options) as PropertyDecorator;
}
