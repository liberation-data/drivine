import { DrivineLogger } from '@/logger';
import type { FragmentModel } from '@/model/FragmentModel';
import type { SchemaItem } from '@/schema/SchemaGrammar';
import type { EnsureResult, IndexSpec, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';

/** A range index or a uniqueness constraint an engine lists, of the kind a lookup by a @NodeId may read. */
export type ListedItem = Pick<SchemaItem, 'label' | 'properties'> & { kind: 'RANGE' | 'UNIQUE' };

/**
 * Warns, once per fragment and database, of a fragment whose @NodeId no index serves under any of its labels: each save
 * and each load by id then reads every node of the label (#800, drivine4j#828). With the range index a fragment read
 * into a SchemaCatalog is given by default, this is the case where that default is off or never applied.
 *
 * Nothing here reads the store while a fragment is used, nor throws: a check that fails is passed over, and the save or
 * load goes on. What serves an id is what SchemaManager's `enforce` (or `recreateAll`) listed of each database
 * (`listed`), after it applied the catalogs, kept current by each ensure after it (`ensured`). A fragment used before an
 * enforce is checked when it runs, and one first used after it against what it listed. Where no SchemaManager with a
 * catalog has been built, nothing applies one; as one may yet be, as an application starts, a fragment is warned of
 * only if none has been UNMANAGED_DELAY_MILLIS after its first use.
 *
 * The warning is logged at WARN, which DrivineLogger prints where DRIVINE_LOG_LEVEL is WARN or lower.
 */
export class NodeIdIndexCheck {
    /** How long after a fragment's first use, with no SchemaManager built, it is warned of. */
    static readonly UNMANAGED_DELAY_MILLIS = 30_000;

    private static readonly logger = new DrivineLogger(NodeIdIndexCheck.name);

    /** The fragments with a @NodeId admitted so far, by class, for `listed` to check. */
    private static readonly admitted = new Map<Function, FragmentModel>();

    /** What serves an id on each database an enforce listed: its range indexes and constraints over one property. */
    private static readonly served = new Map<string, Set<string>>();

    /** The fragments warned of, by database ('' for none: no SchemaManager), each once. */
    private static readonly warned = new Map<string, Set<Function>>();

    /** Whether a SchemaManager with a catalog has been built, which applies catalogs and lists what serves an id. */
    private static managedSince = false;

    /** What `reset` last set: a timer set under another does nothing. */
    private static generation = 0;

    /** A SchemaManager with a catalog was built: fragments are checked against what its enforce lists. */
    static managed(): void {
        this.managedSince = true;
    }

    /** Checks a newly built model once per class: against each database an enforce listed, or, with no manager, later. */
    static admit(model: FragmentModel): void {
        this.guarded(() => {
            if (!model.nodeIdProperty || this.admitted.has(model.type)) {
                return;
            }
            this.admitted.set(model.type, model);
            this.served.forEach((serving, database) => this.check(database, model, serving));
            if (!this.managedSince) {
                this.unmanagedLater(model.type, this.generation);
            }
        });
    }

    /**
     * What an enforce found on `database`, `items` its range indexes and uniqueness constraints: each fragment admitted so
     * far is checked against it. An item serves a property where it is over that property alone, or, on an engine that
     * lists a label's range properties as one item (`rangesPerProperty`, FalkorDB), where it is among them.
     */
    static listed(database: string, items: ListedItem[], rangesPerProperty: boolean = false): void {
        this.guarded(() => {
            const serving = new Set(
                items.flatMap((item) =>
                    item.properties.length === 1 || (rangesPerProperty && item.kind === 'RANGE')
                        ? item.properties.map((property) => key(item.label, property))
                        : []
                )
            );
            this.served.set(database, serving);
            this.admitted.forEach((model) => this.check(database, model, serving));
        });
    }

    /** Whether an enforce has listed `database`, whose listing a runtime ensure is to keep current. */
    static listedOn(database: string): boolean {
        return this.served.has(database);
    }

    /**
     * `spec` was ensured or recreated on `database` with `result`, outside a SchemaManager: where an enforce listed the
     * database, an id it serves is served from then on, so a fragment first used after it isn't warned of. Nothing is
     * read of the store.
     */
    static ensured(database: string, spec: IndexSpec | UniquenessConstraintSpec, result: EnsureResult<any>): void {
        if (!['CREATED', 'ALREADY_MATCHING', 'RECREATED'].includes(result.status)) {
            return;
        }
        if ((spec.kind !== 'RANGE' && spec.kind !== 'UNIQUE') || spec.ignoreCase || spec.properties.length !== 1) {
            return;
        }
        this.served.get(database)?.add(key(spec.label, spec.properties[0]));
    }

    /** Warns of `type`, admitted under `generation`, where no SchemaManager has been built since. */
    static unmanaged(type: Function, generation: number = this.generation): void {
        this.guarded(() => {
            const model = this.admitted.get(type);
            if (model && !this.managedSince && generation === this.generation) {
                this.warn('', model);
            }
        });
    }

    /** Forgets everything, for tests: each class is admitted again at its next build. */
    static reset(): void {
        this.generation++;
        this.admitted.clear();
        this.served.clear();
        this.warned.clear();
        this.managedSince = false;
    }

    /** Warns of `type` after UNMANAGED_DELAY_MILLIS if no SchemaManager has been built by then, and nothing was reset. */
    private static unmanagedLater(type: Function, generation: number): void {
        const timer = setTimeout(() => this.unmanaged(type, generation), this.UNMANAGED_DELAY_MILLIS);
        // Never what keeps a process alive.
        (timer as { unref?: () => void }).unref?.();
    }

    /**
     * Warns of `model` where no index `serving` is over its @NodeId under any of its labels: a save and a load by id match
     * every label of the fragment, so an index under any of them answers it.
     */
    private static check(database: string, model: FragmentModel, serving: Set<string>): void {
        const property = model.nodeIdProperty!;
        if (!model.labels.some((label) => serving.has(key(label, property)))) {
            this.warn(database, model);
        }
    }

    private static warn(database: string, model: FragmentModel): void {
        const label = model.labels[0];
        const property = model.nodeIdProperty;
        if (!label || !property) {
            return;
        }
        const warned = this.warned.get(database) ?? new Set<Function>();
        this.warned.set(database, warned);
        if (warned.has(model.type)) {
            return;
        }
        warned.add(model.type);
        const fragment = model.type.name;
        this.logger.warn(
            `@NodeId '${property}' of ${fragment} has no index under :${label}, so each save scans every :${label} node. ` +
                `Its default index is off (@NodeFragment({ nodeIdIndex: false }) / indexNodeIds: false, or ${fragment} ` +
                `isn't in a SchemaCatalog): declare @RangeIndex or @Unique on it, or ` +
                `indexes.ensure(rangeIndex('${label}', '${property}')).`
        );
    }

    /** Runs `check`, passing over anything it throws: a warning must never fail the save or load it is made in. */
    private static guarded(check: () => void): void {
        try {
            check();
        } catch (e) {
            this.logger.debug(`The check for an unindexed @NodeId could not be made: ${e}`);
        }
    }
}

function key(label: string, property: string): string {
    return JSON.stringify([label, property]);
}
