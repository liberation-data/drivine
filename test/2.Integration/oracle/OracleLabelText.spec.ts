import { DatabaseRegistry, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { hasLabels } from '@/backend/oracle/OracleGraph';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(60_000);

/** Each node of this suite has an id of this prefix, so it reads none another suite wrote. */
const PREFIX = 'labeltext-';

/**
 * A label after the first is looked for by its text, among the labels as `JSON_SERIALIZE` writes them (see
 * `holdsLabel`): it is found whole, whatever characters it holds, and never inside another label. drivine4j's
 * `OracleLabelTextTest`.
 */
describeOnOracle("a later label's text on Oracle", () => {
    let pm: PersistenceManager;

    /** The ids of this suite's nodes that carry every one of `labels`, as the backend tests them. */
    const carrying = async (...labels: string[]): Promise<string[]> => {
        const ids = await pm.getOne<string | null>(
            new QuerySpecification(
                `SELECT LISTAGG(JSON_VALUE(n.props, '$.id'), ',') WITHIN GROUP (ORDER BY JSON_VALUE(n.props, '$.id')) ` +
                    `FROM drivine_node n WHERE ${hasLabels(
                        'n',
                        labels
                    )} AND JSON_VALUE(n.props, '$.id') LIKE '${PREFIX}%'`
            )
        );
        return ids ? ids.split(',').map((it) => it.slice(PREFIX.length)) : [];
    };

    /** The ids of this suite's nodes a compiled Cypher `MATCH` of `labels` finds. */
    const matching = async (...labels: string[]): Promise<string[]> => {
        const pattern = labels.map((it) => `:\`${it.replace(/`/g, '``')}\``).join('');
        const ids = await pm.query<string>(
            new QuerySpecification({
                text: `MATCH (n${pattern}) WHERE n.id STARTS WITH $prefix RETURN n.id ORDER BY n.id`,
                language: 'CYPHER'
            }).bind({
                prefix: PREFIX
            })
        );
        return ids.map((it) => it.slice(PREFIX.length));
    };

    const remove = async (): Promise<void> => {
        await pm.execute(
            new QuerySpecification(`DELETE FROM drivine_node WHERE JSON_VALUE(props, '$.id') LIKE '${PREFIX}%'`)
        );
    };

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        await remove();
        for (const [labels, id] of [
            [`JSON('["Crafted","x\\",\\"Dog"]')`, 'crafted'],
            [
                `JSON_ARRAY('Odd', 'a' || CHR(9) || 'b', 'c' || CHR(10) || 'd', 'e' || CHR(1) || 'f', ` +
                    `'g' || UNISTR('\\2028') || 'h', 'i' || CHR(127) || 'j' RETURNING JSON)`,
                'odd'
            ],
            [`JSON('["Comma","a,","b"]')`, 'comma'],
            [`JSON('["Comma","a[",",b"]')`, 'bracket'],
            [`JSON('["Comma","x",","]')`, 'lone']
        ]) {
            await pm.execute(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES (${labels}, JSON('{"id":"${PREFIX}${id}"}'))`
                )
            );
        }
    });

    afterAll(async () => {
        await remove();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it('should take a label holding a quoted comma for one label, not two', async () => {
        expect(await carrying('Crafted', 'Dog')).toEqual([]);
        expect(await matching('Crafted', 'Dog')).toEqual([]);
        expect(await carrying('Crafted', 'x","Dog')).toEqual(['crafted']);
        expect(await matching('Crafted', 'x","Dog')).toEqual(['crafted']);
        expect(await carrying('Crafted', 'x')).toEqual([]);
    });

    it('should find a later label holding a control character or a line separator', async () => {
        for (const label of ['a\tb', 'c\nd', 'e\u0001f', 'g\u2028h', 'i\u007fj']) {
            expect([label, await carrying('Odd', label)]).toEqual([label, ['odd']]);
            expect([label, await matching('Odd', label)]).toEqual([label, ['odd']]);
        }
        expect(await carrying('Odd', 'a\\tb')).toEqual([]);
    });

    it('should find a label that is a comma only where a node carries it', async () => {
        expect(await carrying('Comma', ',')).toEqual(['lone']);
        expect(await matching('Comma', ',')).toEqual(['lone']);
        expect(await carrying('Comma', 'a,')).toEqual(['comma']);
        expect(await carrying('Comma', ',b')).toEqual(['bracket']);
    });
});
