import { inventoryEntries, readInventory } from '@/schema/SchemaInventory';

describe('A schema marker inventory', () => {
    it('should read an item ensured at runtime as one, and mark one waiting to be recreated', () => {
        const stored =
            'RANGE_INDEX:Doc:slug:a\nruntime:VECTOR_INDEX:Doc:embedding:b\nruntime-stale:RANGE_INDEX:Tag:name:c';
        const recorded = readInventory(stored.split('\n'))!;
        expect(recorded.keys).toEqual([
            'RANGE_INDEX:Doc:slug:a',
            'VECTOR_INDEX:Doc:embedding:b',
            'RANGE_INDEX:Tag:name:c'
        ]);
        expect([...recorded.runtime]).toEqual(['VECTOR_INDEX:Doc:embedding:b', 'RANGE_INDEX:Tag:name:c']);
        expect([...recorded.stale]).toEqual(['RANGE_INDEX:Tag:name:c']);
    });

    it('should keep an empty inventory apart from none', () => {
        expect(readInventory(undefined)).toBeUndefined();
        expect(readInventory([])).toEqual({ keys: [], runtime: new Set(), stale: new Set() });
    });

    it('should write the items ensured at runtime, and those to be recreated, behind their prefixes', () => {
        expect(inventoryEntries(['a', 'b', 'c'], new Set(['b', 'c']), new Set(['c']))).toEqual(
            'a\nruntime:b\nruntime-stale:c'
        );
        expect(inventoryEntries(['a', 'b'])).toEqual('a\nb');
        expect(inventoryEntries([])).toEqual('');
    });

    it('should read back what it writes', () => {
        const recorded = readInventory(
            inventoryEntries(['a', 'b', 'c'], new Set(['b', 'c']), new Set(['c'])).split('\n')
        )!;
        expect(recorded).toEqual({ keys: ['a', 'b', 'c'], runtime: new Set(['b', 'c']), stale: new Set(['c']) });
    });
});
