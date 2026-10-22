import { PostgresBackend } from '@liberation-data/drivine';

describe('PostgresBackend', () => {
    const backend = new PostgresBackend();
    const failure = (code: string): Error => Object.assign(new Error(code), { code });

    it('should take a serialization failure or a deadlock as contention, however deep it is wrapped', () => {
        expect(backend.contended(failure('40001'))).toBe(true);
        expect(backend.contended(failure('40P01'))).toBe(true);
        expect(backend.contended({ rootCause: { cause: failure('40001') } })).toBe(true);
    });

    it('should not take any other failure as contention', () => {
        expect(backend.contended(failure('23505'))).toBe(false);
        expect(backend.contended(new Error('stale'))).toBe(false);
        expect(backend.contended(undefined)).toBe(false);
    });

    it('should keep an empty inventory apart from none', () => {
        expect(backend.markerItems(null)).toBeUndefined();
        expect(backend.markerItems('')).toEqual([]);
        expect(backend.markerItems('a\nb')).toEqual(['a', 'b']);
    });
});
