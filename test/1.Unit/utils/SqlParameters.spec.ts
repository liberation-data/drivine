import { parameterNames, replaceParameters } from '@/utils/SqlParameters';

/** [sql] with each parameter written `<name>`. */
function marked(sql: string): string {
    return replaceParameters(sql, (name) => `<${name}>`);
}

describe('SqlParameters', () => {
    it('reads a parameter outside quoted text, the longest name, past ASCII too', () => {
        expect(marked('select $id, $idList, $größe, $_x')).toEqual('select <id>, <idList>, <größe>, <_x>');
    });

    it('keeps a parameter as it is where it is not replaced', () => {
        expect(replaceParameters('select $a, $b', (name) => (name === 'a' ? '?' : undefined))).toEqual('select ?, $b');
    });

    it('leaves a string literal as it is, a doubled quote and all', () => {
        expect(marked(`select '$t', 'it''s $t', $t`)).toEqual(`select '$t', 'it''s $t', <t>`);
    });

    it('leaves a quoted identifier as it is', () => {
        expect(marked(`select "$t", "a""$t", $t`)).toEqual(`select "$t", "a""$t", <t>`);
    });

    it("leaves a national or alternatively quoted literal as it is: n'…', q'[…]', nq'{…}', q'!…!'", () => {
        expect(marked(`select n'$a', q'[$b']', NQ'{$c}', q'!$d!', $e`)).toEqual(
            `select n'$a', q'[$b']', NQ'{$c}', q'!$d!', <e>`
        );
    });

    it("reads no literal where n or q ends a name: in'$a' is a name and a literal", () => {
        expect(marked(`select in'$a', $b`)).toEqual(`select in'$a', <b>`);
    });

    it("leaves Postgres's dollar-quoted text as it is", () => {
        expect(marked('select $$ $a $$, $tag$ $b $tag$, $c')).toEqual('select $$ $a $$, $tag$ $b $tag$, <c>');
    });

    it('reads a dollar quote only where its tag closes it: $a$b is the parameter a and the text $b', () => {
        expect(marked('select $a$b')).toEqual('select <a>$b');
    });

    it('reads $$ before a name as a PL/SQL inquiry directive, not a quote, nor a parameter', () => {
        expect(marked('select $$PLSQL_UNIT, $a from dual')).toEqual('select $$PLSQL_UNIT, <a> from dual');
    });

    it('leaves a comment as it is', () => {
        expect(marked('select /* $a */ $b -- $c\n, $d')).toEqual('select /* $a */ <b> -- $c\n, <d>');
    });

    it('reads no parameter inside an identifier, nor a positional one', () => {
        expect(marked('select v$session, a#$b, $1, $c')).toEqual('select v$session, a#$b, $1, <c>');
    });

    it('takes quoted text that is never closed to the end', () => {
        expect(marked(`select $a, '$b`)).toEqual(`select <a>, '$b`);
        expect(marked(`select $a, /* $b`)).toEqual(`select <a>, /* $b`);
        expect(marked(`select $a, q'[$b`)).toEqual(`select <a>, q'[$b`);
    });

    it("leaves Postgres's escaped literal as it is, a quote after a backslash and all: e'it\\'s $a'", () => {
        expect(marked(`select E'it\\'s $a', e'\\\\', $b`)).toEqual(`select E'it\\'s $a', e'\\\\', <b>`);
    });

    it('reads a name past the BMP, and no parameter after a letter past it', () => {
        expect(marked('select $𝑥, 𝑥$a, $b')).toEqual('select <𝑥>, 𝑥$a, <b>');
    });

    it("reads a lone $, $$ or q' at the end as it is", () => {
        expect(marked('select $a, $')).toEqual('select <a>, $');
        expect(marked('select $a, $$')).toEqual('select <a>, $$');
        expect(marked("select $a, q'")).toEqual("select <a>, q'");
    });

    it('names the parameters outside quoted text', () => {
        expect([...parameterNames(`select $a, '$b', "$c", $a, $d`)]).toEqual(['a', 'd']);
    });
});
