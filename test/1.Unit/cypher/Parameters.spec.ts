import { Parameters, PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';

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

    it('binds the parameters of a write as one object, each written apart, in the order given, undefined left out', () => {
        const values: any[] = [];
        const parameters = new Parameters(
            { b: [1, 2].values(), a: { x: 1 }, u: undefined, n: null },
            (it, value) => {
                values.push(value);
                return it;
            },
            (it) => it,
            true,
            (it) => `<${JSON.stringify(it)}>`
        );
        expect(parameters.json('b')).toEqual('b');
        // The value as given, an iterator as its items, beside its name.
        expect(values).toEqual([[1, 2]]);
        expect(parameters.values).toEqual({ [PARAMETERS_OBJECT]: '{"b":<[1,2]>,"a":<{"x":1}>,"n":<null>}' });
    });
});
