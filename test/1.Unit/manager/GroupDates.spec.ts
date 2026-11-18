import {
    avg,
    backendFor,
    count,
    DatabaseType,
    GraphObjectMapper,
    GraphProperty,
    key,
    max,
    min,
    ModelRegistry,
    NodeFragment,
    NodeId,
    sum
} from '@liberation-data/drivine';
import { GroupOperations } from '@/manager/GroupOperations';
import { asDate } from '@/mapper/GraphObjectMapper';

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

/**
 * Date fields declared in each way Drivine can tell, as it tells a Set field (see SetFields): TypeScript records the type
 * of a decorated field, whatever the decorator, and the class initializes another with one. And those it can't tell.
 */
@NodeFragment({ labels: ['Dated'] })
class Dated {
    @NodeId() id: string;
    @GraphProperty('opened_at') openedAt?: Date;
    @Marked() closedAt?: Date;
    seenAt: Date = new Date(0);
    @Marked() union?: Date | null;
    undecorated?: Date;
    @Marked() name?: string;
    @Marked() score?: number;
}

const STORES = [
    DatabaseType.NEO4J,
    DatabaseType.MEMGRAPH,
    DatabaseType.FALKORDB,
    DatabaseType.SQLITE,
    DatabaseType.POSTGRES,
    DatabaseType.ORACLE
];

describe('asDate', () => {
    it("reads a SQL store's text of a moment as a Date of that instant", () => {
        expect(asDate('2026-01-01T00:00:00Z')).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(asDate('2026-01-01T00:00:00.000Z')).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(asDate('2026-01-01T01:00:00+01:00')).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        // FalkorDB's, which holds nine digits of the second: a Date keeps the milliseconds.
        expect(asDate('2040-01-01T00:00:00.123456789Z')).toEqual(new Date('2040-01-01T00:00:00.123Z'));
        expect(asDate('2026-01-01')).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('leaves a Date, a value of no date, and a text that names no instant a Date can be given as text', () => {
        const date = new Date('2026-01-01T00:00:00.000Z');
        expect(asDate(date)).toBe(date);
        expect(asDate(undefined)).toBeUndefined();
        expect(asDate(5)).toBe(5);
        // JavaScript's parser would guess a date of each.
        expect(asDate('5')).toBe('5');
        expect(asDate('March 7, 2026')).toBe('March 7, 2026');
        expect(asDate('2026-13-45T00:00:00Z')).toBe('2026-13-45T00:00:00Z');
        // 45 BC, which Cypher and the module write with four digits, and a Date only with six.
        expect(asDate('-0044-03-15T00:00:00Z')).toBe('-0044-03-15T00:00:00Z');
    });
});

describe('The Date fields the model records', () => {
    it("are those Drivine's decorators record as Date, and those the class initializes with one", () => {
        const model = new ModelRegistry().fragment(Dated);
        // A field only another library's decorator marks is read as TypeScript records it when it is grouped, as a Set
        // field is when it is loaded.
        expect([...model.dates].sort()).toEqual(['openedAt', 'seenAt']);
    });
});

/**
 * A grouped `min` or `max` of a property declared a `Date` is a `Date` on every store, as drivine4j's GroupRow gives a
 * value as its handle's type (#785): a SQL store gives its text, and a graph engine's driver a Date already. Anything
 * else is given as the store gives it.
 */
describe.each(STORES)('A grouped min or max of a Date property on %s', (type) => {
    let rows: any[];
    const groups = (): GroupOperations =>
        new GroupOperations(
            new ModelRegistry(),
            async () => Promise.resolve(rows),
            new GraphObjectMapper(),
            backendFor(type)
        );

    it('is a Date, by a reference or by its stored name, on a field stored under another name too', async () => {
        rows = [
            {
                k0: 'one',
                a0: '2026-01-01T00:00:00Z',
                a1: '2026-03-01T00:00:00Z',
                a2: new Date('2026-02-01T00:00:00.000Z'),
                a3: '2026-04-01T00:00:00Z',
                a4: '1970-01-01T00:00:00Z'
            }
        ];
        const [group] = await groups().load(Dated, (q: any) => ({
            keys: { name: key(q.name) },
            aggregates: {
                earliest: min(q.openedAt),
                latest: max('opened_at'),
                closed: max(q.closedAt),
                lastClosed: max('closedAt'),
                seen: min(q.seenAt)
            }
        }));
        expect(group).toEqual({
            name: 'one',
            earliest: new Date('2026-01-01T00:00:00.000Z'),
            latest: new Date('2026-03-01T00:00:00.000Z'),
            closed: new Date('2026-02-01T00:00:00.000Z'),
            lastClosed: new Date('2026-04-01T00:00:00.000Z'),
            seen: new Date(0)
        });
        expect(group.earliest).toBeInstanceOf(Date);
    });

    it('is undefined over no values', async () => {
        rows = [{ k0: 'one', a0: null, a1: undefined }];
        expect(
            await groups().load(Dated, (q: any) => ({
                keys: { name: key(q.name) },
                aggregates: { earliest: min(q.openedAt), latest: max(q.openedAt) }
            }))
        ).toEqual([{ name: 'one', earliest: undefined, latest: undefined }]);
    });

    it('is as the store gives it where the property is declared no Date, or no type TypeScript records', async () => {
        rows = [
            {
                k0: '2026-01-01T00:00:00Z',
                a0: '2026-01-01T00:00:00Z',
                a1: '2026-01-01T00:00:00Z',
                a2: '2026-01-01T00:00:00Z',
                a3: '2026-01-01T00:00:00Z',
                a4: 3
            }
        ];
        const [group] = await groups().load(Dated, (q: any) => ({
            // A key is the value the store gives, as before.
            keys: { at: key(q.openedAt) },
            aggregates: {
                undecorated: min(q.undecorated),
                union: max(q.union),
                name: max(q.name),
                // A property no field is declared for.
                other: min('other'),
                score: max(q.score)
            }
        }));
        expect(group).toEqual({
            at: '2026-01-01T00:00:00Z',
            undecorated: '2026-01-01T00:00:00Z',
            union: '2026-01-01T00:00:00Z',
            name: '2026-01-01T00:00:00Z',
            other: '2026-01-01T00:00:00Z',
            score: 3
        });
    });

    it('leaves a count, a sum and an average as numbers', async () => {
        rows = [{ k0: 'one', a0: 2, a1: 0, a2: 1.5 }];
        expect(
            await groups().load(Dated, (q: any) => ({
                keys: { name: key(q.name) },
                aggregates: { all: count(q.openedAt.isNotNull()), total: sum(q.score), mean: avg(q.score) }
            }))
        ).toEqual([{ name: 'one', all: 2, total: 0, mean: 1.5 }]);
    });
});
