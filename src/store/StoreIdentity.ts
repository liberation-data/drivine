import { randomUUID } from 'crypto';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { GraphBackend } from '@/backend/GraphBackend';
import { ConstraintManager } from '@/schema/ConstraintManager';
import { EnsureResult, uniquenessConstraint, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';
import { anyCause, contendedPause, gaveUpAsContended } from '@/manager/Contention';

/**
 * The stable identity of the store behind a connection: who the graph is, not where it lives. An address can't answer
 * that: a recreated container answers at the old address with no data, and a restored backup is the same data at a new
 * one. The id is minted once, on first sight of a store, and lives in the store, so two connections report the same id
 * when, and only when, they look at the same data.
 */
export interface StoreIdentity {
    /** Assigned the first time Drivine saw the store. Never reassigned. */
    id: string;
    /** The engine connected now. */
    engine: DatabaseType;
    /** When the id was minted, as ISO-8601. */
    assignedAt: string;
}

/** The stamp's node and key, as drivine4j writes them, so a store stamped from the JVM and from Node has one identity. */
const LABEL = 'DrivineStore';
const SINGLETON = 'singleton';
const KEY_CONSTRAINT = uniquenessConstraint(LABEL, 'key');
const ATTEMPTS = 3;
const MERGE_ATTEMPTS = 5;
const MERGE_BACKOFF_MILLIS = 50;
const ENSURE_ATTEMPTS = 3;

/** How many times the winner's key constraint is looked for after this manager's making failed: see `winnersInForce`. */
const LOOKS_FOR_THE_WINNER = 8;

/** The least pause before the second look for the winner's constraint; each later one is as much longer. */
const LOOK_PAUSE_MILLIS = 50;

/**
 * The pause before look `look` (from 1) for the winner's constraint: as many LOOK_PAUSE_MILLIS as looks so far, and up
 * to as much again at random, so that losers looking together don't ask together. 2.8 s at most over all the looks.
 */
const lookPause = (look: number): number => {
    const base = look * LOOK_PAUSE_MILLIS;
    return base + Math.floor(Math.random() * base);
};

/**
 * Whether a schema statement was refused for what another session made meanwhile: a constraint or index that already
 * exists (FalkorDB's "Constraint already exists", or its "Attribute 'key' is already indexed" for the index the
 * constraint needs), or the index's name already taken: on Oracle ORA-00955, and on Postgres a unique violation in its
 * catalog, `pg_class` (23505 whose `schema` is `pg_catalog`), as two sessions running `CREATE ... IF NOT EXISTS` at once
 * get, and not one in a graph's rows or a table of the user's, which nothing made meanwhile, though its index be named
 * `pg_...`, as a graph named `pg_...` names its own. The failure and each cause under it are looked at. A refusal for
 * something else that already exists is ensured again too, in vain: it is thrown after ENSURE_ATTEMPTS, and
 * `ensureUniqueKey` warns of it. A failure the schema executor ran again as turned away, and gave up on, is not ensured
 * again, or the attempts would multiply.
 */
function madeMeanwhile(failure: unknown): boolean {
    return (
        !gaveUpAsContended(failure) &&
        anyCause(
            failure,
            (it) =>
                /already (exists|indexed)|ORA-00955\b/i.test(it.message ?? '') ||
                (it.code === '23505' && it.schema === 'pg_catalog')
        )
    );
}

/**
 * Reads a store's identity, minting it on first sight, from a single `(:DrivineStore {key: 'singleton'})` node.
 *
 * Uniqueness is enforced where the engine allows it: a uniqueness constraint on the key is ensured first, so of two
 * processes that boot against a virgin store at once, the loser's MERGE fails, is retried, and matches the winner's.
 * Where duplicate stamps already exist the oldest is used, tie-broken by id; they are logged, never deleted.
 */
export class StoreIdentityResolver {
    private readonly logger = new DrivineLogger(StoreIdentityResolver.name);

    constructor(
        private readonly persistenceManager: PersistenceManager,
        private readonly backend: GraphBackend,
        private readonly constraints?: ConstraintManager
    ) {}

    async resolve(): Promise<StoreIdentity> {
        const guarded = await this.ensureUniqueKey();
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            await this.assignIfAbsent(guarded);
            const stamps = await this.persistenceManager.query<{ id: string; assignedAt: string }>(
                this.backend.storeStamps().spec()
            );
            if (stamps.length) {
                if (stamps.length > 1) {
                    this.logger.warn(
                        `${stamps.length} DrivineStore stamps on ${this.persistenceManager.database}: concurrent first boots ` +
                            `each minted one. Using the oldest, ${stamps[0].id}.`
                    );
                }
                return { id: stamps[0].id, assignedAt: stamps[0].assignedAt, engine: this.persistenceManager.type };
            }
            this.logger.warn(
                `The DrivineStore stamp on ${this.persistenceManager.database} vanished between write and read; again.`
            );
        }
        throw new DrivineError(
            `Could not establish the identity of the store at ${this.persistenceManager.database}: a stamp was written ` +
                `${ATTEMPTS} times and never read back.`
        );
    }

    /**
     * Ensures the uniqueness constraint on the key. Returns whether it is in force; false degrades `resolve` to
     * best-effort convergence rather than failing boot over an identity that can still be read.
     *
     * Managers making the constraint at once get in each other's way. A deadlock (Neo4j's, on the label's lock) or a
     * write turned away is already run again by the schema executor (see `whenNotContended`). One manager's statement can
     * also be refused for what another's has just made: the constraint or the key's index already there (FalkorDB), or
     * the index's name taken in the catalog (Postgres's `pg_class`, 23505). The constraint is then ensured
     * again, which finds the other's. Going on without it would let a stamp be refused by the other's constraint, or two
     * stamps be written before it is in force (#479, as drivine4j#473).
     *
     * A manager whose making still fails, as one that lost each round of Neo4j's label lock to the others does, looks
     * for the winner's constraint before it goes on best-effort, as drivine4j does (see {@link winnersInForce}).
     */
    private async ensureUniqueKey(): Promise<boolean> {
        if (!this.constraints) {
            return false;
        }
        try {
            const result = await this.ensuredAgainWhenMadeMeanwhile(this.constraints);
            if (result.status === 'VIOLATION') {
                this.logger.warn(
                    `${this.persistenceManager.database} already holds duplicate DrivineStore stamps, so their uniqueness can't ` +
                        `be enforced. Identity is best-effort until they are removed.`
                );
                return false;
            }
            if (result.status === 'BLOCKED_BY_INDEX') {
                const index = result.index?.name ? `The index ${result.index.name}` : 'An index';
                this.logger.warn(
                    `${index} on DrivineStore(key) on ${this.persistenceManager.database} is in the way of its ` +
                        `uniqueness constraint. Identity is best-effort until it is dropped.`
                );
                return false;
            }
            return true;
        } catch (e) {
            if (await this.winnersInForce(this.constraints)) {
                return true;
            }
            this.logger.warn(
                `Could not ensure the DrivineStore key constraint: ${(e as Error).message}. Identity is best-effort.`
            );
            return false;
        }
    }

    /**
     * Whether another manager's key constraint is in force, looked for after this one's making failed. Of managers
     * making it at once on Neo4j, each round of the label's lock goes to one and turns the rest away as deadlocked; with
     * many at once, the rounds can go on past the schema executor's attempts (as in CI run 41260212023). A loser turned
     * away each time finds the winner's here, and, looking rather than making it again, leaves the lock to the others,
     * so that one of them wins sooner. The winner may still be making it, so it is looked for up to
     * LOOKS_FOR_THE_WINNER times, with longer pauses between (see {@link lookPause}). drivine4j looks once. A look that
     * fails finds nothing.
     */
    private async winnersInForce(constraints: ConstraintManager): Promise<boolean> {
        for (let look = 0; look < LOOKS_FOR_THE_WINNER; look++) {
            if (look > 0) {
                await new Promise((resolve) => setTimeout(resolve, lookPause(look)));
            }
            if (await constraints.inForce(KEY_CONSTRAINT).catch(() => false)) {
                return true;
            }
        }
        return false;
    }

    /** `ensure`s the key's constraint, again when another manager made it, or what it needs, meanwhile. */
    private async ensuredAgainWhenMadeMeanwhile(
        constraints: ConstraintManager
    ): Promise<EnsureResult<UniquenessConstraintSpec>> {
        for (let attempt = 1; ; attempt++) {
            try {
                // The label is Drivine's, so a plain index on the key (Neo4j) is replaced by the constraint.
                return await constraints.ensure(KEY_CONSTRAINT, undefined, true);
            } catch (e) {
                // Not a deadlock: the schema executor has run that again already, as many times as it runs one.
                if (attempt >= ENSURE_ATTEMPTS || !madeMeanwhile(e)) {
                    throw e;
                }
                await new Promise((resolve) => setTimeout(resolve, contendedPause(attempt - 1)));
            }
        }
    }

    /**
     * `MERGE`s the stamp. Under the constraint, a concurrent first writer can make this one fail with a violation or a
     * write conflict rather than block; merging again, after a pause, then matches the winner's node.
     *
     * A violation is merged again even when `ensureUniqueKey` could not confirm the constraint, for the violation itself
     * proves one is in force: managers making it at once can be turned away making it (Neo4j deadlocks on the label's
     * lock), and a loser's stamp is then refused by the winner's constraint (#479, as drivine4j#473). A conflict proves
     * nothing, so it is merged again only under a constraint confirmed. A store without schema management (no
     * `constraints`) has no constraint to have refused it, and throws at once.
     */
    private async assignIfAbsent(guarded: boolean): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            try {
                await this.persistenceManager.execute(
                    this.backend.assignStoreStamp().spec<void>({
                        key: SINGLETON,
                        storeId: randomUUID(),
                        assignedAt: new Date().toISOString(),
                        engine: this.persistenceManager.type
                    })
                );
                return;
            } catch (e) {
                // Lost the race to a peer's first boot: its stamp is there, or about to be. Back off and merge onto it.
                if (attempt >= MERGE_ATTEMPTS || !(guarded ? this.lostTheRace(e) : this.violatedTheKey(e))) {
                    throw e;
                }
                await new Promise((resolve) => setTimeout(resolve, MERGE_BACKOFF_MILLIS * 2 ** (attempt - 1)));
            }
        }
    }

    /**
     * Whether a uniqueness constraint refused the stamp. A SQL store says so by its code alone: Postgres's SQLSTATE
     * 23505, Oracle's ORA-00001, on the failure or a cause under it. Its words would also take in a refusal for something
     * else that already exists, as Postgres's 42P07 for a relation or Oracle's ORA-02261 for a key. A graph engine says
     * so in words: Neo4j's "already exists with label", Memgraph's and FalkorDB's "unique constraint violation". Not
     * another constraint, such as a not-null one, which would refuse it each time it was written again. Only a manager
     * with schema management can have made one.
     */
    private violatedTheKey(e: unknown): boolean {
        if (this.constraints == null) {
            return false;
        }
        switch (this.persistenceManager.type) {
            case DatabaseType.POSTGRES:
                return anyCause(e, (it) => it.code === '23505');
            case DatabaseType.ORACLE:
                return anyCause(e, (it) => it.errorNum === 1);
            default:
                return /unique constraint|already exists/i.test((e as Error)?.message ?? '');
        }
    }

    /** Whether a peer's first boot won: a violation, or a write conflict (Memgraph's, FalkorDB's "another write"). */
    private lostTheRace(e: unknown): boolean {
        return this.violatedTheKey(e) || /conflict|another write/i.test((e as Error)?.message ?? '');
    }
}
