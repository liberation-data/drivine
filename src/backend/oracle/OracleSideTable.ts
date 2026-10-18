import { sqlText } from '@/backend/oracle/OracleGraph';

/**
 * A table beside the nodes that holds, for each node of a label, what an Oracle index can be over and a JSON property
 * cannot: an embedding as a VECTOR, or the text of some properties as a document (drivine4j's OracleSideTable). A
 * trigger on the node table keeps it in step with whatever writes a node, an object manager or SQL by hand; a backfill
 * fills it from the nodes there already. Each statement may run again.
 */
export class OracleSideTable {
    /** The trigger on the node table that keeps this one in step. */
    readonly trigger: string;
    /** The index over the column: a vector index, or an Oracle Text one. */
    readonly index: string;

    /** Drops the trigger, then the table (the index over it goes with it); neither fails when absent. */
    static dropping(name: string): string[] {
        return [`DROP TRIGGER IF EXISTS ${name}_t`, `DROP TABLE IF EXISTS ${name} PURGE`];
    }

    constructor(
        readonly name: string,
        private readonly nodes: string,
        private readonly column: string,
        private readonly columnType: string,
        /** The payload of the node whose row the argument names, as SQL. */
        private readonly payload: (row: string) => string,
        /** Whether the node whose row the argument names belongs in the table, as SQL. */
        private readonly indexed: (row: string) => string,
        /** A further test the backfill makes of a node's payload, which the trigger makes by trying to write it. */
        private readonly backfillFilter?: (row: string) => string,
        /** Whether a payload the column refuses leaves its node out of the table, rather than failing the node's write. */
        private readonly tolerant: boolean = false
    ) {
        this.trigger = `${name}_t`;
        this.index = `${name}_i`;
    }

    /** Makes the table, when it is not there. */
    get create(): string {
        return (
            `CREATE TABLE IF NOT EXISTS ${this.name} (nid NUMBER PRIMARY KEY REFERENCES ${this.nodes} (nid) ` +
            `ON DELETE CASCADE, ${this.column} ${this.columnType} NOT NULL)`
        );
    }

    /** The trigger that keeps the table in step. It names the new row with a colon: see `triggerStatement`. */
    get triggerDdl(): string {
        const write =
            `MERGE INTO ${this.name} s USING (SELECT :NEW.nid AS nid, ${this.payload(':NEW')} AS ${
                this.column
            } FROM dual) n ` +
            `ON (s.nid = n.nid) WHEN MATCHED THEN UPDATE SET s.${this.column} = n.${this.column} ` +
            `WHEN NOT MATCHED THEN INSERT (nid, ${this.column}) VALUES (n.nid, n.${this.column});`;
        // Not a payload the column takes: the node is kept, and left out of the table, as the graph engines leave it
        // out of the index.
        const kept = this.tolerant
            ? `BEGIN ${write} EXCEPTION WHEN OTHERS THEN DELETE FROM ${this.name} WHERE nid = :NEW.nid; END;`
            : write;
        return (
            `CREATE OR REPLACE TRIGGER ${this.trigger} AFTER INSERT OR UPDATE OF labels, props ON ${this.nodes} FOR EACH ROW ` +
            `BEGIN IF ${this.indexed(':NEW')} THEN ${kept} ELSE DELETE FROM ${
                this.name
            } WHERE nid = :NEW.nid; END IF; END;`
        );
    }

    /** Makes the trigger from inside a block, so that the `:NEW` it names is not read as a parameter. */
    get triggerStatement(): string {
        return `BEGIN EXECUTE IMMEDIATE ${sqlText(this.triggerDdl)}; END;`;
    }

    /** Fills the table from the nodes that are there and not in it yet. */
    get backfill(): string {
        return (
            `INSERT INTO ${this.name} (nid, ${this.column}) SELECT n.nid, ${this.payload('n')} FROM ${this.nodes} n ` +
            `WHERE ${this.indexed('n')}${this.backfillFilter ? ` AND ${this.backfillFilter('n')}` : ''} ` +
            `AND NOT EXISTS (SELECT 1 FROM ${this.name} s WHERE s.nid = n.nid)`
        );
    }
}
