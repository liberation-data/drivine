import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { cypherSqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/** The years the stored values are of: from 1000 on, read as they were; after 0 but before 1000, and BC, by their era. */
const YEARS = [9999, 2024, 1000, 999, 1, 0, -1, -44, -4000];

/** A year as ISO 8601 writes it, four digits after its sign: `0000` for 1 BC, `-0044` for 45 BC. */
function iso(year: number): string {
    return (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0');
}

/**
 * A year is numbered as Neo4j and ISO 8601 number it, astronomically, where Postgres and Oracle keep no year 0: `0000`
 * is 1 BC and `-0044` is 45 BC (#511, a port of drivine4j#469). drivine4j's `CypherTemporalCrossEngineTest` cases.
 */
describe.each(stores())('A year before 1 on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await clearLabels(pm, store, 'CyTemporal');
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'CyTemporal');
        await closeGraphEngines();
    });

    it('should be numbered as Neo4j numbers it, made, worked out, written and read', async () => {
        // Postgres and Oracle number a year BC from -1, with no year 0, and wrote 1 BC back as 0001; none read a year before 0.
        expect(
            await query(
                "RETURN [toString(date('0001-01-01') - duration('P1D')), toString(date({year: -44, month: 3, day: 15})), toString(date({year: -1})), " +
                    "toString(date.truncate('millennium', date('0999-12-31'))), toString(date.truncate('millennium', date('-1234-06-01'))), " +
                    "toString(datetime.truncate('century', datetime('0050-06-01T10:00:00Z'))), date('-0044-03-15').year, date('0000-06-01').year, " +
                    "toString(duration.between(date('0000-01-01'), date('0001-01-01'))), date('-0044-03-15') < date('0001-01-01')]"
            )
        ).toEqual([
            [
                '0000-12-31',
                '-0044-03-15',
                '-0001-01-01',
                '0000-01-01',
                '-1000-01-01',
                '0000-01-01T00:00:00Z',
                -44,
                0,
                'P1Y',
                true
            ]
        ]);
        // The ISO week's year, a truncation's own year under fields given, and a truncation to the millisecond, which
        // Oracle writes and reads with its sign.
        expect(
            await query(
                "RETURN [date('-0044-03-15').weekYear, toString(date.truncate('year', date('-0044-03-15'), {day: 2})), " +
                    "toString(datetime.truncate('millisecond', datetime('-0044-03-15T12:00:00.1234Z'))), " +
                    "toString(localdatetime.truncate('decade', localdatetime('-0044-03-15T12:00:00'), {month: 2}))]"
            )
        ).toEqual([[-44, '-0044-01-02', '-0044-03-15T12:00:00.123Z', '-0040-02-01T00:00:00']]);
        // A value made of a parameter's text, written and read back, its kind told by its text.
        await query("CREATE (:CyTemporal {id: 'a', day: date($day), at: datetime('-0044-03-15T12:00:00+02:00')})", {
            day: '-0044-03-15'
        });
        expect(
            await query(
                "MATCH (n:CyTemporal) RETURN [toString(n.day + duration('P1D')), n.day.year, toString(n.at + duration('P1Y')), n.day < date('0001-01-01')]"
            )
        ).toEqual([['-0044-03-16', -44, '-0043-03-15T12:00:00+02:00', true]]);
    });

    it('should compare a stored value of any year, and give its year, as Neo4j does, beside a value written or a parameter', async () => {
        // Postgres and Oracle read a text whose year is 1000 or later as it is, with no test of its era, where a test of its
        // kind has told them so; and read a year off the text. A year after 0 but before 1000, and one BC, take the other way.
        await query(
            `UNWIND range(0, ${YEARS.length - 1}) AS i WITH i, [${YEARS.join(', ')}][i] AS y ` +
                'CREATE (:CyTemporal {id: i, day: date({year: y, month: 3, day: 15}), ldt: localdatetime({year: y, month: 3, day: 15, hour: 12}), ' +
                "at: datetime({year: y, month: 3, day: 15, hour: 12, timezone: '+02:00'})})"
        );
        expect(
            await query('MATCH (n:CyTemporal) WITH n ORDER BY n.id RETURN collect([n.day.year, n.ldt.year, n.at.year])')
        ).toEqual([YEARS.map((it) => [it, it, it])]);
        expect(
            await query(
                'MATCH (n:CyTemporal) WITH n ORDER BY n.id ' +
                    "RETURN collect([n.day < date('0001-01-01'), date('0000-03-15') <= n.day, n.day = date('-0044-03-15'), n.day < date($p), " +
                    "n.at < datetime('0000-06-01T00:00:00Z'), n.ldt >= localdatetime('1000-01-01T00:00')])",
                { p: '0000-06-01' }
            )
        ).toEqual([YEARS.map((y) => [y <= 0, y >= 0, y === -44, y <= 0, y <= 0, y >= 1000])]);
        // A truncation and a change of kind keep the stored value's year: written as before from 1000 on, by its era before.
        expect(
            await query(
                'MATCH (n:CyTemporal) WITH n ORDER BY n.id ' +
                    "RETURN collect([toString(date.truncate('month', n.day)), toString(datetime.truncate('day', n.at)), toString(date(n.at)), toString(localdatetime(n.at))])"
            )
        ).toEqual([
            YEARS.map((y) => [
                `${iso(y)}-03-01`,
                `${iso(y)}-03-15T00:00:00+02:00`,
                `${iso(y)}-03-15`,
                `${iso(y)}-03-15T12:00:00`
            ])
        ]);
        // Two years BC are not compared here: two stored values compare by their text, which orders them backwards
        // (#415, a port of drivine4j#374).
    });

    it('should count a CASE of a moment added to, in a reduce(), under an aggregate', async () => {
        // Oracle searches the CASE for a subquery, and what that search declares is not declared (#511).
        await query("UNWIND range(1, 5) AS i CREATE (:CyTemporal {id: i, t: datetime('2024-03-15T10:00:00Z')})");
        expect(
            await query(
                "MATCH (n:CyTemporal) RETURN count(CASE WHEN reduce(a = 0, x IN [1, 2] | a + (n.t + duration('PT1H')).minute) >= 0 THEN 1 END)"
            )
        ).toEqual([5]);
    });
});
