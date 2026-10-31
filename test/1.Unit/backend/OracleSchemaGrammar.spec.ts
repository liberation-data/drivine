import { rangeIndex, uniquenessConstraint } from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { BUSY_ATTEMPTS, OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';

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

    // Managers making the store key's constraint together were turned away at once by each other's lock on the node
    // table (ORA-00054), ran out of attempts, and went on without it.
    it("should run an index over the node table again while another session's lock turns it away, up to a bound", () => {
        const unique = grammar
            .createUnique(uniquenessConstraint('DrivineStore', 'key'))
            .find((it) => it.includes('CREATE UNIQUE INDEX'))!;
        for (const block of [sharedIndex('name'), unique]) {
            expect(block).toContain('PRAGMA EXCEPTION_INIT(e_busy, -54);');
            expect(block).toContain(`FOR attempt IN 1 .. ${BUSY_ATTEMPTS} LOOP`);
            expect(block).toMatch(
                /WHEN e_busy THEN\s+IF attempt = \d+ THEN RAISE; END IF;\s+DBMS_SESSION\.SLEEP\(0\.1\);/
            );
            expect(block).toMatch(/EXECUTE IMMEDIATE 'CREATE[^;]*;\s+RETURN;/);
        }
    });
});
