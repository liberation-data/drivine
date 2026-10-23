import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { FragmentModel } from '@/model/FragmentModel';
import { ConstraintManager } from '@/schema/ConstraintManager';
import { IndexManager } from '@/schema/IndexManager';
import { SchemaItem } from '@/schema/SchemaGrammar';

/**
 * What to do when an ordered query has no range index to seek into. Ordering without one is correct: it scans and
 * sorts, which is fine for a few nodes and quietly expensive for many. So this is advice, at the level the caller picks.
 * OFF: say nothing. WARN (the default): log once per label and properties. FAIL: throw, for development and CI.
 */
export type IndexAdvicePolicy = 'OFF' | 'WARN' | 'FAIL';

/**
 * Checks that an ordered query has a range index over exactly its ordered properties, in order, and says so when it
 * has none. The index list is read once and kept: an index made later is unseen until `refresh`, which the object
 * manager's own index and constraint managers call when they make or drop one. The list is also what a filter is read
 * through, on a store that does (see SchemaGrammar's labelledIndexes).
 */
export class QueryIndexAdvisor {
    private readonly logger = new DrivineLogger(QueryIndexAdvisor.name);
    private indexes?: Promise<SchemaItem[]>;
    private constraints?: Promise<SchemaItem[]>;
    private readonly reported = new Set<string>();

    constructor(
        private readonly indexManager: () => IndexManager,
        private readonly constraintManager: () => ConstraintManager,
        /** Whether the engine indexes properties one by one, so an order is served when each is indexed. */
        private readonly rangesPerProperty: () => boolean
    ) {}

    /**
     * Advises on an order of `model`'s nodes by `properties` (stored names), unless the query's equalities on `pinned`
     * already narrow it to one root, so that its order is over one row.
     */
    async check(
        policy: IndexAdvicePolicy,
        model: FragmentModel,
        properties: string[],
        operation: 'orderBy' | 'seek',
        pinned: string[] = []
    ): Promise<void> {
        if (policy === 'OFF' || !properties.length) {
            return;
        }
        if (await this.selectsOne(model, pinned)) {
            return;
        }
        const label = model.labels[0];
        if (await this.covered(model, properties)) {
            return;
        }
        const message =
            `${operation} on ${label}(${properties.join(', ')}) has no matching range index, so the query scans and ` +
            `sorts rather than seeking. Declare @RangeIndex${
                properties.length > 1 ? `({properties: [${properties.map((it) => `'${it}'`).join(', ')}]})` : '()'
            } on the fragment, or call indexes.ensure(rangeIndex('${label}', [${properties
                .map((it) => `'${it}'`)
                .join(', ')}])). The index must cover exactly these properties, in this order.`;
        if (policy === 'FAIL') {
            throw new DrivineError(message);
        }
        const signature = `${operation}|${label}|${properties.join(',')}`;
        if (!this.reported.has(signature)) {
            this.reported.add(signature);
            this.logger.warn(message);
        }
    }

    /**
     * The range indexes and uniqueness constraints there are, read once and kept as for advice: those whole, as a
     * filter is read through them.
     */
    async indexed(): Promise<SchemaItem[]> {
        return [...(await this.indexList()), ...(await this.constraintList())].filter((it) => !it.incomplete);
    }

    /** Forgets the index list, so the next check reads it again. */
    refresh(): void {
        this.indexes = undefined;
        this.constraints = undefined;
        this.reported.clear();
    }

    private async covered(model: FragmentModel, properties: string[]): Promise<boolean> {
        const items = (await this.indexList()).filter((it) => model.labels.includes(it.label));
        if (this.rangesPerProperty()) {
            return properties.every((property) => items.some((it) => it.properties.includes(property)));
        }
        return items.some((it) => it.properties.join(',') === properties.join(','));
    }

    /** Whether equalities on `pinned` select at most one root: on the @NodeId, or over a uniqueness constraint. */
    private async selectsOne(model: FragmentModel, pinned: string[]): Promise<boolean> {
        if (!pinned.length) {
            return false;
        }
        if (model.nodeIdProperty && pinned.includes(model.nodeIdProperty)) {
            return true;
        }
        return (await this.constraintList()).some(
            (it) => model.labels.includes(it.label) && it.properties.every((p) => pinned.includes(p))
        );
    }

    private async indexList(): Promise<SchemaItem[]> {
        this.indexes ??= this.read('indexes', async () => this.indexManager().list('RANGE'));
        return this.indexes;
    }

    private async constraintList(): Promise<SchemaItem[]> {
        this.constraints ??= this.read('constraints', async () => this.constraintManager().list());
        return this.constraints;
    }

    /** Advice never breaks a query: an engine that can't list its schema gives an empty list. */
    private async read(what: string, list: () => Promise<SchemaItem[]>): Promise<SchemaItem[]> {
        try {
            return await list();
        } catch (e) {
            this.logger.verbose(`Could not read ${what} for query index advice: ${e}`);
            return [];
        }
    }
}
