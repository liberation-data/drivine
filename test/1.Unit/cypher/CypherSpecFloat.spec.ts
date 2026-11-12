import { check, CypherCase, valuesFor } from '../../cypher/CypherSpec';

/**
 * The spec writes NaN and the infinities as `{$float: …}`, in parameters and rows alike, and a NaN in the rows matches
 * a NaN there, though NaN is equal to nothing. The runner reads them so, and still tells each from null, from the other
 * two and from a finite number.
 */
describe('The Cypher spec runner reads {$float: …}', () => {
    const floats = [{ $float: 'NaN' }, { $float: 'Infinity' }, { $float: '-Infinity' }];

    const stepGiving = async (rows: any[]): Promise<void> => {
        const cypherCase: CypherCase = {
            name: 'A float runner case',
            steps: [{ cypher: 'RETURN $p', rows: [[...floats, 1.5]] }]
        };
        await check('queries.yaml', cypherCase, 0, 'neo4j', async () => await Promise.resolve(rows));
    };

    it('as the number each names, in parameters', () => {
        expect(valuesFor({ p: floats, q: { r: { $float: 'NaN' } } }, Number)).toEqual({
            p: [NaN, Infinity, -Infinity],
            q: { r: NaN }
        });
    });

    it('matching a row that gives the same', async () => {
        await stepGiving([[NaN, Infinity, -Infinity, 1.5]]);
    });

    it('not matching a row that gives null for one', async () => {
        await expect(stepGiving([[null, Infinity, -Infinity, 1.5]])).rejects.toThrow(/Received: \[\[null,/);
        await expect(stepGiving([[NaN, null, -Infinity, 1.5]])).rejects.toThrow(/Expected/);
    });

    it('not matching a row that gives another of them, or a finite number', async () => {
        await expect(stepGiving([[NaN, -Infinity, Infinity, 1.5]])).rejects.toThrow(/Expected/);
        await expect(stepGiving([[NaN, Infinity, -Infinity, NaN]])).rejects.toThrow(/Expected/);
        await expect(stepGiving([[0, Infinity, -Infinity, 1.5]])).rejects.toThrow(/Expected/);
    });
});

/** A whole number past 2^53 is a bigint, in the spec's rows and in a SQL store's (liberation-data/drivine#735). */
describe('The Cypher spec runner compares a whole number past 2^53', () => {
    const big = BigInt('9007199254740993');

    it('by its digits, in rows whose order does not count', async () => {
        const cypherCase: CypherCase = {
            name: 'A big runner case',
            steps: [{ cypher: 'UNWIND $p AS x RETURN x', rows: [big, BigInt(1)], unordered: true }]
        };
        const run = async (rows: any[]): Promise<void> =>
            await check('queries.yaml', cypherCase, 0, 'sqlite', async () => await Promise.resolve(rows));
        await run([1, big]);
        await expect(run([1, big - BigInt(1)])).rejects.toThrow(/Expected: \["9007199254740993",1\]/);
    });
});
