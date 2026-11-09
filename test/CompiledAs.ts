import * as Compiled from '@/cypher/CompiledSpecification';
import { CompiledSpecification } from '@/cypher/CompiledSpecification';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * The rows `connection` gives for a Cypher statement compiled to `compiled`, whatever it says of how its rows come back
 * and whether it was given NaN or an infinity (liberation-data/drivine#673). Run through `query`, so as any Cypher
 * statement is.
 */
export async function compiledAs(connection: Connection, compiled: CompiledSpecification<unknown>): Promise<any[]> {
    const spy = jest.spyOn(Compiled, 'compiledSpecification').mockReturnValue(compiled as CompiledSpecification<any>);
    try {
        return await connection.query(new QuerySpecification({ text: 'RETURN 1 AS x', language: 'CYPHER' }));
    } finally {
        spy.mockRestore();
    }
}
