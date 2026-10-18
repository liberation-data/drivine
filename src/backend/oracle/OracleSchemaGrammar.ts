import { createHash } from 'crypto';
import { hasLabels, jsonKey, OracleGraph, sqlText } from '@/backend/oracle/OracleGraph';
import { DrivineError } from '@/DrivineError';
import { SchemaGrammar, SchemaItem } from '@/schema/SchemaGrammar';
import { FullTextIndexSpec, RangeIndexSpec, UniquenessConstraintSpec, VectorIndexSpec } from '@/schema/SchemaSpecs';

type Kind = 'RANGE' | 'UNIQUE';

/**
 * Indexes and constraints on Oracle, as drivine4j makes them: over the JSON properties of one label's nodes, a
 * function-based index of `CASE WHEN <the node carries the label> THEN JSON_VALUE(props, '$.<p>') END` per property,
 * so other labels' nodes are left out (their entries are null, which an index holds none of). A uniqueness
 * constraint is the same index, unique. Each item is recorded in the graph's catalog with the name of the object made
 * for it; listing reads the catalog, keeping items whose object is still there, and a drop drops the object recorded.
 */
export class OracleSchemaGrammar implements SchemaGrammar {
    readonly engine = 'Oracle';

    constructor(private readonly graph: OracleGraph) {}

    get listRanges(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('RANGE');
    }

    get listUniques(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return this.listing('UNIQUE');
    }

    get listVectors(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return { statement: 'SELECT 1 FROM dual WHERE 1 = 0', read: () => [] };
    }

    get listFullTexts(): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return { statement: 'SELECT 1 FROM dual WHERE 1 = 0', read: () => [] };
    }

    createRange(spec: RangeIndexSpec): string[] {
        return [this.create('RANGE', spec.label, spec.properties)];
    }

    dropRange(spec: RangeIndexSpec): string[] {
        return [this.drop('RANGE', spec.label, spec.properties)];
    }

    createUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.create('UNIQUE', spec.label, spec.properties)];
    }

    dropUnique(spec: UniquenessConstraintSpec): string[] {
        return [this.drop('UNIQUE', spec.label, spec.properties)];
    }

    createVector(_spec: VectorIndexSpec): string[] {
        throw new DrivineError('A vector index is not available on Oracle yet.');
    }

    dropVector(_spec: VectorIndexSpec): string[] {
        throw new DrivineError('A vector index is not available on Oracle yet.');
    }

    createFullText(_spec: FullTextIndexSpec): string[] {
        throw new DrivineError('A full-text index is not available on Oracle yet.');
    }

    dropFullText(_spec: FullTextIndexSpec): string[] {
        throw new DrivineError('A full-text index is not available on Oracle yet.');
    }

    conflicts(spec: UniquenessConstraintSpec, limit: number): string {
        const values = spec.properties.map((it) => `JSON_VALUE(n.props, '$${jsonKey(it)}')`);
        return (
            // One property's value as it is, several as a list, as the graph engines give them.
            `SELECT ${
                values.length === 1 ? values[0] : `JSON_ARRAY(${values.join(', ')} RETURNING JSON)`
            } AS "value" ` +
            `FROM ${this.graph.nodes} n ` +
            `WHERE ${hasLabels('n', [spec.label])} AND ${values.map((it) => `${it} IS NOT NULL`).join(' AND ')} ` +
            `GROUP BY ${values.join(', ')} HAVING COUNT(*) > 1 FETCH FIRST ${limit} ROWS ONLY`
        );
    }

    /** The name of the object made for an item: the graph's, the kind, and a hash of what it is over. */
    objectName(kind: Kind, label: string, properties: string[]): string {
        const hash = createHash('sha1')
            .update([kind, label, ...properties].join('\u0000'))
            .digest('hex')
            .slice(0, 12);
        return `${this.graph.name}_${kind === 'RANGE' ? 'r' : 'u'}_${hash}`.toUpperCase();
    }

    private listing(kind: Kind): { statement: string; read: (rows: any[]) => SchemaItem[] } {
        return {
            statement:
                `SELECT JSON_OBJECT('label' VALUE c.label, 'properties' VALUE JSON(c.properties), 'name' VALUE c.name ` +
                `RETURNING JSON) AS "item" FROM ${this.graph.catalog} c WHERE c.kind = '${kind}' AND EXISTS ` +
                `(SELECT 1 FROM user_indexes i WHERE i.index_name = c.object_name)`,
            read: (rows) => rows.map((it) => ({ label: it.label, properties: it.properties, name: it.name }))
        };
    }

    /** Makes the index and records it, in one block; an item recorded already is recorded again. */
    private create(kind: Kind, label: string, properties: string[]): string {
        const object = this.objectName(kind, label, properties);
        const columns = properties
            .map(
                (it) =>
                    `CASE WHEN ${hasLabels('n', [label])} THEN JSON_VALUE(n.props, '$${jsonKey(
                        it
                    )}' RETURNING VARCHAR2(4000) NULL ON ERROR) END`
            )
            .join(', ');
        const ddl = `CREATE ${kind === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX ${object} ON ${this.graph.nodes} n (${columns})`;
        const name = `${label}_${properties.join('_')}_${kind === 'RANGE' ? 'range' : 'unique'}`;
        return `BEGIN
    EXECUTE IMMEDIATE ${sqlText(ddl)};
    DELETE FROM ${this.graph.catalog} WHERE kind = '${kind}' AND label = ${sqlText(label)} AND properties = ${sqlText(
        JSON.stringify(properties)
    )};
    INSERT INTO ${this.graph.catalog} (kind, label, properties, name, object_name, details)
        VALUES ('${kind}', ${sqlText(label)}, ${sqlText(JSON.stringify(properties))}, ${sqlText(
            name
        )}, '${object}', JSON('{}'));
END;`;
    }

    private drop(kind: Kind, label: string, properties: string[]): string {
        const where = `kind = '${kind}' AND label = ${sqlText(label)} AND properties = ${sqlText(
            JSON.stringify(properties)
        )}`;
        return `DECLARE
    e_missing EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_missing, -1418);
BEGIN
    FOR it IN (SELECT object_name FROM ${this.graph.catalog} WHERE ${where}) LOOP
        BEGIN EXECUTE IMMEDIATE 'DROP INDEX ' || it.object_name; EXCEPTION WHEN e_missing THEN NULL; END;
    END LOOP;
    DELETE FROM ${this.graph.catalog} WHERE ${where};
END;`;
    }
}
