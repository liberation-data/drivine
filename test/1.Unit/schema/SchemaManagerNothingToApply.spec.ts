import { GraphObjectManagerFactory, SchemaCatalog, SchemaManager, SchemaOptions } from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { DrivineModuleBuilder, SCHEMA_ENFORCED } from '@/nest/DrivineModuleBuilder';

/**
 * With nothing to apply, the manager says so, and says which: no catalog at all, or catalogs that are all empty, named.
 * No database is spoken to: the factory refuses to give one.
 */
describe('SchemaManager with nothing to apply', () => {
    let info: jest.SpyInstance;
    let warn: jest.SpyInstance;
    const factory = {
        get: () => {
            throw new Error('No database is spoken to.');
        }
    } as unknown as GraphObjectManagerFactory;
    const manager = (catalogs: SchemaCatalog[]): SchemaManager => new SchemaManager(factory, { catalogs });
    const lines = (): string[] => info.mock.calls.map(([it]) => String(it));

    beforeEach(() => {
        info = jest.spyOn(DrivineLogger.prototype, 'log').mockImplementation(() => undefined);
        warn = jest.spyOn(DrivineLogger.prototype, 'warn');
    });

    afterEach(() => jest.restoreAllMocks());

    it('should say there is no catalog at all, that the catalogs are read once, and where schema known later goes', async () => {
        expect(await manager([]).enforce()).toEqual(new Map());
        expect(lines()).toEqual([
            'Schema management found no SchemaCatalog; nothing to apply. ' +
                'Catalogs are read once, when the SchemaManager is built; schema known later is given to SchemaManager.ensure.'
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('should name catalogs that are all empty, an unnamed one as unnamed', async () => {
        await manager([
            SchemaCatalog.of().named('dice'),
            SchemaCatalog.of(),
            SchemaCatalog.of().named('rag').forDatabase('neo'),
            SchemaCatalog.of()
        ]).enforce();
        expect(lines()).toEqual([
            "Schema management found 4 SchemaCatalog(s), all empty: 'dice', unnamed (2), 'rag'; nothing to apply. " +
                'Catalogs are read once, when the SchemaManager is built; schema known later is given to SchemaManager.ensure.'
        ]);
    });

    it('should say it on every way in: enforce, recreateAll and the startup run', async () => {
        const schema: SchemaOptions = { catalogs: [SchemaCatalog.of().named('dice')] };
        const subject = manager(schema.catalogs);
        await subject.enforce();
        await subject.recreateAll();
        const startup = new DrivineModuleBuilder({ connectionProviders: [], schema })
            .schemaProviders()
            .find((it: any) => it.provide === SCHEMA_ENFORCED) as any;
        expect(await startup.useFactory(subject)).toBe(true);

        expect(lines()).toHaveLength(3);
        lines().forEach((it) => expect(it).toContain("all empty: 'dice'; nothing to apply"));
    });
});
