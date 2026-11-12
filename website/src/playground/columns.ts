/**
 * The names of the columns `cypher`'s last RETURN gives, as Neo4j names them: each item's alias, or else its text. Read
 * from the text, splitting the items at commas outside brackets and strings, because the compiler on Drivine's pin
 * doesn't give the columns yet. Undefined where there is no RETURN to read.
 */
export function returnedColumns(cypher: string): string[] | undefined {
    const clause = lastReturn(withoutComments(cypher));
    if (clause === undefined) {
        return undefined;
    }
    return items(clause).map((item) => {
        const alias = /\s+AS\s+(`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*$/i.exec(item);
        return alias ? alias[1].replace(/^`|`$/g, '') : item.trim();
    });
}

/** `cypher` with each comment outside strings made a space, as a quote or a RETURN in one is no part of the query. */
function withoutComments(cypher: string): string {
    let out = '';
    let quote: string | undefined;
    for (let i = 0; i < cypher.length; i++) {
        const c = cypher[i];
        if (quote) {
            if (c === '\\') {
                out += c + (cypher[i + 1] ?? '');
                i++;
                continue;
            }
            if (c === quote) quote = undefined;
        } else if (c === "'" || c === '"' || c === '`') {
            quote = c;
        } else if (c === '/' && (cypher[i + 1] === '/' || cypher[i + 1] === '*')) {
            const end = cypher[i + 1] === '/' ? cypher.indexOf('\n', i) : cypher.indexOf('*/', i + 2) + 2;
            out += ' ';
            i = (end <= 1 ? cypher.length : end) - 1;
            continue;
        }
        out += c;
    }
    return out;
}

/** Each character's depth in brackets and whether it is in a string, so keywords and commas are found outside both. */
function* scan(text: string): Generator<{ i: number; outside: boolean }> {
    let depth = 0;
    let quote: string | undefined;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === '\\') {
                i++;
            } else if (c === quote) {
                quote = undefined;
            }
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            quote = c;
            continue;
        }
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) depth--;
        yield { i, outside: depth === 0 };
    }
}

/** The text of the last top-level RETURN's items, up to ORDER BY, SKIP, LIMIT, UNION or the end. */
function lastReturn(cypher: string): string | undefined {
    let start: number | undefined;
    for (const { i, outside } of scan(cypher)) {
        if (outside && /^RETURN\b/i.test(cypher.slice(i)) && (i === 0 || /\W/.test(cypher[i - 1]))) {
            start = i + 'RETURN'.length;
        }
    }
    if (start === undefined) {
        return undefined;
    }
    let body = cypher.slice(start).replace(/^\s*DISTINCT\b/i, '');
    for (const { i, outside } of scan(body)) {
        if (outside && /\W/.test(body[i - 1] ?? ' ') && /^(ORDER\s+BY|SKIP|LIMIT|UNION)\b/i.test(body.slice(i))) {
            body = body.slice(0, i);
            break;
        }
    }
    return body.replace(/;\s*$/, '');
}

/** `clause` split into its items at the commas outside brackets and strings. */
function items(clause: string): string[] {
    const found: string[] = [];
    let from = 0;
    for (const { i, outside } of scan(clause)) {
        if (outside && clause[i] === ',') {
            found.push(clause.slice(from, i));
            from = i + 1;
        }
    }
    found.push(clause.slice(from));
    return found.map((it) => it.trim()).filter((it) => it.length > 0);
}
