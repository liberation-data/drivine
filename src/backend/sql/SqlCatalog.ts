import { sqlText } from '@/backend/sql/SqlGraph';
import { SchemaSpec } from '@/schema/SchemaCatalog';
import type { SchemaItem } from '@/schema/SchemaGrammar';

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

/** The aliases a catalog record's `details` keep, as a listing reads them: none (undefined) where there are none. */
export function aliasesIn(details: unknown): string[] | undefined {
    const aliases = (details as Record<string, unknown> | null | undefined)?.aliases;
    return Array.isArray(aliases) && aliases.length ? aliases.map(String) : undefined;
}

/** The aliases as the JSON array a record's details keep them in, written byte for byte as drivine4j writes it. */
export function aliasesJson(aliases: string[]): string {
    const quoted = (alias: string): string =>
        '"' +
        [...alias]
            .map((c) =>
                c === '\\'
                    ? '\\\\'
                    : c === '"'
                    ? '\\"'
                    : c < ' '
                    ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
                    : c
            )
            .join('') +
        '"';
    return `[${aliases.map(quoted).join(',')}]`;
}

/** The aliases a record's details keep, as a listed item holds them: nothing where there are none. */
export function withAliases(details: unknown): Pick<SchemaItem, 'aliases'> {
    const aliases = aliasesIn(details);
    return aliases ? { aliases } : {};
}
