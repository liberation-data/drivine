import { DatabaseRegistry, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { hasLabels, holdsLabel, serializedLabel } from '@/backend/oracle/OracleGraph';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(60_000);

/** Each node of this suite has an id of this prefix, so it reads none another suite wrote. */
const PREFIX = 'labeltext-';

/** Labels that try the edges of the text a label is looked for in: brackets, quotes, commas and backslashes. */
const EDGES = ['', '"', '[', ']', '\\', 'a\\', ',"', '","', '\u00e9 \u{1f600}', '$x'];

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
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_node (labels, props) VALUES (JSON($labels), JSON($props))`
            ).bind({
                labels: JSON.stringify(['Edge', ...EDGES]),
                props: JSON.stringify({ id: `${PREFIX}edge` })
            })
        );
        for (const [labels, id] of [
            [`JSON('["Single"]')`, 'single'],
            [`JSON('[]')`, 'none']
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

    it('should find a later label of brackets, quotes, commas or backslashes whole, and nothing near it', async () => {
        for (const label of EDGES) {
            expect([label, await carrying('Edge', label)]).toEqual([label, ['edge']]);
        }
        for (const label of EDGES.filter((it) => it.length > 0)) {
            expect([label, await matching('Edge', label)]).toEqual([label, ['edge']]);
        }
        for (const label of [
            'a',
            ',',
            '\\\\',
            'a\\\\',
            '""',
            '["',
            '"]',
            'Edge","',
            '\u00e9',
            '\u{1f600}',
            'Edge",""'
        ]) {
            expect([label, await carrying('Edge', label)]).toEqual([label, []]);
        }
    });

    it('should tell a node of one label or none by its text alike', async () => {
        expect(await carrying('Single')).toEqual(['single']);
        expect(await matching('Single')).toEqual(['single']);
        expect(await carrying('Single', '')).toEqual([]);
        expect(await carrying('Singl')).toEqual([]);
        const held = async (label: string): Promise<string[]> =>
            pm.query<string>(
                new QuerySpecification(
                    `SELECT JSON_VALUE(n.props, '$.id') FROM drivine_node n WHERE JSON_VALUE(n.props, '$.id') IN ` +
                        `('${PREFIX}single', '${PREFIX}none') AND ${holdsLabel('n.labels', label)}`
                )
            );
        expect(await held('Single')).toEqual([`${PREFIX}single`]);
        expect(await held('')).toEqual([]);
    });

    it('should write a label as JSON_SERIALIZE writes it, for every character up to U+00FF and the others it escapes', async () => {
        let text = '';
        for (let code = 1; code <= 0xff; code++) {
            text += String.fromCharCode(code);
        }
        text += '\u2027\u2028\u2029\u202a\ufeff\ufffd\u{1f600}';
        const written = await pm.getOne<string>(
            new QuerySpecification('SELECT JSON_SERIALIZE(JSON_ARRAY($text RETURNING JSON)) FROM dual').bind({ text })
        );
        expect(written).toEqual(`[${serializedLabel(text)}]`);
    });
});
