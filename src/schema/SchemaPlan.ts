import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { ModuleStore } from '@/backend/StoreStatements';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';
import { ReusedIdsError } from '@/connection/sqlite/ReusedIdsError';
import type { NativeOperation, SchemaItem } from '@/schema/SchemaGrammar';
import {
    EngineVectorOptions,
    EnsureResult,
    EnsureStatus,
    IndexSpec,
    SimilarityFunction,
    UniquenessConstraintSpec,
    ViolatingKey
} from '@/schema/SchemaSpecs';

/** An index or a constraint, as TypeScript declares one. */
export type PlanSpec = IndexSpec | UniquenessConstraintSpec;

/** The module's name of each kind of item, by TypeScript's. */
const KINDS: Record<PlanSpec['kind'], string> = {
    RANGE: 'RANGE_INDEX',
    UNIQUE: 'UNIQUENESS_CONSTRAINT',
    VECTOR: 'VECTOR_INDEX',
    FULLTEXT: 'FULLTEXT_INDEX'
};

/** TypeScript's name of each kind of item, by the module's. */
const SPEC_KINDS: Record<string, PlanSpec['kind']> = Object.fromEntries(
    Object.entries(KINDS).map(([kind, name]) => [name, kind as PlanSpec['kind']])
);

/** The module's name of a kind of item. */
export function moduleKind(kind: PlanSpec['kind']): string {
    return KINDS[kind];
}

/** `spec` as the module reads a spec (`PlanJson.spec`): the module makes it, over lowercased copies where it ignores case. */
export function moduleSpec(spec: PlanSpec): Record<string, any> {
    return {
        kind: KINDS[spec.kind],
        label: spec.label,
        properties: [...spec.properties],
        name: 'name' in spec ? spec.name ?? null : null,
        ...kindFields(spec)
    };
}

/** What a spec of each kind gives beside its kind, label, properties and name, as the module reads it. */
function kindFields(spec: PlanSpec): Record<string, any> {
    if (spec.kind === 'RANGE') {
        return { ignoreCase: spec.ignoreCase ?? false };
    }
    if (spec.kind === 'UNIQUE') {
        return { ignoreCase: spec.ignoreCase ?? false, nodeIdProperty: spec.nodeIdProperty ?? null };
    }
    if (spec.kind === 'FULLTEXT') {
        return { analyzer: null };
    }
    return {
        dimensions: spec.dimensions,
        similarity: spec.similarity,
        hnswM: spec.hnswM ?? null,
        hnswEfConstruction: spec.hnswEfConstruction ?? null,
        engineOptions: (spec.engineOptions ?? []).map(engineOptions)
    };
}

function engineOptions(options: EngineVectorOptions): Record<string, any> {
    return options.engine === 'Neo4j'
        ? {
              engine: 'Neo4j',
              quantizationEnabled: options.quantizationEnabled ?? null,
              hnswM: options.hnswM ?? null,
              hnswEfConstruction: options.hnswEfConstruction ?? null
          }
        : {
              engine: 'FalkorDB',
              efRuntime: options.efRuntime ?? null,
              hnswM: options.hnswM ?? null,
              hnswEfConstruction: options.hnswEfConstruction ?? null
          };
}

/** A spec as the module writes one (`PlanJson.spec`), as TypeScript declares it. */
export function planSpec(written: Record<string, any>): PlanSpec {
    const kind = SPEC_KINDS[written.kind];
    const base = { label: written.label as string, properties: [...(written.properties as string[])] };
    const named = written.name ? { name: written.name as string } : {};
    const ignoringCase = written.ignoreCase ? { ignoreCase: true } : {};
    if (kind === 'RANGE') {
        return { kind, ...base, ...ignoringCase, ...named };
    }
    if (kind === 'UNIQUE') {
        const nodeId = written.nodeIdProperty ? { nodeIdProperty: written.nodeIdProperty as string } : {};
        return { kind, ...base, ...ignoringCase, ...nodeId, ...named };
    }
    if (kind === 'FULLTEXT') {
        return { kind, ...base };
    }
    if (kind === 'VECTOR') {
        return vectorSpec(written, base.label, base.properties[0]);
    }
    throw new DrivineError(`No item of TypeScript's is of the module's kind ${written.kind}.`);
}

/** A vector index's spec as the module writes one, as TypeScript declares it: what it leaves null left out. */
function vectorSpec(written: Record<string, any>, label: string, property: string): PlanSpec {
    const given = (it: Record<string, any>): Record<string, any> =>
        Object.fromEntries(Object.entries(it).filter(([, value]) => value != null));
    const options = (written.engineOptions ?? []) as Record<string, any>[];
    return {
        kind: 'VECTOR',
        label,
        properties: [property],
        dimensions: written.dimensions,
        similarity: written.similarity as SimilarityFunction,
        ...given({ hnswM: written.hnswM, hnswEfConstruction: written.hnswEfConstruction }),
        ...(options.length ? { engineOptions: options.map((it) => given(it) as EngineVectorOptions) } : {})
    };
}

/** An item as the module writes one (`PlanJson.item`, and `items`'s aliases), as TypeScript lists one. */
export function schemaItem(written: Record<string, any>): SchemaItem {
    const item: SchemaItem = { label: written.label, properties: [...written.properties] };
    if (written.name != null) {
        item.name = written.name;
    }
    if (written.dimensions != null) {
        item.dimensions = written.dimensions;
    }
    if (written.similarity != null) {
        item.similarity = written.similarity;
    }
    for (const key of ['quantizationEnabled', 'hnswM', 'hnswEfConstruction'] as const) {
        if (written[key] != null) {
            (item as any)[key] = written[key];
        }
    }
    if (written.aliases?.length) {
        item.aliases = [...written.aliases];
    }
    return item;
}

/** What ensuring an item gave, as the module writes it (keyed by its kind), as TypeScript reports it, for `spec`. */
export function ensureResult<S>(written: Record<string, any>, spec: S): EnsureResult<S> {
    const [kind, value] = Object.entries(written)[0] as [string, any];
    const status: EnsureStatus = (
        {
            created: 'CREATED',
            alreadyMatching: 'ALREADY_MATCHING',
            drift: 'DRIFT',
            recreated: 'RECREATED',
            violation: 'VIOLATION',
            blockedByIndex: 'BLOCKED_BY_INDEX'
        } as Record<string, EnsureStatus>
    )[kind];
    if (status === undefined) {
        throw new DrivineError(`The schema plan gave a result TypeScript doesn't know: ${kind}.`);
    }
    const result: EnsureResult<S> = { status, spec };
    if (status === 'DRIFT' && value?.existing) {
        result.found = schemaItem(value.existing);
    }
    if (status === 'VIOLATION') {
        result.sample = (value?.sample ?? []) as ViolatingKey[];
    }
    if (status === 'BLOCKED_BY_INDEX' && value?.index) {
        result.index = schemaItem(value.index);
    }
    return result;
}

/** One error of a failure's chain, as the module's error rules read it (`Cause`). */
interface Cause {
    sqlState: string | null;
    vendorCode: number | null;
    code: string | null;
    gqlStatus: string | null;
    message: string | null;
}

/**
 * The chain of `failure`, outermost first, as the module's error rules read it: a SQL driver's error by its SQL state and
 * its number (node-postgres's `code`, node-oracledb's `errorNum`, `node:sqlite`'s `errcode`), a Neo4j driver's (which
 * Memgraph's errors are too) by its code and GQL status, and any other by its message alone.
 */
export function causes(failure: unknown): Cause[] {
    const chain: Cause[] = [];
    const seen = new Set<unknown>();
    for (let it: any = failure; it && chain.length < 10 && !seen.has(it); it = it.rootCause ?? it.cause) {
        seen.add(it);
        chain.push(causeOf(it));
    }
    return chain;
}

/** One error, as the module's error rules read it. */
function causeOf(it: any): Cause {
    const message = typeof it.message === 'string' ? it.message : String(it);
    const cause: Cause = { sqlState: null, vendorCode: null, code: null, gqlStatus: null, message };
    const code = typeof it.code === 'string' ? (it.code as string) : undefined;
    if (typeof it.errorNum === 'number' || typeof it.errcode === 'number') {
        // node-oracledb's number, or node:sqlite's.
        cause.vendorCode = it.errorNum ?? it.errcode;
    } else if (code !== undefined && /^[0-9A-Z]{5}$/.test(code) && 'severity' in it) {
        // node-postgres's error: its code is the SQL state.
        cause.sqlState = code;
        cause.vendorCode = 0;
    } else if (code?.startsWith('Neo.')) {
        cause.code = code;
        cause.gqlStatus = typeof it.gqlStatus === 'string' ? it.gqlStatus : null;
    }
    return cause;
}

/** What a plan's round asks a host to do: `PlanJson.action`. */
export type PlanAction =
    | {
          type: 'query';
          statement: string;
          parameters: Record<string, any>;
          purpose: string;
          delayMillis: number;
          compiled: boolean;
      }
    | {
          type: 'execute';
          statement: string | { native: string[] };
          parameters: Record<string, any>;
          purpose: string;
          retry: 'ONCE' | 'CONTENDED';
      }
    | { type: 'awaitIndex'; statement: string; parameters: Record<string, any> }
    | { type: 'readLowerCopies'; label: string; properties: string[] }
    | { type: 'fillLowerCopies'; label: string; properties: string[] }
    | { type: 'writeMarker'; scope: string; statement: string; parameters: Record<string, any> };

/** What a host runs a plan's actions with, on the database the plan is for. */
export interface PlanHost {
    /** Runs a schema statement, or a listing, on a connection of its own: its rows, a row of one column its value. */
    run(statement: string | NativeOperation, parameters: Record<string, any>): Promise<any[]>;
    /** Runs a statement of the marker's through the database's auto-commit manager: Cypher where `compiled`. */
    marker(statement: string, parameters: Record<string, any>, compiled: boolean, rows: boolean): Promise<any[]>;
    /** The lowercased copies recorded as filled in, each `[label, property]`; undefined where there is no store of them. */
    readLowerCopies?(): Promise<[string, string][]>;
    /** Fills in the lowercased copies of the label's properties, recorded or not. */
    fillLowerCopies?(label: string, properties: string[]): Promise<void>;
    /** Told once a statement has made or dropped an item, as what the host knows of the store's items is then stale. */
    changed?(): void;
}

/** The report a plan ends with: `PlanJson.report`. */
export interface PlanReport {
    database: string;
    owners: {
        owner: string | null;
        results: { spec: Record<string, any>; result: Record<string, any> }[];
        unbuilt: { spec: Record<string, any>; stillBuilding: boolean; message: string }[];
        orphans: string[];
        marker: { version: string | null; items: string } | null;
        failure: string | null;
        removed: { dropped: string[]; kept: Record<string, any>[] } | null;
    }[];
    item: { result: Record<string, any> | null; dropped: boolean | null } | null;
    failure: string | null;
    rethrown: { action: PlanAction; round: number } | null;
    log: { level: 'INFO' | 'WARN' | 'ERROR'; logger: string; message: string }[];
}

/** A request as the planner reads one: `PlanJson.requestOf`. */
export interface PlanRequest {
    database: string;
    operation: Record<string, any>;
    catalogs: { owner: string | null; version: string | null; items: Record<string, any>[] }[];
    runtime: { owner: string | null; version: string | null; items: Record<string, any>[] }[];
    policy: {
        mode: 'FAIL_FAST' | 'WARN';
        recreateOnDrift: boolean;
        recreateOnStartup: boolean;
        violationSampleSize: number;
        replaceBlockingIndex: boolean;
    };
    buildTimeoutMillis: number;
}

/** A runtime catalog as the planner keeps one: what `ensure` gave an owner, on the databases named, or all. */
export interface RuntimeCatalog {
    owner: string | null;
    databases: string[] | null;
    items: Record<string, any>[];
}

/** The loggers the module's log lines name, by name. */
const loggers = new Map<string, DrivineLogger>();

/**
 * The shared module's schema planner for one store's graph (its `schemaPlan` request, drivine-cypher-spec#107, #135): which
 * indexes and constraints to make or drop, and what to record in the schema marker, decided by the module a round at a time,
 * while this runs each round's statements on the host's connections and gives back what each did, as drivine4j's
 * `SchemaPlanDriver` runs the planner. `plans.yaml` pins every decision, so TypeScript's schema manager decides as
 * drivine4j's and drivine-python's do.
 */
export class SchemaPlan {
    constructor(
        private readonly store: ModuleStore,
        private readonly graph: string | undefined,
        private readonly clock: () => number = () => Date.now(),
        private readonly sleep: (millis: number) => Promise<void> = async (millis) =>
            new Promise((resolve) => setTimeout(resolve, millis))
    ) {}

    /** Why `request` is refused before anything is applied; undefined where nothing conflicts. */
    validate(request: PlanRequest): string | undefined {
        return this.ask<{ refusal: string | null }>({ validate: request }).refusal ?? undefined;
    }

    /** The runtime catalogs after `operation`, as the planner keeps the items `ensure` gives. */
    runtimeAfter(
        operation: Record<string, any>,
        runtime: RuntimeCatalog[],
        databases: string[] | undefined
    ): RuntimeCatalog[] {
        return this.ask<{ runtime: RuntimeCatalog[] }>({
            runtimeAfter: { operation, runtime, databases: databases ?? null }
        }).runtime;
    }

    /** The runtime catalogs that hold on `database`, as a request's `runtime` takes them. */
    runtimeOn(database: string, runtime: RuntimeCatalog[]): PlanRequest['runtime'] {
        return this.ask<{ catalogs: PlanRequest['runtime'] }>({ runtimeOn: { database, runtime } }).catalogs;
    }

    /** The statements that list each kind of index the store has, and its constraints. */
    listings(): { indexes: Record<string, string>; constraints: string } {
        return this.ask({ listings: {} });
    }

    /** The items a listing's `rows` hold, each with its aliases and build state; with `spec`, those of its identity. */
    items(
        of: 'indexes' | 'constraints',
        rows: any[],
        spec?: PlanSpec
    ): (Record<string, any> & { buildInProgress: boolean; buildFailed: boolean })[] {
        return this.ask<{ items: any[] }>({ items: { of, rows, ...(spec ? { spec: moduleSpec(spec) } : {}) } }).items;
    }

    /** The statement that records `aliases` as all the aliases of `item`; undefined on a store that keeps no record. */
    aliased(spec: PlanSpec, item: SchemaItem, aliases: string[]): string | undefined {
        return (
            this.ask<{ statement: string | null }>({
                aliased: {
                    item: { kind: KINDS[spec.kind], label: item.label, properties: item.properties, name: item.name },
                    aliases
                }
            }).statement ?? undefined
        );
    }

    /**
     * Runs `request` round by round with `host` until the plan is done, logs what the plan says to, and gives its report.
     * Where an action's failure ends the plan, the error the host got for it is thrown as it was; where the plan fails
     * otherwise, a DrivineError with the plan's message.
     */
    async run(request: PlanRequest, host: PlanHost): Promise<PlanReport> {
        const errors: unknown[] = [];
        let answer = this.ask<any>({ start: request, now: this.clock() });
        while (answer.run) {
            const round: { outcomes: any[]; error?: unknown } = await this.round(answer.run as PlanAction[], host);
            errors.push(round.error);
            answer = this.ask<any>({ resume: answer.state, outcomes: round.outcomes, now: this.clock() });
        }
        const report = answer.done as PlanReport;
        for (const line of report.log) {
            let logger: DrivineLogger | undefined = loggers.get(line.logger);
            if (!logger) {
                logger = new DrivineLogger(line.logger);
                loggers.set(line.logger, logger);
            }
            // A line may name drivine4j's settings, as the failure does: it names SchemaOptions here too.
            const message = withOptionNames(line.message);
            if (line.level === 'INFO') {
                logger.log(message);
            } else if (line.level === 'WARN') {
                logger.warn(message);
            } else {
                logger.error(message);
            }
        }
        if (report.rethrown) {
            throw errors[report.rethrown.round] ?? new DrivineError(report.failure ?? 'The schema plan failed.');
        }
        if (report.failure) {
            throw new DrivineError(withOptionNames(report.failure));
        }
        return report;
    }

    /**
     * Runs a round's actions in order, up to and with the first that fails: what each did, and the error that ended it. A
     * graph refused for every owner alike (ReusedIdsError) is thrown out of the round as it is, unanswered, and plans
     * nothing more, as drivine4j rethrows its `ReusedIdsException` past its owners' isolation.
     */
    private async round(actions: PlanAction[], host: PlanHost): Promise<{ outcomes: any[]; error?: unknown }> {
        const outcomes: any[] = [];
        for (const action of actions) {
            try {
                outcomes.push(await this.answer(action, host));
            } catch (e) {
                if (e instanceof ReusedIdsError) {
                    throw e;
                }
                outcomes.push({ type: 'failed', causes: causes(e) });
                return { outcomes, error: e };
            }
        }
        return { outcomes };
    }

    private async answer(action: PlanAction, host: PlanHost): Promise<any> {
        switch (action.type) {
            case 'query':
                return this.query(action, host);
            case 'execute':
                return this.execute(action, host);
            case 'awaitIndex':
                await host.run(action.statement, action.parameters);
                return { type: 'ran' };
            case 'readLowerCopies':
                return { type: 'rows', rows: await copiesOf(host).readLowerCopies!() };
            case 'fillLowerCopies':
                await copiesOf(host).fillLowerCopies!(action.label, action.properties);
                return { type: 'ran' };
            case 'writeMarker':
                await host.marker(action.statement, action.parameters, false, false);
                return { type: 'ran' };
            default:
                throw new DrivineError(`TypeScript runs no plan action ${JSON.stringify(action)}.`);
        }
    }

    /** A query's rows: the marker's and the scopes' through the host's manager, any other on a connection of its own. */
    private async query(action: Extract<PlanAction, { type: 'query' }>, host: PlanHost): Promise<any> {
        if (action.delayMillis > 0) {
            await this.sleep(action.delayMillis);
        }
        const rows =
            action.purpose === 'MARKER' || action.purpose === 'SCOPES'
                ? await host.marker(action.statement, action.parameters, action.compiled, true)
                : await host.run(action.statement, action.parameters);
        return { type: 'rows', rows };
    }

    /** A statement run: the marker's through the host's manager, telling the host of any that makes or drops an item. */
    private async execute(action: Extract<PlanAction, { type: 'execute' }>, host: PlanHost): Promise<any> {
        if (action.purpose === 'MARKER') {
            await host.marker(action.statement as string, action.parameters, false, false);
            return { type: 'ran' };
        }
        try {
            await host.run(native(action.statement), action.parameters);
        } finally {
            if (action.purpose !== 'PREPARE') {
                host.changed?.();
            }
        }
        return { type: 'ran' };
    }

    /** The module's answer to a `schemaPlan` question of this store; its error thrown. */
    private ask<T>(question: Record<string, any>): T {
        const request = {
            schemaPlan: { store: this.store, ...(this.graph !== undefined ? { graph: this.graph } : {}), ...question }
        };
        const answer = JSON.parse(cypherCompilerModule().compile(plain(request)));
        if (answer && typeof answer === 'object' && 'error' in answer) {
            throw new DrivineError(`The shared module's schema planner can't answer: ${answer.error}`);
        }
        return answer as T;
    }
}

/** The host, where it has a store of lowercased copies to read and fill in; refused where it has none. */
function copiesOf(host: PlanHost): PlanHost {
    if (!host.readLowerCopies || !host.fillLowerCopies) {
        throw new DrivineError(
            "The lowercased copies can't be read or filled in: this manager has no store to fill the lowercased copies in through."
        );
    }
    return host;
}

/** A statement of a plan as TypeScript runs it: FalkorDB's `GRAPH.CONSTRAINT` as its driver's command. */
function native(statement: string | { native: string[] }): string | NativeOperation {
    if (typeof statement === 'string') {
        return statement;
    }
    const [command, operation, , , , label, , , ...properties] = statement.native;
    if (command !== 'GRAPH.CONSTRAINT' || (operation !== 'CREATE' && operation !== 'DROP')) {
        throw new DrivineError(`TypeScript runs no native command ${statement.native.join(' ')}.`);
    }
    return { native: operation === 'CREATE' ? 'CONSTRAINT_CREATE' : 'CONSTRAINT_DROP', label, properties };
}

/**
 * `value` as plain JSON, as the planner reads a row (`PlanJson.plain`): each key and value as it is, a `bigint`, and the
 * Neo4j driver's `Integer`, as its digits, so a whole number past 2^53 a listing gives keeps them.
 */
function plain(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (typeof value === 'object') {
        if (typeof value.low === 'number' && typeof value.high === 'number' && typeof value.toNumber === 'function') {
            return value.toString();
        }
        if (value instanceof Date) {
            return JSON.stringify(value.toISOString());
        }
        if (Array.isArray(value)) {
            return `[${value.map(plain).join(',')}]`;
        }
        const entries = Object.entries(value).filter(([, it]) => it !== undefined);
        return `{${entries.map(([key, it]) => `${JSON.stringify(key)}:${plain(it)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

/** A store's schema plan, the database it is for, and how statements run there: what a schema manager plans with. */
export interface SchemaPlanning {
    plan: SchemaPlan;
    database: string;
    host: PlanHost;
}

/** How an item call is planned: drivine4j's `SchemaPolicy`, with the longest an index is waited on to be built. */
export interface ItemPolicy {
    mode?: 'FAIL_FAST' | 'WARN';
    violationSampleSize?: number;
    replaceBlockingIndex?: boolean;
    buildTimeoutMillis?: number;
}

/** How long, in milliseconds, an index is waited on to be built, unless a manager is told otherwise: the planner's. */
export const DEFAULT_BUILD_TIMEOUT = 60_000;

/** How many keys held more than once a violation reports, unless a manager is told otherwise: the planner's. */
export const DEFAULT_VIOLATION_SAMPLE = 10;

/** A request of `operation` on the planning's database, with no catalog: what an item call, ensure or remove plans. */
export function planRequest(
    database: string,
    operation: Record<string, any>,
    policy: ItemPolicy = {},
    catalogs: PlanRequest['catalogs'] = [],
    runtime: PlanRequest['runtime'] = [],
    recreate: { onDrift?: boolean; onStartup?: boolean } = {}
): PlanRequest {
    return {
        database,
        operation,
        catalogs,
        runtime,
        policy: {
            mode: policy.mode ?? 'FAIL_FAST',
            recreateOnDrift: recreate.onDrift ?? false,
            recreateOnStartup: recreate.onStartup ?? false,
            violationSampleSize: policy.violationSampleSize ?? DEFAULT_VIOLATION_SAMPLE,
            replaceBlockingIndex: policy.replaceBlockingIndex ?? false
        },
        buildTimeoutMillis: policy.buildTimeoutMillis ?? DEFAULT_BUILD_TIMEOUT
    };
}

/**
 * One of the public index and constraint calls, `ENSURE`, `RECREATE` or `DROP`, of `spec`, as the module plans it: its
 * report's item. A spec that ignores case is refused where the manager has no store to fill the lowercased copies in
 * through, before any statement reaches the store, as drivine4j refuses it.
 */
export async function planItem(
    planning: SchemaPlanning,
    call: 'ENSURE' | 'RECREATE' | 'DROP',
    spec: PlanSpec,
    policy: ItemPolicy = {}
): Promise<{ result: Record<string, any> | null; dropped: boolean | null }> {
    const ignoresCase = (spec.kind === 'RANGE' || spec.kind === 'UNIQUE') && spec.ignoreCase === true;
    if (call !== 'DROP' && ignoresCase && !planning.host.fillLowerCopies) {
        throw new DrivineError(
            `${moduleKind(spec.kind)} on ${spec.label}[${spec.properties.join(', ')}] ignores case, and this manager ` +
                'has no store to fill the lowercased copies in through.'
        );
    }
    const report = await planning.plan.run(
        planRequest(planning.database, { type: 'item', call, spec: moduleSpec(spec) }, policy),
        planning.host
    );
    if (!report.item) {
        throw new DrivineError(`The plan of ${call} of ${spec.kind} on ${spec.label} gave no item.`);
    }
    return report.item;
}

/**
 * The items of a listing the store holds, read with no plan, as drivine4j's managers list and find: none where the
 * listing can't be read, as a store that refuses it holds none this can see. With `spec`, those of its identity.
 */
export async function listed(
    planning: SchemaPlanning,
    of: 'indexes' | 'constraints',
    statement: string | undefined,
    spec?: PlanSpec
): Promise<(Record<string, any> & { buildInProgress: boolean; buildFailed: boolean })[]> {
    if (!statement) {
        return [];
    }
    let rows: any[];
    try {
        rows = await planning.host.run(statement, {});
    } catch (e) {
        new DrivineLogger(of === 'indexes' ? 'IndexManager' : 'ConstraintManager').verbose(
            `${of === 'indexes' ? 'Index' : 'Constraint'} introspection failed (treating as none exist): ${
                (e as Error).message
            }`
        );
        return [];
    }
    return planning.plan.items(of, rows, spec);
}

/** What drivine4j's failure says to set, in the names of its Spring settings, which the module writes for every library. */
const DRIVINE4J_SETTINGS =
    'Resolve them, set drivine.schema.recreate-on-drift=true (destructive), ' +
    'drivine.schema.replace-blocking-index=true for an index in the way of a constraint, ' +
    'drivine.schema.index-build-timeout longer for an index still being built, ' +
    'or set drivine.schema.mode=WARN to continue with warnings.';

/** The same, in the names of SchemaOptions, which is what a TypeScript application sets. */
const SCHEMA_OPTIONS =
    'Resolve them, set recreateOnDrift (destructive), replaceBlockingIndex for an index in the way of a constraint, ' +
    'indexBuildTimeout longer for an index still being built, or set mode to WARN to continue with warnings.';

/** A plan's failure, naming the options a TypeScript application sets where the module names drivine4j's settings. */
export function withOptionNames(failure: string): string {
    return failure.split(DRIVINE4J_SETTINGS).join(SCHEMA_OPTIONS);
}
