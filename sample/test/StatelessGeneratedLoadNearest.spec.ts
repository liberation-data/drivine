import { DatabaseType, QuerySpecification, SchemaCatalog, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { RaisedAndAssignedIssue, SampleDocNode, SampleVectorView } from '../src';
import { seedIssue } from './support/IssueWorld';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's GeneratedLoadNearestTest, which checks that its code generator writes loadNearest for a view whose root
 * has a vector index, with searchK, and none for other views, and count for every view. TypeScript has no generator:
 * here the searches are the test.
 */
describe.each(sampleStores())('loadNearest on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;

    const doc = (id: string, embedding: number[]): SampleDocNode =>
        Object.assign(new SampleDocNode(), { id, title: id, embedding });

    beforeAll(async () => {
        sample = await startSample(engine, {
            schema: { catalogs: [SchemaCatalog.fromFragments(() => 3, SampleDocNode).forDatabase(engine.name)] }
        });
        gom = sample.gom;
        await sample.clear();
        if (engine.type === DatabaseType.MEMGRAPH) {
            // Memgraph's vector search returns nodes deleted since its last garbage collection, and fails on them.
            await sample.pm.execute(new QuerySpecification('FREE MEMORY'));
        }
        await gom.saveAll([doc('north', [1, 0, 0]), doc('north-east', [0.8, 0.6, 0]), doc('up', [0, 0, 1])]);
        if (engine.type === DatabaseType.NEO4J) {
            await sample.pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    it('should search a view by its root’s vector index, with searchK widening the search', async () => {
        // Vector indexes are approximate: asked for one hit only, Neo4j's can return the second nearest.
        const [nearest] = await gom.loadNearest(SampleVectorView, [1, 0.1, 0], { topK: 1, searchK: 3 });
        expect(nearest.value).toBeInstanceOf(SampleVectorView);
        expect(nearest.value.doc.id).toEqual('north');
        const close = await gom.loadNearest(SampleVectorView, [1, 0.1, 0], { topK: 2, searchK: 3, threshold: 0.9 });
        expect(close.map((it) => it.value.doc.id)).toEqual(['north', 'north-east']);
    });

    it('should refuse a view whose root has no vector index', async () => {
        await expect(gom.loadNearest(RaisedAndAssignedIssue, [1, 0, 0], { topK: 1 })).rejects.toThrow(/VectorIndex/);
    });

    it('should count any view', async () => {
        expect(await gom.count(SampleVectorView)).toEqual(3);
        await seedIssue(gom, { id: 1, title: 'Counted', body: 'b', person: 'Ada', bio: 'bio', org: 'Acme' });
        expect(await gom.count(RaisedAndAssignedIssue)).toEqual(1);
    });
});
