import {
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    quoteName
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person', 'Odd Label'] })
class Person {
    @NodeId() uuid: string;
}

@NodeFragment({ labels: ['Thing'] })
class Thing {}

describe('CypherBackend', () => {
    const registry = new ModelRegistry();
    const backend = new CypherBackend(NEO4J_GRAMMAR);

    it('should load every node of a fragment, quoting labels that need it', () => {
        expect(backend.loadAllFragments(registry.fragment(Person)).text).toEqual(
            'MATCH (n:Person:`Odd Label`)\nRETURN {props: properties(n), labels: labels(n)} AS result'
        );
    });

    it('should load by id', () => {
        expect(backend.loadFragment(registry.fragment(Person)).text).toEqual(
            'MATCH (n:Person:`Odd Label`)\nWHERE n.uuid = $id\nRETURN {props: properties(n), labels: labels(n)} AS result'
        );
    });

    it('should refuse to load by id a fragment without one', () => {
        expect(() => backend.loadFragment(registry.fragment(Thing))).toThrow(/Thing has no @NodeId property/);
    });

    it('should count', () => {
        expect(backend.countFragments(registry.fragment(Thing), 'n.x > 1').text).toEqual(
            'MATCH (n:Thing)\nWHERE n.x > 1\nRETURN count(n) AS count'
        );
    });

    it('should quote names', () => {
        expect(quoteName('plain_1')).toEqual('plain_1');
        expect(quoteName('two words')).toEqual('`two words`');
        expect(quoteName('a`b')).toEqual('`a``b`');
        expect(quoteName('1st')).toEqual('`1st`');
    });

    it('should have a grammar for each graph engine, and none for Postgres', () => {
        expect(cypherGrammarFor(DatabaseType.MEMGRAPH).engine).toEqual('Memgraph');
        expect(() => cypherGrammarFor(DatabaseType.POSTGRES)).toThrow(/POSTGRES does not have a Cypher grammar/);
    });
});
