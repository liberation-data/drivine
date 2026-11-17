import {
    ConnectionProvider,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    SchemaCatalog,
    SchemaManager,
    vectorIndex
} from '@liberation-data/drivine';

describe('SchemaManager.ensure refusing two items of one identity given at once that differ', () => {
    const schema = () => new SchemaManager({} as GraphObjectManagerFactory, { catalogs: [] });
    const differing = [vectorIndex('RtProp', 'embedding', 3), vectorIndex('RtProp', 'embedding', 4)];
    const graph = (name: string) => ({ name, type: DatabaseType.NEO4J }) as ConnectionProvider;

    beforeEach(() => DatabaseRegistry.tearDown());
    afterAll(() => DatabaseRegistry.tearDown());

    /** The module's refusal (drivine4j's), which names the item and both declarations, and no database. */
    const REFUSAL =
        'Conflicting schema declarations for VECTOR_INDEX on RtProp[embedding] (they disagree on portable parameters)';

    it('should still refuse them with no graph database registered', async () => {
        await expect(schema().ensure('dice', ...differing)).rejects.toThrow(REFUSAL);
    });

    it('should refuse them before the database they are given for is spoken to', async () => {
        DatabaseRegistry.getInstance().register(graph('a'));

        await expect(schema().ensure('dice', ...differing)).rejects.toThrow(REFUSAL);
    });

    it('should refuse them once when they are given for several databases', async () => {
        DatabaseRegistry.getInstance().register(graph('a'));
        DatabaseRegistry.getInstance().register(graph('b'));

        await expect(schema().ensure(SchemaCatalog.of(...differing).named('dice'))).rejects.toThrow(REFUSAL);
    });
});
