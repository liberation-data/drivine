import { javaDouble } from '@/connection/sqlite/JavaDouble';
import { SqliteStatements } from '@/backend/sqlite/SqliteStatements';
import { SqliteArguments } from '@/connection/sqlite/SqliteArguments';
import type { SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';

/** The variable the parameters' object is bound to: see `SqlCypherCompiler`'s `PARAMS`. */
const PARAMS = 'cy_params';

/** The savepoint a procedure runs within. */
const SAVEPOINT = 'drivine_cypher';

/** A step of a procedure, as the shared compiler's `SqliteCypherCompiler.procedure` writes it. */
interface Step {
    op: string;
    sql?: string;
    variables?: string[];
    variable?: string | null;
    record?: string;
    body?: Step[];
    message?: string;
}

/**
 * `drivine_cypher(steps, parameters)`: carries out the procedure a Cypher statement that writes compiles to (see
 * the shared compiler's `SqliteCypherCompiler.procedure`), as Postgres runs its PL/pgSQL and Oracle its PL/SQL, step by
 * step on the connection the statement runs on, in its transaction, and gives back the rows it returns as a JSON list,
 * as drivine4j's `SqliteCypherFunction` does.
 *
 * Each step has its SQL, in which each variable it reads is a numbered parameter, `?1`, and the variables bound to them
 * in turn: the parameters' object, the rows carried from clause to clause, the id a write made. A step sets a variable
 * to what its query gives, loops over a query's rows, which are read whole before the loop writes anything, writes,
 * fails the procedure, keeps a row in a list of rows, or returns rows. A variable holds the first column of a row as SQLite gives it: a whole number,
 * a real one, or text, bound again as it is. The steps run within a savepoint of their own: a procedure that fails is
 * rolled back to where it began, so the statement is applied whole or not at all.
 */
export function procedures(db: SqliteDatabase): (steps: SqliteValue, params: SqliteValue) => SqliteValue {
    // Of their own, read exactly: a whole number stays one, and is bound again as one.
    const statements = new SqliteStatements(db, true);
    return (steps, params) => {
        const program = SqliteArguments.text(steps);
        if (program === null) {
            throw new Error('drivine_cypher has no steps.');
        }
        const procedure = new Procedure(statements, SqliteArguments.text(params));
        statements.run(`SAVEPOINT ${SAVEPOINT}`);
        try {
            procedure.run((JSON.parse(program) as { steps: Step[] }).steps);
            statements.run(`RELEASE ${SAVEPOINT}`);
        } catch (failure) {
            undo(statements);
            throw failure;
        }
        return `[${procedure.rows.map(rowText).join(',')}]`;
    };
}

/** Rolls back to where the procedure began, and leaves its savepoint. */
function undo(statements: SqliteStatements): void {
    for (const sql of [`ROLLBACK TO ${SAVEPOINT}`, `RELEASE ${SAVEPOINT}`]) {
        try {
            statements.run(sql);
        } catch {
            // The failure that stopped the procedure is the one to give.
        }
    }
}

/**
 * The rows a write keeps, each the JSON text, or the number, a step gave: a step that reads them is given them as a JSON
 * list (see `Procedure.values`). Each `json_insert` of a row into the list as text read and wrote the whole list again
 * (#624, liberation-data/drivine4j#588).
 */
type Kept = SqliteValue[];

/** A procedure as it is carried out: its variables, and the rows it has returned. */
class Procedure {
    readonly rows: SqliteValue[] = [];
    private readonly variables: Map<string, SqliteValue | Kept>;

    constructor(
        private readonly statements: SqliteStatements,
        params: string | null
    ) {
        this.variables = new Map([[PARAMS, params]]);
    }

    run(steps: Step[]): void {
        for (const step of steps) {
            if (!Object.prototype.hasOwnProperty.call(STEPS, step.op)) {
                throw new Error(`drivine_cypher has no step ${step.op}.`);
            }
            STEPS[step.op](this, step);
        }
    }

    /** The first column of each row the step's query gives. */
    query(step: Step): SqliteValue[] {
        return this.statements.rows(step.sql!, ...this.values(step)).map((row) => row[0] ?? null);
    }

    /** The first column of the first row the step's query gives, or null where it gives none. */
    first(step: Step): SqliteValue {
        return this.query(step)[0] ?? null;
    }

    update(step: Step): void {
        this.statements.update(step.sql!, ...this.values(step));
    }

    set(variable: string, value: SqliteValue | Kept): void {
        this.variables.set(variable, value);
    }

    /** The rows kept in `variable`, a list a `kept` step made. */
    kept(variable: string): Kept {
        const kept = this.variables.get(variable);
        if (!Array.isArray(kept)) {
            throw new Error(`drivine_cypher keeps no rows in ${variable}.`);
        }
        return kept;
    }

    /**
     * The values of the variables the step reads, in the order its parameters are numbered: null for one not set, and
     * the rows a write keeps as a JSON list.
     */
    private values(step: Step): SqliteValue[] {
        return (step.variables ?? []).map((name) => {
            const value = this.variables.get(name) ?? null;
            return Array.isArray(value) ? `[${value.map(rowText).join(',')}]` : value;
        });
    }
}

/** What each step does, by its `op`. */
const STEPS: Record<string, (procedure: Procedure, step: Step) => void> = {
    select: (procedure, step) => procedure.set(step.variable!, procedure.first(step)),
    loop: (procedure, step) => {
        for (const item of procedure.query(step)) {
            procedure.set(step.record!, item);
            procedure.run(step.body!);
        }
    },
    if: (procedure, step) => {
        // As drivine4j reads it, a number as a whole number: 1 holds.
        const found = procedure.first(step);
        if ((typeof found === 'bigint' || typeof found === 'number') && Math.trunc(Number(found)) === 1) {
            procedure.run(step.body!);
        }
    },
    raise: (_procedure, step) => {
        throw new Error(step.message);
    },
    execute: (procedure, step) => {
        if (step.variable != null) {
            procedure.set(step.variable, procedure.first(step));
        } else {
            procedure.update(step);
        }
    },
    kept: (procedure, step) => procedure.set(step.variable!, []),
    keep: (procedure, step) => {
        procedure.kept(step.variable!).push(procedure.first(step));
    },
    return: (procedure, step) => {
        procedure.rows.push(...procedure.query(step));
    }
};

/** A row a procedure returns, as drivine4j writes it into the list: a real number as Java writes a double. */
function rowText(value: SqliteValue): string {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'number') {
        return javaDouble(value);
    }
    return SqliteArguments.text(value)!;
}
