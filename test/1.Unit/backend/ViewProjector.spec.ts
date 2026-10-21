import {
    CypherBackend,
    Direction,
    FALKORDB_GRAMMAR,
    GraphPath,
    GraphRelationship,
    GraphView,
    hop,
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

@NodeFragment({ labels: ['Director'] })
class Director {}

@NodeFragment({ labels: ['Movie'] })
class Movie {}

@GraphView()
class Filmography {
    @Root() person: Person;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year'), hop('DIRECTED_BY')], {
        target: () => Director,
        required: true
    })
    directors: Director[];
    @GraphPath([hop('DIRECTED', Direction.INCOMING, undefined, 'release year', false)], { target: () => Movie })
    latest?: Movie;
}

describe('Ordered path statements', () => {
    const model = new ModelRegistry().view(Filmography);

    it('should sort the pairs a pattern comprehension reaches, a text first and nulls last', () => {
        expect(new CypherBackend(NEO4J_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE EXISTS { MATCH (n)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(:Director) }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {' +
                'directors: [x1 IN reduce(acc = [], y IN [z1 IN reduce(s1 = [], ' +
                'y1 IN [(n)-[:ACTED_IN]->(h1:Movie)-[:DIRECTED_BY]->(t1:Director) | ' +
                '{k: h1.year, s: toString(h1.year) = h1.year, n: t1}] | ' +
                '[a1 IN s1 WHERE y1.k IS NULL OR (a1.k IS NOT NULL AND ((a1.s AND NOT y1.s) ' +
                'OR (a1.s = y1.s AND coalesce(a1.k <= y1.k, false))))] + [y1] + ' +
                '[a1 IN s1 WHERE NOT (y1.k IS NULL OR (a1.k IS NOT NULL AND ((a1.s AND NOT y1.s) ' +
                'OR (a1.s = y1.s AND coalesce(a1.k <= y1.k, false)))))]) | z1.n] | ' +
                'CASE WHEN y IN acc THEN acc ELSE acc + y END) | {props: properties(x1), labels: labels(x1)}], ' +
                'latest: head([x2 IN reduce(acc = [], y IN [z2 IN reduce(s2 = [], ' +
                'y2 IN [(n)<-[:DIRECTED]-(t2:Movie) | ' +
                '{k: t2.`release year`, s: toString(t2.`release year`) = t2.`release year`, n: t2}] | ' +
                '[a2 IN s2 WHERE y2.k IS NULL OR (a2.k IS NOT NULL AND ((y2.s AND NOT a2.s) ' +
                'OR (a2.s = y2.s AND coalesce(a2.k >= y2.k, false))))] + [y2] + ' +
                '[a2 IN s2 WHERE NOT (y2.k IS NULL OR (a2.k IS NOT NULL AND ((y2.s AND NOT a2.s) ' +
                'OR (a2.s = y2.s AND coalesce(a2.k >= y2.k, false)))))]) | z2.n] | ' +
                'CASE WHEN y IN acc THEN acc ELSE acc + y END) | {props: properties(x2), labels: labels(x2)}])}} AS result'
        );
    });

    it('should sort the rows before collecting them on FalkorDB, nulls last', () => {
        expect(new CypherBackend(FALKORDB_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE any(p1 IN [(n)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(p1) | p1] WHERE p1:Director)\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[:ACTED_IN]->(h1:Movie)-[:DIRECTED_BY]->(t1) ' +
                'WITH n, t1, h1 ORDER BY h1.year IS NULL, h1.year ASC RETURN collect(DISTINCT CASE WHEN t1:Director ' +
                'THEN {props: properties(t1), labels: labels(t1)} END) AS v1 }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)<-[:DIRECTED]-(t2) ' +
                'WITH n, t2 ORDER BY t2.`release year` IS NULL, t2.`release year` DESC RETURN head(collect(DISTINCT CASE WHEN t2:Movie ' +
                'THEN {props: properties(t2), labels: labels(t2)} END)) AS v2 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {directors: v1, latest: v2}} AS result'
        );
    });
});
