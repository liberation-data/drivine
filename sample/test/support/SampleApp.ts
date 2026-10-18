import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, PersistenceManager, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { SAMPLE_PERSISTENCE_MANAGER, SampleAppModule } from '../../src';
import { allStores, clearLabels, GraphEngine } from '../../../test/2.Integration/support/GraphEngines';

/** Every label the sample's classes write, which a sample test clears before it seeds. */
const SAMPLE_LABELS = [
    'Person',
    'Organization',
    'Issue',
    'GuideUser',
    'WebUser',
    'ContentElement',
    'OddlyStored',
    'SampleResolver',
    'StampedNote',
    'SampleArticle',
    'SampleDoc'
];

/** The stores the sample runs on: the graph engines, and Oracle when it is configured. */
export const sampleStores = (): GraphEngine[] => allStores();

/** The sample application over one store, as a test drives it. */
export interface SampleApp {
    app: TestingModule;
    gom: StatelessGraphObjectManager;
    pm: PersistenceManager;
    /** Deletes every node of the sample's labels. */
    clear(): Promise<void>;
    close(): Promise<void>;
}

export async function startSample(engine: GraphEngine): Promise<SampleApp> {
    const app = await Test.createTestingModule({ imports: [SampleAppModule.forDatabase(engine.name)] }).compile();
    const pm = app.get<PersistenceManager>(SAMPLE_PERSISTENCE_MANAGER);
    return {
        app,
        gom: app.get(StatelessGraphObjectManager),
        pm,
        clear: async () => clearLabels(pm, engine, ...SAMPLE_LABELS),
        close: async () => {
            await app.close();
            DrivineModule.tearDownStaticData();
        }
    };
}
