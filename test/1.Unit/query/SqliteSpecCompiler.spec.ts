import { SqliteSpecCompiler } from '@/connection/sqlite/SqliteSpecCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';

describe('SqliteSpecCompiler', () => {
    it("binds no parameter named only in quoted text, which SQLite would refuse: a JSON path's '$.\"$t\"' (#789)", () => {
        const spec = new QuerySpecification(`select json_extract(props, '$."$t"') from n where id = $id`)
            .bind({ t: 'a', id: 'x' })
            .finalizedCopy('SQL');
        expect(new SqliteSpecCompiler(spec).compile().parameters).toEqual({ id: 'x' });
    });

    it("reads a parameter as text where it is read only by CAST($name AS TEXT), a quoted '$name' aside", () => {
        const spec = new QuerySpecification(`select '$id' from n where CAST($id AS TEXT) = n.id`)
            .bind({ id: 7 })
            .finalizedCopy('SQL');
        expect(new SqliteSpecCompiler(spec).compile().parameters).toEqual({ id: '7' });
    });

    it("reads a parameter as a value where a quoted 'CAST($name AS TEXT)' is the only cast of it", () => {
        const spec = new QuerySpecification(`select 'CAST($id AS TEXT)' from n where n.num = $id`)
            .bind({ id: 7 })
            .finalizedCopy('SQL');
        expect(new SqliteSpecCompiler(spec).compile().parameters).toEqual({ id: 7 });
    });
});
