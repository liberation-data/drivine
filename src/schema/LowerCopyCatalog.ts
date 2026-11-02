import { labelExpression, quoteName } from '@/backend/Cypher';
import { LOCK } from '@/backend/CypherStamps';
import { catalogProperties } from '@/backend/sql/SqlCatalog';
import { DrivineLogger } from '@/logger';
import { LowerCopies } from '@/model/LowerCopies';
import { DrivineError } from '@/DrivineError';
import { IndexSpec, itemName, lowercased, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';

/** How many nodes one statement fills in: drivine4j's `LowerCopyCatalog.BATCH`. */
export const LOWER_COPY_BATCH = 10_000;

/** What a catalog row that records a copy filled in is of, on Oracle and Postgres: drivine4j's. */
export const LOWER_COPY_KIND = 'LOWER_COPY';

/** The property of the store's `DrivineStore` node that holds the records, on the graph engines: drivine4j's. */
export const LOWERED_LIST = 'lowered';

/**
 * The statements that fill in the lowercased copies of a property (see LowerCopies) and record that every node of a
 * label has its copy, in the store's own language. The graph engines keep the record on the store's `DrivineStore`
 * node, as a list of entries under `lowered`, each the JSON array `["<label>","<property>"]` with nothing between its
 * parts and only a backslash and a quote escaped. Oracle and Postgres keep it as a row of the graph's catalog, of kind
 * `LOWER_COPY`, with the property as the one item of `properties`, no `name` or `object_name`, and `details` `{}`. Both
 * are drivine4j's, so a record one library wrote is read by the others.
 */
export interface LowerCopyStatements {
    /** Reads every record, binding nothing: each row is one, as `entries` reads it. */
    read: string;
    /**
     * Writes the copy of `property` on at most `batch` nodes of `label` whose copy is not the property lowercased, and
     * removes it from those whose property has no value. Returns one row: the number of nodes it wrote. Run until it
     * writes fewer than `batch`.
     */
    fill(label: string, property: string, batch: number): string;
    /** Records that every node of `label` has the copy of `property`. Run again, it records it once. */
    record(label: string, property: string): { statement: string; bindings?: Record<string, any> };
    /** The label and property of each record among `rows`, as `read` gives them. */
    entries(rows: any[]): [string, string][];
}

/** The record of `label` and `property` on the graph engines: the JSON array of the two, as the SQL catalog writes one. */
export function loweredEntry(label: string, property: string): string {
    return catalogProperties([label, property]);
}

/** The value of a row of one column, as a store may give it: the value, or a map of one key. */
function columnOf(row: any): any {
    const keys = row !== null && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : [];
    return keys.length === 1 ? row[keys[0]] : row;
}

/** The copies' statements in Cypher, for the graph engines, as drivine4j's `CypherLowerCopies` writes them. */
export const CYPHER_LOWER_COPIES: LowerCopyStatements = {
    fill(label: string, property: string, batch: number): string {
        const copy = `n.${quoteName(LowerCopies.of(property))}`;
        const value = `n.${quoteName(property)}`;
        return [
            `MATCH (n${labelExpression([label])})`,
            `WHERE NOT coalesce(${copy} = toLower(${value}), ${copy} IS NULL AND ${value} IS NULL)`,
            `WITH n LIMIT ${batch}`,
            `SET ${LowerCopies.setClause('n', property)}`,
            'RETURN count(n)'
        ].join('\n');
    },

    /** The node's lock is taken before its list is read, so two processes recording at once both keep theirs. */
    record(label: string, property: string) {
        return {
            statement: [
                "MATCH (s:DrivineStore {key: 'singleton'})",
                `SET s.${LOCK} = true REMOVE s.${LOCK}`,
                `SET s.${LOWERED_LIST} = [e IN coalesce(s.${LOWERED_LIST}, []) WHERE e <> $entry] + $entry`
            ].join('\n'),
            bindings: { entry: loweredEntry(label, property) }
        };
    },

    read: `MATCH (s:DrivineStore) UNWIND coalesce(s.${LOWERED_LIST}, []) AS e RETURN DISTINCT e`,

    entries(rows: any[]): [string, string][] {
        return rows.flatMap((row) => {
            try {
                const parsed = JSON.parse(String(columnOf(row)));
                return Array.isArray(parsed) && parsed.length === 2 && parsed.every((it) => typeof it === 'string')
                    ? [[parsed[0], parsed[1]] as [string, string]]
                    : [];
            } catch {
                return [];
            }
        });
    }
};

/** The label and property of each SQL catalog row among `rows`, each its `label` and its `properties`, as text. */
export function catalogEntries(rows: any[]): [string, string][] {
    return rows.flatMap((row) => {
        try {
            const properties = JSON.parse(String(row.properties));
            return Array.isArray(properties) && properties.length === 1 && typeof row.label === 'string'
                ? [[row.label, String(properties[0])] as [string, string]]
                : [];
        } catch {
            return [];
        }
    });
}

/** Fills in the lowercased copies an index or constraint that ignores case is made over: see LowerCopyCatalog. */
export interface LowerCopyFiller {
    /**
     * Fills in the copy of each of `properties` on the nodes of `label`, and records that they all have it; one recorded
     * already is left as it is, unless `again`.
     */
    fillIn(label: string, properties: string[], again: boolean): Promise<void>;
}

/**
 * Fills in the lowercased copies `spec` is made over, when it ignores case: see LowerCopyCatalog. With `again`, they are
 * filled in whether or not they are recorded as there. Refused where there is no store to fill them in through.
 */
export async function fillInLowerCopies(
    copies: LowerCopyFiller | undefined,
    spec: IndexSpec | UniquenessConstraintSpec,
    again: boolean
): Promise<void> {
    const properties = lowercased(spec);
    if (!properties.length) {
        return;
    }
    if (!copies) {
        throw new DrivineError(
            `The ${itemName(spec)} on ${spec.label}(${spec.properties.join(', ')}) ignores case, and this manager ` +
                'has no store to fill the lowercased copies in through.'
        );
    }
    await copies.fillIn(spec.label, properties, again);
}

/** The record's key in a set: a label and a property. */
const keyOf = (label: string, property: string): string => JSON.stringify([label, property]);

/**
 * Which `@CaseInsensitive` properties have their lowercased copy (see LowerCopies) on every node of a label, so that a
 * query may compare with the copy: those an `ensure` of an index or a constraint that ignores case has filled in, as
 * the store records them. drivine4j's `LowerCopyCatalog`.
 *
 * What this manager has recorded is known at once. What another recorded is read from the store, on a schema
 * connection of its own: the first time a property is asked after, and then again in the background at least every
 * `maxAge` milliseconds while properties are asked after, a lookup meanwhile going by what was read last. A property
 * that isn't recorded counts as not filled in, and a query lowercases the property itself, which gives the same answer
 * without the index. A record is never taken back: every save keeps the copy in step, and `recreate`, or an `ensure`
 * that makes the item anew, fills it in again where a write that bypassed Drivine, or one made while the field was not
 * `@CaseInsensitive`, left it out of step.
 *
 * @param run runs a statement on a schema connection of its own, outside any transaction
 * @param resolveStore makes the store's `DrivineStore` node where it isn't there, for the graph engines' record
 */
export class LowerCopyCatalog implements LowerCopyFiller {
    private readonly logger = new DrivineLogger(LowerCopyCatalog.name);
    private readonly recorded = new Set<string>();
    private read?: { entries: Set<string>; at: number };
    private reading?: Promise<void>;

    constructor(
        private readonly run: (statement: string, bindings?: Record<string, any>) => Promise<any[]>,
        private readonly statements: LowerCopyStatements,
        private readonly resolveStore: () => Promise<unknown>,
        private readonly maxAge: number = 60_000,
        private readonly clock: () => number = Date.now,
        private readonly batch: number = LOWER_COPY_BATCH
    ) {}

    /** Whether every node of `label` is known to have the copy of `property`. */
    async filledIn(label: string, property: string): Promise<boolean> {
        const key = keyOf(label, property);
        if (this.recorded.has(key)) {
            return true;
        }
        if (!this.read) {
            await this.readAgain();
        } else if (this.clock() - this.read.at >= this.maxAge) {
            // Read in the background: meanwhile a lookup goes by what was read last.
            void this.readAgain();
        }
        return this.read?.entries.has(key) ?? false;
    }

    /** The properties among `properties` whose copy every node of one of `labels` is known to have. */
    async filled(labels: string[], properties: string[]): Promise<Set<string>> {
        const filled = new Set<string>();
        for (const property of properties) {
            for (const label of labels) {
                if (await this.filledIn(label, property)) {
                    filled.add(property);
                    break;
                }
            }
        }
        return filled;
    }

    async fillIn(label: string, properties: string[], again: boolean): Promise<void> {
        if (!properties.length) {
            return;
        }
        const stored = again ? new Set<string>() : await this.stored();
        for (const property of properties.filter((it) => again || !stored.has(keyOf(label, it)))) {
            let filled = 0;
            let written: number;
            do {
                written = Number(columnOf((await this.run(this.statements.fill(label, property, this.batch)))[0]));
                filled += written;
            } while (written >= this.batch);
            // The graph engines keep the record on the store's own node, which is made where it isn't there.
            if (this.statements === CYPHER_LOWER_COPIES) {
                await this.resolveStore();
            }
            const record = this.statements.record(label, property);
            await this.run(record.statement, record.bindings);
            this.recorded.add(keyOf(label, property));
            this.logger.log(
                `Filled in the lowercased copy of ${label}.${property} on ${filled} node(s), and recorded that every node has it`
            );
        }
    }

    /** What the store records, read now. */
    private async stored(): Promise<Set<string>> {
        const entries = this.statements.entries(await this.run(this.statements.read));
        return new Set(entries.map(([label, property]) => keyOf(label, property)));
    }

    /** Reads the record again, once at a time. One that can't be read leaves what was read last. */
    private async readAgain(): Promise<void> {
        if (!this.reading) {
            const at = this.clock();
            this.reading = this.stored()
                .then(
                    (entries) => {
                        this.read = { entries, at };
                    },
                    (e) => {
                        // A store whose record can't be read is compared without the copies: slower, and the same answers.
                        this.logger.verbose(
                            `The record of lowercased copies could not be read, so they are not compared with: ${
                                (e as Error).message
                            }`
                        );
                        this.read = { entries: this.read?.entries ?? new Set(), at };
                    }
                )
                .finally(() => {
                    this.reading = undefined;
                });
        }
        return this.reading;
    }
}
