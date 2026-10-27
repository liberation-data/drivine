import { DrivineLogger } from '@/logger/DrivineLogger';

/** What a session's check needs of a connection: node-oracledb's `execute`. */
export interface Executes {
    execute(sql: string): Promise<unknown>;
}

/** The function the store keeps beside the graph `graph`'s tables that compares two values that may hold a null. */
export function nullsEqualName(graph: string): string {
    return `${graph}_nulls_equal`;
}

/**
 * The function `name`, which compares two JSON values as Cypher compares values that may hold a null: 1 where they are
 * equal, 0 where they differ, and null where a pair of their items holds a null and no pair differs. It walks the two
 * together with `JSON_ELEMENT_T`, list item by list item and map key by map key, at any depth. A query declares it with
 * `WITH FUNCTION` where the store has none (see `OracleCypherCompiler.nullsEqual`); the store keeps it, made with the
 * graph, as `CREATE OR REPLACE` of the same text (see `OracleGraph.functions`).
 *
 * The store's copy is part of the store layout the three Drivine libraries share (see AGENTS.md): it is
 * `CREATE OR REPLACE ` and this text with `name` as {@link nullsEqualName} gives it, the graph's name as written and then
 * `_nulls_equal`, its lines joined by `\n` with no newline after the last (the `//` comment below is not in it).
 * drivine4j's `OracleCypherCompiler.nullsEqualFunction` is the reference: changing a byte of it changes the layout for
 * all three, so it changes in all three together.
 */
export function nullsEqualFunction(name: string): string {
    return [
        `FUNCTION ${name}(cy_x JSON, cy_y JSON) RETURN NUMBER IS`,
        '    FUNCTION eq(a JSON_ELEMENT_T, b JSON_ELEMENT_T) RETURN NUMBER IS',
        '        r NUMBER := 1;',
        '        e NUMBER;',
        '        la JSON_ARRAY_T;',
        '        lb JSON_ARRAY_T;',
        '        oa JSON_OBJECT_T;',
        '        ob JSON_OBJECT_T;',
        '        ks JSON_KEY_LIST;',
        '        too_long EXCEPTION;',
        '        PRAGMA EXCEPTION_INIT(too_long, -40478);',
        '    BEGIN',
        '        IF a.is_Null OR b.is_Null THEN RETURN NULL; END IF;',
        '        IF a.is_Array AND b.is_Array THEN',
        '            la := TREAT(a AS JSON_ARRAY_T);',
        '            lb := TREAT(b AS JSON_ARRAY_T);',
        '            IF la.get_Size <> lb.get_Size THEN RETURN 0; END IF;',
        '            FOR i IN 0 .. la.get_Size - 1 LOOP',
        '                e := eq(la.get(i), lb.get(i));',
        '                IF e = 0 THEN RETURN 0; END IF;',
        '                IF e IS NULL THEN r := NULL; END IF;',
        '            END LOOP;',
        '            RETURN r;',
        '        END IF;',
        '        IF a.is_Object AND b.is_Object THEN',
        '            oa := TREAT(a AS JSON_OBJECT_T);',
        '            ob := TREAT(b AS JSON_OBJECT_T);',
        '            IF oa.get_Size <> ob.get_Size THEN RETURN 0; END IF;',
        '            ks := oa.get_Keys;',
        '            FOR i IN 1 .. ks.COUNT LOOP',
        '                IF NOT ob.has(ks(i)) THEN RETURN 0; END IF;',
        '                e := eq(oa.get(ks(i)), ob.get(ks(i)));',
        '                IF e = 0 THEN RETURN 0; END IF;',
        '                IF e IS NULL THEN r := NULL; END IF;',
        '            END LOOP;',
        '            RETURN r;',
        '        END IF;',
        '        IF a.is_Number AND b.is_Number THEN RETURN CASE WHEN a.to_Number = b.to_Number THEN 1 ELSE 0 END; END IF;',
        // As VARCHAR2s, three times as fast as CLOBs; as CLOBs where one is past 32 KB, which to_String raises on
        // (ORA-40478).
        '        IF a.is_String AND b.is_String THEN',
        '            BEGIN',
        '                RETURN CASE WHEN a.to_String = b.to_String THEN 1 ELSE 0 END;',
        '            EXCEPTION WHEN too_long THEN',
        '                RETURN CASE WHEN DBMS_LOB.COMPARE(a.to_Clob, b.to_Clob) = 0 THEN 1 ELSE 0 END;',
        '            END;',
        '        END IF;',
        '        IF a.is_Boolean AND b.is_Boolean THEN RETURN CASE WHEN a.to_Boolean = b.to_Boolean THEN 1 ELSE 0 END; END IF;',
        '        RETURN 0;',
        '    END;',
        'BEGIN',
        '    RETURN eq(JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_x RETURNING CLOB)), JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_y RETURNING CLOB)));',
        'END;'
    ].join('\n');
}

/**
 * The errors calling a function there is none of gives: ORA-00904 where there is none, or none the session may call
 * (Oracle says the same of one it may not execute, and of a synonym for one that is gone), ORA-06575 where it is not
 * valid, and ORA-00942 or ORA-01031 where something it reads is not granted. Any other error, a connection lost among
 * them, is the statement's to report.
 */
const NO_FUNCTION = new Set([904, 942, 1031, 6575]);

/**
 * Whether a session may call the functions a graph's store keeps beside its tables (see `OracleGraph.functions`). A
 * store made by an earlier version has none until the graph is ensured again, and a user who may not make a function
 * (`CREATE PROCEDURE`) has none at all: a Cypher statement is then compiled to call none, and says so once for each
 * graph. drivine4j's `OracleStoredFunctions`.
 *
 * Asked only by a statement that would call one. A session that may call it is remembered for the database, its user
 * and the graph, for as long as the process runs: a function dropped after that is not noticed, and a statement that
 * calls it fails until the process restarts. One that may not is remembered for {@link ABSENT_FOR_MS}, or until the
 * graph is ensured in this process (see `OracleGraph.ensure`), so a store without the function is not asked on every
 * statement, and a graph ensured later still gains it.
 */
export class OracleStoredFunctions {
    /** How long a session found to call no function is taken to call none before it is asked again. */
    static readonly ABSENT_FOR_MS = 60_000;

    private static readonly logger = new DrivineLogger(OracleStoredFunctions.name);

    /** The database, user and graph of each session found to call the function. */
    private static readonly callable = new Set<string>();

    /** The database, user and graph of each session found to call none, and when ({@link clock}) to ask again. */
    private static readonly absent = new Map<string, number>();

    /** The database, user and graph of each session that was said to have no function. */
    private static readonly warned = new Set<string>();

    /** Milliseconds, as `performance.now()` counts them: replaced by a test that lets {@link ABSENT_FOR_MS} pass. */
    static clock: () => number = () => performance.now();

    /**
     * Whether `connection` may call the function the graph `graph` compares two values that may hold a null by. It
     * calls the function: one another user's store keeps, read through a synonym, is called as the graph's tables are.
     * A query that fails rolls back only itself, so a transaction open on `connection` is left as it was.
     *
     * @param database the database and the user the session is of, which with the graph keys what is remembered
     * @throws where calling it fails for any reason but there being no function it may call
     */
    static async nullsEqual(connection: Executes, database: string, graph: string): Promise<boolean> {
        const key = `${database}|${graph}`;
        if (this.callable.has(key)) {
            return true;
        }
        const now = this.clock();
        const until = this.absent.get(key);
        if (until !== undefined && now < until) {
            return false;
        }
        const name = nullsEqualName(graph);
        let found: boolean;
        try {
            await connection.execute(`SELECT ${name}(JSON('[1]'), JSON('[1]')) FROM DUAL`);
            found = true;
        } catch (e) {
            if (!NO_FUNCTION.has((e as { errorNum?: number }).errorNum ?? -1)) {
                throw e;
            }
            found = false;
        }
        if (found) {
            this.callable.add(key);
            this.absent.delete(key);
            return true;
        }
        this.absent.set(key, now + this.ABSENT_FOR_MS);
        if (!this.warned.has(key)) {
            this.warned.add(key);
            this.logger.warn(
                `The Oracle graph '${graph}' has no function ${name}, which the graph is made with where its user may ` +
                    'make a function (CREATE PROCEDURE, which the RESOURCE role grants). Until the graph is ensured by ' +
                    'such a user, a Cypher statement that writes, or the step of a reduce(), compares two lists or maps ' +
                    'that hold a null and differ as JSON as false, where Cypher may give null.'
            );
        }
        return false;
    }

    /** Asks again, of every session, whether it may call the functions of `graph`: it has just been ensured. */
    static ensured(graph: string): void {
        for (const key of [...this.absent.keys()]) {
            if (key.endsWith(`|${graph}`)) {
                this.absent.delete(key);
            }
        }
    }
}
