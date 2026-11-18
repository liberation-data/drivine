import { StoredFunctionCalls } from '@/backend/GraphStatement';
import { SqlFragments } from '@/cypher/SqlFragments';

/**
 * What the shared module's fragments on Oracle ask of the statement they are written into, beside their SQL
 * (drivine-cypher-spec#235; drivine4j's `OracleSelect.hinted`): the optimizer hints its outermost `SELECT` or `DELETE`
 * carries, without which Oracle 23 can give a comparison the wrong truth (`NO_JSON_TABLE_TRANSFORM`), and the graph's
 * stored functions its terms call. A filter or an order of the query DSL is handed to the backend as text, which it
 * writes into a load, a count, a delete, a patch or a search; so what it asks travels with its text, as a comment of
 * its own ({@link noted}), which the statement it ends up in takes out again: {@link hinted} writes the hints where
 * Oracle reads them, and {@link called} says which functions the statement calls. Oracle reads the comment as a
 * comment, so a text never written into a statement still runs as it is.
 */

/** A comment {@link noted} writes: what one fragment asks, a hint (any text but the comment's end) or a function it calls. */
const NOTE = /\/\*drivine:(hint|calls) ((?:(?!\*\/)[^])+?)\*\//g;

/** The keyword a statement's hints follow: its first `SELECT` or `DELETE`, the outermost. */
const LEADING_KEYWORD = /\b(SELECT|DELETE)\b/i;

/**
 * `sql`, a filter or an order the fragments wrote, with what they ask of its statement before it: each hint in order,
 * and each stored function the terms call. Undefined for undefined, and `sql` itself where they ask nothing.
 */
export function noted(sql: string | undefined, fragments: SqlFragments): string | undefined {
    if (sql === undefined) {
        return undefined;
    }
    const notes = [
        ...[...fragments.hints].map((it) => `/*drivine:hint ${it}*/`),
        ...(fragments.callsStoredNullsEqual ? ['/*drivine:calls nullsEqual*/'] : []),
        ...(fragments.callsStoredEra ? ['/*drivine:calls era*/'] : []),
        ...(fragments.callsStoredTemporalArithmetic ? ['/*drivine:calls temporalArithmetic*/'] : [])
    ];
    return notes.join('') + sql;
}

/**
 * `sql`, one statement, with the hints the fragments in it ask for ({@link noted}) taken out and written once each, in
 * the order first asked, as `/*+ A B *\/` after its first `SELECT` or `DELETE`, the outermost: drivine4j's
 * `OracleSelect.hinted`. `more` are hints of its own fragments, asked before those. `sql` as it is where none are asked.
 * What the fragments call is left in, for {@link called}.
 */
export function hinted(sql: string, more: Iterable<string> = []): string {
    const hints = new Set<string>(more);
    const text = sql.replace(NOTE, (note: string, kind: string, name: string) => {
        if (kind !== 'hint') {
            return note;
        }
        hints.add(name);
        return '';
    });
    if (!hints.size) {
        return text;
    }
    const keyword = LEADING_KEYWORD.exec(text);
    if (!keyword) {
        return text;
    }
    const at = keyword.index + keyword[0].length;
    return `${text.slice(0, at)} /*+ ${[...hints].join(' ')} */${text.slice(at)}`;
}

/**
 * `text`, a statement of the graph `graph`, with the stored functions the fragments in it call ({@link noted}) taken out,
 * and which they are, with `more` of its own; undefined where it calls none. See OracleConnection.
 */
export function called(
    text: string,
    graph: string,
    more?: { callsStoredNullsEqual: boolean; callsStoredEra: boolean; callsStoredTemporalArithmetic: boolean }
): { text: string; calls?: StoredFunctionCalls } {
    let nullsEqual = more?.callsStoredNullsEqual ?? false;
    let era = more?.callsStoredEra ?? false;
    let temporalArithmetic = more?.callsStoredTemporalArithmetic ?? false;
    const taken = text.replace(NOTE, (note: string, kind: string, name: string) => {
        if (kind !== 'calls') {
            return note;
        }
        nullsEqual ||= name === 'nullsEqual';
        era ||= name === 'era';
        temporalArithmetic ||= name === 'temporalArithmetic';
        return '';
    });
    return {
        text: taken,
        ...(nullsEqual || era || temporalArithmetic ? { calls: { graph, nullsEqual, era, temporalArithmetic } } : {})
    };
}
