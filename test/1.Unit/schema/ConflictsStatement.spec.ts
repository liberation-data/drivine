import {
    DatabaseType,
    FALKORDB_SCHEMA,
    MEMGRAPH_SCHEMA,
    NEO4J_SCHEMA,
    schemaGrammarFor,
    uniquenessConstraint
} from '@liberation-data/drivine';

/** The statement that samples a uniqueness constraint's violation names the nodes holding each key. */
describe('The statement sampling the keys a constraint would refuse', () => {
    const named = uniquenessConstraint('Person', 'email', { nodeIdProperty: 'uuid' });
    const quoted = uniquenessConstraint('Person', 'email', { nodeIdProperty: "node's id" });
    const keyed = uniquenessConstraint('Person', ['email', 'uuid'], { nodeIdProperty: 'uuid' });

    it("should name each node by Neo4j's elementId and the node id, a slice of them per key", () => {
        expect(NEO4J_SCHEMA.conflicts(named, 3)).toEqual(
            'MATCH (n:Person) WHERE n.email IS NOT NULL WITH n.email AS _k0, count(*) AS holders, ' +
                'collect({elementId: elementId(n), uuid: n.uuid}) AS held WHERE holders > 1 ' +
                'RETURN {properties: {email: _k0}, count: holders, nodes: held[0..3]} LIMIT 3'
        );
    });

    it('should quote a node id that needs it, and leave it out when it is a key', () => {
        expect(NEO4J_SCHEMA.conflicts(quoted, 3)).toContain(
            "collect({elementId: elementId(n), `node's id`: n.`node's id`})"
        );
        expect(NEO4J_SCHEMA.conflicts(keyed, 3)).toContain('collect({elementId: elementId(n)}) AS held');
        expect(NEO4J_SCHEMA.conflicts(keyed, 3)).toContain('{properties: {email: _k0, uuid: _k1}');
        expect(NEO4J_SCHEMA.conflicts(uniquenessConstraint('Person', 'email'), 3)).toContain(
            'collect({elementId: elementId(n)}) AS held'
        );
    });

    it('should name each node by id(n) on Memgraph and FalkorDB, which have no elementId', () => {
        for (const grammar of [MEMGRAPH_SCHEMA, FALKORDB_SCHEMA]) {
            expect(grammar.conflicts(named, 3)).toContain('collect({elementId: id(n), uuid: n.uuid}) AS held');
        }
    });

    it('should number each node within its key on Oracle, naming it by its nid', () => {
        expect(schemaGrammarFor(DatabaseType.ORACLE).conflicts(named, 3)).toEqual(
            `SELECT JSON_OBJECT('properties' VALUE JSON_OBJECT('email' VALUE k0), 'count' VALUE MAX(c), 'nodes' VALUE ` +
                `JSON_ARRAYAGG(JSON_OBJECT('elementId' VALUE nid, 'uuid' VALUE i) ORDER BY nid) RETURNING JSON) AS "value" ` +
                `FROM (SELECT n.nid, JSON_VALUE(n.props, '$."email"') AS k0, JSON_VALUE(n.props, '$."uuid"') AS i, ` +
                `COUNT(*) OVER (PARTITION BY JSON_VALUE(n.props, '$."email"')) AS c, ` +
                `ROW_NUMBER() OVER (PARTITION BY JSON_VALUE(n.props, '$."email"') ORDER BY n.nid) AS r ` +
                `FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "Person")') AND ` +
                `JSON_VALUE(n.props, '$."email"') IS NOT NULL) WHERE c > 1 AND r <= 3 GROUP BY k0 FETCH FIRST 3 ROWS ONLY`
        );
        expect(schemaGrammarFor(DatabaseType.ORACLE).conflicts(keyed, 3)).toContain(
            "JSON_OBJECT('elementId' VALUE nid) ORDER BY nid"
        );
        expect(schemaGrammarFor(DatabaseType.ORACLE).conflicts(quoted, 3)).toContain(`'node''s id' VALUE i`);
    });

    it('should slice the nodes of each key on Postgres, naming them by their nid', () => {
        expect(schemaGrammarFor(DatabaseType.POSTGRES).conflicts(named, 3)).toEqual(
            `SELECT jsonb_build_object('properties', jsonb_build_object('email', (n.props ->> 'email')), 'count', COUNT(*), ` +
                `'nodes', to_jsonb((array_agg(jsonb_build_object('elementId', n.nid, 'uuid', (n.props ->> 'uuid')) ` +
                `ORDER BY n.nid))[1:3])) AS "value" FROM drivine_node n WHERE n.labels @> '["Person"]' AND ` +
                `(n.props ->> 'email') IS NOT NULL GROUP BY (n.props ->> 'email') HAVING COUNT(*) > 1 LIMIT 3`
        );
        expect(schemaGrammarFor(DatabaseType.POSTGRES).conflicts(quoted, 3)).toContain(
            `'node''s id', (n.props ->> 'node''s id')`
        );
    });
});
