import { plainToInstance } from 'class-transformer';
import { propertyMetadata } from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import type { FragmentModel } from '@/model/FragmentModel';
import type { SchemaCatalog } from '@/schema/SchemaCatalog';
import type { VectorIndexSpec } from '@/schema/SchemaSpecs';

/**
 * Refuses a vector index declared in a schema catalog over a fragment's property whose field has no @VectorIndex.
 *
 * Drivine knows a field is an embedding from the decorator alone (the model's `vectorFields`): without it the field is
 * not written in the engine's vector form on FalkorDB, and `loadNearest` finds no index to search. Neither says where
 * the mistake was made, so it is refused there. A field is known by its decorators or its initializer: one with neither
 * leaves no trace at runtime, so it isn't checked.
 *
 * Either side may be seen first (a catalog can be applied before a fragment class is used, or after), so both are kept
 * for the life of the process: the vector specs SchemaManager has applied, and the fragments whose model has been
 * built. Each new arrival is checked against the other. A spec for a label no fragment maps has nothing to check, and a
 * spec beside the decorator is how an index is tuned. A spec given to `indexes.ensure` directly is not checked.
 */
export class VectorAnnotationCheck {
    /** By label and property, all a check reads of a spec, so applying a catalog again adds nothing. */
    private static readonly specs = new Map<string, VectorIndexSpec>();
    private static readonly admitted = new Map<Function, FragmentModel>();

    /** Records the vector specs of the catalogs, and checks them against every fragment admitted so far. */
    static register(catalogs: SchemaCatalog[]): void {
        const declared = catalogs.flatMap((it) => it.items).filter((it): it is VectorIndexSpec => it.kind === 'VECTOR');
        if (!declared.length) {
            return;
        }
        declared.forEach((it) => this.specs.set(JSON.stringify([it.label, it.properties[0]]), it));
        this.refuse([...this.admitted.values()].flatMap((model) => uncovered(model, declared)));
    }

    /** Checks a newly built model against the vector specs registered so far. A refused one is not admitted. */
    static admit(model: FragmentModel): void {
        this.refuse(uncovered(model, [...this.specs.values()]));
        this.admitted.set(model.type, model);
    }

    private static refuse(problems: string[]): void {
        if (problems.length) {
            throw new DrivineError([...new Set(problems)].join('\n'));
        }
    }
}

/**
 * The fields a fragment class declares: those it decorates or initializes. A field with neither leaves no trace at
 * runtime, so it can't be checked.
 */
function declaredFields(type: Function): Set<string> {
    const fields = new Set(propertyMetadata(type).keys());
    try {
        Object.keys(plainToInstance(type as any, {}) as object).forEach((it) => fields.add(it));
    } catch {
        // A constructor that needs its arguments: its decorated fields are all there is to go by.
    }
    return fields;
}

/**
 * The declared field a node's property is stored in: the one stored under it by @GraphProperty, else the field of its
 * name, unless that field is stored under another name or is neither loaded nor saved.
 */
function fieldFor(model: FragmentModel, property: string): string | undefined {
    const renamed = [...model.graphProperties].find(([, name]) => name === property)?.[0];
    if (renamed) {
        return renamed;
    }
    const stored =
        declaredFields(model.type).has(property) &&
        !model.graphProperties.has(property) &&
        !model.transientFields.has(property) &&
        !model.propertyBags.some((it) => it.field === property) &&
        model.nodeLabels?.field !== property;
    return stored ? property : undefined;
}

function uncovered(model: FragmentModel, specs: VectorIndexSpec[]): string[] {
    return specs
        .filter((spec) => model.labels.includes(spec.label))
        .flatMap((spec) => {
            const field = fieldFor(model, spec.properties[0]);
            return field === undefined || model.vectorFields.has(field)
                ? []
                : [
                      `\`${model.type.name}.${field}\` is covered by the vector index on ` +
                          `\`${spec.label}.${spec.properties[0]}\` but is not annotated \`@VectorIndex\`. Add the ` +
                          `annotation: without it the field is not written as a vector on FalkorDB, and ` +
                          `\`loadNearest\` cannot find its index.`
                  ];
        });
}
