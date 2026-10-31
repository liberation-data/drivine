import {
    CONTENDED_ATTEMPTS,
    CONTENDED_PAUSE_MILLIS,
    contendedPause,
    CypherBackend,
    ddlContended,
    ddlDeadlocked,
    ddlWillNotMake,
    DrivineError,
    gaveUpAsContended,
    NEO4J_GRAMMAR,
    whenNotContended
} from '@liberation-data/drivine';
import { error, Neo4jError } from 'neo4j-driver';

describe('whenNotContended', () => {
    const contended = new Error('contended');
    const isContended = (failure: unknown): boolean => failure === contended;
    const pauses: number[] = [];
    const sleep = async (millis: number): Promise<void> => {
        pauses.push(millis);
        return Promise.resolve();
    };

    beforeEach(() => (pauses.length = 0));

    it('should run again after a contended failure, until it succeeds', async () => {
        let calls = 0;
        const result = await whenNotContended(
            async () => {
                if (++calls < 3) {
                    return Promise.reject(contended);
                }
                return Promise.resolve('done');
            },
            isContended,
            sleep
        );
        expect(result).toEqual('done');
        expect(calls).toEqual(3);
        expect(pauses.length).toEqual(2);
    });

    it('should throw the first failure when attempts run out, without a pause after the last', async () => {
        let calls = 0;
        const first = new Error('first');
        await expect(
            whenNotContended(
                async () => Promise.reject(++calls === 1 ? first : contended),
                (it) => it === first || it === contended,
                sleep
            )
        ).rejects.toBe(first);
        expect(calls).toEqual(CONTENDED_ATTEMPTS);
        expect(pauses.length).toEqual(CONTENDED_ATTEMPTS - 1);
    });

    it('should not run again what an inner run gave up on, as a schema statement over a first connection would', async () => {
        let calls = 0;
        const inner = async (): Promise<string> =>
            whenNotContended(
                async () => {
                    calls++;
                    return Promise.reject(contended);
                },
                isContended,
                sleep
            );
        await expect(
            whenNotContended(
                async () => inner().catch(async (e) => Promise.reject(DrivineError.withRootCause(e))),
                (it) => isContended((it as DrivineError).rootCause),
                sleep
            )
        ).rejects.toMatchObject({ rootCause: contended });
        expect(calls).toEqual(CONTENDED_ATTEMPTS);
    });

    it('should throw a failure of another kind at once', async () => {
        const other = new Error('other');
        let calls = 0;
        await expect(
            whenNotContended(
                async () => {
                    calls++;
                    return Promise.reject(other);
                },
                isContended,
                sleep
            )
        ).rejects.toBe(other);
        expect(calls).toEqual(1);
    });

    // Each failure is made afresh: the marks are held by the failure itself, across tests.
    describe('gaveUpAsContended', () => {
        it('should take a failure run again until attempts ran out, under a cause or not', async () => {
            const turnedAway = new Error('turned away');
            await expect(whenNotContended(async () => Promise.reject(turnedAway), () => true, sleep)).rejects.toBe(
                turnedAway
            );
            expect(gaveUpAsContended(turnedAway)).toBe(true);
            expect(gaveUpAsContended(DrivineError.withRootCause(turnedAway))).toBe(true);
        });

        it('should take the first failure, run again, when a failure of another kind followed it', async () => {
            const first = new Error('first');
            const other = new Error('other');
            let calls = 0;
            await expect(
                whenNotContended(async () => Promise.reject(++calls === 1 ? first : other), (it) => it === first, sleep)
            ).rejects.toBe(first);
            expect(gaveUpAsContended(first)).toBe(true);
            expect(gaveUpAsContended(other)).toBe(false);
        });

        it('should not take a failure thrown at once, as not turned away, though the run gave up on it', async () => {
            const other = new Error('other');
            await expect(whenNotContended(async () => Promise.reject(other), () => false, sleep)).rejects.toBe(other);
            expect(gaveUpAsContended(other)).toBe(false);
        });

        it('should take what an inner run gave up on as contended, under an outer run that threw it at once', async () => {
            const turnedAway = new Error('turned away');
            const failure = await whenNotContended(
                async () =>
                    whenNotContended(async () => Promise.reject(turnedAway), (it) => it === turnedAway, sleep).catch(
                        async (e) => Promise.reject(DrivineError.withRootCause(e))
                    ),
                () => true,
                sleep
            ).catch((e: unknown) => e);
            expect(failure).toMatchObject({ rootCause: turnedAway });
            expect(gaveUpAsContended(failure)).toBe(true);
        });
    });

    it('should pause longer each time, and for a random part as long again', () => {
        expect(contendedPause(0, () => 0)).toEqual(CONTENDED_PAUSE_MILLIS);
        expect(contendedPause(0, () => 0.999)).toEqual(2 * CONTENDED_PAUSE_MILLIS - 1);
        expect(contendedPause(2, () => 0)).toEqual(3 * CONTENDED_PAUSE_MILLIS);
        expect(contendedPause(2, () => 0.5)).toEqual(Math.floor(4.5 * CONTENDED_PAUSE_MILLIS));
    });

    describe('over Bolt', () => {
        const backend = new CypherBackend(NEO4J_GRAMMAR);
        const isContended = (failure: unknown): boolean => backend.contended(failure);
        const failing = (code: string, calls: { count: number }) => async (): Promise<string> => {
            if (++calls.count === 1) {
                return Promise.reject(DrivineError.withRootCause(new Neo4jError(code, code)));
            }
            return Promise.resolve('saved');
        };

        it('should run a save turned away by a deadlock again', async () => {
            const calls = { count: 0 };
            await expect(
                whenNotContended(failing('Neo.TransientError.Transaction.DeadlockDetected', calls), isContended, sleep)
            ).resolves.toEqual('saved');
            expect(calls.count).toEqual(2);
        });

        it('should not run again a save that lost its connection: it may have been applied', async () => {
            for (const code of [error.SERVICE_UNAVAILABLE, error.SESSION_EXPIRED]) {
                const calls = { count: 0 };
                await expect(whenNotContended(failing(code, calls), isContended, sleep)).rejects.toMatchObject({
                    rootCause: { code }
                });
                expect(calls.count).toEqual(1);
            }
            expect(pauses).toEqual([]);
        });
    });
});

describe('ddlContended', () => {
    it("should take Oracle's busy lock, library cache deadlock and row deadlock for contention, under a cause or not", () => {
        for (const message of [
            'ORA-00054: resource busy and acquire with NOWAIT specified or timeout expired',
            'ORA-04020: deadlock detected while trying to lock object DRIVINE.FC_RACE_X_NODE',
            'ORA-00060: deadlock detected while waiting for resource'
        ]) {
            expect(ddlContended(new Error(message))).toBe(true);
            expect(ddlContended(DrivineError.withRootCause(new Error(`ORA-06512: at line 7\n${message}`)))).toBe(true);
        }
    });

    it("should take Postgres's deadlock for contention, not a lock not had in time", () => {
        expect(ddlContended(Object.assign(new Error('deadlock detected'), { code: '40P01' }))).toBe(true);
        expect(ddlContended(Object.assign(new Error('lock timeout'), { code: '55P03' }))).toBe(false);
    });

    it('should take only deadlocks for a deadlock, not a lock busy or not had in time', () => {
        expect(ddlDeadlocked(new Error('ORA-04020: deadlock detected while trying to lock object X'))).toBe(true);
        expect(ddlDeadlocked(DrivineError.withRootCause(new Error('ORA-00060: deadlock detected')))).toBe(true);
        expect(ddlDeadlocked(Object.assign(new Error('deadlock detected'), { code: '40P01' }))).toBe(true);
        expect(ddlDeadlocked(new Error('ORA-00054: resource busy and acquire with NOWAIT specified'))).toBe(false);
        expect(ddlDeadlocked(Object.assign(new Error('lock timeout'), { code: '55P03' }))).toBe(false);
        expect(ddlDeadlocked(undefined)).toBe(false);
    });

    it('should not take another failure for contention', () => {
        expect(ddlContended(new Error('ORA-01031: insufficient privileges'))).toBe(false);
        expect(ddlContended(new Error('ORA-040200: not a code'))).toBe(false);
        expect(ddlContended(Object.assign(new Error('permission denied for schema public'), { code: '42501' }))).toBe(
            false
        );
        expect(ddlContended(undefined)).toBe(false);
    });
});

describe('ddlWillNotMake', () => {
    it("should take Oracle's insufficient privileges and read-only database, under a cause or not", () => {
        for (const message of [
            'ORA-01031: insufficient privileges',
            'ORA-16000: database or pluggable database open for read-only access'
        ]) {
            expect(ddlWillNotMake(new Error(message))).toBe(true);
            expect(ddlWillNotMake(DrivineError.withRootCause(new Error(`${message}\nORA-06512: at line 40`)))).toBe(
                true
            );
        }
    });

    it("should take Postgres's insufficient privilege and read-only transaction, under a cause or not", () => {
        for (const code of ['42501', '25006']) {
            const failure = Object.assign(new Error('refused'), { code });
            expect(ddlWillNotMake(failure)).toBe(true);
            expect(ddlWillNotMake(DrivineError.withRootCause(failure))).toBe(true);
            expect(ddlWillNotMake(Object.assign(new Error('wrapped'), { cause: failure }))).toBe(true);
        }
    });

    it('should not take contention or another failure, which may pass', () => {
        expect(ddlWillNotMake(new Error('ORA-00054: resource busy and acquire with NOWAIT specified'))).toBe(false);
        expect(ddlWillNotMake(new Error('ORA-04020: deadlock detected while trying to lock object X'))).toBe(false);
        expect(ddlWillNotMake(new Error('ORA-010310: not a code'))).toBe(false);
        for (const code of ['40P01', '55P03', '40001', '08006']) {
            expect(ddlWillNotMake(Object.assign(new Error('failed'), { code }))).toBe(false);
        }
        expect(ddlWillNotMake(undefined)).toBe(false);
    });
});
