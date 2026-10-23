import { catalogProperties, catalogRecord } from '@/backend/sql/SqlCatalog';

describe('SqlCatalog', () => {
    it("should write an item's properties as drivine4j writes them, byte for byte: no spaces, quotes and backslashes escaped", () => {
        expect(catalogProperties(['lastActivityAt', 'sessionId'])).toEqual('["lastActivityAt","sessionId"]');
        expect(catalogProperties(['a"b', 'c\\d', "it's", 'é'])).toEqual('["a\\"b","c\\\\d","it\'s","é"]');
        // drivine4j escapes nothing else, where a JSON library would: a newline is written as it is.
        expect(catalogProperties(['a\nb'])).toEqual('["a\nb"]');
    });

    it("should find an item's record under drivine4j's kind, or under any of the kinds given", () => {
        expect(catalogRecord({ kind: 'RANGE', label: 'Person', properties: ["it's"] })).toEqual(
            `kind = 'RANGE_INDEX' AND label = 'Person' AND properties = '["it''s"]'`
        );
        expect(
            catalogRecord({ kind: 'UNIQUE', label: 'Person', properties: ['uuid'] }, [
                'UNIQUENESS_CONSTRAINT',
                'UNIQUE'
            ])
        ).toEqual(`kind IN ('UNIQUENESS_CONSTRAINT', 'UNIQUE') AND label = 'Person' AND properties = '["uuid"]'`);
    });
});
