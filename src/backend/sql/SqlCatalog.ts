import { sqlText } from '@/backend/sql/SqlGraph';
import { SchemaSpec } from '@/schema/SchemaCatalog';

/**
 * What an item is recorded as in a graph's catalog (`<name>_schema`): drivine4j's `SchemaItemKind`, so a store whose
 * schema one library made is read the same by the others.
 */
export const CATALOG_KINDS = {
    RANGE: 'RANGE_INDEX',
    UNIQUE: 'UNIQUENESS_CONSTRAINT',
    VECTOR: 'VECTOR_INDEX',
    FULLTEXT: 'FULLTEXT_INDEX'
} as const;

/**
 * The properties of an item as its record holds them, drivine4j's form: part of the catalog's key, so written the same,
 * byte for byte, whichever library writes it.
 */
export function catalogProperties(properties: string[]): string {
    return `[${properties.map((it) => `"${it.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}]`;
}

/** Whether the catalog's row is the record of the item, recorded as any of `kinds` (drivine4j's kind unless given). */
export function catalogRecord(
    spec: Pick<SchemaSpec, 'kind' | 'label' | 'properties'>,
    kinds: string[] = [CATALOG_KINDS[spec.kind]]
): string {
    const kind = kinds.length === 1 ? `kind = ${sqlText(kinds[0])}` : `kind IN (${kinds.map(sqlText).join(', ')})`;
    return `${kind} AND label = ${sqlText(spec.label)} AND properties = ${sqlText(catalogProperties(spec.properties))}`;
}
