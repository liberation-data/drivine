import { DatabaseType, QuerySpecification, SchemaCatalog, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { RaisedAndAssignedIssue, SampleArticleNode, SampleFullTextView } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's GeneratedLoadMatchingTest, which checks that its code generator writes loadMatching for a view or a
 * fragment with a full-text index, and none for other views. TypeScript has no generator: here the searches are the
 * test.
 */
describe.each(sampleStores())('loadMatching on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;

    const article = (id: string, body: string): SampleArticleNode =>
        Object.assign(new SampleArticleNode(), { id, body });

    beforeAll(async () => {
        sample = await startSample(engine, {
            schema: { catalogs: [SchemaCatalog.fromFragments(undefined, SampleArticleNode).forDatabase(engine.name)] }
        });
        gom = sample.gom;
        await sample.clear();
        await gom.saveAll([
            article('a1', 'graph databases store relationships natively'),
            article('a2', 'graph queries'),
            article('a3', 'relational tables')
        ]);
        if (engine.type === DatabaseType.NEO4J) {
            await sample.pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    it('should search a view by its root’s full-text index', async () => {
        const hits = await gom.loadMatching(SampleFullTextView, 'graph', { topK: 5 });
        expect(hits.map((it) => it.value.article.id).sort()).toEqual(['a1', 'a2']);
        expect(hits[0].value).toBeInstanceOf(SampleFullTextView);
    });

    it('should search a fragment by its full-text index', async () => {
        const hits = await gom.loadMatching(SampleArticleNode, 'relational', { topK: 5 });
        expect(hits.map((it) => it.value.id)).toEqual(['a3']);
        expect(hits[0].value).toBeInstanceOf(SampleArticleNode);
    });

    it('should refuse a view whose root has no full-text index', async () => {
        await expect(gom.loadMatching(RaisedAndAssignedIssue, 'graph', { topK: 1 })).rejects.toThrow(/FullTextIndex/);
    });
});
