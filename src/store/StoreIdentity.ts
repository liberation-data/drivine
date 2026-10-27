import { randomUUID } from 'crypto';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { GraphBackend } from '@/backend/GraphBackend';
import { ConstraintManager } from '@/schema/ConstraintManager';
import { uniquenessConstraint } from '@/schema/SchemaSpecs';

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

    private async ensureUniqueKey(): Promise<boolean> {
        if (!this.constraints) {
            return false;
        }
        try {
            // The label is Drivine's, so a plain index on the key (Neo4j) is replaced by the constraint.
            const result = await this.constraints.ensure(KEY_CONSTRAINT, undefined, true);
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
            this.logger.warn(
                `Could not ensure the DrivineStore key constraint: ${(e as Error).message}. Identity is best-effort.`
            );
            return false;
        }
    }

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
                if (
                    !guarded ||
                    attempt >= MERGE_ATTEMPTS ||
                    !/constraint|already exists|conflict|another write/i.test((e as Error).message)
                ) {
                    throw e;
                }
                await new Promise((resolve) => setTimeout(resolve, MERGE_BACKOFF_MILLIS * 2 ** (attempt - 1)));
            }
        }
    }
}
