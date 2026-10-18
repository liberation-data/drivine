import { QuerySpecification } from '@liberation-data/drivine';
import { FalkorDbResultMapper } from '@/connection/falkordb/FalkorDbResultMapper';

describe('FalkorDbResultMapper', () => {
    const mapper = new FalkorDbResultMapper();
    const spec = new QuerySpecification('RETURN 1').finalizedCopy('CYPHER');

    it('should return a single column as the value, and several as an array', () => {
        expect(mapper.mapQueryResults([{ a: 1 }, { a: 2 }], spec)).toEqual([1, 2]);
        expect(mapper.mapQueryResults([{ a: 1, b: 'x' }], spec)).toEqual([[1, 'x']]);
    });

    it('should return a node or relationship as its properties', () => {
        const node = { id: 0, labels: ['P'], properties: { name: 'a', tags: ['x'] } };
        const rel = { id: 0, sourceId: 0, destinationId: 1, properties: { w: 2 }, relationshipType: 'R' };
        expect(mapper.mapQueryResults([{ n: node }], spec)).toEqual([{ name: 'a', tags: ['x'] }]);
        expect(mapper.mapQueryResults([{ r: rel }], spec)).toEqual([{ w: 2 }]);
        expect(mapper.mapQueryResults([{ m: { owner: node, list: [node] } }], spec)).toEqual([
            { owner: { name: 'a', tags: ['x'] }, list: [{ name: 'a', tags: ['x'] }] }
        ]);
    });

    it('should leave a map that only resembles a node alone', () => {
        expect(mapper.mapQueryResults([{ m: { id: 1, labels: ['x'] } }], spec)).toEqual([{ id: 1, labels: ['x'] }]);
    });

    it('should map a datetime and a date to a Date in UTC', () => {
        const plain = (tag: string, text: string) => ({ [Symbol.toStringTag]: tag, toString: () => text });
        const [dt, d] = mapper.mapQueryResults(
            [{ dt: plain('Temporal.PlainDateTime', '2040-01-01T10:00:00'), d: plain('Temporal.PlainDate', '2040-01-02') }],
            spec
        )[0] as any;
        expect(dt).toEqual(new Date('2040-01-01T10:00:00Z'));
        expect(d).toEqual(new Date('2040-01-02T00:00:00Z'));
    });
});
