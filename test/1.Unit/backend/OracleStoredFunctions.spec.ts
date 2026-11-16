import { OracleGraph } from '@/backend/oracle';
import { OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { storeStatements } from '@/backend/StoreStatements';
import { DrivineLogger } from '@/logger/DrivineLogger';

/** The module's statement that finds whether a session may call the functions of the compiler flag `flag`. */
const probe = (graph: string, flag: string): string => storeStatements('oracle', graph).storedFunctions!.probes[flag];

describe('The functions an Oracle graph is made with', () => {
    // Their texts are the shared module's, which store.yaml pins, so drivine4j, drivine-python and this library make
    // them byte for byte alike: this pins only that the graph makes the module's, by the names a statement calls.
    it("are the shared module's, each made by the graph's block where missing, not valid or of another version", () => {
        const graph = new OracleGraph('myGraph');
        const module = storeStatements('oracle', 'myGraph');
        expect(graph.functions).toEqual(module.functions);
        expect(graph.ensuring).toEqual(module.ensuring);
        for (const [name, version] of Object.entries(module.versions!)) {
            const making = graph.functions.find((it) => it.startsWith(`CREATE OR REPLACE FUNCTION ${name}(`));
            expect(making).toContain(`-- drivine:${version}`);
            expect(graph.ensuring).toContain(`o.object_name = '${name.toUpperCase()}'`);
        }
        expect([graph.nullsEqual, graph.era, graph.eraDate].every((it) => it in module.versions!)).toBe(true);
    });
});

/** A session whose checks of the function give `outcomes` in turn: rows, or the error node-oracledb throws with its number. */
function session(...outcomes: (number | 'found')[]): { execute: jest.Mock } {
    const execute = jest.fn();
    for (const outcome of outcomes) {
        if (outcome === 'found') {
            execute.mockResolvedValueOnce({ rows: [[1]] });
        } else {
            execute.mockRejectedValueOnce(Object.assign(new Error(`ORA-${outcome}`), { errorNum: outcome }));
        }
    }
    return { execute };
}

describe('Whether a session may call the graph function', () => {
    const clock = OracleStoredFunctions.clock;
    let now = 0;
    let graphs = 0;
    /** A graph of its own for each test: what a session found is remembered for the process. */
    const graph = (): string => `unit_${++graphs}_${Date.now()}`;

    beforeEach(() => {
        now = 1_000;
        OracleStoredFunctions.clock = () => now;
    });

    afterEach(() => {
        OracleStoredFunctions.clock = clock;
    });

    it('calls it once, and remembers a yes for the database, the user and the graph', async () => {
        const g = graph();
        const found = session('found');
        expect(await OracleStoredFunctions.nullsEqual(found, 'db|me', g)).toBe(true);
        expect(await OracleStoredFunctions.nullsEqual(found, 'db|me', g)).toBe(true);
        expect(found.execute).toHaveBeenCalledTimes(1);
        expect(found.execute).toHaveBeenCalledWith(probe(g, 'nullsEqualStored'));
        // Another user is asked of its own.
        const other = session(904);
        expect(await OracleStoredFunctions.nullsEqual(other, 'db|you', g)).toBe(false);
    });

    it.each([904, 942, 1031, 6575])('takes ORA-%i as missing', async (code) => {
        expect(await OracleStoredFunctions.nullsEqual(session(code), 'db|me', graph())).toBe(false);
    });

    it("takes any other failure as the statement's to report, and remembers nothing of it", async () => {
        const g = graph();
        await expect(OracleStoredFunctions.nullsEqual(session(20001), 'db|me', g)).rejects.toThrow('ORA-20001');
        await expect(OracleStoredFunctions.nullsEqual(session(3113), 'db|me', g)).rejects.toThrow('ORA-3113');
        expect(await OracleStoredFunctions.nullsEqual(session('found'), 'db|me', g)).toBe(true);
    });

    it('remembers a no for a minute, then asks again', async () => {
        const g = graph();
        const asked = session(904, 'found');
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(false);
        now += OracleStoredFunctions.ABSENT_FOR_MS - 1;
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(false);
        expect(asked.execute).toHaveBeenCalledTimes(1);
        now += 1;
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(true);
        expect(asked.execute).toHaveBeenCalledTimes(2);
    });

    it('asks again at once once the graph is ensured, and of that graph only', async () => {
        const g = graph();
        const other = graph();
        const asked = session(904, 904, 'found');
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(false);
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', other)).toBe(false);
        await new OracleGraph(g).ensure({ execute: async () => Promise.resolve(undefined) });
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', other)).toBe(false);
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(true);
        expect(asked.execute).toHaveBeenCalledTimes(3);
    });

    it('warns once for the graph', async () => {
        const g = graph();
        const warned = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const asked = session(904, 904);
            await OracleStoredFunctions.nullsEqual(asked, 'db|me', g);
            now += OracleStoredFunctions.ABSENT_FOR_MS;
            await OracleStoredFunctions.nullsEqual(asked, 'db|me', g);
            expect(asked.execute).toHaveBeenCalledTimes(2);
            const warnings = warned.mock.calls.filter(([text]) =>
                String(text).includes(`has no function ${g}_nulls_equal`)
            );
            expect(warnings).toHaveLength(1);
        } finally {
            warned.mockRestore();
        }
    });

    it('asks of both era functions in one call, apart from nulls_equal, and warns once for them', async () => {
        // A store ensured before liberation-data/drivine#609 has nulls_equal and not the era functions.
        const g = graph();
        const warned = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const asked = session('found', 904, 904);
            expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(true);
            expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(false);
            expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(false);
            expect(asked.execute).toHaveBeenCalledTimes(2);
            expect(asked.execute).toHaveBeenLastCalledWith(probe(g, 'eraStored'));
            expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(true);
            now += OracleStoredFunctions.ABSENT_FOR_MS;
            expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(false);
            expect(asked.execute).toHaveBeenCalledTimes(3);
            const warnings = warned.mock.calls.map(([text]) => String(text));
            expect(
                warnings.filter((it) => it.includes(`has no function ${g}_era, ${g}_era_date and ${g}_temporal_key`))
            ).toHaveLength(1);
            expect(warnings.filter((it) => it.includes(`${g}_nulls_equal`))).toHaveLength(0);
        } finally {
            warned.mockRestore();
        }
    });

    it('remembers a yes for the era functions apart from a no for nulls_equal, and asks again of them once ensured', async () => {
        const g = graph();
        const asked = session(904, 904, 'found', 'found');
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(false);
        expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(false);
        await new OracleGraph(g).ensure({ execute: async () => Promise.resolve(undefined) });
        expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(true);
        expect(await OracleStoredFunctions.nullsEqual(asked, 'db|me', g)).toBe(true);
        expect(await OracleStoredFunctions.era(asked, 'db|me', g)).toBe(true);
        expect(asked.execute).toHaveBeenCalledTimes(4);
    });
});
