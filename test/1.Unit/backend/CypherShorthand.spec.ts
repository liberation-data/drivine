import { CypherBackend } from '@/backend/CypherBackend';
import { NEO4J_GRAMMAR } from '@/backend/CypherGrammar';
import { OracleBackend } from '@/backend/oracle/OracleBackend';
import { textOf as oracle } from '@/backend/oracle/OracleGraph';
import { PostgresBackend } from '@/backend/postgres/PostgresBackend';
import { CypherShorthand } from '@/backend/sql/CypherShorthand';

// drivine4j's CypherShorthandTest, ported: a predicate written by hand, with the root's properties written as Cypher
// writes them, read on Oracle, as drivine4j reads it.
describe('CypherShorthand', () => {
    const shorthand = new CypherShorthand('n', 'n_', oracle);
    const rewrite = (predicate: string): string => shorthand.rewrite(predicate);

    it('should read a property of the root from its document', () => {
        expect(rewrite("n.name = 'x'")).toEqual("JSON_VALUE(n_.props, '$.name') = 'x'");
    });

    it('should read a name in backticks as one key, quoted in the path', () => {
        expect(rewrite('n.`a.b` = 1')).toEqual('JSON_VALUE(n_.props, \'$."a.b"\') = 1');
    });

    it("should read the row's own columns as the columns", () => {
        expect(rewrite('n.stamp IS NULL')).toEqual('n_.stamp IS NULL');
        expect(rewrite("JSON_EXISTS(n.props, '$.x')")).toEqual("JSON_EXISTS(n_.props, '$.x')");
        expect(rewrite('JSON_SERIALIZE(n.labels)')).toEqual('JSON_SERIALIZE(n_.labels)');
        expect(rewrite('n.nid > 0')).toEqual('n_.nid > 0');
    });

    it('should leave text inside a string literal as it is', () => {
        expect(rewrite("n.name = 'n.name'")).toEqual("JSON_VALUE(n_.props, '$.name') = 'n.name'");
        expect(rewrite("n.text = 'it''s n.text, see'")).toEqual("JSON_VALUE(n_.props, '$.text') = 'it''s n.text, see'");
        expect(rewrite("'n.name'")).toEqual("'n.name'");
    });

    it('should not take another alias for the root', () => {
        expect(rewrite("other.name = 'x'")).toEqual("other.name = 'x'");
        expect(rewrite("an.name = 'x'")).toEqual("an.name = 'x'");
        expect(rewrite("x.n.name = 'x'")).toEqual("x.n.name = 'x'");
    });

    it('should rewrite a property inside a function, and not a function on the alias', () => {
        expect(rewrite("LOWER(n.x) = 'a'")).toEqual("LOWER(JSON_VALUE(n_.props, '$.x')) = 'a'");
        expect(rewrite('n.fn(1) = 2')).toEqual('n.fn(1) = 2');
    });

    it('should rewrite each of several properties in one predicate', () => {
        expect(rewrite('n.a = n.b AND n.c IS NOT NULL')).toEqual(
            "JSON_VALUE(n_.props, '$.a') = JSON_VALUE(n_.props, '$.b') AND JSON_VALUE(n_.props, '$.c') IS NOT NULL"
        );
    });

    it("should read a view's root by what the predicate calls it, and no related node's", () => {
        expect(new CypherShorthand('claim', 'claim_', oracle).rewrite("claim.id = 'c1'")).toEqual(
            "JSON_VALUE(claim_.props, '$.id') = 'c1'"
        );
        expect(new OracleBackend().written("n.id = 'c1' AND people.name = 'x'")).toEqual(
            "JSON_VALUE(n.props, '$.id') = 'c1' AND people.name = 'x'"
        );
    });

    it('should leave a predicate with nothing of the root in it unchanged', () => {
        expect(rewrite('1 = 1')).toEqual('1 = 1');
        expect(rewrite('')).toEqual('');
    });

    it('should compare a property compared with a boolean with the text a JSON boolean is read as', () => {
        expect(rewrite('n.locked = true')).toEqual("JSON_VALUE(n_.props, '$.locked') = 'true'");
        expect(rewrite('n.locked <> FALSE AND n.stamp IS NOT NULL')).toEqual(
            "JSON_VALUE(n_.props, '$.locked') <> 'false' AND n_.stamp IS NOT NULL"
        );
        // A word that only begins as a boolean is not one, and nor is a boolean compared otherwise.
        expect(rewrite('n.state = truest')).toEqual("JSON_VALUE(n_.props, '$.state') = truest");
        expect(rewrite('true = n.locked')).toEqual("true = JSON_VALUE(n_.props, '$.locked')");
    });

    it('should escape a name in backticks for the literal and the path it is written in', () => {
        expect(rewrite("n.`it's` = 1")).toEqual("JSON_VALUE(n_.props, '$.\"it''s\"') = 1");
        expect(rewrite('n.`a"b\\c` = 1')).toEqual('JSON_VALUE(n_.props, \'$."a\\"b\\\\c"\') = 1');
        expect(rewrite('n.true = 1')).toEqual('JSON_VALUE(n_.props, \'$."true"\') = 1');
        expect(new PostgresBackend().written("n.`it's` = 1 OR n.`x') = '' OR 1=1 --` = 2")).toEqual(
            "(n.props ->> 'it''s') = 1 OR (n.props ->> 'x'') = '''' OR 1=1 --') = 2"
        );
    });

    it("should read a property on Postgres as Postgres reads one, and leave a graph engine's predicate as Cypher", () => {
        expect(new PostgresBackend().written("n.name = 'x' AND n.locked = true AND n.stamp IS NULL")).toEqual(
            "(n.props ->> 'name') = 'x' AND (n.props ->> 'locked') = 'true' AND n.stamp IS NULL"
        );
        expect(new CypherBackend(NEO4J_GRAMMAR).written("n.name = 'x'")).toEqual("n.name = 'x'");
    });
});
