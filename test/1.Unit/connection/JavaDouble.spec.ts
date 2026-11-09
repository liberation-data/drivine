import { javaDouble } from '@/connection/sqlite/JavaDouble';

describe('javaDouble', () => {
    it("writes a double as Java's Double.toString does", () => {
        expect(
            [2, 1.5, 0.001, 9.99e-4, 1e7, 9999999.5, 1e-5, 5e-324, 1e21, 1.7976931348623157e308, -2.5e-320].map(
                javaDouble
            )
        ).toEqual([
            '2.0',
            '1.5',
            '0.001',
            '9.99E-4',
            '1.0E7',
            '9999999.5',
            '1.0E-5',
            '4.9E-324',
            '1.0E21',
            '1.7976931348623157E308',
            '-2.5E-320'
        ]);
        expect([0, -0, NaN, Infinity, -Infinity].map(javaDouble)).toEqual([
            '0.0',
            '-0.0',
            'NaN',
            'Infinity',
            '-Infinity'
        ]);
    });
});
