import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresSchemaGrammar } from '@/backend/postgres/PostgresSchemaGrammar';
import { SqlGraph } from '@/backend/sql/SqlGraph';
import { labelExpression, quoteName } from '@/backend/Cypher';
import {
    FullTextIndexSpec,
    itemName,
    RangeIndexSpec,
    sampledNodeId,
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
    /**
     * Whether the engine holds part of what is made for the item and lacks the rest (Oracle: a range index whose index
     * over the label's nodes is gone), so that `ensure` makes the rest. It is listed, found and dropped as it is.
     */
    incomplete?: boolean;
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
    /**
     * Whether its range indexes and uniqueness constraints hold a label's nodes alone, so that a query over references
     * reads a filter on one of their properties through them, in place of the label (Oracle). The object manager then
     * gives the backend's renderQuery the ones there are.
     */
    readonly labelledIndexes?: boolean;
    /** Whether a uniqueness constraint needs a range index over its properties, made first. */
    readonly uniqueNeedsRange?: boolean;
    /** A statement listing range indexes, and how to read its rows. */
    listRanges: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listUniques: { statement: string; read: (rows: any[]) => SchemaItem[] };
    /**
     * Where a uniqueness constraint is built in the background (FalkorDB), a statement listing the ones whose build
     * failed, as when two nodes hold the same values, and how to read its rows.
     */
    listFailedUniques?: { statement: string; read: (rows: any[]) => SchemaItem[] };
    /** Where a uniqueness constraint is built in the background, the ones listed while still being built. */
    listBuildingUniques?: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listVectors: { statement: string; read: (rows: any[]) => SchemaItem[] };
    listFullTexts: { statement: string; read: (rows: any[]) => SchemaItem[] };
    createRange(spec: RangeIndexSpec): string[];
    /** Drops the range index; `name` is the engine's name for it, where the engine names items and Drivine didn't. */
    dropRange(spec: RangeIndexSpec, name?: string): string[];
    createUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
    dropUnique(spec: UniquenessConstraintSpec): (string | NativeOperation)[];
    createVector(spec: VectorIndexSpec): string[];
    dropVector(spec: VectorIndexSpec): string[];
    createFullText(spec: FullTextIndexSpec): string[];
    /** Drops the full-text index; `name` is the engine's name for it, where the engine names items. */
    dropFullText(spec: FullTextIndexSpec, name?: string): string[];
    /**
     * A statement giving up to `limit` keys that more than one of the label's nodes hold, one per row: each the
     * `properties` that repeat, the `count` of nodes that hold them, and `nodes`, `limit` of those at most, each its
     * `elementId` and, when the spec knows it, its `nodeIdProperty` (see ViolatingKey).
     */
    conflicts(spec: UniquenessConstraintSpec, limit: number): string;
    /** The pins of a vector index the engine can't express, by name: reported and logged, never dropped silently. */
    unsupportedVectorTuning?(spec: VectorIndexSpec): string[];
    /**
     * Whether a failure making a uniqueness constraint says a plain range index over the same label and properties is
     * in the way of it. Only on an engine whose constraint brings its own index, so that the plain one is redundant once
     * the constraint is made and may be dropped for it (Neo4j). Never where the constraint needs the plain index
     * (`uniqueNeedsRange`, FalkorDB) or is made beside it (Memgraph, Oracle, Postgres).
     */
    blockedByIndex?(failure: unknown): boolean;
}

/** Neo4j's code for an index over the schema a constraint would make its own index over. */
const INDEX_ALREADY_EXISTS = 'Neo.ClientError.Schema.IndexAlreadyExists';

/** The portable HNSW pins a spec makes, for an engine with no HNSW parameters of its own. */
function portablePins(spec: VectorIndexSpec): string[] {
    return [
        ...(spec.hnswM !== undefined ? ['hnswM'] : []),
        ...(spec.hnswEfConstruction !== undefined ? ['hnswEfConstruction'] : [])
    ];
}

/**
 * Keys that repeat over the properties, in Cypher, each with the nodes that hold it, `limit` of them at most: `elementId`
 * names how the engine gives a node's own id.
 */
function cypherConflicts(elementId: string): (spec: UniquenessConstraintSpec, limit: number) => string {
    return (spec, limit) => {
        const values = spec.properties.map((it) => `n.${quoteName(it)}`);
        const present = values.map((it) => `${it} IS NOT NULL`).join(' AND ');
        const keys = values.map((it, k) => `${it} AS _k${k}`).join(', ');
        const nodeId = sampledNodeId(spec);
        const node = [
            `elementId: ${elementId}(n)`,
            ...(nodeId !== undefined ? [`${quoteName(nodeId)}: n.${quoteName(nodeId)}`] : [])
        ].join(', ');
        const properties = spec.properties.map((it, k) => `${quoteName(it)}: _k${k}`).join(', ');
        return (
            `MATCH (n${labelExpression([spec.label])}) WHERE ${present} ` +
            `WITH ${keys}, count(*) AS holders, collect({${node}}) AS held WHERE holders > 1 ` +
            `RETURN {properties: {${properties}}, count: holders, nodes: held[0..${limit}]} LIMIT ${limit}`
        );
    };
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
    conflicts: cypherConflicts('elementId'),
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
                quantizationEnabled: quantizationEnabled(it.config),
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
            // `enabled`, not `type`: every Neo4j from 5 to 2026.10 accepts `enabled`, and those before 2026.06 refuse `type`.
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
    dropRange: (spec, name) => [`DROP INDEX ${quoteName(name ?? itemName(spec))} IF EXISTS`],
    /**
     * "There already exists an index (:Label {prop}). A constraint cannot be created until the index has been dropped."
     * Known by its code, however deep the failure is wrapped: not by a name clash, nor by its prose.
     */
    blockedByIndex: (failure) => {
        for (
            let cause: any = failure, depth = 0;
            cause && depth < 10;
            cause = cause.rootCause ?? cause.cause, depth++
        ) {
            if (cause.code === INDEX_ALREADY_EXISTS) {
                return true;
            }
        }
        return false;
    },
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
    conflicts: cypherConflicts('id'),
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
const FALKORDB_UNIQUES =
    "CALL db.constraints() YIELD type, label, properties, entitytype, status WHERE type = 'UNIQUE' AND entitytype = 'NODE' " +
    'RETURN {label: label, properties: properties, status: status}';

export const FALKORDB_SCHEMA: SchemaGrammar = {
    conflicts: cypherConflicts('id'),
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
        statement: FALKORDB_UNIQUES,
        read: (rows) =>
            rows.filter((it) => it.status !== 'FAILED').map((it) => ({ label: it.label, properties: it.properties }))
    },
    listFailedUniques: {
        statement: FALKORDB_UNIQUES,
        read: (rows) =>
            rows.filter((it) => it.status === 'FAILED').map((it) => ({ label: it.label, properties: it.properties }))
    },
    // UNDER CONSTRUCTION until it is OPERATIONAL or FAILED.
    listBuildingUniques: {
        statement: FALKORDB_UNIQUES,
        read: (rows) =>
            rows
                .filter((it) => it.status && it.status !== 'OPERATIONAL' && it.status !== 'FAILED')
                .map((it) => ({ label: it.label, properties: it.properties }))
    }
};

/** The schema grammar of an engine; on Oracle and Postgres, over `graph` (the default graph unless given). */
export function schemaGrammarFor(type: DatabaseType, graph?: SqlGraph): SchemaGrammar {
    switch (type) {
        case DatabaseType.NEO4J:
            return NEO4J_SCHEMA;
        case DatabaseType.MEMGRAPH:
            return MEMGRAPH_SCHEMA;
        case DatabaseType.FALKORDB:
            return FALKORDB_SCHEMA;
        case DatabaseType.ORACLE:
            return new OracleSchemaGrammar(graph instanceof OracleGraph ? graph : new OracleGraph(graph?.name));
        case DatabaseType.POSTGRES:
            return new PostgresSchemaGrammar(graph instanceof PostgresGraph ? graph : new PostgresGraph(graph?.name));
        default:
            throw new DrivineError(`${type} has no schema management.`);
    }
}

/**
 * Whether a Neo4j vector index quantizes, as its `indexConfig` reports it. Neo4j up to 2026.05 reports
 * `vector.quantization.enabled`. From 2026.06 it reports `vector.quantization.type` in its place: `NONE`, or the kind of
 * quantization, `SCALAR` or `BINARY`. Undefined when it reports neither.
 */
function quantizationEnabled(config: Record<string, unknown> | undefined): boolean | undefined {
    const type = config?.['vector.quantization.type'];
    if (typeof type === 'string') {
        return type.toUpperCase() !== 'NONE';
    }
    const enabled = config?.['vector.quantization.enabled'];
    return typeof enabled === 'boolean' ? enabled : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
    return value === undefined || value === null ? undefined : Number(value);
}
