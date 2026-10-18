import { classSchemaDeclarations, SchemaDeclaration } from '@/annotation/Schema';
import { propertyMetadata } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import {
    fullTextIndex,
    IndexSpec,
    rangeIndex,
    uniquenessConstraint,
    UniquenessConstraintSpec,
    vectorIndex
} from '@/schema/SchemaSpecs';

export type SchemaSpec = IndexSpec | UniquenessConstraintSpec;

/** The dimensions of the vectors stored under a label's property: those of the embedding model, known at runtime. */
export type VectorDimensionProvider = (label: string, property: string) => number;

/**
 * Indexes and constraints to hold on one or more databases, enforced by a SchemaManager. Immutable: each `with`/`for`
 * gives a new catalog.
 */
export class SchemaCatalog {
    static of(...items: SchemaSpec[]): SchemaCatalog {
        return new SchemaCatalog(items);
    }

    /**
     * The items fragments declare with @RangeIndex, @Unique, @VectorIndex and @FullTextIndex, over their first label and
     * their properties' graph names. A vector index's dimensions come from `dimensions` unless the decorator gives them.
     */
    static fromFragments(dimensions: VectorDimensionProvider | undefined, ...types: ClassRef[]): SchemaCatalog {
        const registry = new ModelRegistry();
        const items = types.flatMap((type) => {
            const model = registry.fragment(type as ClassType);
            const label = model.labels[0];
            const graphName = (field: string): string => model.graphProperties.get(field) ?? field;
            const declarations: SchemaDeclaration[] = [
                ...[...propertyMetadata(type)].flatMap(([, it]) => it.schema ?? []),
                ...classSchemaDeclarations(type)
            ];
            return declarations.map((it) => {
                const properties = it.fields.map(graphName);
                switch (it.kind) {
                    case 'UNIQUE':
                        return uniquenessConstraint(label, properties);
                    case 'FULLTEXT':
                        return fullTextIndex(label, properties);
                    case 'VECTOR': {
                        const size = it.dimensions ?? dimensions?.(label, properties[0]);
                        if (size === undefined) {
                            throw new DrivineError(
                                `The vector index on ${type.name}.${it.fields[0]} needs its dimensions: give them on @VectorIndex, ` +
                                    `or a dimension provider to fromFragments.`
                            );
                        }
                        return vectorIndex(label, properties[0], size, it.similarity ?? 'COSINE', {
                            hnswM: it.hnswM,
                            hnswEfConstruction: it.hnswEfConstruction
                        });
                    }
                    default:
                        return rangeIndex(label, properties);
                }
            });
        });
        return new SchemaCatalog(items);
    }

    private constructor(
        readonly items: SchemaSpec[],
        /** A token whose change makes the next `enforce` recreate the catalog's items once. */
        readonly version?: string,
        /** The databases it applies to; every graph database when undefined. */
        readonly databases?: string[],
        /** What its version is recorded under. */
        readonly name: string = 'default'
    ) {}

    withVersion(version: string): SchemaCatalog {
        return new SchemaCatalog(this.items, version, this.databases, this.name);
    }

    /** Records its version under this name, so that catalogs version apart. */
    named(name: string): SchemaCatalog {
        return new SchemaCatalog(this.items, this.version, this.databases, name);
    }

    /** Applies only to the databases named ('default' being the first registered). Replaces earlier targets. */
    forDatabases(...databases: string[]): SchemaCatalog {
        return new SchemaCatalog(this.items, this.version, databases, this.name);
    }

    forDatabase(database: string): SchemaCatalog {
        return this.forDatabases(database);
    }

    forDefaultDatabase(): SchemaCatalog {
        return this.forDatabases('default');
    }
}
