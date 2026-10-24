import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';

/**
 * On Oracle, a node's first label is tested so the index over labels answers it, and each label after it by its text,
 * as one whole label escaped as `JSON_SERIALIZE` writes it: the backend's own test of the labels. drivine4j's
 * `OracleLabelTestTextTest`.
 */
describe('A later label in compiled Cypher on Oracle', () => {
    it('should be looked for as one whole label, escaped as JSON_SERIALIZE writes it', () => {
        const sql: string = new OracleCypherCompiler('g').compile('MATCH (n:Crafted:`x","Dog`:`a\tb`) RETURN n.id').sql;
        expect(sql).toContain(`JSON_EXISTS(n1.labels, '$[*]?(@ == "Crafted")')`);
        expect(sql).toContain(
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n1.labels), ']'), '[') || ',"', ',"x\\",\\"Dog","') > 0`
        );
        expect(sql).toContain(
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n1.labels), ']'), '[') || ',"', ',"a\\tb","') > 0`
        );
    });
});
