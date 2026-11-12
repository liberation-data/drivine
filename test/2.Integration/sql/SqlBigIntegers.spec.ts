import { QuerySpecification, cypherStatement } from '@liberation-data/drivine';
import { cypherSqlStores, sqlPersistenceManager } from '../support/SqlStores';

// A whole number past 2^53 that compiled Cypher gives back keeps its digits, as a bigint, as one bound is given
// (liberation-data/drivine#735): read as a JavaScript number, 9007199254740993 would be 9007199254740992. A whole
// number a number holds exactly stays a number.
// Oracle's driver reads a JSON number through a JavaScript number, so a compiled read there still rounds: left out
// until that is read otherwise.
describe.each(cypherSqlStores().filter((it) => it.name !== 'ORACLE'))('a whole number past 2^53 on $name', (store) => {
    const manager = sqlPersistenceManager(store);
    const cypher = (text: string, parameters: Record<string, unknown> = {}) =>
        new QuerySpecification<any>(cypherStatement(text)).bind(parameters);

    it('is given back with its digits, written, computed or bound', async () => {
        expect(await manager.query(cypher('RETURN 9007199254740993 AS big'))).toEqual([BigInt('9007199254740993')]);
        expect(await manager.query(cypher('RETURN 9007199254740992 + 1 AS big'))).toEqual([BigInt('9007199254740993')]);
        expect(await manager.query(cypher('RETURN $x AS big', { x: BigInt('-9007199254740993') }))).toEqual([
            BigInt('-9007199254740993')
        ]);
    });

    it('keeps its digits in a list and a map', async () => {
        expect(
            await manager.query(cypher('RETURN [9223372036854775807, 1] AS l, {k: -9223372036854775808} AS m'))
        ).toEqual([[[BigInt('9223372036854775807'), 1], { k: BigInt('-9223372036854775808') }]]);
    });

    it('leaves a whole number a number holds exactly a number, and a float a float', async () => {
        expect(await manager.query(cypher('RETURN 9007199254740991 AS n, 2.5 AS f, 1e20 AS e'))).toEqual([
            [9007199254740991, 2.5, 1e20]
        ]);
    });
});
