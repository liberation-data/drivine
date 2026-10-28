import {
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    inDrivineContext,
    NodeFragment,
    NodeId,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    Transactional
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines } from '../support/GraphEngines';

@NodeFragment({ labels: ['NestlessPerson'] })
class Person {
    @NodeId() uuid: string;
    name: string;
}

// The guide's "Without Nest" (docs/03-quick-start.md): factories made by hand, and @Transactional with no module and no middleware.
describe.each(graphEngines())('Drivine without Nest on $type', (engine) => {
    let gom: StatelessGraphObjectManager;

    class PersonService {
        @Transactional()
        async hire(...names: string[]): Promise<void> {
            await gom.saveAll(names.map((name) => Object.assign(new Person(), { uuid: `nestless-${name}`, name })));
        }

        @Transactional()
        async hireThenFail(name: string): Promise<void> {
            await this.hire(name);
            throw new Error('Changed our minds');
        }
    }

    class Onboarding {
        constructor(
            readonly people: PersonService = new PersonService(),
            readonly mentors: PersonService = new PersonService()
        ) {}

        @Transactional()
        async onboard(name: string, mentor: string): Promise<void> {
            await this.people.hire(name);
            await this.mentors.hire(mentor);
            throw new Error('Changed our minds');
        }
    }

    const service = new PersonService();
    // FalkorDB commits each statement by itself, so there is nothing to roll back.
    const itRollsBack = engine.type === DatabaseType.FALKORDB ? it.skip : it;
    const names = async (): Promise<string[]> => (await gom.loadAll(Person)).map((it) => it.name).sort();

    beforeAll(() => {
        DatabaseRegistry.buildOrResolveFromEnv(engine.name === 'default' ? undefined : engine.name);
        gom = new GraphObjectManagerFactory(new PersistenceManagerFactory()).get(engine.name);
    });

    beforeEach(async () => {
        await gom.persistenceManager.execute(new QuerySpecification('MATCH (n:NestlessPerson) DETACH DELETE n'));
    });

    afterAll(async () => {
        await gom.persistenceManager.execute(new QuerySpecification('MATCH (n:NestlessPerson) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should commit a @Transactional method called with no context', async () => {
        await service.hire('Ada', 'Grace');
        expect(await names()).toEqual(['Ada', 'Grace']);
    });

    itRollsBack('should roll back a @Transactional method called with no context when it throws', async () => {
        await expect(service.hireThenFail('Ada')).rejects.toThrow('Changed our minds');
        expect(await names()).toEqual([]);
    });

    itRollsBack('should join one transaction across classes, through the awaits, and roll it all back', async () => {
        await expect(new Onboarding().onboard('Ada', 'Grace')).rejects.toThrow('Changed our minds');
        expect(await names()).toEqual([]);
    });

    itRollsBack('should run a block in a transaction of its own', async () => {
        await expect(
            inDrivineContext()
                .withTransaction()
                .run(async () => {
                    await service.hire('Ada');
                    await service.hire('Grace');
                    throw new Error('Changed our minds');
                })
        ).rejects.toThrow('Changed our minds');
        expect(await names()).toEqual([]);
    });
});
