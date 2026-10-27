import { OracleGraph } from '@/backend/oracle';
import { nullsEqualFunction, OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { sqlText } from '@/backend/oracle/OracleGraph';
import { DrivineLogger } from '@/logger/DrivineLogger';

/**
 * The lines of drivine4j's `OracleCypherCompiler.nullsEqualFunction`, copied verbatim from drivine4j at 42c34f59
 * (liberation-data/drivine4j#323), its Kotlin comment and `$name` too: Kotlin's `"$name"` is the function's name, and
 * here is replaced by it. The store keeps this function, so its text is part of the store layout the three libraries
 * share, byte for byte (#367). A change to it is made in drivine4j first and copied here again.
 */
// prettier-ignore
const DRIVINE4J_NULLS_EQUAL = [
    "FUNCTION $name(cy_x JSON, cy_y JSON) RETURN NUMBER IS",
    "    FUNCTION eq(a JSON_ELEMENT_T, b JSON_ELEMENT_T) RETURN NUMBER IS",
    "        r NUMBER := 1;",
    "        e NUMBER;",
    "        la JSON_ARRAY_T;",
    "        lb JSON_ARRAY_T;",
    "        oa JSON_OBJECT_T;",
    "        ob JSON_OBJECT_T;",
    "        ks JSON_KEY_LIST;",
    "        too_long EXCEPTION;",
    "        PRAGMA EXCEPTION_INIT(too_long, -40478);",
    "    BEGIN",
    "        IF a.is_Null OR b.is_Null THEN RETURN NULL; END IF;",
    "        IF a.is_Array AND b.is_Array THEN",
    "            la := TREAT(a AS JSON_ARRAY_T);",
    "            lb := TREAT(b AS JSON_ARRAY_T);",
    "            IF la.get_Size <> lb.get_Size THEN RETURN 0; END IF;",
    "            FOR i IN 0 .. la.get_Size - 1 LOOP",
    "                e := eq(la.get(i), lb.get(i));",
    "                IF e = 0 THEN RETURN 0; END IF;",
    "                IF e IS NULL THEN r := NULL; END IF;",
    "            END LOOP;",
    "            RETURN r;",
    "        END IF;",
    "        IF a.is_Object AND b.is_Object THEN",
    "            oa := TREAT(a AS JSON_OBJECT_T);",
    "            ob := TREAT(b AS JSON_OBJECT_T);",
    "            IF oa.get_Size <> ob.get_Size THEN RETURN 0; END IF;",
    "            ks := oa.get_Keys;",
    "            FOR i IN 1 .. ks.COUNT LOOP",
    "                IF NOT ob.has(ks(i)) THEN RETURN 0; END IF;",
    "                e := eq(oa.get(ks(i)), ob.get(ks(i)));",
    "                IF e = 0 THEN RETURN 0; END IF;",
    "                IF e IS NULL THEN r := NULL; END IF;",
    "            END LOOP;",
    "            RETURN r;",
    "        END IF;",
    "        IF a.is_Number AND b.is_Number THEN RETURN CASE WHEN a.to_Number = b.to_Number THEN 1 ELSE 0 END; END IF;",
    // As VARCHAR2s, about 3.5 times as fast as CLOBs; as CLOBs where one is past 32 KB, which to_String
    // raises on (ORA-40478).
    "        IF a.is_String AND b.is_String THEN",
    "            BEGIN",
    "                RETURN CASE WHEN a.to_String = b.to_String THEN 1 ELSE 0 END;",
    "            EXCEPTION WHEN too_long THEN",
    "                RETURN CASE WHEN DBMS_LOB.COMPARE(a.to_Clob, b.to_Clob) = 0 THEN 1 ELSE 0 END;",
    "            END;",
    "        END IF;",
    "        IF a.is_Boolean AND b.is_Boolean THEN RETURN CASE WHEN a.to_Boolean = b.to_Boolean THEN 1 ELSE 0 END; END IF;",
    "        RETURN 0;",
    "    END;",
    "BEGIN",
    "    RETURN eq(JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_x RETURNING CLOB)), JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_y RETURNING CLOB)));",
    "END;",
];

/** The text drivine4j makes of the function `name`: its lines joined by `\n`, with no newline after the last. */
function drivine4jNullsEqual(name: string): string {
    return DRIVINE4J_NULLS_EQUAL.join('\n').replace('$name', name);
}

describe('The function an Oracle graph is made with, which compares values that may hold a null', () => {
    it("is drivine4j's text byte for byte, as CREATE OR REPLACE of it", () => {
        expect(nullsEqualFunction('myGraph_nulls_equal')).toEqual(drivine4jNullsEqual('myGraph_nulls_equal'));
        const graph = new OracleGraph('myGraph');
        expect(graph.nullsEqual).toEqual('myGraph_nulls_equal');
        expect(graph.functions).toEqual([`CREATE OR REPLACE ${drivine4jNullsEqual('myGraph_nulls_equal')}`]);
        expect(graph.functions[0].endsWith('END;')).toBe(true);
    });

    it('is made after the tables, where missing or not valid, waiting on locks, tolerant of a user who may not make one', () => {
        // drivine4j's OracleNamesTest of the block (#270).
        const graph = new OracleGraph('myGraph');
        const ensuring = graph.ensuring;
        for (const statement of graph.ddl) {
            expect(ensuring).toContain(
                `BEGIN EXECUTE IMMEDIATE ${sqlText(statement)}; EXCEPTION WHEN e_exists THEN NULL; END;`
            );
        }
        const checked = ensuring.indexOf(
            "SELECT COUNT(*) INTO v_made FROM user_objects WHERE object_type = 'FUNCTION' AND object_name = 'MYGRAPH_NULLS_EQUAL' AND status = 'VALID';"
        );
        expect(checked).toBeGreaterThan(ensuring.lastIndexOf('EXCEPTION WHEN e_exists THEN NULL; END;'));
        expect(ensuring).toContain('PRAGMA EXCEPTION_INIT(e_denied, -1031);');
        const made = ensuring.indexOf(
            `BEGIN EXECUTE IMMEDIATE ${sqlText(graph.functions[0])}; EXCEPTION WHEN e_denied THEN NULL; END;`
        );
        expect(made).toBeGreaterThan(checked);
        // The function waits on another session's locks as the tables do (#365), and the wait is set back after it.
        const waits = `EXECUTE IMMEDIATE 'ALTER SESSION SET DDL_LOCK_TIMEOUT = ${OracleGraph.DDL_WAIT_SECONDS}';`;
        const resets = "EXECUTE IMMEDIATE 'ALTER SESSION SET DDL_LOCK_TIMEOUT = 0';";
        expect(ensuring.indexOf(waits, checked)).toBeLessThan(made);
        expect(ensuring.indexOf(resets, made)).toBeGreaterThan(made);
        expect(ensuring.match(/BEGIN EXECUTE IMMEDIATE /g)).toHaveLength(graph.ddl.length + graph.functions.length);
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
        expect(found.execute).toHaveBeenCalledWith(`SELECT ${g}_nulls_equal(JSON('[1]'), JSON('[1]')) FROM DUAL`);
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
});
