import {
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    Root,
    SaveStatementBuilder
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() id: string;
    name?: string;
}

@NodeFragment({ labels: ['Anonymous'] })
class Anonymous {
    name: string;
}

@GraphView()
class Team {
    @Root() lead: Person;
    @GraphRelationship({ type: 'HAS', target: () => Person }) members: Person[];
}

describe('SaveStatementBuilder', () => {
    const registry = new ModelRegistry();
    const fragment = (type: any) => ({ kind: 'NODE_FRAGMENT' as const, model: registry.fragment(type) });
    const view = { kind: 'GRAPH_VIEW' as const, model: registry.view(Team) };
    const person = (id: string) => Object.assign(new Person(), { id });

    it('should merge a fragment on its id and set its properties that are not null', () => {
        const statement = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            fragment(Person),
            Object.assign(new Person(), { id: 'p', name: undefined })
        );
        expect(statement.text).toMatch(/^MERGE \(n:Person \{id: \$root.id\}\) ON CREATE SET/);
        expect(statement.text).toContain('SET n += $root.props');
        expect(statement.text).toMatch(/RETURN {found: _found, now: n.`__drivine.stamp`} AS result$/);
        expect(statement.bindings.root).toEqual({ id: 'p', props: { id: 'p' }, vectors: {} });
        expect(statement.bindings._stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
        expect(statement.expectedStamp).toBeUndefined();
    });

    it('should refuse a node without an id', () => {
        expect(() => new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Person), new Person())).toThrow(/has no id/);
        expect(() => new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Anonymous), new Anonymous())).toThrow(
            /Anonymous has no @NodeId property/
        );
    });

    it('should refuse replace on a fragment, of a field that is not a relationship, or of a missing list', () => {
        const builder = (): SaveStatementBuilder => new SaveStatementBuilder(NEO4J_GRAMMAR);
        expect(() => builder().build(fragment(Person), person('p'), { replace: ['name'] })).toThrow(/is a @NodeFragment/);
        const team = Object.assign(new Team(), { lead: person('l'), members: [] });
        expect(() => builder().build(view, team, { replace: ['lead'] })).toThrow(/not a relationship field/);
        expect(() => builder().build(view, { ...team, members: undefined }, { replace: ['members'] })).toThrow(
            /Give an empty list/
        );
    });

    it('should write the rows of a relationship as a parameter, so the text does not grow with the list', () => {
        const one = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            view,
            Object.assign(new Team(), { lead: person('l'), members: [person('a')] })
        );
        const two = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            view,
            Object.assign(new Team(), { lead: person('l'), members: [person('a'), person('b')] })
        );
        expect(two.text).toEqual(one.text);
        expect(two.bindings.rows1).toEqual([
            { id: 'a', props: { id: 'a' }, vectors: {} },
            { id: 'b', props: { id: 'b' }, vectors: {} }
        ]);
    });
});
