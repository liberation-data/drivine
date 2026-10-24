import {
    backendFor,
    DatabaseRegistry,
    GraphProperty,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { rawProperty, SqlSeed, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

@NodeFragment({ labels: ['SqlTest', 'Ticket'] })
class Ticket {
    @NodeId() id: string;
    title: string;
    @GraphProperty('ticket_no') number: number;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['Urgent'] })
class UrgentTicket extends Ticket {}

@NodeFragment({ labels: ['SqlTest', 'Flag'] })
class Flag {
    @NodeId() id: string;
    locked: boolean;
}

describe.each(sqlStores())('fragments on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;
    const title = rawProperty(store, 'title');

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlTest');
        await seed.prepare();
        await seed.clear();
        await seed.node(['Ticket'], { id: 't1', title: 'Crash', ticket_no: 101 }, 'aaaa:bbbb');
        await seed.node(['Ticket', 'Urgent'], { id: 't2', title: 'Outage', ticket_no: 102 });
        await seed.node(['Ticket'], { id: 't3', title: 'Typo', ticket_no: 103 });
        await seed.node(['Other'], { id: 't1', title: 'Not a ticket' });
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should load a fragment by id, by its labels, with its stamp and graph names', async () => {
        const ticket = await gom.load(Ticket, 't1');
        expect(ticket).toBeInstanceOf(Ticket);
        expect(ticket).toEqual(
            Object.assign(new Ticket(), { id: 't1', title: 'Crash', number: 101, stamp: 'aaaa:bbbb' })
        );
        expect(await gom.load(Ticket, 'nobody')).toBeUndefined();
    });

    it('should load the most specific subtype a node carries the labels of', async () => {
        expect(await gom.load(Ticket, 't2')).toBeInstanceOf(UrgentTicket);
    });

    it('should load all, filtered by SQL over the row n, and page', async () => {
        const all = await gom.loadAll(Ticket);
        expect(all.map((it) => it.id).sort()).toEqual(['t1', 't2', 't3']);
        const big = await gom.loadAll(Ticket, {
            where: `${rawProperty(store, 'ticket_no', 'NUMBER')} > $min`,
            bindings: { min: 101 }
        });
        expect(big.map((it) => it.id).sort()).toEqual(['t2', 't3']);
        expect((await gom.loadAll(UrgentTicket)).map((it) => it.id)).toEqual(['t2']);
    });

    it('should count', async () => {
        expect(await gom.count(Ticket)).toBe(3);
        expect(await gom.count(Ticket, `${title} = $title`, { title: 'Typo' })).toBe(1);
    });

    it('should delete by id and condition, and delete all a filter finds', async () => {
        await seed.node(['Ticket'], { id: 'gone1', title: 'x', ticket_no: 900 });
        await seed.node(['Ticket'], { id: 'gone2', title: 'x', ticket_no: 901 });
        expect(await gom.delete(Ticket, 'gone1', { where: `${title} = 'y'` })).toBe(0);
        expect(await gom.delete(Ticket, 'gone1')).toBe(1);
        expect(await gom.deleteAll(Ticket, `${title} = 'x'`)).toBe(1);
        expect(await gom.count(Ticket)).toBe(3);
    });

    it('should read a property of the node written as Cypher writes it, n.title, in a raw where', async () => {
        expect((await gom.loadAll(Ticket, 'n.title = $title', { title: 'Typo' })).map((it) => it.id)).toEqual(['t3']);
        expect(await gom.count(Ticket, "n.title = 'Crash' OR n.`title` = 'Outage'")).toBe(2);
        expect(await gom.count(Ticket, "n.title = 'n.title' OR n.stamp = 'aaaa:bbbb'")).toBe(1);
        expect(await gom.delete(Ticket, 't1', { where: "n.title = 'y'" })).toBe(0);
        await seed.node(['Ticket'], { id: 'gone3', title: 'z', ticket_no: 902 });
        expect(await gom.deleteAll(Ticket, "n.title = 'z'")).toBe(1);
        await seed.node(['Flag'], { id: 'f1', locked: true });
        await seed.node(['Flag'], { id: 'f2', locked: false });
        expect((await gom.loadAll(Flag, 'n.locked = true')).map((it) => it.id)).toEqual(['f1']);
        expect((await gom.loadAll(Flag, 'n.locked <> TRUE')).map((it) => it.id)).toEqual(['f2']);
    });

    it('should take the query DSL', async () => {
        const typed = await gom.loadAll(Ticket, (q) => ({ where: q.number.gte(102), orderBy: q.number.desc() }));
        expect(typed.map((it) => it.id)).toEqual(['t3', 't2']);
    });
});
