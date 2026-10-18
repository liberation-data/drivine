import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { itemName, RangeIndexSpec, UniquenessConstraintSpec } from '@/schema/SchemaSpecs';

/** What an engine reports of an item: its label and properties, and its name where it names items. */
export interface SchemaItem {
    label: string;
    properties: string[];
    name?: string;
}

/**
 * How an engine writes schema DDL and reports what it holds. A statement is Cypher, except where the engine takes a
 * native command (FalkorDB's constraints), given as a `native` operation.
 */
export interface SchemaGrammar {
    readonly engine: string;
    /** Whether the engine indexes a label's properties one by one, so that a composite index is one per property. */
    readonly rangesPerProperty?: boolean;
    /** Whether a uniqueness constraint needs a range index over its properties, made first. */
    readonly uniqueNeedsRange?: boolean;
    /** A statement listing range indexes, and how to read its rows. */
    listRanges: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listUniques: { statement: string; read: (rows: any[]) => SchemaItem[] };
    createRange(spec: RangeIndexSpec): string[];
    dropRange(spec: RangeIndexSpec): string[];
    createUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
    dropUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
}

/** A command for the engine's driver, rather than a Cypher statement. */
export interface NativeOperation {
    native: 'CONSTRAINT_CREATE' | 'CONSTRAINT_DROP';
    label: string;
    properties: string[];
}

const pattern = (spec: { label: string }): string => `(n${labelExpression([spec.label])})`;
const props = (spec: { properties: string[] }): string => spec.properties.map((it) => `n.${quoteName(it)}`).join(', ');

export const NEO4J_SCHEMA: SchemaGrammar = {
    engine: 'Neo4j',
    createRange: (spec) => [`CREATE INDEX ${itemName(spec)} IF NOT EXISTS FOR ${pattern(spec)} ON (${props(spec)})`],
    dropRange: (spec) => [`DROP INDEX ${itemName(spec)} IF EXISTS`],
    listRanges: {
        statement:
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, owningConstraint WHERE type = 'RANGE' " +
            "AND entityType = 'NODE' AND owningConstraint IS NULL RETURN {name: name, labels: labelsOrTypes, properties: properties}",
        read: (rows) => rows.map((it) => ({ label: it.labels[0], properties: it.properties, name: it.name }))
    },
    createUnique: (spec) => {
        const required = spec.properties.length === 1 ? props(spec) : `(${props(spec)})`;
        return [`CREATE CONSTRAINT ${itemName(spec)} IF NOT EXISTS FOR ${pattern(spec)} REQUIRE ${required} IS UNIQUE`];
    },
    dropUnique: (spec) => [`DROP CONSTRAINT ${itemName(spec)} IF EXISTS`],
    listUniques: {
        statement:
            "SHOW CONSTRAINTS YIELD name, type, entityType, labelsOrTypes, properties WHERE type IN ['UNIQUENESS', 'NODE_PROPERTY_UNIQUENESS'] " +
            "AND entityType = 'NODE' RETURN {name: name, labels: labelsOrTypes, properties: properties}",
        read: (rows) => rows.map((it) => ({ label: it.labels[0], properties: it.properties, name: it.name }))
    }
};

export const MEMGRAPH_SCHEMA: SchemaGrammar = {
    engine: 'Memgraph',
    createRange: (spec) => [
        `CREATE INDEX ON ${labelExpression([spec.label])}(${spec.properties.map(quoteName).join(', ')})`
    ],
    dropRange: (spec) => [
        `DROP INDEX ON ${labelExpression([spec.label])}(${spec.properties.map(quoteName).join(', ')})`
    ],
    listRanges: {
        // Columns: index type, label, property, count. Memgraph takes no RETURN after SHOW, so rows come as arrays.
        statement: 'SHOW INDEX INFO',
        read: (rows) =>
            rows.filter((it) => it[0] === 'label+property').map((it) => ({ label: it[1], properties: [it[2]].flat() }))
    },
    createUnique: (spec) => [`CREATE CONSTRAINT ON ${pattern(spec)} ASSERT ${props(spec)} IS UNIQUE`],
    dropUnique: (spec) => [`DROP CONSTRAINT ON ${pattern(spec)} ASSERT ${props(spec)} IS UNIQUE`],
    listUniques: {
        // Columns: constraint type, label, properties, data type.
        statement: 'SHOW CONSTRAINT INFO',
        read: (rows) =>
            rows.filter((it) => it[0] === 'unique').map((it) => ({ label: it[1], properties: [it[2]].flat() }))
    }
};

/**
 * FalkorDB indexes each property of a label on its own, so a composite range index is one per property, and present
 * when each is. Its uniqueness constraints are a Redis command, and need a range index over their properties.
 */
export const FALKORDB_SCHEMA: SchemaGrammar = {
    engine: 'FalkorDB',
    rangesPerProperty: true,
    uniqueNeedsRange: true,
    createRange: (spec) => [`CREATE INDEX FOR ${pattern(spec)} ON (${props(spec)})`],
    dropRange: (spec) => spec.properties.map((it) => `DROP INDEX FOR ${pattern(spec)} ON (n.${quoteName(it)})`),
    listRanges: {
        statement:
            "CALL db.indexes() YIELD label, properties, types, entitytype WHERE entitytype = 'NODE' RETURN {label: label, properties: properties, types: types}",
        // One item per property with a range index: a composite spec matches when all of its are present.
        read: (rows) =>
            rows.flatMap((it) =>
                (it.properties as string[])
                    .filter((property) => (it.types?.[property] ?? []).includes('RANGE'))
                    .map((property) => ({ label: it.label, properties: [property] }))
            )
    },
    createUnique: (spec) => [{ native: 'CONSTRAINT_CREATE', label: spec.label, properties: spec.properties }],
    dropUnique: (spec) => [{ native: 'CONSTRAINT_DROP', label: spec.label, properties: spec.properties }],
    listUniques: {
        statement:
            "CALL db.constraints() YIELD type, label, properties, entitytype, status WHERE type = 'UNIQUE' AND entitytype = 'NODE' " +
            'RETURN {label: label, properties: properties, status: status}',
        read: (rows) =>
            rows.filter((it) => it.status !== 'FAILED').map((it) => ({ label: it.label, properties: it.properties }))
    }
};

export function schemaGrammarFor(type: DatabaseType): SchemaGrammar {
    switch (type) {
        case DatabaseType.NEO4J:
            return NEO4J_SCHEMA;
        case DatabaseType.MEMGRAPH:
            return MEMGRAPH_SCHEMA;
        case DatabaseType.FALKORDB:
            return FALKORDB_SCHEMA;
        default:
            throw new DrivineError(`${type} has no schema management.`);
    }
}
