import { int } from 'neo4j-driver';
import { isInt } from '@/utils/Integers';
import { randomHex, randomUuid } from '@/utils/Random';
import { assert } from '@/utils/Assert';
import { parametersJson } from '@/cypher/SharedCypherCompiler';

describe('isInt', () => {
    it('is true of a Neo4j driver integer', () => {
        expect(isInt(int(7))).toBe(true);
        expect(isInt(int('9007199254740993'))).toBe(true);
    });

    it('is false of a plain map of low and high, which stays a map', () => {
        expect(isInt({ low: 1, high: 0 })).toBe(false);
        expect(parametersJson({ m: { low: 1, high: 0 } })).toBe('{"m":{"low":1,"high":0}}');
        expect(parametersJson({ n: int(7) })).toBe('{"n":7}');
    });

    it('is false of numbers, bigints, null and other objects', () => {
        for (const value of [1, BigInt(1), null, undefined, 'x', [], {}, { low: '1', high: 0, toNumber: () => 1 }]) {
            expect(isInt(value)).toBe(false);
        }
    });
});

describe('randomHex', () => {
    it('gives two lower-case hex digits a byte', () => {
        expect(randomHex(4)).toMatch(/^[0-9a-f]{8}$/);
        expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('randomUuid', () => {
    it('gives a version 4 UUID', () => {
        expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});

describe('assert', () => {
    it('throws its message when false, and nothing when true', () => {
        expect(() => assert(false, 'nope')).toThrow('nope');
        expect(() => assert(1, 'fine')).not.toThrow();
    });
});
