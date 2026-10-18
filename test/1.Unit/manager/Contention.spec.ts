import { CONTENDED_ATTEMPTS, CONTENDED_PAUSE_MILLIS, contendedPause, whenNotContended } from '@liberation-data/drivine';

describe('whenNotContended', () => {
    const contended = new Error('contended');
    const isContended = (failure: unknown): boolean => failure === contended;
    const pauses: number[] = [];
    const sleep = async (millis: number): Promise<void> => {
        pauses.push(millis);
    };

    beforeEach(() => (pauses.length = 0));

    it('should run again after a contended failure, until it succeeds', async () => {
        let calls = 0;
        const result = await whenNotContended(
            async () => {
                if (++calls < 3) {
                    throw contended;
                }
                return 'done';
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
                async () => {
                    throw ++calls === 1 ? first : contended;
                },
                (it) => it === first || it === contended,
                sleep
            )
        ).rejects.toBe(first);
        expect(calls).toEqual(CONTENDED_ATTEMPTS);
        expect(pauses.length).toEqual(CONTENDED_ATTEMPTS - 1);
    });

    it('should throw a failure of another kind at once', async () => {
        const other = new Error('other');
        let calls = 0;
        await expect(
            whenNotContended(
                async () => {
                    calls++;
                    throw other;
                },
                isContended,
                sleep
            )
        ).rejects.toBe(other);
        expect(calls).toEqual(1);
    });

    it('should pause longer each time, and for a random part as long again', () => {
        expect(contendedPause(0, () => 0)).toEqual(CONTENDED_PAUSE_MILLIS);
        expect(contendedPause(0, () => 0.999)).toEqual(2 * CONTENDED_PAUSE_MILLIS - 1);
        expect(contendedPause(2, () => 0)).toEqual(3 * CONTENDED_PAUSE_MILLIS);
        expect(contendedPause(2, () => 0.5)).toEqual(Math.floor(4.5 * CONTENDED_PAUSE_MILLIS));
    });
});
