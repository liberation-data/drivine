import * as oracledb from 'oracledb';
import { QuerySpecification } from '@liberation-data/drivine';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';

/** The value the statement `select $v from dual` binds `value` as. */
function bound(value: any): any {
    const spec = new QuerySpecification('select $v from dual').bind({ v: value }).finalizedCopy('SQL');
    return new OracleSpecCompiler(spec).compile().parameters.b0;
}

describe('OracleSpecCompiler', () => {
    it('binds a text a VARCHAR2 holds as itself, measured in bytes', () => {
        // 32,767 bytes in UTF-8: the most a PL/SQL VARCHAR2 holds.
        const text = `${'é'.repeat(16_383)}a`;
        expect(bound(text)).toEqual(text);
    });

    it('binds a text past what a VARCHAR2 holds as a CLOB, as drivine4j does, though its characters are fewer', () => {
        const text = 'é'.repeat(16_384);
        expect(bound(text)).toEqual({ type: oracledb.CLOB, val: text });
    });

    it('binds a map or a list whose JSON text a VARCHAR2 can’t hold as a CLOB of that text', () => {
        const list = Array.from({ length: 10_000 }, (_, i) => i);
        expect(bound(list)).toEqual({ type: oracledb.CLOB, val: JSON.stringify(list) });
        expect(bound({ a: [1, 2] })).toEqual('{"a":[1,2]}');
    });

    it('binds a name past ASCII, as Cypher reads one, and not a name it is the prefix of', () => {
        const spec = new QuerySpecification('select $größe, $größer from dual').bind({ größe: 3 }).finalizedCopy('SQL');
        const compiled = new OracleSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select :b0, $größer from dual');
        expect(compiled.parameters).toEqual({ b0: 3 });
    });
});
