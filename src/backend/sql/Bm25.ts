import { TextQuery } from '@/backend/sql/TextQuery';

/** How soon a term's count stops adding to its score: Lucene's. */
export const K1 = 1.2;

/** How much a text's length, against the average, weighs its counts down: Lucene's. */
export const B = 0.75;

/** How a store writes what `bm25Ranked` asks of it. */
export interface Bm25Dialect {
    /**
     * How often a term occurs in a text, the term bound as a parameter: each time, where it is written again at once too, so
     * not taking the character after one (drivine4j#607).
     */
    count(text: string, term: string): string;
    /** Whether a term occurs in a text at all, the term bound as a parameter: cheaper than `count` where the store can tell. */
    holds(text: string, term: string): string;
    /** The natural logarithm of a number. */
    ln(value: string): string;
    /** A number as floating point. */
    real(value: string): string;
}

/**
 * The nodes whose text meets the query, each scored by BM25, the score Lucene, and so Neo4j's full-text index, gives it,
 * against the best of them, so the best scores one: a query of `nid` and `score` (drivine4j#604). Counted alone, a
 * common word outweighed the word a query is about, and a long text won by holding more of everything.
 *
 * `candidates` is a query of `nid`, `text` and `len` for the nodes of the label that may hold a scoring term, which a
 * store narrows by an index where it has one; `label` is a query of `len` for every node of the label. `text` is
 * lower-cased, as a term is matched in it, and `len` is the length in characters of the text before it was: lowering
 * every node's text only to measure it took most of the time a rare word's search did.
 *
 * Only the candidates that hold a scoring term are counted. Every node that holds a term is one of them, so the count of
 * those that hold it, each term's rarity, is a window aggregate over them, and exact. The label's count of nodes and
 * their average length are subqueries of their own, with no term matched, which no row is passed to, so a store works
 * each out once: joined beside the candidates, Postgres read the label again for each candidate where it guessed there
 * were few. Then the nodes that lack a required term, or hold an excluded one, are left out: they still count among
 * those that hold the terms they do.
 */
export function bm25Ranked(candidates: string, label: string, query: TextQuery, sql: Bm25Dialect): string {
    const tf = query.scored.map((_, i) => `tf${i + 1}`);
    const df = query.scored.map((_, i) => `df${i + 1}`);
    const required = query.required.map((_, i) => `r${i + 1}`);
    const excluded = query.excluded.map((_, i) => `x${i + 1}`);
    const counts: [string, string][] = [
        ...query.scored.map((term, i): [string, string] => [term, tf[i]]),
        ...query.required.map((term, i): [string, string] => [term, required[i]]),
        ...query.excluded.map((term, i): [string, string] => [term, excluded[i]])
    ];
    const counted =
        `SELECT ${['s.nid', 's.len', ...counts.map(([term, name]) => `${sql.count('s.text', term)} AS ${name}`)].join(
            ', '
        )} ` + `FROM (${candidates}) s WHERE (${query.scored.map((it) => sql.holds('s.text', it)).join(' OR ')})`;
    const figure = (of: string): string => `(SELECT ${sql.real(of)} FROM (${label}) l)`;
    const weighed =
        `SELECT ${[
            'h.*',
            `${figure('COUNT(*)')} AS n`,
            `${figure('AVG(l.len)')} AS avglen`,
            ...tf.map((t, i) => `SUM(CASE WHEN h.${t} > 0 THEN 1 ELSE 0 END) OVER () AS ${df[i]}`)
        ].join(', ')} ` + `FROM (${counted}) h`;
    const score = bm25Score(
        tf.map((t, i): [string, string] => [`w.${t}`, `w.${df[i]}`]),
        'w.n',
        'w.len',
        'NULLIF(w.avglen, 0)',
        sql.ln
    );
    const conditions = [...required.map((it) => `w.${it} > 0`), ...excluded.map((it) => `w.${it} = 0`)];
    const scored =
        `SELECT w.nid, ${sql.real(score)} AS score FROM (${weighed}) w` +
        `${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}`;
    return `SELECT b.nid, b.score / MAX(b.score) OVER () AS score FROM (${scored}) b WHERE b.score > 0`;
}

/**
 * The score of a text whose `length` is against the `average` over the label's `nodes`: for each term, its count in the
 * text and the count of the label's nodes that hold it, as SQL. `ln` is the store's natural logarithm. Lucene's weight of
 * a term's rarity, `ln(1 + (N - df + 0.5) / (df + 0.5))`, is never below 0, so a term every node holds adds nothing but
 * never takes away.
 */
export function bm25Score(
    terms: [string, string][],
    nodes: string,
    length: string,
    average: string,
    ln: (value: string) => string
): string {
    return terms
        .map(
            ([count, holding]) =>
                `${ln(`1 + (${nodes} - ${holding} + 0.5) / (${holding} + 0.5)`)} * ${count} * ${
                    K1 + 1
                } / (${count} + ${K1} * (${1 - B} + ${B} * ${length} / ${average}))`
        )
        .join(' + ');
}
