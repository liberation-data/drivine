import { CATALOG_KINDS } from '@/backend/sql/SqlCatalog';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import type { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import type { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';
import { DdlSpec, SchemaDdlResult } from '@/schema/ddl/SchemaDdlResult';
import { defaultName, isReserved, storeName } from '@/schema/ddl/SchemaDdl';
import { SchemaCatalog, SchemaSpec } from '@/schema/SchemaCatalog';
import type { SchemaItem } from '@/schema/SchemaGrammar';
import { SchemaManager } from '@/schema/SchemaManager';
import { fullTextIndex, rangeIndex, uniquenessConstraint, vectorIndex } from '@/schema/SchemaSpecs';

/** An index or a constraint as the store lists it, with its kind. */
interface Recorded {
    kind: SchemaSpec['kind'];
    item: SchemaItem;
}

const KINDS: Record<DdlSpec['kind'], string> = { ...CATALOG_KINDS, TEXT: 'TEXT_INDEX' };

/**
 * Runs Neo4j schema DDL on a SQL store, one database's, through Drivine's schema machinery: the statements a graph
 * engine runs itself, which a Cypher statement on Postgres, Oracle or SQLite would otherwise be refused as. `SchemaDdl`
 * reads the statement, and what it gives is applied as the schema API applies a spec, so the items are the ones the API
 * makes, with the same names, expressions and inventory entries.
 *
 * - `CREATE` ensures the spec with SchemaManager's `ensure`, under the owner `ddl` (`SchemaCommands.OWNER`) and never an
 *   application's own, whose declared items an ensure of its catalog would replace. The DDL's name (or, for DDL that
 *   names none, the API's name for its spec), where it is not the name the item goes by, is kept as an alias of the item
 *   (see SchemaItem's `aliases`): so too over an item of the same properties in another order, which the API names by
 *   that order. Over an item of the same kind, label and properties that is there already, `IF NOT EXISTS` does nothing
 *   but add the alias, and without it the statement fails, as on Neo4j. A name that another item goes by, by the API's
 *   name or an alias, is refused, with or without `IF NOT EXISTS`.
 * - `DROP` finds the item by the API's name, or else by an alias, and removes it with SchemaManager's `remove`. An item
 *   another owner's marker records, such as an application's, is forgotten by `ddl` alone and left in place, with a
 *   warning, and no longer goes by the alias dropped. An item no one has by that name is no error with `IF EXISTS`, and
 *   fails without it.
 * - `CALL db.awaitIndexes(…)` does nothing: an index on a SQL store is whole once it is made.
 * - A constraint of Drivine's own nodes is ensured as Drivine ensures it, and recorded in no inventory.
 *
 * DDL is not run inside a transaction (see `refusedInTransaction`): Drivine's schema statements run on a connection of
 * their own, committed as they go, which the caller's rollback would not undo. One SchemaCommands serves a database,
 * however many names the persistence managers that run it are asked for by.
 */
export class SchemaCommands {
    /** The owner the items DDL makes are ensured and recorded under: never an application's own. */
    static readonly OWNER = 'ddl';

    private readonly logger = new DrivineLogger(SchemaCommands.name);

    /** Serializes the commands, each of which reads what is there before it changes it. */
    private queue: Promise<unknown> = Promise.resolve();

    private manager?: SchemaManager;

    /**
     * @param database the database's registered name.
     * @param type the store it is.
     * @param objects the object managers the schema is read and applied through, asked for only when a command runs.
     */
    constructor(
        readonly database: string,
        private readonly type: DatabaseType,
        private readonly objects: () => GraphObjectManagerFactory
    ) {}

    /** Runs schema DDL that `SchemaDdl.translate` read. */
    async run(ddl: SchemaDdlResult): Promise<void> {
        const next = this.queue.then(async () => this.runNow(ddl));
        this.queue = next.catch(() => undefined);
        await next;
    }

    private async runNow(ddl: SchemaDdlResult): Promise<void> {
        switch (ddl.type) {
            case 'NOT_DDL':
                throw new DrivineError('Not schema DDL');
            case 'REFUSED':
                throw new DrivineError(ddl.message);
            case 'AWAIT_INDEXES':
                this.logger.debug(
                    `db.awaitIndexes on '${this.database}': an index on a SQL store is whole once made, so nothing is ` +
                        'waited for'
                );
                return;
            case 'RESERVED': {
                const result = await this.gom().constraints.ensure(ddl.spec, undefined, true);
                this.logger.debug(
                    `Schema DDL on '${this.database}' named Drivine's own ${describeSpec(ddl.spec)}, ensured as ` +
                        `Drivine ensures it: ${result.status}`
                );
                return;
            }
            case 'CREATE':
                await this.create(ddl);
                return;
            case 'DROP':
                await this.drop(ddl);
                return;
            default:
                throw new DrivineError(`Not schema DDL: ${JSON.stringify(ddl)}`);
        }
    }

    private gom(): StatelessGraphObjectManager {
        return this.objects().get(this.database);
    }

    private schemaManager(): SchemaManager {
        this.manager ??= new SchemaManager(this.objects(), { catalogs: [] });
        return this.manager;
    }

    /** What is recorded of every index and constraint, with their aliases. */
    private async recorded(): Promise<Recorded[]> {
        const gom = this.gom();
        const of = (kind: SchemaSpec['kind'], items: SchemaItem[]): Recorded[] => items.map((item) => ({ kind, item }));
        return [
            ...of('RANGE', await gom.indexes.list('RANGE')),
            ...of('VECTOR', await gom.indexes.list('VECTOR')),
            ...of('FULLTEXT', await gom.indexes.list('FULLTEXT')),
            ...of('UNIQUE', await gom.constraints.list())
        ];
    }

    private async create(ddl: Extract<SchemaDdlResult, { type: 'CREATE' }>): Promise<void> {
        const spec = this.creatable(ddl);
        const name = ddl.alias ?? defaultName(spec);
        const items = await this.recorded();
        const namesake = items.find(
            (it) => (it.item.name === name || it.item.aliases?.includes(name)) && !sameIdentity(it, spec)
        );
        if (namesake) {
            throw new DrivineError(
                `There is already a schema item named '${name}' on '${this.database}': ${describe(namesake)}. ` +
                    `${describeSpec(spec)} is not created under that name.`
            );
        }
        const existing = items.find((it) => sameIdentity(it, spec));
        if (existing && !this.over(existing, spec, ddl.ifNotExists)) {
            return;
        }
        // A range index is found by its properties in their order, so over one of the same properties in another
        // order the item there is ensured, in its order, and not made a second time.
        const ensured: SchemaSpec =
            existing && spec.kind === 'RANGE' ? { ...spec, properties: existing.item.properties } : spec;
        await this.schemaManager().ensure(
            SchemaCatalog.of(ensured).named(SchemaCommands.OWNER).forDatabase(this.database)
        );
        const found = existing ?? (await this.recorded()).find((it) => sameIdentity(it, spec));
        // The DDL's name, or the API's name for its spec, where the item goes by neither: as over an item of the same
        // properties in another order, whose name the API gives of that order.
        if (!found || found.item.name === name || found.item.aliases?.includes(name)) {
            return;
        }
        await this.gom().indexes.alias(found.kind, found.item, [...(found.item.aliases ?? []), name]);
        this.logger.log(`Schema DDL on '${this.database}': ${describe(found)} goes by '${name}' too`);
    }

    /** The spec the DDL creates: refused for a TEXT index, and without the analyzer of a full-text index. */
    private creatable(ddl: Extract<SchemaDdlResult, { type: 'CREATE' }>): SchemaSpec {
        const declared = ddl.spec;
        if (declared.kind === 'TEXT') {
            const engine = storeName(this.type);
            throw new DrivineError(
                `TEXT index ${defaultName(declared)} on ${declared.label}[${
                    declared.properties[0]
                }] cannot be made on ` +
                    `${engine}: a TEXT index is Neo4j's, and ${engine} has none. For tokenized search declare a ` +
                    'fullTextIndex (@FullTextIndex); for exact lookups, a rangeIndex.'
            );
        }
        if (ddl.analyzer !== undefined) {
            this.logger.warn(
                `Schema DDL on '${this.database}': the full-text index on ${declared.label}[${declared.properties.join(
                    ', '
                )}] is made without the analyzer '${
                    ddl.analyzer
                }', as Drivine for TypeScript's full-text indexes take none`
            );
        }
        return declared;
    }

    /**
     * Whether a CREATE over the item of the spec's identity that is there goes on, to record it under the ddl owner and
     * give it its alias: with IF NOT EXISTS, over an item of the spec's shape. Without IF NOT EXISTS it fails, as on Neo4j;
     * over an item of another shape IF NOT EXISTS leaves it as it is.
     */
    private over(existing: Recorded, spec: SchemaSpec, ifNotExists: boolean): boolean {
        const equivalent = sameShape(existing, spec);
        if (!ifNotExists) {
            throw new DrivineError(
                equivalent
                    ? `An equivalent ${what(spec)} already exists on '${this.database}': ${describe(existing)}.`
                    : `A ${what(spec)} on ${spec.label}[${spec.properties.join(', ')}] already exists on ` +
                      `'${this.database}', of another shape: ${describe(existing)}.`
            );
        }
        if (!equivalent) {
            this.logger.warn(
                `Schema DDL on '${this.database}': ${describe(existing)} exists already, of another shape than ` +
                    `${describeSpec(spec)}, and IF NOT EXISTS leaves it as it is`
            );
        }
        return equivalent;
    }

    private async drop(ddl: Extract<SchemaDdlResult, { type: 'DROP' }>): Promise<void> {
        const items = await this.recorded();
        const what = ddl.kind.toLowerCase();
        const found =
            items.find((it) => it.item.name === ddl.name) ?? items.find((it) => it.item.aliases?.includes(ddl.name));
        const spec =
            (found && specOf(found)) ??
            this.schemaManager()
                .ensured(SchemaCommands.OWNER)
                .find((it) => defaultName(it) === ddl.name);
        if (!spec) {
            if (ddl.ifExists) {
                return;
            }
            throw new DrivineError(`There is no ${what} named '${ddl.name}' on '${this.database}' to drop.`);
        }
        const index = spec.kind !== 'UNIQUE';
        if (index !== (ddl.kind === 'INDEX')) {
            const [other, drop] = index ? ['an index', 'INDEX'] : ['a constraint', 'CONSTRAINT'];
            throw new DrivineError(
                `'${ddl.name}' is ${other} on '${this.database}', ${describeSpec(spec)}: DROP ${ddl.kind} does not ` +
                    `drop it, and DROP ${drop} does.`
            );
        }
        if (isReserved(spec)) {
            throw new DrivineError(
                `'${ddl.name}' is Drivine's own constraint on ${spec.label}[${spec.properties.join(', ')}], which ` +
                    'Drivine keeps, and is not dropped.'
            );
        }
        await this.schemaManager().remove(
            SchemaCatalog.of(spec).named(SchemaCommands.OWNER).forDatabase(this.database)
        );
        // An item another owner declares is left in place by the removal: it no longer goes by this DDL's name.
        const kept = (await this.recorded()).find((it) => it.item.aliases?.includes(ddl.name));
        if (kept) {
            await this.gom().indexes.alias(
                kept.kind,
                kept.item,
                kept.item.aliases!.filter((it) => it !== ddl.name)
            );
        }
    }
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((it) => b.includes(it));

/** Whether the item is the spec's: of its kind and label, and of its properties in any order. */
function sameIdentity(found: Recorded, spec: SchemaSpec): boolean {
    return (
        found.kind === spec.kind && found.item.label === spec.label && sameSet(found.item.properties, spec.properties)
    );
}

/** Whether the item, of the spec's identity, is of its shape: a vector index's dimensions and similarity. */
function sameShape(found: Recorded, spec: SchemaSpec): boolean {
    return (
        spec.kind !== 'VECTOR' ||
        (found.item.dimensions === spec.dimensions &&
            (found.item.similarity === undefined || found.item.similarity === spec.similarity))
    );
}

/** The spec of an item the store lists, by its kind, label, properties and name. */
export function specOf(found: Recorded): SchemaSpec {
    const { label, properties, name }: SchemaItem = found.item;
    switch (found.kind) {
        case 'RANGE':
            return { ...rangeIndex(label, properties), ...(name ? { name } : {}) };
        case 'UNIQUE':
            return { ...uniquenessConstraint(label, properties), ...(name ? { name } : {}) };
        case 'VECTOR':
            return vectorIndex(label, properties[0], found.item.dimensions ?? 1, found.item.similarity ?? 'COSINE');
        default:
            return fullTextIndex(label, properties);
    }
}

function what(spec: SchemaSpec): string {
    return spec.kind === 'UNIQUE' ? 'constraint' : 'index';
}

function describe(found: Recorded): string {
    const { label, properties, name }: SchemaItem = found.item;
    return `${KINDS[found.kind]}${name ? ` ${name}` : ''} on ${label}[${properties.join(', ')}]`;
}

function describeSpec(spec: DdlSpec): string {
    return `${KINDS[spec.kind]} ${defaultName(spec)} on ${spec.label}[${spec.properties.join(', ')}]`;
}
