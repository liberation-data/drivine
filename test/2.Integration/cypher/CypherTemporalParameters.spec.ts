import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import neo4j from 'neo4j-driver';
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

const { Date: DriverDate, DateTime, Duration, LocalDateTime, LocalTime, Time }: typeof neo4j.types = neo4j.types;

/** `Temporal`, where the runtime has it: Node has it from 26, and Drivine runs on 22. */
const Temporal: any = (globalThis as any).Temporal;

/**
 * A temporal value bound as a parameter is the value Cypher writes, on every store (#767, a port of drivine4j#833): on
 * the SQL stores each kind was bound as a map of its fields, so `$d = duration('PT1H')` was false and `toString($t)`
 * a map's text. drivine4j's `CypherTemporalCrossEngineTest` case, each of the Neo4j driver's temporal kinds, and each
 * `Temporal` one, which the driver wrote as an empty map on Neo4j.
 */
describe.each(stores())('A temporal parameter on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));
    // A SQL store holds a datetime's offset, not its named zone (the spec's README, "A time").
    const zoned =
        store.type === DatabaseType.NEO4J ? '2024-01-15T10:00:00+01:00[Europe/Paris]' : '2024-01-15T10:00:00+01:00';

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await clearLabels(pm, store, 'CyTemporalParameter');
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'CyTemporalParameter');
        await closeGraphEngines();
    });

    it('should be the time with its offset or the duration Cypher writes', async () => {
        const parameters = { t: new Time(10, 0, 0, 0, 0), d: new Duration(0, 0, 3600, 0) };
        expect(await query("RETURN [$t = time('10:00Z'), toString($t), $d = duration('PT1H')]", parameters)).toEqual([
            [true, '10:00:00Z', true]
        ]);
        // A time is no text, alone or in a list (#779).
        expect(await query("RETURN [$t = '10:00Z', [$t] = ['10:00Z']]", parameters)).toEqual([[false, false]]);
    });

    it('should be each kind of the Neo4j driver, alone, in a list and in a map', async () => {
        const parameters = {
            date: new DriverDate(2024, 1, 15),
            localTime: new LocalTime(10, 0, 0, 0),
            localDateTime: new LocalDateTime(2024, 1, 15, 10, 0, 0, 0),
            offset: new DateTime(2024, 1, 15, 10, 0, 0, 0, 3600),
            zoned: new DateTime(2024, 1, 15, 10, 0, 0, 0, 3600, 'Europe/Paris'),
            duration: new Duration(14, 3, 3600, 5)
        };
        expect(
            await query(
                'RETURN [toString($date), toString($localTime), toString($localDateTime), toString($offset), toString($zoned), ' +
                    'toString($duration), $date.year, $duration.months]',
                parameters
            )
        ).toEqual([
            [
                '2024-01-15',
                '10:00:00',
                '2024-01-15T10:00:00',
                '2024-01-15T10:00:00+01:00',
                zoned,
                'P1Y2M3DT1H0.000000005S',
                2024,
                14
            ]
        ]);
        expect(
            await query("RETURN [[$l][0][0] = date('2024-01-15'), $m.d = duration('PT1H')]", {
                l: [parameters.date],
                m: { d: new Duration(0, 0, 3600, 0) }
            })
        ).toEqual([[true, true]]);
    });

    it('should be a date or a datetime of a year before 1', async () => {
        expect(
            await query("RETURN [toString($d), $d = date('-0005-01-15'), toString($dt)]", {
                d: new DriverDate(-5, 1, 15),
                dt: new DateTime(-44, 3, 15, 10, 0, 0, 0, 0)
            })
        ).toEqual([['-0005-01-15', true, '-0044-03-15T10:00:00Z']]);
    });

    it('should be a JavaScript Date as the datetime at an offset of zero, alone, in a list and in a map (#810)', async () => {
        const at = new Date('2024-01-15T10:00:00.089Z');
        expect(
            await query(
                "RETURN [toString($at), $at = datetime('2024-01-15T10:00:00.089Z'), " +
                    "[$l][0][0] = datetime('2024-01-15T10:00:00.089Z'), $m.at.year, $invalid IS NULL]",
                { at, l: [at], m: { at }, invalid: new Date(Number.NaN) }
            )
        ).toEqual([['2024-01-15T10:00:00.089Z', true, true, 2024, true]]);
    });

    it('should be written and read back as the value it is', async () => {
        await query('CREATE (:CyTemporalParameter {d: $d, t: $t})', {
            d: new Duration(0, 1, 0, 0),
            t: new LocalTime(9, 30, 0, 0)
        });
        expect(await query("MATCH (n:CyTemporalParameter) RETURN [n.d = duration('P1D'), toString(n.t)]")).toEqual([
            [true, '09:30:00']
        ]);
    });

    (Temporal ? it : it.skip)('should be each Temporal kind', async () => {
        const parameters = {
            date: Temporal.PlainDate.from('2024-01-15'),
            time: Temporal.PlainTime.from('10:00'),
            dateTime: Temporal.PlainDateTime.from('2024-01-15T10:00'),
            zoned: Temporal.ZonedDateTime.from('2024-01-15T10:00[Europe/Paris]'),
            instant: Temporal.Instant.from('2024-01-15T10:00Z'),
            duration: Temporal.Duration.from({ months: 14, days: 3, hours: 1 })
        };
        expect(
            await query(
                'RETURN [toString($date), toString($time), toString($dateTime), toString($zoned), toString($instant), toString($duration)]',
                parameters
            )
        ).toEqual([['2024-01-15', '10:00:00', '2024-01-15T10:00:00', zoned, '2024-01-15T10:00:00Z', 'P1Y2M3DT1H']]);
    });

    (store.type === DatabaseType.NEO4J ? it.skip : it)(
        'should be refused by name in a named zone with no offset on a SQL store',
        async () => {
            await expect(
                query('RETURN toString($t)', { t: new DateTime(2024, 1, 15, 10, 0, 0, 0, undefined, 'Europe/Paris') })
            ).rejects.toThrow(/named zone with no offset/);
        }
    );
});
