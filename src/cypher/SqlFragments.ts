import { DrivineError } from '@/DrivineError';
import {
    fragment,
    FragmentPart,
    FragmentVariable,
    SharedGraph,
    SharedStore,
    SqlFragment
} from '@/cypher/SharedCypherCompiler';

/**
 * A fragment's Cypher: its text, or a function that writes it given `name`, which gives each of its parameters' names in
 * the Cypher (`name('p')` is `$f1_p`).
 */
export type FragmentCypher = string | ((name: (parameter: string) => string) => string);

/**
 * The fragments of one statement the library writes itself (drivine4j's `Fragments`): each compiled by {@link fragment},
 * its parameters named apart from every other fragment's, `$p` of the n-th as `$f<n>_p`, so that two fragments of one
 * statement don't bind one name. What they bind is gathered in {@link parameters}, to be bound beside the statement's
 * own, and the hints its outermost `SELECT` carries in {@link hints}.
 */
export class SqlFragments {
    /** What the fragments written so far bind, by the names the module gives them (`_cy_f1_p`, `_cyk_f1_p`). */
    readonly parameters: Record<string, any> = {};
    /** The optimizer hints the fragments written so far ask the statement's outermost `SELECT` to carry, in order. */
    readonly hints = new Set<string>();
    /** Whether a value a fragment written so far gives may be NaN or an infinity. */
    nonFinite = false;
    /** Whether a fragment written so far calls the graph's stored `nullsEqual` function (Oracle). */
    callsStoredNullsEqual = false;
    /** Whether a fragment written so far calls the graph's stored `era` function (Oracle). */
    callsStoredEra = false;

    private count = 0;

    constructor(
        private readonly store: SharedStore,
        private readonly graph: SharedGraph
    ) {}

    /** The one term of the condition `cypher` over `variables`, with `parameters` by the names `cypher` gives them. */
    condition(
        variables: Record<string, FragmentVariable>,
        cypher: FragmentCypher,
        parameters: Record<string, any> = {}
    ): string {
        return single(this.taken((text) => ({ condition: text }), variables, cypher, parameters));
    }

    /** The one term of the value `cypher` over `variables`: for the statement to group or bind by, never to compare. */
    value(
        variables: Record<string, FragmentVariable>,
        cypher: FragmentCypher,
        parameters: Record<string, any> = {}
    ): string {
        return single(this.taken((text) => ({ value: text }), variables, cypher, parameters));
    }

    /** The terms an `ORDER BY` sorts by `cypher` over `variables`, descending where `descending` is true. */
    order(
        variables: Record<string, FragmentVariable>,
        cypher: FragmentCypher,
        descending: boolean = false,
        parameters: Record<string, any> = {}
    ): string[] {
        return this.taken((text) => ({ order: text, descending }), variables, cypher, parameters).terms;
    }

    /** The next fragment compiled, its parameters named apart, and what it binds, its hints and its calls kept. */
    private taken(
        part: (cypher: string) => FragmentPart,
        variables: Record<string, FragmentVariable>,
        cypher: FragmentCypher,
        parameters: Record<string, any>
    ): SqlFragment {
        const prefix = `f${++this.count}_`;
        const text =
            typeof cypher === 'string'
                ? renamed(cypher, Object.keys(parameters), prefix)
                : cypher((it) => `$${prefix}${it}`);
        const given = Object.fromEntries(Object.entries(parameters).map(([name, value]) => [prefix + name, value]));
        const compiled = fragment(this.store, this.graph, part(text), variables, given);
        Object.assign(this.parameters, compiled.parameters);
        compiled.hints.forEach((it) => this.hints.add(it));
        this.nonFinite ||= compiled.nonFinite;
        this.callsStoredNullsEqual ||= compiled.storedFunctions.nullsEqual;
        this.callsStoredEra ||= compiled.storedFunctions.era;
        return compiled;
    }
}

/** The one term of a condition or a value. */
function single(compiled: SqlFragment): string {
    if (compiled.terms.length !== 1) {
        throw new DrivineError(
            `A fragment gave ${compiled.terms.length} terms where a condition or a value gives one.`
        );
    }
    return compiled.terms[0];
}

/**
 * `cypher` with each of `parameters`, `$p`, named `$<prefix>p`. A name is matched whole, so `$id` is not read in
 * `$idList`, and not within a quoted text or a name in backticks; a name may be a number, `$0`, as Cypher's may. A
 * parameter whose own name is in backticks (`` $`p` ``) isn't renamed: write the Cypher by a function
 * ({@link FragmentCypher}) for one. A parameter missed is never bound by its own name, so the module refuses it.
 */
function renamed(cypher: string, parameters: string[], prefix: string): string {
    if (parameters.length === 0) {
        return cypher;
    }
    const names = new Set(parameters);
    return cypher.replace(
        /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`]|``)*`|\$([\p{L}\p{N}_]+)/gu,
        (whole, name: string | undefined) => (name !== undefined && names.has(name) ? `$${prefix}${name}` : whole)
    );
}
