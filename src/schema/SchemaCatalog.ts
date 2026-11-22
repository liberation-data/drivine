import { classSchemaDeclarations, SchemaDeclaration } from '@/annotation/Schema';
import { propertyMetadata } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import {
    fullTextIndex,
    IndexSpec,
    madeAs,
    rangeIndex,
    uniquenessConstraint,
    UniquenessConstraintSpec,
    vectorIndex
} from '@/schema/SchemaSpecs';
import { moduleSpec } from '@/schema/SchemaPlan';

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
    /**
     * The items, each declared once (see `asPlanned`), the indexes before the constraints, each in the order given: as
     * drivine4j's catalog holds them, and as `items` gives them.
     */
    static of(...items: SchemaSpec[]): SchemaCatalog {
        return new SchemaCatalog(asPlanned(items));
    }

    /**
     * The items fragments declare with @RangeIndex, @Unique, @VectorIndex and @FullTextIndex, over their first label and
     * their properties' graph names. A vector index's dimensions come from `dimensions` unless the decorator gives them.
     * Each item is given once, the indexes before the constraints, as `of` gives them: of each class, its own
     * declarations first, then its fields', by field name, as drivine4j reads them.
     */
    static fromFragments(dimensions: VectorDimensionProvider | undefined, ...types: ClassRef[]): SchemaCatalog {
        const registry = new ModelRegistry();
        const items = types.flatMap((type) => {
            const model = registry.fragment(type as ClassType);
            const label = model.labels[0];
            const graphName = (field: string): string => model.graphProperties.get(field) ?? field;
            // The class's own first, its range indexes, then its full-text indexes, then its constraints, then each
            // property's, by its name, as drivine4j's scanner reads them. A class's decorators are applied from the
            // last written to the first, so its declarations are recorded in reverse.
            const own = [...classSchemaDeclarations(type)].reverse();
            const declarations: SchemaDeclaration[] = [
                ...CLASS_ORDER.flatMap((kind) => own.filter((it) => it.kind === kind)),
                ...[...propertyMetadata(type)]
                    .sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
                    .flatMap(([, it]) => it.schema ?? [])
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
        return new SchemaCatalog(asPlanned(items));
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

/** The order drivine4j's scanner reads a fragment class's own declarations in, by kind. */
const CLASS_ORDER = ['RANGE', 'FULLTEXT', 'UNIQUE'];

/**
 * `items` as the planner is given them, as drivine4j's catalog gives them (drivine-cypher-spec#135's declarations.yaml):
 * each item declared once, the indexes before the constraints, each in the order declared. Declarations of one item
 * share its kind, label and properties as made, in any order; of a uniqueness constraint declared with and without a
 * node id to sample by, the one with it is kept. Declarations of one item that differ otherwise, the order of their
 * properties included, are kept, for the planner to refuse. A store one library indexed is up to date for another only
 * where both give the same catalogs.
 */
function asPlanned(items: SchemaSpec[]): SchemaSpec[] {
    const once: SchemaSpec[] = [];
    for (const item of items) {
        const same = once.findIndex((it) => sameItem(it, item));
        if (same < 0) {
            once.push(item);
        } else if (item.kind === 'UNIQUE' && item.nodeIdProperty !== undefined) {
            const kept = once[same] as UniquenessConstraintSpec;
            if (kept.nodeIdProperty === undefined) {
                once[same] = item;
            }
        }
    }
    return [...once.filter((it) => it.kind !== 'UNIQUE'), ...once.filter((it) => it.kind === 'UNIQUE')];
}

/**
 * Whether `a` and `b` declare one item alike, but for a uniqueness constraint's node id to sample by: as the module
 * reads each, so that a spec written by hand is the builder's like it, and with its properties in their declared order,
 * as drivine4j compares them.
 */
function sameItem(a: SchemaSpec, b: SchemaSpec): boolean {
    const key = (it: SchemaSpec): string => JSON.stringify([it.kind, it.label, [...madeAs(it).properties].sort()]);
    if (key(a) !== key(b)) {
        return false;
    }
    const plain = (it: SchemaSpec): string => JSON.stringify({ ...moduleSpec(it), nodeIdProperty: undefined });
    return plain(a) === plain(b);
}
