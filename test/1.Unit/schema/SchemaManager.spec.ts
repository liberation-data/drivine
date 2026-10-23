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

    it('should still refuse them with no graph database registered, naming none', async () => {
        await expect(schema().ensure('dice', ...differing)).rejects.toThrow(
            "Two schema catalogs declare the VECTOR on RtProp(embedding) differently, both owned by 'dice'."
        );
    });

    it('should name the database they are given for', async () => {
        DatabaseRegistry.getInstance().register(graph('a'));

        await expect(schema().ensure('dice', ...differing)).rejects.toThrow(
            "Two schema catalogs declare the VECTOR on RtProp(embedding) on a differently, both owned by 'dice'."
        );
    });

    it('should name no one database when they are given for several', async () => {
        DatabaseRegistry.getInstance().register(graph('a'));
        DatabaseRegistry.getInstance().register(graph('b'));

        await expect(schema().ensure(SchemaCatalog.of(...differing).named('dice'))).rejects.toThrow(
            "Two schema catalogs declare the VECTOR on RtProp(embedding) differently, both owned by 'dice'."
        );
    });
});
