import { SchemaExecutor } from '@/schema/SchemaExecutor';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { EnsureResult, IndexSpec, RangeIndexSpec } from '@/schema/SchemaSpecs';

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it, k) => it === b[k]);
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

/**
 * Range, vector and full-text indexes, made idempotently: `ensure` makes one only when the engine holds none over the
 * label and properties, and reports DRIFT, changing nothing, when it holds one of another shape. `recreate` replaces.
 */
export class IndexManager {
    constructor(
        private readonly executor: SchemaExecutor,
        private readonly grammar: SchemaGrammar
    ) {}

    /** The indexes of a kind the engine holds. */
    async list(kind: IndexSpec['kind'] = 'RANGE'): Promise<SchemaItem[]> {
        const listing =
            kind === 'RANGE'
                ? this.grammar.listRanges
                : kind === 'VECTOR'
                ? this.grammar.listVectors
                : this.grammar.listFullTexts;
        return listing.read(await this.executor.run(listing.statement));
    }

    async ensure<S extends IndexSpec>(spec: S): Promise<EnsureResult<S>> {
        const found = await this.find(spec);
        if (found) {
            return this.matches(spec, found)
                ? { status: 'ALREADY_MATCHING', spec }
                : {
                      status: 'DRIFT',
                      spec,
                      found: {
                          properties: found.properties,
                          dimensions: found.dimensions,
                          similarity: found.similarity
                      }
                  };
        }
        await this.create(spec);
        return { status: 'CREATED', spec };
    }

    /** Drops the index over the label and properties, whatever its shape, and makes it as the spec says. Destructive. */
    async recreate<S extends IndexSpec>(spec: S): Promise<EnsureResult<S>> {
        await this.drop(spec);
        await this.create(spec);
        return { status: 'RECREATED', spec };
    }

    async drop(spec: IndexSpec): Promise<void> {
        const found = await this.find(spec);
        if (!found) {
            return;
        }
        // Dropped as it was made: for a drifted full-text index, over the properties the engine holds.
        const held = { ...spec, properties: found.properties } as IndexSpec;
        for (const statement of this.statements(held, 'drop')) {
            await this.executor.run(statement);
        }
    }

    private async create(spec: IndexSpec): Promise<void> {
        for (const statement of this.statements(spec, 'create')) {
            await this.executor.run(statement);
        }
    }

    private statements(spec: IndexSpec, action: 'create' | 'drop'): string[] {
        switch (spec.kind) {
            case 'VECTOR':
                return action === 'create' ? this.grammar.createVector(spec) : this.grammar.dropVector(spec);
            case 'FULLTEXT':
                return action === 'create' ? this.grammar.createFullText(spec) : this.grammar.dropFullText(spec);
            default:
                return action === 'create' ? this.grammar.createRange(spec) : this.grammar.dropRange(spec);
        }
    }

    /**
     * The index the engine holds for the spec: a vector index over the same property, the label's full-text index (one
     * to a label), or a range index over the same properties.
     */
    private async find(spec: IndexSpec): Promise<SchemaItem | undefined> {
        const items = (await this.list(spec.kind)).filter((it) => it.label === spec.label);
        switch (spec.kind) {
            case 'VECTOR':
                return items.find((it) => it.properties[0] === spec.properties[0]);
            case 'FULLTEXT':
                return items[0];
            default:
                return this.findRange(spec, items);
        }
    }

    private findRange(spec: RangeIndexSpec, items: SchemaItem[]): SchemaItem | undefined {
        if (this.grammar.rangesPerProperty) {
            // An engine that indexes properties one by one holds a composite index when it holds each property's.
            const all = spec.properties.every((property) => items.some((it) => it.properties[0] === property));
            return all ? { label: spec.label, properties: spec.properties } : undefined;
        }
        return items.find((it) => same(it.properties, spec.properties));
    }

    private matches(spec: IndexSpec, found: SchemaItem): boolean {
        switch (spec.kind) {
            case 'VECTOR':
                return found.dimensions === spec.dimensions && found.similarity === spec.similarity;
            case 'FULLTEXT':
                return sameSet(found.properties, spec.properties);
            default:
                return true;
        }
    }
}
