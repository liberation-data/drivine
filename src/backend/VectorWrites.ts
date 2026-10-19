import { quoteName } from '@/backend/Cypher';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { FragmentModel } from '@/model/FragmentModel';

/**
 * A node's vector properties, taken out of its props map to be written each in the engine's vector form: `props`
 * without them, and `vectors` by graph property name (null where a cleared field clears it).
 */
export function splitVectors(
    model: FragmentModel,
    props: Record<string, any>
): { props: Record<string, any>; vectors: Record<string, any> } {
    const names = new Set([...model.vectorFields.values()].map((it) => it.property));
    if (!names.size) {
        return { props, vectors: {} };
    }
    const rest: Record<string, any> = {};
    const vectors: Record<string, any> = {};
    for (const [name, value] of Object.entries(props)) {
        (names.has(name) ? vectors : rest)[name] = value;
    }
    return { props: rest, vectors };
}

/**
 * Clauses writing the vectors `source` (a map expression, e.g. `$root.vectors` or `row.vectors`) holds onto `alias`, and
 * the conditions that say one changes the node. A key that is absent or null leaves the property, unless `clears`
 * names it, which removes it.
 */
export function vectorClauses(
    model: FragmentModel,
    grammar: CypherGrammar,
    alias: string,
    source: string,
    clears: string[] = []
): { sets: string[]; changes: string[] } {
    const sets: string[] = [];
    const changed: string[] = [];
    for (const { property } of model.vectorFields.values()) {
        const value = `${source}.${quoteName(property)}`;
        const target = `${alias}.${quoteName(property)}`;
        const written = grammar.vectorValue(value);
        sets.push(`FOREACH (_ IN CASE WHEN ${value} IS NULL THEN [] ELSE [1] END | SET ${target} = ${written})`);
        changed.push(`(${value} IS NOT NULL AND (${target} IS NULL OR ${target} <> ${written}))`);
        if (clears.includes(property)) {
            sets.push(`SET ${target} = null`);
            changed.push(`${target} IS NOT NULL`);
        }
    }
    return { sets, changes: changed };
}
