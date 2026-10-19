import {
    CypherBackend,
    Direction,
    FALKORDB_GRAMMAR,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    Root
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() uuid: string;
}

@NodeFragment({ labels: ['City'] })
class City {}

@GraphView()
class Resident {
    @Root() person: Person;
    @GraphRelationship({ type: 'LIVES_IN', required: true }) city: City;
    @GraphRelationship({ type: 'KNOWS', direction: Direction.INCOMING, target: () => Person }) knownBy: Person[];
}

describe('View statements', () => {
    const model = new ModelRegistry().view(Resident);

    it('should project each relationship as a pattern comprehension, and require required ones', () => {
        expect(new CypherBackend(NEO4J_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE EXISTS { MATCH (n)-[:LIVES_IN]->(:City) }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {' +
                'city: head([(n)-[r1:LIVES_IN]->(t1:City) | {props: properties(t1), labels: labels(t1)}]), ' +
                'knownBy: [(n)<-[r2:KNOWS]-(t2:Person) | {props: properties(t2), labels: labels(t2)}]}} AS result'
        );
    });

    it('should project each relationship in a CALL subquery on FalkorDB', () => {
        expect(new CypherBackend(FALKORDB_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE size([(n)-[:LIVES_IN]->(:City) | 1]) > 0\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[r1:LIVES_IN]->(t1:City) RETURN head(collect(CASE WHEN t1 IS NOT NULL ' +
                'THEN {props: properties(t1), labels: labels(t1)} END)) AS v1 }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)<-[r2:KNOWS]-(t2:Person) RETURN collect(CASE WHEN t2 IS NOT NULL ' +
                'THEN {props: properties(t2), labels: labels(t2)} END) AS v2 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {city: v1, knownBy: v2}} AS result'
        );
    });

    it('should check existence the way the engine can', () => {
        expect(new CypherBackend(FALKORDB_GRAMMAR).countViews(model, 'n.uuid = $id').text).toEqual(
            'MATCH (n:Person)\nWHERE (n.uuid = $id) AND size([(n)-[:LIVES_IN]->(:City) | 1]) > 0\nRETURN count(n) AS count'
        );
    });
});
