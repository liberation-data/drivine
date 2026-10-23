import {
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    DrivineError,
    FALKORDB_GRAMMAR,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    quoteName
} from '@liberation-data/drivine';
import { error, Neo4jError } from 'neo4j-driver';

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

    describe('contended', () => {
        const bolt = (code: string): Neo4jError => new Neo4jError(code, code);

        it('should take a transient error over Bolt as contention, however deep it is wrapped', () => {
            expect(backend.contended(bolt('Neo.TransientError.Transaction.DeadlockDetected'))).toBe(true);
            expect(backend.contended(bolt('Neo.TransientError.Transaction.LockAcquisitionTimeout'))).toBe(true);
            expect(backend.contended(DrivineError.withRootCause(bolt('Neo.TransientError.General.Unknown')))).toBe(
                true
            );
            const memgraph = new CypherBackend(MEMGRAPH_GRAMMAR);
            expect(memgraph.contended(bolt('Memgraph.TransientError.MemgraphError.MemgraphError'))).toBe(true);
        });

        it('should not run again a save that lost its connection, though the driver calls it retriable', () => {
            for (const code of [
                error.SERVICE_UNAVAILABLE,
                error.SESSION_EXPIRED,
                'Neo.ClientError.Security.AuthorizationExpired'
            ]) {
                expect(Neo4jError.isRetriable(bolt(code))).toBe(true);
                expect(backend.contended(bolt(code))).toBe(false);
                expect(backend.contended(DrivineError.withRootCause(bolt(code)))).toBe(false);
            }
        });

        it('should not take a terminated transaction, a client error or an error of another kind as contention', () => {
            expect(backend.contended(bolt('Neo.TransientError.Transaction.Terminated'))).toBe(false);
            expect(backend.contended(bolt('Neo.TransientError.Transaction.LockClientStopped'))).toBe(false);
            expect(backend.contended(bolt('Neo.ClientError.Schema.ConstraintValidationFailed'))).toBe(false);
            expect(backend.contended(new Error('Neo.TransientError.Transaction.DeadlockDetected'))).toBe(false);
            expect(backend.contended(undefined)).toBe(false);
        });

        it('should take FalkorDB turning a write away while another is in progress as contention', () => {
            const falkor = new CypherBackend(FALKORDB_GRAMMAR);
            expect(falkor.contended(new Error('ERR another write is in progress'))).toBe(true);
            expect(falkor.contended(new Error('Connection is closed.'))).toBe(false);
        });
    });
});
