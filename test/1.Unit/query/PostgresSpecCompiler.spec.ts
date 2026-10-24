import { QuerySpecification } from '@liberation-data/drivine';
import { PostgresSpecCompiler } from '@/connection/postgres/PostgresSpecCompiler';

describe('PostgresSpecCompiler', () => {
    it('should pass positional parameters through unchanged', () => {
        const spec = new QuerySpecification().withStatement(`select $1, $2`).bind([1, 'foo']);
        const compiled = new PostgresSpecCompiler(spec.finalizedCopy('SQL')).compile();
        expect(compiled.statement).toEqual('select $1, $2');
        expect(compiled.parameters).toEqual([1, 'foo']);
    });

    it('should rewrite named parameters to positional, in sorted key order', () => {
        const spec = new QuerySpecification(`select * from person where name = $name and age > $age`)
            .bind({ name: 'Moon Girl', age: 13 })
            .finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select * from person where name = $2 and age > $1');
        expect(compiled.parameters).toEqual([13, 'Moon Girl']);
    });

    it('should rewrite every occurrence of a named parameter', () => {
        const spec = new QuerySpecification(`select $id as a, $id as b`).bind({ id: 7 }).finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select $1 as a, $1 as b');
        expect(compiled.parameters).toEqual([7]);
    });

    it('should not match a name as the prefix of a longer one', () => {
        const spec = new QuerySpecification(`select * from t where id = $id or id = any($idList)`)
            .bind({ id: 1, idList: [2, 3] })
            .finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select * from t where id = $1 or id = any($2)');
        expect(compiled.parameters).toEqual([1, [2, 3]]);
    });

    it('should rewrite a name past ASCII, as Cypher reads one, and end a name at a dollar', () => {
        const spec = new QuerySpecification(`select $größe, $_x$1`).bind({ größe: 3, _x: 4 }).finalizedCopy('SQL');
        const compiler = new PostgresSpecCompiler(spec);
        expect(compiler.formattedStatement().trim()).toEqual('select $2, $1$1');
        expect(compiler.formattedParams()).toEqual([4, 3]);
    });

    it('should bind only the names the statement uses, as Postgres refuses one it does not', () => {
        const spec = new QuerySpecification(`select * from t where name = $name`)
            .bind({ name: 'Moon Girl', unused: 1, threshold: undefined })
            .finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select * from t where name = $1');
        expect(compiled.parameters).toEqual(['Moon Girl']);
    });

    it('should leave out a binding whose key no parameter can name, whatever it holds', () => {
        const spec = new QuerySpecification(`select * from t where name = $name`)
            .bind({ name: 'Moon Girl', 'c++ (draft)': 1 })
            .finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select * from t where name = $1');
        expect(compiled.parameters).toEqual(['Moon Girl']);
    });

    it('should apply skip and limit as OFFSET and LIMIT', () => {
        const spec = new QuerySpecification(`select * from t`).skip(10).limit(5).finalizedCopy('SQL');
        const compiled = new PostgresSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('select * from t OFFSET 10 LIMIT 5');
    });

    it('should refuse Cypher', () => {
        const spec = new QuerySpecification(`match (n) return n`).finalizedCopy('CYPHER');
        expect(() => new PostgresSpecCompiler(spec)).toThrow(/CYPHER is not supported on Postgres/);
    });
});
