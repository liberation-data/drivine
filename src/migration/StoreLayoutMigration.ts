import { DrivineError } from '@/DrivineError';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';
import { stampParameters, storeStatements } from '@/backend/StoreStatements';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { randomUuid } from '@/utils/Random';
import { classChain, propertyMetadata, ownClassMetadata } from '@/annotation/Metadata';

/** What a property is declared to hold, which store layout 1 can't tell (the shared module's `LayoutMigration.Kind`). */
export type DeclaredKind =
    | 'date'
    | 'localtime'
    | 'time'
    | 'localdatetime'
    | 'datetime'
    | 'duration'
    | 'float'
    | 'bytes';

/** That the property `property` of the nodes labelled `label`, or the relationships of that type, holds `kind`, or lists of it. */
export interface MigrationDeclaration {
    label: string;
    property: string;
    kind: DeclaredKind;
}

/** What a migration is asked besides its declarations. */
export interface MigrationOptions {
    /** The rows read and written at once: 1000 if left out. */
    batchSize?: number;
    /** Reports what a migration would do, and writes nothing. */
    dryRun?: boolean;
    /** Keeps a value that is no value of its declared kind as it is, named in the report, where it would refuse the graph. */
    keepInvalid?: boolean;
    /**
     * Must be true: the migration's statements are the shared module's, pinned by the spec, but their runs on Postgres and
     * Oracle are still to be made (liberation-data/drivine#765). Back the graph up first.
     */
    unproven: true;
}

/** The report a migration, or its dry run, ends with: the shared module's `MigrationReport`, as its JSON entry writes it. */
export interface MigrationReport {
    status:
        | 'current'
        | 'empty'
        | 'refused'
        | 'inProgress'
        | 'invalid'
        | 'dryRun'
        | 'collisions'
        | 'migrated'
        | 'failed';
    message: string;
    tables: Record<string, { rows: number; changed: number }>;
    properties: {
        label: string;
        property: string;
        changes: Record<string, number>;
        invalid: { table: string; id: number; kind: string; value: string; message: string }[];
    }[];
    observed: { label: string; property: string; classes: Record<string, number> }[];
    candidates: { label: string; property: string; kind: DeclaredKind; values: number }[];
    kept: {
        table: string;
        id: number;
        labels: string[];
        property: string;
        kind: string;
        value: string;
        message: string;
    }[];
    collisions: { label: string; properties: string[]; sample: string }[];
    notes: string[];
}

/** A provider of a SQL store a migration runs on: Postgres's, Oracle's or SQLite's. */
export interface MigratableProvider {
    readonly type: string;
    readonly graphName: string;
    /** A connection that neither makes the graph's tables nor judges its layout. */
    connectUnjudged(): Promise<Connection>;
    /** Makes the graph's tables on a connection, as a first connection makes them, without the layout's verdict. */
    prepareUnjudged(connection: Connection): Promise<void>;
}

type Action =
    | { type: 'query' | 'execute'; statement: string; parameters: Record<string, any>; purpose: string }
    | { type: 'transaction'; statements: { statement: string; parameters: Record<string, any> }[] }
    | { type: 'prepare' }
    | { type: 'assignStamp' }
    | { type: 'lock'; statement: string };

type Outcome = { type: 'rows'; rows: any[] } | { type: 'ran' } | { type: 'failed'; message: string };

/**
 * Moves a graph on Postgres, Oracle or SQLite from store layout 1, which every Drivine for TypeScript before 6 wrote, to
 * layout 2, in place of reloading it (liberation-data/drivine-cypher-spec#256). The shared module decides each round, by
 * its JSON entry's `migrate` request, as every library migrates alike; this runs what it decides on the provider's store,
 * and gives back the module's report. drivine4j's `StoreLayoutMigration`.
 *
 * Run it while nothing else uses the graph, with a backup taken first: a migration stopped at any moment is resumed by
 * running it again with the same declarations. A dry run writes nothing, and reports what would change, the values that
 * are no value of their declared kind, the candidates to declare, and the uniqueness constraints' keys that may collide.
 * A migration makes no index or constraint: the application's schema plan makes its declared ones at its next start.
 *
 * Statements run on a connection of their own that neither makes the graph's tables nor judges its layout, as `connect`
 * would, and refuse the graph; the lock on another, in a transaction left open until the migration ends.
 */
export class StoreLayoutMigration {
    private readonly store: 'postgres' | 'oracle' | 'sqlite';

    constructor(private readonly provider: MigratableProvider) {
        const store = String(provider.type).toLowerCase();
        if (store !== 'postgres' && store !== 'oracle' && store !== 'sqlite') {
            throw new DrivineError(
                `A store layout migration runs on Postgres, Oracle or SQLite, which keep a graph in tables, not on ${provider.type}.`
            );
        }
        this.store = store;
    }

    /** Migrates the graph by `declarations`, or with `dryRun` reports what a migration would do: see the class. */
    async migrate(declarations: MigrationDeclaration[], options: MigrationOptions): Promise<MigrationReport> {
        if (options?.unproven !== true) {
            throw new DrivineError(
                'The store layout migration is not yet proven on every store (liberation-data/drivine#765): back the graph up first, and pass { unproven: true } to run it.'
            );
        }
        const work = await this.provider.connectUnjudged();
        const held: { lock?: Connection } = {};
        try {
            let answer = this.ask({
                start: {
                    declarations,
                    batchSize: options.batchSize ?? 1000,
                    dryRun: options.dryRun ?? false,
                    keepInvalid: options.keepInvalid ?? false
                }
            });
            while ('run' in answer) {
                answer = this.ask({
                    resume: answer.state,
                    outcomes: await this.round(work, held, answer.run as Action[])
                });
            }
            return answer.done as MigrationReport;
        } finally {
            if (held.lock) {
                await held.lock.rollbackTransaction().catch(() => undefined);
                await held.lock.release().catch(() => undefined);
            }
            await work.release().catch(() => undefined);
        }
    }

    /**
     * Runs a round's `actions` in order, up to and with the first that fails, and gives back what came of each: each on
     * `work`, but the lock, taken once on a connection of its own, in a transaction held open, kept in `held`.
     */
    private async round(work: Connection, held: { lock?: Connection }, actions: Action[]): Promise<Outcome[]> {
        const outcomes: Outcome[] = [];
        for (const action of actions) {
            let outcome: Outcome;
            try {
                if (action.type === 'lock') {
                    if (!held.lock) {
                        held.lock = await this.provider.connectUnjudged();
                        await held.lock.startTransaction();
                        await held.lock.query(new QuerySpecification(action.statement));
                    }
                    outcome = { type: 'ran' };
                } else {
                    outcome = await this.run(work, action);
                }
            } catch (e) {
                outcome = { type: 'failed', message: e instanceof Error ? e.message : String(e) };
            }
            outcomes.push(outcome);
            if (outcome.type === 'failed') {
                break;
            }
        }
        return outcomes;
    }

    /** The module's answer to a `migrate` request on this store and graph. */
    private ask(request: Record<string, any>): Record<string, any> {
        const answer = JSON.parse(
            cypherCompilerModule().compile(
                JSON.stringify({ migrate: { store: this.store, graph: this.provider.graphName, ...request } })
            )
        );
        if ('error' in answer) {
            throw new DrivineError(
                `The shared module refused the migration of '${this.provider.graphName}': ${answer.error}`
            );
        }
        return answer;
    }

    private async run(work: Connection, action: Action): Promise<Outcome> {
        switch (action.type) {
            case 'query':
                return { type: 'rows', rows: await this.rows(work, action.statement, action.parameters) };
            case 'execute':
                await this.rows(work, action.statement, action.parameters);
                return { type: 'ran' };
            case 'transaction':
                await work.startTransaction();
                try {
                    for (const it of action.statements) {
                        await this.rows(work, it.statement, it.parameters);
                    }
                    await work.commitTransaction();
                } catch (e) {
                    await work.rollbackTransaction().catch(() => undefined);
                    throw e;
                }
                return { type: 'ran' };
            case 'prepare':
                await this.provider.prepareUnjudged(work);
                return { type: 'ran' };
            case 'assignStamp': {
                const statements = storeStatements(this.store, this.provider.graphName);
                await this.rows(
                    work,
                    statements.stamp.assignIfAbsent,
                    stampParameters(
                        this.store,
                        this.provider.graphName,
                        randomUuid(),
                        new Date().toISOString(),
                        statements.engine
                    )
                );
                return { type: 'ran' };
            }
            default:
                throw new DrivineError(`No migration action ${(action as { type: string }).type}.`);
        }
    }

    /** The rows `statement` gives, each a JSON object where its row holds one, as the module reads them. */
    private async rows(work: Connection, statement: string, parameters: Record<string, any>): Promise<any[]> {
        const rows = await work.query(new QuerySpecification(statement).bind(parameters).exactIntegers());
        return rows.map(document);
    }
}

/** A row of one JSON column as the value it holds, whether the store gives it as text or as an object; any other row as it is. */
function document(row: any): any {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
        const values = Object.values(row);
        if (values.length === 1) {
            const value = values[0];
            if (typeof value === 'string' && /^\s*[{[]/.test(value)) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            return value;
        }
    }
    return row;
}

/**
 * The declarations the node fragment `type` says, under each of its labels, its own and those it inherits, as a node of it
 * carries them: each field TypeScript records as a `Date`
 * (`datetime`, as a JavaScript Date is a moment) or as bytes (`Uint8Array`, `Buffer`), as `design:type` gives them for a
 * decorated field. A date with no time, a float, or a list of either, which TypeScript records no type of, is to be
 * declared by hand.
 */
/** The labels a node of `type` carries: its own and those it inherits, none where it has none. */
function inheritedLabels(type: Function): string[] {
    const labels = new Set<string>();
    for (const it of classChain(type)) {
        ownClassMetadata(it)?.labels?.forEach((label) => labels.add(label));
    }
    return [...labels];
}

export function declarationsOf(type: Function, relationshipType?: string): MigrationDeclaration[] {
    const labels: string[] = relationshipType ? [relationshipType] : inheritedLabels(type);
    const declared: MigrationDeclaration[] = [];
    propertyMetadata(type).forEach((metadata, field) => {
        const kind: DeclaredKind | undefined =
            metadata.designType === Date
                ? 'datetime'
                : metadata.designType === Uint8Array ||
                  (typeof Buffer !== 'undefined' && metadata.designType === Buffer)
                ? 'bytes'
                : undefined;
        if (kind) {
            const property = metadata.graphProperty ?? field;
            labels.forEach((label) => declared.push({ label, property, kind }));
        }
    });
    return declared;
}
