import { StaleObjectException } from '@liberation-data/drivine';

class Claim {}

describe('StaleObjectException', () => {
    it('should say a field differs when the node carries the stamp the object was loaded with', () => {
        const stamp = '0123456789abcdef:fedcba9876543210';
        expect(new StaleObjectException(Claim, 'c1', stamp, stamp, false).message).toEqual(
            `Claim 'c1' changed since it was loaded, under the stamp ${stamp}: a field is not as it was loaded.`
        );
        expect(new StaleObjectException(Claim, 'c1', stamp, 'other', false).message).toContain(
            `expected stamp ${stamp}, found other`
        );
    });
});
