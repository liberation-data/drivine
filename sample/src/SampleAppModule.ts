import { DynamicModule, Module } from '@nestjs/common';
import {
    DatabaseRegistry,
    GraphObjectManagerFactory,
    PersistenceManager,
    PersistenceManagerFactory,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/nest';

/** The token the sample's persistence manager is injected by: an interface is no token. */
export const SAMPLE_PERSISTENCE_MANAGER = 'SamplePersistenceManager';

/**
 * The sample application, as drivine4j's SampleAppContext wires Spring: Drivine over one database, with that
 * database's object manager and persistence manager injectable by class.
 */
@Module({})
export class SampleAppModule {
    /**
     * The application over the database the environment configures under `name` ('default' for DATABASE_*, else
     * `<name>_DATABASE_*`), with any other of Drivine's options: its schema, how it treats queries.
     */
    static forDatabase(
        name: string = 'default',
        options: Omit<DrivineModuleOptions, 'connectionProviders'> = {}
    ): DynamicModule {
        return {
            module: SampleAppModule,
            imports: [
                DrivineModule.withOptions({
                    ...options,
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv(name === 'default' ? undefined : name)]
                })
            ],
            providers: [
                {
                    provide: StatelessGraphObjectManager,
                    inject: [GraphObjectManagerFactory],
                    useFactory: (factory: GraphObjectManagerFactory): StatelessGraphObjectManager => factory.get(name)
                },
                {
                    provide: SAMPLE_PERSISTENCE_MANAGER,
                    inject: [PersistenceManagerFactory],
                    useFactory: (factory: PersistenceManagerFactory): PersistenceManager =>
                        factory.get(name, 'NON_TRANSACTIONAL')
                }
            ],
            exports: [StatelessGraphObjectManager, SAMPLE_PERSISTENCE_MANAGER]
        };
    }
}
