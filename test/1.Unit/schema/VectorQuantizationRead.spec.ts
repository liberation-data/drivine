import { NEO4J_SCHEMA } from '@liberation-data/drivine';

/** Neo4j up to 2026.05 reports `vector.quantization.enabled`; from 2026.06 it reports `vector.quantization.type`. */
describe("Reading a Neo4j vector index's quantization", () => {
    const quantizationReadFrom = (config: Record<string, unknown>): boolean | undefined =>
        NEO4J_SCHEMA.listVectors.read([
            { labels: ['P'], properties: ['e'], name: 'v', config: { 'vector.dimensions': 8, ...config } }
        ])[0].quantizationEnabled;

    it('should read vector.quantization.enabled, which Neo4j reports up to 2026.05', () => {
        expect(quantizationReadFrom({ 'vector.quantization.enabled': false })).toBe(false);
        expect(quantizationReadFrom({ 'vector.quantization.enabled': true })).toBe(true);
    });

    it('should read vector.quantization.type, which Neo4j reports from 2026.06, as enabled unless it is NONE', () => {
        expect(quantizationReadFrom({ 'vector.quantization.type': 'NONE' })).toBe(false);
        expect(quantizationReadFrom({ 'vector.quantization.type': 'BINARY' })).toBe(true);
        expect(quantizationReadFrom({ 'vector.quantization.type': 'SCALAR' })).toBe(true);
    });

    it('should read vector.quantization.type over vector.quantization.enabled when both are reported', () => {
        expect(quantizationReadFrom({ 'vector.quantization.type': 'NONE', 'vector.quantization.enabled': true })).toBe(
            false
        );
    });

    it('should read vector.quantization.type in any case', () => {
        expect(quantizationReadFrom({ 'vector.quantization.type': 'none' })).toBe(false);
        expect(quantizationReadFrom({ 'vector.quantization.type': 'scalar' })).toBe(true);
    });

    it('should read a vector.quantization.type Drivine does not know as quantized, since only NONE is not', () => {
        expect(quantizationReadFrom({ 'vector.quantization.type': 'PRODUCT' })).toBe(true);
    });

    it('should ignore a vector.quantization.type that is not a string, in favour of vector.quantization.enabled', () => {
        expect(quantizationReadFrom({ 'vector.quantization.type': 0, 'vector.quantization.enabled': false })).toBe(
            false
        );
        expect(quantizationReadFrom({ 'vector.quantization.type': true })).toBeUndefined();
    });

    it('should read neither as undefined, not as disabled', () => {
        expect(quantizationReadFrom({})).toBeUndefined();
    });
});
