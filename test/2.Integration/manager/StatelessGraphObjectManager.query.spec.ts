import {
    allOf,
    anyOf,
    CypherBackend,
    cypherGrammarFor,
    GraphProperty,
    GraphRelationship,
    GraphTransient,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    not,
    PersistenceManager,
    PropertyBag,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['QueryTest', 'Issue'] })
class Issue {
    @NodeId() id: string;
    title: string;
    state: 'open' | 'closed';
    @GraphProperty('issue_no') number: number;
    priority?: number;
    tags?: string[];
    @PropertyBag() metadata: Record<string, string> = {};
    @GraphTransient() scratch?: string;
}

@NodeFragment({ labels: ['Bug'] })
class Bug extends Issue {}

@NodeFragment({ labels: ['QueryTest', 'Person'] })
class Person {
    @NodeId() id: string;
    name: string;
}

@NodeFragment({ labels: ['QueryTest', 'Org'] })
class Org {
    @NodeId() id: string;
    name: string;
}

@NodeFragment({ labels: ['QueryTest', 'Comment'] })
class Comment {
    @NodeId() id: string;
    body: string;
    @GraphProperty('up_votes') upVotes: number;
}

@RelationshipFragment()
class Assignment {
    role: string;
    @GraphProperty('since_year') since: number;
    @TargetNode() person: Person;
}

@GraphView()
class Reporter {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR' })
    worksFor?: Org;
}

@GraphView()
class IssueView {
    @Root() issue: Issue;

    @GraphRelationship({ type: 'ASSIGNED_TO', target: () => Assignment })
    assignees: Assignment[];

    @GraphRelationship({ type: 'HAS_COMMENT', target: () => Comment })
    comments: Comment[];

    @GraphRelationship({ type: 'RAISED_BY', target: () => Reporter })
    raisedBy?: Reporter;
}

const ids = (items: { id: string }[]): string[] => items.map((it) => it.id).sort();
const viewIds = (items: IssueView[]): string[] => items.map((it) => it.issue.id).sort();

describe.each(graphEngines())('query DSL on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await pm.execute(new QuerySpecification('MATCH (n:QueryTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (i1:QueryTest:Issue {id: 'i1', title: 'Crash on start', state: 'open', issue_no: 101, " +
                    "priority: 1, tags: ['crash', 'ui'], `metadata.source`: 'github'}), " +
                    "(i2:QueryTest:Issue:Bug {id: 'i2', title: 'Slow search', state: 'open', issue_no: 102, priority: 3, " +
                    "tags: ['perf'], `metadata.source`: 'jira'}), " +
                    "(i3:QueryTest:Issue {id: 'i3', title: 'Typo in docs', state: 'closed', issue_no: 103}), " +
                    "(i4:QueryTest:Issue:Bug {id: 'i4', title: 'CRASH when saving', state: 'closed', issue_no: 104, " +
                    'priority: 2}), ' +
                    "(kent:QueryTest:Person {id: 'kent', name: 'Kent'}), (ada:QueryTest:Person {id: 'ada', name: 'Ada'}), " +
                    "(acme:QueryTest:Org {id: 'acme', name: 'Acme'}), (kent)-[:WORKS_FOR]->(acme), " +
                    "(i1)-[:ASSIGNED_TO {role: 'lead', since_year: 2020}]->(kent), " +
                    "(i1)-[:ASSIGNED_TO {role: 'reviewer', since_year: 2024}]->(ada), " +
                    "(i2)-[:ASSIGNED_TO {role: 'reviewer', since_year: 2021}]->(kent), " +
                    "(i3)-[:ASSIGNED_TO {role: 'lead', since_year: 2022}]->(ada), " +
                    "(i1)-[:HAS_COMMENT]->(:QueryTest:Comment {id: 'c1', body: 'Seen it too', up_votes: 5}), " +
                    "(i2)-[:HAS_COMMENT]->(:QueryTest:Comment {id: 'c2', body: 'Fixed in main', up_votes: 1}), " +
                    '(i1)-[:RAISED_BY]->(kent), (i3)-[:RAISED_BY]->(ada)'
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:QueryTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    describe('on a fragment', () => {
        it('should compare properties, under their graph names', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.state.eq('open') })))).toEqual(['i1', 'i2']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.state.neq('open') })))).toEqual(['i3', 'i4']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.number.gt(102) })))).toEqual(['i3', 'i4']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.number.lte(102) })))).toEqual(['i1', 'i2']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.number.in([101, 104]) })))).toEqual(['i1', 'i4']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.id.notIn(['i1', 'i2']) })))).toEqual(['i3', 'i4']);
        });

        it('should match text', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.contains('Crash') })))).toEqual(['i1']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.containsIgnoreCase('crash') })))).toEqual([
                'i1',
                'i4'
            ]);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.startsWith('Slow') })))).toEqual(['i2']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.endsWith('docs') })))).toEqual(['i3']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.eqIgnoreCase('typo IN docs') })))).toEqual([
                'i3'
            ]);
        });

        it('should match a regular expression', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.title.matches('.*(Crash|CRASH).*') })))).toEqual([
                'i1',
                'i4'
            ]);
        });

        it('should test for no value, and for an item of a list', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.priority.isNull() })))).toEqual(['i3']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.tags.isNotNull() })))).toEqual(['i1', 'i2']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.tags.hasItem('perf') })))).toEqual(['i2']);
        });

        it('should test an entry of a property bag', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.metadata.source.eq('jira') })))).toEqual(['i2']);
        });

        it('should compose with AND, anyOf and not', async () => {
            const both = await gom.loadAll(Issue, (q) => ({ where: [q.state.eq('open'), q.priority.gt(1)] }));
            expect(ids(both)).toEqual(['i2']);
            const either = await gom.loadAll(Issue, (q) => ({
                where: anyOf(q.priority.eq(1), allOf(q.state.eq('closed'), q.priority.isNull()))
            }));
            expect(ids(either)).toEqual(['i1', 'i3']);
            const neither = await gom.loadAll(Issue, (q) => ({ where: not(anyOf(q.id.eq('i1'), q.id.eq('i2'))) }));
            expect(ids(neither)).toEqual(['i3', 'i4']);
        });

        it('should test the class of the root', async () => {
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: q.instanceOf(Bug) })))).toEqual(['i2', 'i4']);
            expect(ids(await gom.loadAll(Issue, (q) => ({ where: not(q.instanceOf(Bug)) })))).toEqual(['i1', 'i3']);
        });

        it('should order, skip and limit', async () => {
            const byNumber = await gom.loadAll(Issue, (q) => ({ orderBy: q.number.desc() }));
            expect(byNumber.map((it) => it.id)).toEqual(['i4', 'i3', 'i2', 'i1']);
            const page = await gom.loadAll(Issue, (q) => ({ orderBy: q.number.asc(), skip: 1, limit: 2 }));
            expect(page.map((it) => it.id)).toEqual(['i2', 'i3']);
            const twoKeys = await gom.loadAll(Issue, (q) => ({ orderBy: [q.state.desc(), q.number.desc()] }));
            expect(twoKeys.map((it) => it.id)).toEqual(['i2', 'i1', 'i4', 'i3']);
        });

        it('should place the rows with no value', async () => {
            const first = await gom.loadAll(Issue, (q) => ({ orderBy: q.priority.asc().nullsFirst() }));
            expect(first.map((it) => it.id)).toEqual(['i3', 'i1', 'i4', 'i2']);
            const last = await gom.loadAll(Issue, (q) => ({ orderBy: q.priority.desc().nullsLast() }));
            expect(last.map((it) => it.id)).toEqual(['i2', 'i4', 'i1', 'i3']);
        });

        it('should count and delete what a query finds', async () => {
            expect(await gom.count(Issue, (q) => ({ where: q.state.eq('open') }))).toBe(2);
            expect(await gom.count(Comment, (q) => ({ where: q.upVotes.gte(5) }))).toBe(1);
            await pm.execute(new QuerySpecification("CREATE (:QueryTest:Issue {id: 'gone', title: 'x', state: 'x'})"));
            expect(await gom.deleteAll(Issue, (q) => ({ where: q.state.eq('x' as any) }))).toBe(1);
            expect(await gom.count(Issue)).toBe(4);
        });

        it('should refuse an order or limit on a count', async () => {
            await expect(gom.count(Issue, (_q) => ({ limit: 1 }))).rejects.toThrow(/not an order, skip or limit/);
        });

        it('should refuse fields it cannot query, naming them', async () => {
            await expect(gom.loadAll(Issue, (q) => ({ where: q.scratch.eq('x') }))).rejects.toThrow(
                /Issue.scratch is transient/
            );
            await expect(gom.loadAll(Issue, (q) => ({ where: q.state.eq(null as any) }))).rejects.toThrow(
                /use isNull\(\)/
            );
            await expect(gom.loadAll(Issue, (_q) => ({ limit: 1.5 }))).rejects.toThrow(/whole number/);
        });
    });

    describe('on a view', () => {
        it('should filter and order by the root', async () => {
            const open = await gom.loadAll(IssueView, (q) => ({
                where: q.issue.state.eq('open'),
                orderBy: q.issue.number.desc()
            }));
            expect(open.map((it) => it.issue.id)).toEqual(['i2', 'i1']);
            expect(open[1].assignees).toHaveLength(2);
        });

        it('should test the nodes a relationship leads to', async () => {
            const commented = await gom.loadAll(IssueView, (q) => ({ where: q.comments.body.contains('Fixed') }));
            expect(viewIds(commented)).toEqual(['i2']);
            const popular = await gom.loadAll(IssueView, (q) => ({ where: q.comments.upVotes.gt(3) }));
            expect(viewIds(popular)).toEqual(['i1']);
        });

        it("should test a relationship fragment's properties and its target", async () => {
            const leads = await gom.loadAll(IssueView, (q) => ({ where: q.assignees.role.eq('lead') }));
            expect(viewIds(leads)).toEqual(['i1', 'i3']);
            const kent = await gom.loadAll(IssueView, (q) => ({ where: q.assignees.person.name.eq('Kent') }));
            expect(viewIds(kent)).toEqual(['i1', 'i2']);
            const recent = await gom.loadAll(IssueView, (q) => ({ where: q.assignees.since.gte(2022) }));
            expect(viewIds(recent)).toEqual(['i1', 'i3']);
        });

        it('should hold conditions to one related node with any, and none with none', async () => {
            // Flat conditions may each hold on another node: i1 has a lead (Kent) and an Ada (a reviewer).
            const flat = await gom.loadAll(IssueView, (q) => ({
                where: [q.assignees.role.eq('lead'), q.assignees.person.name.eq('Ada')]
            }));
            expect(viewIds(flat)).toEqual(['i1', 'i3']);
            const together = await gom.loadAll(IssueView, (q) => ({
                where: q.assignees.any((a) => [a.role.eq('lead'), a.person.name.eq('Ada')])
            }));
            expect(viewIds(together)).toEqual(['i3']);
            const noLead = await gom.loadAll(IssueView, (q) => ({ where: q.assignees.none((a) => a.role.eq('lead')) }));
            expect(viewIds(noLead)).toEqual(['i2', 'i4']);
        });

        it("should follow a nested view's relationships", async () => {
            const acme = await gom.loadAll(IssueView, (q) => ({ where: q.raisedBy.worksFor.name.eq('Acme') }));
            expect(viewIds(acme)).toEqual(['i1']);
            const byAda = await gom.loadAll(IssueView, (q) => ({ where: q.raisedBy.person.name.eq('Ada') }));
            expect(viewIds(byAda)).toEqual(['i3']);
        });

        it('should test the class of a related node and of the root', async () => {
            const bugs = await gom.loadAll(IssueView, (q) => ({
                where: q.issue.instanceOf(Bug),
                orderBy: q.issue.id.asc()
            }));
            expect(bugs.map((it) => it.issue.id)).toEqual(['i2', 'i4']);
            expect(bugs[0].issue).toBeInstanceOf(Bug);
        });

        it('should page roots, keeping their relationships whole', async () => {
            const page = await gom.loadAll(IssueView, (q) => ({ orderBy: q.issue.number.asc(), limit: 1 }));
            expect(page.map((it) => it.issue.id)).toEqual(['i1']);
            expect(page[0].assignees.map((it) => it.person.id).sort()).toEqual(['ada', 'kent']);
        });

        it('should count views a query finds', async () => {
            expect(await gom.count(IssueView, (q) => ({ where: q.assignees.person.name.eq('Ada') }))).toBe(2);
        });

        it('should refuse an order by a relationship', async () => {
            await expect(gom.loadAll(IssueView, (q) => ({ orderBy: q.comments.upVotes.desc() }))).rejects.toThrow(
                /a property of the root/
            );
            await expect(gom.loadAll(IssueView, (q) => ({ where: (q.issue as any).any(() => []) }))).rejects.toThrow(
                /issue is not one/
            );
        });
    });
});
