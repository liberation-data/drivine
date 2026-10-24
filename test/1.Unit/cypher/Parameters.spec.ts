import { Parameters } from '@/cypher/sql/Parameters';

/** The parameters of a statement as the SQL binds them. */
describe('Parameters', () => {
    it('binds an iterable read more than once as all its items, though it gives them only once', () => {
        const parameters = new Parameters(
            { ids: [1, 2].values() },
            (it) => it,
            (it) => it
        );
        parameters.json('ids');
        parameters.json('ids');
        expect(parameters.values).toEqual({ _cy_ids: '[1,2]' });
    });
});
