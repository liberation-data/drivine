import { SchemaExecutor } from '@/schema/SchemaExecutor';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import {
    EnsureResult,
    IndexSpec,
    itemName,
    RangeIndexSpec,
    SchemaItemShape,
    vectorTuning,
    VectorTuning
} from '@/schema/SchemaSpecs';
import { DrivineLogger } from '@/logger';

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it, k) => it === b[k]);
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

/**
 * Range, vector and full-text indexes, made idempotently: `ensure` makes one only when the engine holds none over the
 * label and properties, and reports DRIFT, changing nothing, when it holds one of another shape. `recreate` replaces.
 */
/** What an engine reports of an index's shape. */
function shapeOf(found: SchemaItem): SchemaItemShape {
    return {
        properties: found.properties,
        dimensions: found.dimensions,
        similarity: found.similarity,
        hnswM: found.hnswM,
        hnswEfConstruction: found.hnswEfConstruction,
        quantizationEnabled: found.quantizationEnabled,
        efRuntime: found.efRuntime
    };
}

export class IndexManager {
    private readonly logger = new DrivineLogger(IndexManager.name);

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
        this.warnUnsupported(spec);
        const found = await this.find(spec);
        if (found) {
            return this.matches(spec, found)
                ? { status: 'ALREADY_MATCHING', spec }
                : { status: 'DRIFT', spec, found: shapeOf(found) };
        }
        await this.create(spec);
        await this.logEffective(spec);
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
        // Dropped as it was made: by the engine's name for it where it names items, else over the properties it holds.
        const held = { ...spec, properties: found.properties.length ? found.properties : spec.properties } as IndexSpec;
        const statements =
            held.kind === 'FULLTEXT' ? this.grammar.dropFullText(held, found.name) : this.statements(held, 'drop');
        for (const statement of statements) {
            await this.executor.run(statement);
        }
    }

    /** Says which pins of a vector index the engine can't express: they are reported, never dropped silently. */
    private warnUnsupported(spec: IndexSpec): void {
        const unsupported = spec.kind === 'VECTOR' ? this.grammar.unsupportedVectorTuning?.(spec) ?? [] : [];
        if (unsupported.length) {
            this.logger.warn(
                `The vector index on ${spec.label}(${spec.properties.join(', ')}) pins ${unsupported.join(
                    ', '
                )}, which ` + `${this.grammar.engine} can't express: they are not applied there.`
            );
        }
    }

    /** Logs what the engine chose for a vector index it made, pinned or not, so the value can be told later. */
    private async logEffective(spec: IndexSpec): Promise<void> {
        if (spec.kind !== 'VECTOR') {
            return;
        }
        const found = await this.find(spec);
        if (found) {
            const shape = Object.entries(shapeOf(found))
                .filter(([key, value]) => value !== undefined && key !== 'properties')
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
            this.logger.log(`Vector index ${itemName(spec)} on ${spec.label}[${spec.properties[0]}]: ${shape}`);
        }
    }

    private async create(spec: IndexSpec): Promise<void> {
        const missing = await this.missing(spec);
        if (!missing.properties.length) {
            return;
        }
        for (const statement of this.statements(missing, 'create')) {
            await this.executor.run(statement);
        }
    }

    /**
     * The part of the spec the engine doesn't hold. On an engine that indexes properties one by one, a composite index's
     * properties that are indexed already are left out: it refuses to index one twice.
     */
    private async missing(spec: IndexSpec): Promise<IndexSpec> {
        if (spec.kind !== 'RANGE' || !this.grammar.rangesPerProperty) {
            return spec;
        }
        const held = (await this.list('RANGE')).filter((it) => it.label === spec.label).flatMap((it) => it.properties);
        return { ...spec, properties: spec.properties.filter((it) => !held.includes(it)) };
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
                // By its name where the engine names items (a label may hold several); FalkorDB holds one to a label.
                if (!items.some((it) => it.name)) {
                    return items[0];
                }
                // The same properties in another order name the same index; one made over the whole label reports none,
                // so its name is all there is to go by.
                return (
                    items.find((it) => it.name === itemName(spec)) ??
                    items.find((it) => it.properties.length > 0 && sameSet(it.properties, spec.properties)) ??
                    items.find((it) => it.name && namesInAnyOrder(spec).has(it.name))
                );
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
            case 'VECTOR': {
                // Unpinned is never drift: with no declared value there is nothing for the engine to differ from. A pin
                // the engine reports otherwise is; one the engine doesn't report, or can't express, is not checked.
                const pinned = vectorTuning(spec, this.grammar.engine);
                const unsupported = this.grammar.unsupportedVectorTuning?.(spec) ?? [];
                const agrees = (key: keyof VectorTuning): boolean =>
                    pinned[key] === undefined ||
                    found[key] === undefined ||
                    unsupported.includes(key) ||
                    pinned[key] === found[key];
                return (
                    found.dimensions === spec.dimensions &&
                    found.similarity === spec.similarity &&
                    (['hnswM', 'hnswEfConstruction', 'quantizationEnabled', 'efRuntime'] as const).every(agrees)
                );
            }
            case 'FULLTEXT':
                // An index made over the whole label covers any properties of it.
                return (
                    sameSet(found.properties, spec.properties) ||
                    (!!this.grammar.fullTextOverLabel && spec.properties.length > 1 && found.properties.length === 0)
                );
            default:
                return true;
        }
    }
}

/** The names a full-text index over the spec's properties has, whatever their order. */
function namesInAnyOrder(spec: IndexSpec): Set<string> {
    const orders = (rest: string[]): string[][] =>
        rest.length <= 1
            ? [rest]
            : rest.flatMap((it, i) => orders([...rest.slice(0, i), ...rest.slice(i + 1)]).map((tail) => [it, ...tail]));
    return new Set(orders(spec.properties).map((properties) => itemName({ ...spec, properties } as IndexSpec)));
}
