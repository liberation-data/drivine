import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    GraphProperty,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

@NodeFragment({ labels: ['OraTest', 'Ticket'] })
class Ticket {
    @NodeId() id: string;
    title: string;
    @GraphProperty('ticket_no') number: number;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['Urgent'] })
class UrgentTicket extends Ticket {}

describeOnOracle('fragments on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const node = (labels: string[], props: object, stamp?: string) =>
        new QuerySpecification(
            'INSERT INTO drivine_node (labels, props, stamp) VALUES (JSON($labels), JSON($props), $stamp)'
        ).bind({ labels, props, stamp: stamp ?? null });

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
        await pm.execute(
            new QuerySpecification(`DELETE FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "OraTest")')`)
        );
        await pm.execute(node(['OraTest', 'Ticket'], { id: 't1', title: 'Crash', ticket_no: 101 }, 'aaaa:bbbb'));
        await pm.execute(node(['OraTest', 'Ticket', 'Urgent'], { id: 't2', title: 'Outage', ticket_no: 102 }));
        await pm.execute(node(['OraTest', 'Ticket'], { id: 't3', title: 'Typo', ticket_no: 103 }));
        await pm.execute(node(['OraTest', 'Other'], { id: 't1', title: 'Not a ticket' }));
    });

    afterAll(async () => {
        await pm.execute(
            new QuerySpecification(`DELETE FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "OraTest")')`)
        );
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
            where: "JSON_VALUE(n.props, '$.ticket_no' RETURNING NUMBER) > $min",
            bindings: { min: 101 }
        });
        expect(big.map((it) => it.id).sort()).toEqual(['t2', 't3']);
        expect((await gom.loadAll(UrgentTicket)).map((it) => it.id)).toEqual(['t2']);
    });

    it('should count', async () => {
        expect(await gom.count(Ticket)).toBe(3);
        expect(await gom.count(Ticket, "JSON_VALUE(n.props, '$.title') = $title", { title: 'Typo' })).toBe(1);
    });

    it('should delete by id and condition, and delete all a filter finds', async () => {
        await pm.execute(node(['OraTest', 'Ticket'], { id: 'gone1', title: 'x', ticket_no: 900 }));
        await pm.execute(node(['OraTest', 'Ticket'], { id: 'gone2', title: 'x', ticket_no: 901 }));
        expect(await gom.delete(Ticket, 'gone1', { where: "JSON_VALUE(n.props, '$.title') = 'y'" })).toBe(0);
        expect(await gom.delete(Ticket, 'gone1')).toBe(1);
        expect(await gom.deleteAll(Ticket, "JSON_VALUE(n.props, '$.title') = 'x'")).toBe(1);
        expect(await gom.count(Ticket)).toBe(3);
    });

    it('should take the query DSL', async () => {
        const typed = await gom.loadAll(Ticket, (q) => ({ where: q.number.gte(102), orderBy: q.number.desc() }));
        expect(typed.map((it) => it.id)).toEqual(['t3', 't2']);
    });

    it('should say what is not on Oracle yet', async () => {
        await expect(gom.save(Object.assign(new Ticket(), { id: 'new', title: 'x', number: 1 }))).rejects.toThrow(
            /Saving is not available on Oracle yet/
        );
    });
});
