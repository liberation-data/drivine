import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { labelExpression, quoteName } from '@/backend/Cypher';
import {
    FullTextIndexSpec,
    itemName,
    RangeIndexSpec,
    SimilarityFunction,
    UniquenessConstraintSpec,
    VectorIndexSpec,
    vectorTuning,
    VectorTuning
} from '@/schema/SchemaSpecs';

/** What an engine reports of an item: its label and properties, and its name where it names items. */
export interface SchemaItem extends VectorTuning {
    label: string;
    properties: string[];
    name?: string;
    dimensions?: number;
    similarity?: SimilarityFunction;
}

/**
 * How an engine writes schema DDL and reports what it holds. A statement is Cypher, except where the engine takes a
 * native command (FalkorDB's constraints), given as a `native` operation.
 */
export interface SchemaGrammar {
    readonly engine: string;
    /** Whether the engine indexes a label's properties one by one, so that a composite index is one per property. */
    readonly rangesPerProperty?: boolean;
    /** Whether a full-text index over several properties is made over the whole label, and reported with none. */
    readonly fullTextOverLabel?: boolean;
    /** Whether a uniqueness constraint needs a range index over its properties, made first. */
    readonly uniqueNeedsRange?: boolean;
    /** A statement listing range indexes, and how to read its rows. */
    listRanges: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listUniques: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listVectors: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listFullTexts: { statement: string; read: (rows: any[]) => SchemaItem[] };
    createRange(spec: RangeIndexSpec): string[];
    dropRange(spec: RangeIndexSpec): string[];
    createUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
    dropUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
    createVector(spec: VectorIndexSpec): string[];
    dropVector(spec: VectorIndexSpec): string[];
    createFullText(spec: FullTextIndexSpec): string[];
    /** Drops the full-text index; `name` is the engine's name for it, where the engine names items. */
    dropFullText(spec: FullTextIndexSpec, name?: string): string[];
    /** A statement giving up to `limit` values that more than one of the label's nodes hold, one per row. */
    conflicts(spec: UniquenessConstraintSpec, limit: number): string;
    /** The pins of a vector index the engine can't express, by name: reported and logged, never dropped silently. */
    unsupportedVectorTuning?(spec: VectorIndexSpec): string[];
}

/** The portable HNSW pins a spec makes, for an engine with no HNSW parameters of its own. */
function portablePins(spec: VectorIndexSpec): string[] {
    return [
        ...(spec.hnswM !== undefined ? ['hnswM'] : []),
        ...(spec.hnswEfConstruction !== undefined ? ['hnswEfConstruction'] : [])
    ];
}

/** Duplicate values over the properties, in Cypher. */
function cypherConflicts(spec: UniquenessConstraintSpec, limit: number): string {
    const values = spec.properties.map((it) => `n.${quoteName(it)}`);
    const present = values.map((it) => `${it} IS NOT NULL`).join(' AND ');
    const key = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
    return (
        `MATCH (n${labelExpression([spec.label])}) WHERE ${present} WITH ${key} AS value, count(*) AS holders ` +
        `WHERE holders > 1 RETURN value LIMIT ${limit}`
    );
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
    conflicts: cypherConflicts,
    listVectors: {
        statement:
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, options WHERE type = 'VECTOR' AND entityType = 'NODE' " +
            'RETURN {name: name, labels: labelsOrTypes, properties: properties, config: options.indexConfig}',
        read: (rows) =>
            rows.map((it) => ({
                label: it.labels[0],
                properties: it.properties,
                name: it.name,
                dimensions: Number(it.config?.['vector.dimensions']),
                similarity: String(it.config?.['vector.similarity_function']).toUpperCase() as SimilarityFunction,
                quantizationEnabled: it.config?.['vector.quantization.enabled'] ?? undefined,
                hnswM: numberOrUndefined(it.config?.['vector.hnsw.m']),
                hnswEfConstruction: numberOrUndefined(it.config?.['vector.hnsw.ef_construction'])
            }))
    },
    listFullTexts: {
        statement:
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties WHERE type = 'FULLTEXT' AND entityType = 'NODE' " +
            'RETURN {name: name, labels: labelsOrTypes, properties: properties}',
        read: (rows) => rows.map((it) => ({ label: it.labels[0], properties: it.properties, name: it.name }))
    },
    createVector: (spec) => {
        const tuning = vectorTuning(spec, 'Neo4j');
        const config = [
            `\`vector.dimensions\`: ${spec.dimensions}`,
            `\`vector.similarity_function\`: '${spec.similarity.toLowerCase()}'`,
            ...(tuning.quantizationEnabled !== undefined
                ? [`\`vector.quantization.enabled\`: ${tuning.quantizationEnabled}`]
                : []),
            ...(tuning.hnswM !== undefined ? [`\`vector.hnsw.m\`: ${tuning.hnswM}`] : []),
            ...(tuning.hnswEfConstruction !== undefined
                ? [`\`vector.hnsw.ef_construction\`: ${tuning.hnswEfConstruction}`]
                : [])
        ];
        return [
            `CREATE VECTOR INDEX ${quoteName(itemName(spec))} IF NOT EXISTS FOR ${pattern(spec)} ON (${props(spec)}) ` +
                `OPTIONS {indexConfig: {${config.join(', ')}}}`
        ];
    },
    unsupportedVectorTuning: () => [],
    dropVector: (spec) => [`DROP INDEX ${quoteName(itemName(spec))} IF EXISTS`],
    createFullText: (spec) => [
        `CREATE FULLTEXT INDEX ${quoteName(itemName(spec))} IF NOT EXISTS FOR ${pattern(spec)} ON EACH [${props(spec)}]`
    ],
    dropFullText: (spec, name) => [`DROP INDEX ${quoteName(name ?? itemName(spec))} IF EXISTS`],
    engine: 'Neo4j',
    createRange: (spec) => [
        `CREATE INDEX ${quoteName(itemName(spec))} IF NOT EXISTS FOR ${pattern(spec)} ON (${props(spec)})`
    ],
    dropRange: (spec) => [`DROP INDEX ${quoteName(itemName(spec))} IF EXISTS`],
    listRanges: {
        statement:
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, owningConstraint WHERE type = 'RANGE' " +
            "AND entityType = 'NODE' AND owningConstraint IS NULL RETURN {name: name, labels: labelsOrTypes, properties: properties}",
        read: (rows) => rows.map((it) => ({ label: it.labels[0], properties: it.properties, name: it.name }))
    },
    createUnique: (spec) => {
        const required = spec.properties.length === 1 ? props(spec) : `(${props(spec)})`;
        return [
            `CREATE CONSTRAINT ${quoteName(itemName(spec))} IF NOT EXISTS FOR ${pattern(
                spec
            )} REQUIRE ${required} IS UNIQUE`
        ];
    },
    dropUnique: (spec) => [`DROP CONSTRAINT ${quoteName(itemName(spec))} IF EXISTS`],
    listUniques: {
        statement:
            "SHOW CONSTRAINTS YIELD name, type, entityType, labelsOrTypes, properties WHERE type IN ['UNIQUENESS', 'NODE_PROPERTY_UNIQUENESS'] " +
            "AND entityType = 'NODE' RETURN {name: name, labels: labelsOrTypes, properties: properties}",
        read: (rows) => rows.map((it) => ({ label: it.labels[0], properties: it.properties, name: it.name }))
    }
};

export const MEMGRAPH_SCHEMA: SchemaGrammar = {
    conflicts: cypherConflicts,
    fullTextOverLabel: true,
    listVectors: {
        // Columns: index_name, label (as ':Label'), property, capacity, dimension, metric, ...
        statement: 'SHOW VECTOR INDEX INFO',
        read: (rows) =>
            rows.map((it) => ({
                name: it[0],
                label: String(it[1]).replace(/^:/, ''),
                properties: [it[2]],
                dimensions: Number(it[4]),
                similarity: it[5] === 'cos' ? 'COSINE' : 'EUCLIDEAN'
            }))
    },
    listFullTexts: {
        // A text index is a SHOW INDEX INFO row of type 'label_text (name: <name>)'.
        statement: 'SHOW INDEX INFO',
        read: (rows) =>
            rows
                .filter((it) => String(it[0]).startsWith('label_text'))
                .map((it) => ({ name: /name: ([^)]+)/.exec(it[0])?.[1], label: it[1], properties: [it[2]].flat() }))
    },
    createVector: (spec) => [
        `CREATE VECTOR INDEX ${quoteName(itemName(spec))} ON ${labelExpression([spec.label])}(${quoteName(
            spec.properties[0]
        )}) WITH CONFIG ` +
            `{"dimension": ${spec.dimensions}, "capacity": ${spec.capacity ?? 1024}, "metric": "${
                spec.similarity === 'COSINE' ? 'cos' : 'l2sq'
            }"}`
    ],
    dropVector: (spec) => [`DROP VECTOR INDEX ${quoteName(itemName(spec))}`],
    // Memgraph's vector index takes no HNSW parameters.
    unsupportedVectorTuning: portablePins,
    // A text index over several properties indexes only the first (Memgraph 3.x), so one over several is made over the
    // whole label, which indexes every property: a search may then match the label's other text too.
    createFullText: (spec) => [
        spec.properties.length === 1
            ? `CREATE TEXT INDEX ${quoteName(itemName(spec))} ON ${labelExpression([spec.label])}(${quoteName(
                  spec.properties[0]
              )})`
            : `CREATE TEXT INDEX ${quoteName(itemName(spec))} ON ${labelExpression([spec.label])}`
    ],
    dropFullText: (spec, name) => [`DROP TEXT INDEX ${name ?? itemName(spec)}`],
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
    conflicts: cypherConflicts,
    engine: 'FalkorDB',
    rangesPerProperty: true,
    uniqueNeedsRange: true,
    listVectors: {
        statement:
            "CALL db.indexes() YIELD label, properties, types, options, entitytype WHERE entitytype = 'NODE' " +
            'RETURN {label: label, properties: properties, types: types, options: options}',
        read: (rows) =>
            rows.flatMap((it) =>
                (it.properties as string[])
                    .filter((property) => (it.types?.[property] ?? []).includes('VECTOR'))
                    .map((property) => ({
                        label: it.label,
                        properties: [property],
                        dimensions: Number(it.options?.[property]?.dimension),
                        similarity: String(
                            it.options?.[property]?.similarityFunction
                        ).toUpperCase() as SimilarityFunction,
                        hnswM: numberOrUndefined(it.options?.[property]?.M),
                        hnswEfConstruction: numberOrUndefined(it.options?.[property]?.efConstruction),
                        efRuntime: numberOrUndefined(it.options?.[property]?.efRuntime)
                    }))
            )
    },
    listFullTexts: {
        // One full-text index per label, over the properties that have one.
        statement:
            "CALL db.indexes() YIELD label, properties, types, entitytype WHERE entitytype = 'NODE' " +
            'RETURN {label: label, properties: properties, types: types}',
        read: (rows) =>
            rows
                .map((it) => ({
                    label: it.label,
                    properties: (it.properties as string[]).filter((property) =>
                        (it.types?.[property] ?? []).includes('FULLTEXT')
                    )
                }))
                .filter((it) => it.properties.length)
    },
    // FalkorDB names the HNSW parameters M / efConstruction, adds efRuntime, and accepts any key without complaint, so
    // the names are the ones it reads back.
    createVector: (spec) => {
        const tuning = vectorTuning(spec, 'FalkorDB');
        const options = [
            `dimension: ${spec.dimensions}`,
            `similarityFunction: '${spec.similarity.toLowerCase()}'`,
            ...(tuning.hnswM !== undefined ? [`M: ${tuning.hnswM}`] : []),
            ...(tuning.hnswEfConstruction !== undefined ? [`efConstruction: ${tuning.hnswEfConstruction}`] : []),
            ...(tuning.efRuntime !== undefined ? [`efRuntime: ${tuning.efRuntime}`] : [])
        ];
        return [`CREATE VECTOR INDEX FOR ${pattern(spec)} ON (${props(spec)}) OPTIONS {${options.join(', ')}}`];
    },
    unsupportedVectorTuning: () => [],
    dropVector: (spec) => [`DROP VECTOR INDEX FOR ${pattern(spec)} ON (${props(spec)})`],
    createFullText: (spec) => [`CREATE FULLTEXT INDEX FOR ${pattern(spec)} ON (${props(spec)})`],
    dropFullText: (spec) =>
        spec.properties.map((it) => `DROP FULLTEXT INDEX FOR ${pattern(spec)} ON (n.${quoteName(it)})`),
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
        case DatabaseType.ORACLE:
            return new OracleSchemaGrammar(new OracleGraph());
        default:
            throw new DrivineError(`${type} has no schema management.`);
    }
}

function numberOrUndefined(value: unknown): number | undefined {
    return value === undefined || value === null ? undefined : Number(value);
}
