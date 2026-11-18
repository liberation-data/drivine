import {
    CypherBackend,
    Direction,
    FALKORDB_GRAMMAR,
    GraphPath,
    GraphRelationship,
    GraphView,
    hop,
    MEMGRAPH_GRAMMAR,
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

    it('should sort the rows in a CALL before collecting the nodes on Neo4j, nulls last', () => {
        expect(new CypherBackend(NEO4J_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE EXISTS { MATCH (n)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(:Director) }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[:ACTED_IN]->(h1:Movie)-[:DIRECTED_BY]->(t1:Director) ' +
                'WITH n, t1, h1 ORDER BY h1.year IS NULL, h1.year ASC WITH collect(DISTINCT t1) AS s1 ' +
                'RETURN [x1 IN s1 | {props: properties(x1), labels: labels(x1)}] AS v1 }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)<-[:DIRECTED]-(t2:Movie) ' +
                'WITH n, t2 ORDER BY t2.`release year` IS NULL, t2.`release year` DESC WITH collect(DISTINCT t2) AS s2 ' +
                'RETURN head([x2 IN s2 | {props: properties(x2), labels: labels(x2)}]) AS v2 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {directors: v1, latest: v2}} AS result'
        );
    });

    it('should sort the rows in a CALL before collecting the nodes on Memgraph, as on Neo4j', () => {
        expect(new CypherBackend(MEMGRAPH_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'WHERE EXISTS { MATCH (n)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(:Director) }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[:ACTED_IN]->(h1:Movie)-[:DIRECTED_BY]->(t1:Director) ' +
                'WITH n, t1, h1 ORDER BY h1.year IS NULL, h1.year ASC WITH collect(DISTINCT t1) AS s1 ' +
                'RETURN [x1 IN s1 | {props: properties(x1), labels: labels(x1)}] AS v1 }\n' +
                'CALL { WITH n OPTIONAL MATCH (n)<-[:DIRECTED]-(t2:Movie) ' +
                'WITH n, t2 ORDER BY t2.`release year` IS NULL, t2.`release year` DESC WITH collect(DISTINCT t2) AS s2 ' +
                'RETURN head([x2 IN s2 | {props: properties(x2), labels: labels(x2)}]) AS v2 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {directors: v1, latest: v2}} AS result'
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

@GraphView()
class Acquaintance {
    @Root() person: Person;
    @GraphRelationship({ type: 'KNOWS', target: () => Filmography }) friends: Filmography[];
    @GraphRelationship({ type: 'LIVES_IN' }) city?: City;
}

describe('A view nested with an ordered path', () => {
    const model = new ModelRegistry().view(Acquaintance);

    it('should read the relationship to it in a CALL on Neo4j, and the others as comprehensions', () => {
        expect(new CypherBackend(NEO4J_GRAMMAR).loadAllViews(model).text).toEqual(
            'MATCH (n:Person)\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[r1:KNOWS]->(t1:Person) ' +
                'WHERE EXISTS { MATCH (t1)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(:Director) } ' +
                'CALL { WITH t1 OPTIONAL MATCH (t1)-[:ACTED_IN]->(h2:Movie)-[:DIRECTED_BY]->(t2:Director) ' +
                'WITH t1, t2, h2 ORDER BY h2.year IS NULL, h2.year ASC WITH collect(DISTINCT t2) AS s2 ' +
                'RETURN [x2 IN s2 | {props: properties(x2), labels: labels(x2)}] AS v2 } ' +
                'CALL { WITH t1 OPTIONAL MATCH (t1)<-[:DIRECTED]-(t3:Movie) ' +
                'WITH t1, t3 ORDER BY t3.`release year` IS NULL, t3.`release year` DESC WITH collect(DISTINCT t3) AS s3 ' +
                'RETURN head([x3 IN s3 | {props: properties(x3), labels: labels(x3)}]) AS v3 } ' +
                'RETURN collect(CASE WHEN t1 IS NOT NULL THEN {root: {props: properties(t1), labels: labels(t1)}, ' +
                'rels: {directors: v2, latest: v3}} END) AS v1 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {friends: v1, ' +
                'city: head([(n)-[r4:LIVES_IN]->(t4:City) | {props: properties(t4), labels: labels(t4)}])}} AS result'
        );
    });
});

@GraphView()
class Partner {
    @Root() person: Person;
    @GraphRelationship({ type: 'MARRIED_TO', target: () => Filmography }) spouse?: Filmography;
}

describe('A single relationship to a view with an ordered path', () => {
    const model = new ModelRegistry().view(Partner);

    it('should read its first target in a CALL on Memgraph, and page the roots after', () => {
        expect(
            new CypherBackend(MEMGRAPH_GRAMMAR).loadAllViews(
                model,
                undefined,
                {},
                { orderBy: 'n.uuid', skip: 1, limit: 2 }
            ).text
        ).toEqual(
            'MATCH (n:Person)\n' +
                'CALL { WITH n OPTIONAL MATCH (n)-[r1:MARRIED_TO]->(t1:Person) ' +
                'WHERE EXISTS { MATCH (t1)-[:ACTED_IN]->(:Movie)-[:DIRECTED_BY]->(:Director) } ' +
                'CALL { WITH t1 OPTIONAL MATCH (t1)-[:ACTED_IN]->(h2:Movie)-[:DIRECTED_BY]->(t2:Director) ' +
                'WITH t1, t2, h2 ORDER BY h2.year IS NULL, h2.year ASC WITH collect(DISTINCT t2) AS s2 ' +
                'RETURN [x2 IN s2 | {props: properties(x2), labels: labels(x2)}] AS v2 } ' +
                'CALL { WITH t1 OPTIONAL MATCH (t1)<-[:DIRECTED]-(t3:Movie) ' +
                'WITH t1, t3 ORDER BY t3.`release year` IS NULL, t3.`release year` DESC WITH collect(DISTINCT t3) AS s3 ' +
                'RETURN head([x3 IN s3 | {props: properties(x3), labels: labels(x3)}]) AS v3 } ' +
                'RETURN head(collect(CASE WHEN t1 IS NOT NULL THEN {root: {props: properties(t1), labels: labels(t1)}, ' +
                'rels: {directors: v2, latest: v3}} END)) AS v1 }\n' +
                'RETURN {root: {props: properties(n), labels: labels(n)}, rels: {spouse: v1}} AS result\n' +
                'ORDER BY n.uuid\nSKIP 1\nLIMIT 2'
        );
    });
});
