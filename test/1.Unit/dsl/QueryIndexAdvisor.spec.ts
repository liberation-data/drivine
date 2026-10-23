import { QueryIndexAdvisor } from '@/dsl/QueryIndexAdvisor';

describe('QueryIndexAdvisor', () => {
    it('should give a filter only the indexes that are whole, as one incomplete lacks the index it would be read through', async () => {
        const ranges = [
            { label: 'Person', properties: ['name'] },
            { label: 'Person', properties: ['uuid'], incomplete: true }
        ];
        const constraints = [{ label: 'Person', properties: ['email'] }];
        const advisor = new QueryIndexAdvisor(
            () => ({ list: async () => Promise.resolve(ranges) }) as any,
            () => ({ list: async () => Promise.resolve(constraints) }) as any,
            () => false
        );
        expect((await advisor.indexed()).map((it) => it.properties)).toEqual([['name'], ['email']]);
    });
});
