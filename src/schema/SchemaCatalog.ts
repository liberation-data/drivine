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
/** The owner of an unnamed catalog, as drivine4j names it. */
export const DEFAULT_SCOPE = 'schema';

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
                // An item that ignores case is over the lowercased copies a @CaseInsensitive field keeps, and a save
                // keeps none of another field: it would hold the nodes there were when it was ensured, and none after.
                const uncopied = it.ignoreCase ? properties.filter((p) => !model.lowerCopied.includes(p)) : [];
                if (uncopied.length) {
                    throw new DrivineError(
                        `The ${it.kind === 'UNIQUE' ? 'uniqueness constraint' : 'range index'} on ${
                            type.name
                        }(${it.fields.join(', ')}) ignores case, and ${uncopied
                            .map((p) => `'${p}'`)
                            .join(', ')} is not the property of a ` +
                            '@CaseInsensitive field, which a save keeps a lowercased copy of. Add @CaseInsensitive to the field.'
                    );
                }
                const ignoreCase = it.ignoreCase ? { ignoreCase: true } : {};
                switch (it.kind) {
                    case 'UNIQUE':
                        // A violation's sample names each conflicting node by the fragment's @NodeId too.
                        return uniquenessConstraint(label, properties, {
                            nodeIdProperty: model.nodeIdProperty,
                            ...ignoreCase
                        });
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
                        return rangeIndex(label, properties, ignoreCase);
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
        /**
         * Its owner: what its version and inventory are recorded under, in the owner's marker. Unnamed catalogs share the
         * owner 'schema', drivine4j's default scope.
         */
        readonly name: string = DEFAULT_SCOPE
    ) {}

    withVersion(version: string): SchemaCatalog {
        return new SchemaCatalog(this.items, version, this.databases, this.name);
    }

    /** Records its version and inventory under this owner, so that owners version apart. */
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
