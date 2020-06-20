import { QuerySpecification } from '@liberation-data/drivine';
import { AgensGraphSpecCompiler } from '@/query/AgensGraphSpecCompiler';

describe('AgensGraphSpecCompiler', () => {

    const spec = new QuerySpecification().withStatement(`match (n) return count(n)`).bind([1, 'foo', 'bar', false]);

    it('should map parameters to AgensGraph format', () => {
        const compiledSpec = new AgensGraphSpecCompiler(spec).compile();
        const map: any[] = compiledSpec.parameters;
        expect(map[0]).toEqual('1');
        expect(map[1]).toEqual('"foo"');
        expect(map[2]).toEqual('"bar"');
        expect(map[3]).toEqual('false');
    });

});
