import { QuerySpecification } from '@liberation-data/drivine';
import { AgensGraphSpecCompiler } from '@/query/AgensGraphSpecCompiler';

describe('AgensGraphSpecCompiler', () => {

    it('should map parameters to AgensGraph format', () => {
        const spec = new QuerySpecification().withStatement(`match (n) return count(n)`).bind([1, 'foo', 'bar', false]);
        const compiledSpec = new AgensGraphSpecCompiler(spec).compile();
        const map: any[] = compiledSpec.parameters;
        expect(map[0]).toEqual('1');
        expect(map[1]).toEqual('"foo"');
        expect(map[2]).toEqual('"bar"');
        expect(map[3]).toEqual('false');
    });

    it('should map parameters to AgensGraph format', () => {
        const sql = `MERGE (u:Urbanite { id : $id } ) set u += $urbaniteProps WITH u UNWIND $metros AS metro MERGE (m:Metro {name: metro}) WITH u, m, metro MERGE (u)-[:FREQUENTLY_HAUNTS]-(m)`;

        const params = {
            "id" : "911c7a87-7794-4f71-8ca0-87131350a96d",
            "urbaniteProps": { "firstName": "Moon", "lastName": "Girl" },
            "metros": ["NYC", "Cavite Island"]
        };
        const compiledSpec = new AgensGraphSpecCompiler(new QuerySpecification(sql).bind(params)).compile();
        const map: any[] = compiledSpec.parameters;
        const statement = compiledSpec.statement;
        expect(statement).toEqual('MERGE (u:Urbanite { id : $1 } ) set u += $3 WITH u UNWIND $2 AS metro MERGE (m:Metro {name: metro}) WITH u, m, metro MERGE (u)-[:FREQUENTLY_HAUNTS]-(m)');
        expect(map[0]).toEqual('"911c7a87-7794-4f71-8ca0-87131350a96d"');
        expect(map[1]).toEqual(JSON.stringify(["NYC", "Cavite Island"]));
        expect(map[2]).toEqual(JSON.stringify({ "firstName": "Moon", "lastName": "Girl" }));
    });

});
