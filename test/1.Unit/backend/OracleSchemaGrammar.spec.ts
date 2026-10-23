import { rangeIndex } from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';

describe('OracleSchemaGrammar', () => {
    const grammar = new OracleSchemaGrammar(new OracleGraph('jvm'));

    /** The DDL of the index over the property of every node, as the block that makes it holds it. */
    const sharedIndex = (property: string): string => grammar.createRange(rangeIndex('Person', property))[0];

    it("should write the shared index's path as drivine4j writes it: bare for a key SQL takes for an identifier", () => {
        expect(sharedIndex('name')).toContain(`(JSON_VALUE(props, ''$.name''))`);
        expect(sharedIndex('_created2')).toContain(`(JSON_VALUE(props, ''$._created2''))`);
    });

    it("should quote a key drivine4j quotes: one a JSON path reads as a value, or that isn't an identifier", () => {
        // drivine4j: `'$."true"'`, `'$."meta.source"'`, `'$."it''s"'`, `'$."a\"b"'`, then doubled for EXECUTE IMMEDIATE.
        expect(sharedIndex('true')).toContain(`(JSON_VALUE(props, ''$."true"''))`);
        expect(sharedIndex('null')).toContain(`(JSON_VALUE(props, ''$."null"''))`);
        expect(sharedIndex('meta.source')).toContain(`(JSON_VALUE(props, ''$."meta.source"''))`);
        expect(sharedIndex('2fa')).toContain(`(JSON_VALUE(props, ''$."2fa"''))`);
        expect(sharedIndex("it's")).toContain(`(JSON_VALUE(props, ''$."it''''s"''))`);
        expect(sharedIndex('a"b')).toContain(`(JSON_VALUE(props, ''$."a\\"b"''))`);
    });
});
