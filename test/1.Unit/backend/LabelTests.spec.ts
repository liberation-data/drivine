import { carriesLabels } from '@/backend/oracle/OracleGraph';
import { hasLabels as postgresHasLabels } from '@/backend/postgres/PostgresGraph';
import { hasLabels as sqliteHasLabels } from '@/backend/sqlite/SqliteGraph';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';

/** The module's `idSql` `hasLabels` of `labels` over the node row `alias` on `store` (drivine-cypher-spec#365). */
function moduleHasLabels(store: string, alias: string, labels: string[]): string {
    const answer = JSON.parse(
        cypherCompilerModule().compile(JSON.stringify({ idSql: { store, helper: 'hasLabels', alias, labels } }))
    );
    expect(answer.error).toBeUndefined();
    return answer.sql;
}

/**
 * The label tests a lookup by a node's id makes beside `hasId` are the module's `hasLabels`, byte for byte: on Postgres
 * and SQLite each label as its partial index's WHERE is written, so the labelled index answers the lookup, and on Oracle
 * each by its text, as the id's index there is no label's. Should the module's form move, this fails, where the lookup
 * would quietly read no labelled index.
 */
describe("A node's label tests, as the shared module's idSql hasLabels writes them", () => {
    const labelSets = [['Person'], ['Person', 'Actor'], ["Pers'on", 'A"b', 'back\\slash', 'café', '日本']];

    it.each(labelSets.map((it) => [it.join(', '), it] as const))('on each SQL store, for %s', (_, labels) => {
        expect(postgresHasLabels('n_', labels)).toEqual(moduleHasLabels('postgres', 'n_', labels));
        expect(sqliteHasLabels('n_', labels)).toEqual(moduleHasLabels('sqlite', 'n_', labels));
        expect(carriesLabels('n_', labels)).toEqual(moduleHasLabels('oracle', 'n_', labels));
    });
});
