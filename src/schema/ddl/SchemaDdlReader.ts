import { DdlSpec, SchemaDdlResult } from '@/schema/ddl/SchemaDdlResult';
import { described, Lexer, refusal, Token } from '@/schema/ddl/SchemaDdlLexer';
import {
    fullTextIndex,
    itemName,
    neo4jVectorOptions,
    rangeIndex,
    SimilarityFunction,
    uniquenessConstraint,
    UniquenessConstraintSpec,
    vectorIndex,
    VectorIndexSpec
} from '@/schema/SchemaSpecs';

/**
 * The uniqueness constraints of Drivine's own nodes, by label: the schema marker's scope and the store stamp's key, as
 * SchemaManager and StoreIdentityResolver ensure them.
 */
const RESERVED: Map<string, UniquenessConstraintSpec> = new Map([
    ['_DrivineSchema', uniquenessConstraint('_DrivineSchema', 'scope')],
    ['DrivineStore', uniquenessConstraint('DrivineStore', 'key')]
]);

/** The kinds of index a `CREATE … INDEX` names before `INDEX`. */
const INDEX_KINDS = new Set(['RANGE', 'BTREE', 'TEXT', 'FULLTEXT', 'VECTOR', 'POINT', 'LOOKUP']);

/** What a refusal calls the item a `CREATE … INDEX` of each kind makes; 'An index' for the rest. */
const INDEX_ITEMS: Record<string, string> = {
    FULLTEXT: 'A full-text index',
    VECTOR: 'A vector index',
    TEXT: 'A TEXT index'
};

/** The words a value of OPTIONS may be, in any case. */
const LITERALS = new Map<string, { value: boolean | null }>([
    ['true', { value: true }],
    ['false', { value: false }],
    ['null', { value: null }]
]);

/** Reads one statement's tokens, from its first. */
export class Reader {
    private readonly lexer: Lexer;
    private readonly tokens: Token[] = [];
    private position = 0;

    constructor(text: string) {
        this.lexer = new Lexer(text);
    }

    peek(ahead: number = 0): Token {
        while (this.tokens.length <= this.position + ahead) {
            const last = this.tokens[this.tokens.length - 1];
            this.tokens.push(last && (last.type === 'END' || last.type === 'BAD') ? last : this.lexer.next());
        }
        return this.tokens[this.position + ahead];
    }

    advance(): Token {
        const token = this.peek();
        this.position++;
        return token;
    }

    word(ahead: number, keyword: string): boolean {
        const token = this.peek(ahead);
        return token.type === 'WORD' && token.text.toUpperCase() === keyword.toUpperCase();
    }

    symbol(ahead: number, symbol: string): boolean {
        const token = this.peek(ahead);
        return token.type === 'SYMBOL' && token.text === symbol;
    }

    accept(symbol: string): boolean {
        const found = this.symbol(0, symbol);
        if (found) {
            this.advance();
        }
        return found;
    }

    fail(expected: string): never {
        const found = this.peek();
        if (found.type === 'BAD') {
            throw refusal(`Invalid schema command: ${found.text}`);
        }
        throw refusal(`Invalid schema command: expected ${expected}, but found ${described(found)}.`);
    }

    expectWord(keyword: string): void {
        if (!this.word(0, keyword)) {
            this.fail(keyword);
        }
        this.advance();
    }

    expectSymbol(symbol: string): void {
        if (!this.symbol(0, symbol)) {
            this.fail(`'${symbol}'`);
        }
        this.advance();
    }

    /** A label, a property or a variable: bare, or in backticks. */
    name(what: string): string {
        const token = this.peek();
        if (token.type !== 'WORD' && token.type !== 'NAME') {
            this.fail(what);
        }
        this.advance();
        if (!token.text.length) {
            throw refusal(`A ${what} is empty: an empty name names nothing.`);
        }
        return token.text;
    }

    /** The end of the statement, after an optional `;`. */
    end(): void {
        this.accept(';');
        if (this.peek().type !== 'END') {
            this.fail('the end of the schema command, which runs on its own');
        }
    }

    // ----- CREATE -----

    create(): SchemaDdlResult {
        const first = this.peek(1);
        if (first.type !== 'WORD') {
            return { type: 'NOT_DDL' };
        }
        const kind = first.text.toUpperCase();
        if ((kind === 'INDEX' || kind === 'CONSTRAINT') && !this.symbol(2, '=')) {
            this.position += 2;
            return kind === 'INDEX' ? this.index('') : this.constraint();
        }
        if (INDEX_KINDS.has(kind) && this.word(2, 'INDEX') && !this.symbol(3, '=')) {
            this.position += 3;
            return this.index(kind);
        }
        return { type: 'NOT_DDL' };
    }

    /** The item's name, when it has one: not the `IF NOT EXISTS`, `FOR (` or `ON :` that follows where it has none. */
    itemName(): string | undefined {
        const token = this.peek();
        if (token.type === 'PARAMETER') {
            throw refusal(
                `A schema item named by a parameter, $${token.text}, is not created on a SQL store: write its name.`
            );
        }
        if (token.type === 'WORD') {
            const keyword = token.text.toUpperCase();
            if (keyword === 'IF' && this.word(1, 'NOT')) {
                return undefined;
            }
            if (keyword === 'FOR' && this.symbol(1, '(')) {
                return undefined;
            }
            if (keyword === 'ON' && (this.symbol(1, ':') || this.symbol(1, '('))) {
                return undefined;
            }
        } else if (token.type !== 'NAME') {
            return undefined;
        }
        this.advance();
        if (!token.text.trim().length) {
            throw refusal("A schema item's name is empty: an item is created with a name, or with none.");
        }
        return token.text;
    }

    ifNotExists(): boolean {
        if (!this.word(0, 'IF')) {
            return false;
        }
        this.advance();
        this.expectWord('NOT');
        this.expectWord('EXISTS');
        return true;
    }

    /** The node pattern an item is for, `(n:L)`: its variable, which may be left out, and its one label. */
    nodePattern(item: string): [string | undefined, string] {
        this.expectSymbol('(');
        const variable = this.peek().type === 'WORD' || this.peek().type === 'NAME' ? this.name('variable') : undefined;
        if (this.symbol(0, ')')) {
            this.advance();
            if (this.symbol(0, '-') || this.symbol(0, '<')) {
                throw relationships(item);
            }
            throw refusal(`${item} is made for the nodes of one label, and this pattern names none.`);
        }
        this.expectSymbol(':');
        const label = this.name('label');
        if (this.symbol(0, '|') || this.symbol(0, ':') || this.symbol(0, '&')) {
            throw refusal(`${item} over several labels is not made on a SQL store: declare one for each label.`);
        }
        this.expectSymbol(')');
        if (this.symbol(0, '-') || this.symbol(0, '<')) {
            throw relationships(item);
        }
        return [variable, label];
    }

    /** A property of the pattern's node, `n.p`. */
    property(variable: string | undefined): string {
        const owner = this.name('variable');
        if (variable !== undefined && owner !== variable) {
            throw refusal(`The property ${owner}.… is of ${owner}, and the pattern binds ${variable}.`);
        }
        this.expectSymbol('.');
        return this.name('property');
    }

    /** Properties of the pattern's node, between `open` and `close`, separated by commas. */
    properties(variable: string | undefined, open: string, close: string): string[] {
        this.expectSymbol(open);
        const properties = [this.property(variable)];
        while (this.accept(',')) {
            properties.push(this.property(variable));
        }
        this.expectSymbol(close);
        return properties;
    }

    index(kind: string): SchemaDdlResult {
        if (kind === 'POINT') {
            throw refusal("A POINT index is Neo4j's, and is not made on a SQL store.");
        }
        if (kind === 'LOOKUP') {
            throw refusal(
                "A LOOKUP index is Neo4j's, and is not made on a SQL store, which finds a node's labels without one."
            );
        }
        const item = INDEX_ITEMS[kind] ?? 'An index';
        const name = this.itemName();
        const ifNotExists = this.ifNotExists();
        const [label, properties] = this.word(0, 'FOR') ? this.indexFor(kind, item) : this.indexOn(kind);
        if (kind === 'VECTOR' && this.word(0, 'WITH')) {
            throw refusal('A vector index WITH properties to filter by is not made on a SQL store.');
        }
        const options = this.options();
        this.end();
        switch (kind) {
            case 'TEXT':
                return this.created({ kind: 'TEXT', label, properties: [single(item, properties)] }, name, ifNotExists);
            case 'FULLTEXT':
                return this.created(fullTextIndex(label, properties), name, ifNotExists, analyzer(options));
            case 'VECTOR':
                return this.created(vector(label, single(item, properties), options), name, ifNotExists);
            default:
                return this.created(rangeIndex(label, properties), name, ifNotExists);
        }
    }

    /** The label and properties of `FOR (n:L) ON …`. */
    indexFor(kind: string, item: string): [string, string[]] {
        this.advance();
        const [variable, label] = this.nodePattern(item);
        this.expectWord('ON');
        if (kind === 'FULLTEXT') {
            this.expectWord('EACH');
            return [label, this.properties(variable, '[', ']')];
        }
        return [label, this.symbol(0, '(') ? this.properties(variable, '(', ')') : [this.property(variable)]];
    }

    /** The label and properties of Neo4j 4's `ON :L(a, b)`, whose properties are named bare. */
    indexOn(kind: string): [string, string[]] {
        if (!this.word(0, 'ON') || !this.symbol(1, ':') || kind === 'FULLTEXT' || kind === 'VECTOR') {
            this.fail('FOR');
        }
        this.advance();
        this.advance();
        const label = this.name('label');
        this.expectSymbol('(');
        const properties = [this.name('property')];
        while (this.accept(',')) {
            properties.push(this.name('property'));
        }
        this.expectSymbol(')');
        return [label, properties];
    }

    constraint(): SchemaDdlResult {
        const name = this.itemName();
        const ifNotExists = this.ifNotExists();
        if (!this.word(0, 'FOR') && !this.word(0, 'ON')) {
            this.fail('FOR');
        }
        const neo4j4 = this.word(0, 'ON');
        this.advance();
        const item = 'A constraint';
        const [variable, label] = this.nodePattern(item);
        this.expectWord(neo4j4 ? 'ASSERT' : 'REQUIRE');
        if (this.word(0, 'EXISTS') && this.symbol(1, '(')) {
            throw existence();
        }
        const properties = this.symbol(0, '(') ? this.properties(variable, '(', ')') : [this.property(variable)];
        this.expectWord('IS');
        this.unique(item);
        this.options();
        this.end();
        return this.created(uniquenessConstraint(label, properties), name, ifNotExists);
    }

    /** What follows a constraint's `IS`: `[NODE] UNIQUE`, or a kind of constraint a SQL store does not make. */
    unique(item: string): void {
        if (this.word(0, 'NOT')) {
            throw existence();
        }
        if (this.symbol(0, '::') || this.word(0, 'TYPED')) {
            throw refusal(
                "A property type constraint (IS :: TYPE) is not made on a SQL store: Drivine's schema has uniqueness constraints only."
            );
        }
        if (this.word(0, 'RELATIONSHIP') || this.word(0, 'REL')) {
            throw relationships(item);
        }
        if (this.word(0, 'NODE')) {
            this.advance();
        }
        if (this.word(0, 'KEY')) {
            throw key();
        }
        if (!this.word(0, 'UNIQUE')) {
            this.fail('UNIQUE');
        }
        this.advance();
    }

    /**
     * The spec, as DDL named it `name`: Drivine's own, or one to create, with the name as its alias where the schema
     * API names it otherwise.
     */
    created(spec: DdlSpec, name: string | undefined, ifNotExists: boolean, analyzer?: string): SchemaDdlResult {
        const own = RESERVED.get(spec.label);
        if (own) {
            if (spec.kind !== 'TEXT' && isReserved(spec)) {
                return { type: 'RESERVED', spec: own };
            }
            throw refusal(
                `${spec.label} is the label of Drivine's own nodes, and no schema is made for it but Drivine's.`
            );
        }
        return {
            type: 'CREATE',
            spec,
            ...(name !== undefined && name !== defaultName(spec) ? { alias: name } : {}),
            ifNotExists,
            ...(analyzer !== undefined ? { analyzer } : {})
        };
    }

    // ----- OPTIONS -----

    /** The map of `OPTIONS`, when there is one. */
    options(): Record<string, unknown> {
        if (!this.word(0, 'OPTIONS')) {
            return {};
        }
        this.advance();
        if (this.peek().type === 'PARAMETER') {
            throw refusal('OPTIONS given as a parameter are not read on a SQL store: write them.');
        }
        return this.map();
    }

    map(): Record<string, unknown> {
        this.expectSymbol('{');
        const map: Record<string, unknown> = {};
        if (!this.symbol(0, '}')) {
            do {
                const key = this.peek();
                if (key.type !== 'WORD' && key.type !== 'NAME' && key.type !== 'STRING') {
                    this.fail('a key');
                }
                this.advance();
                this.expectSymbol(':');
                map[key.text] = this.value();
            } while (this.accept(','));
        }
        this.expectSymbol('}');
        return map;
    }

    value(): unknown {
        const token = this.peek();
        if (token.type === 'STRING' || token.type === 'NUMBER') {
            const read = this.advance();
            return read.value ?? read.text;
        }
        if (this.symbol(0, '-') && this.peek(1).type === 'NUMBER') {
            this.advance();
            return -(this.advance().value as number);
        }
        const literal = token.type === 'WORD' ? LITERALS.get(token.text.toLowerCase()) : undefined;
        if (literal) {
            this.advance();
            return literal.value;
        }
        if (this.symbol(0, '{')) {
            return this.map();
        }
        if (this.symbol(0, '[')) {
            return this.list();
        }
        if (token.type === 'PARAMETER') {
            throw refusal(`An option given as a parameter, $${token.text}, is not read on a SQL store: write it.`);
        }
        return this.fail('a value');
    }

    /** A list of values, `[…]`. */
    list(): unknown[] {
        this.advance();
        const items: unknown[] = [];
        if (!this.symbol(0, ']')) {
            do {
                items.push(this.value());
            } while (this.accept(','));
        }
        this.expectSymbol(']');
        return items;
    }

    // ----- DROP -----

    drop(): SchemaDdlResult {
        this.advance();
        const kind = this.advance().text.toUpperCase() === 'INDEX' ? 'INDEX' : 'CONSTRAINT';
        const what = kind.toLowerCase();
        if (this.word(0, 'ON') && (this.symbol(1, ':') || this.symbol(1, '('))) {
            throw refusal(
                `DROP ${kind} ON … is Neo4j 4's, and drops by label and properties: drop the ${what} by its name.`
            );
        }
        const token = this.peek();
        if (token.type === 'PARAMETER') {
            const item = kind === 'INDEX' ? 'An index' : 'A constraint';
            throw refusal(
                `${item} named by a parameter, $${token.text}, is not dropped on a SQL store: write its name.`
            );
        }
        const name = this.name('name');
        let ifExists = false;
        if (this.word(0, 'IF')) {
            this.advance();
            this.expectWord('EXISTS');
            ifExists = true;
        }
        this.end();
        return { type: 'DROP', kind, name, ifExists };
    }

    // ----- CALL -----

    call(): SchemaDdlResult {
        const db = this.peek(1);
        const procedure = this.peek(3);
        const awaits =
            db.type === 'WORD' &&
            db.text === 'db' &&
            this.symbol(2, '.') &&
            procedure.type === 'WORD' &&
            (procedure.text === 'awaitIndexes' || procedure.text === 'awaitIndex');
        if (!awaits) {
            return { type: 'NOT_DDL' };
        }
        this.position += 4;
        if (this.accept('(')) {
            if (!this.symbol(0, ')')) {
                do {
                    if (this.peek().type === 'PARAMETER') {
                        this.advance();
                    } else {
                        this.value();
                    }
                } while (this.accept(','));
            }
            this.expectSymbol(')');
        }
        this.end();
        return { type: 'AWAIT_INDEXES' };
    }
}

function relationships(item: string): Error {
    return refusal(`${item} on relationships is not made on a SQL store: Drivine's schema is of nodes.`);
}

function existence(): Error {
    return refusal(
        "A property existence constraint (IS NOT NULL) is not made on a SQL store: Drivine's schema has uniqueness constraints only."
    );
}

function key(): Error {
    return refusal(
        "A key constraint (IS NODE KEY) is not made on a SQL store: Drivine's schema has uniqueness constraints only."
    );
}

function single(item: string, properties: string[]): string {
    if (properties.length !== 1) {
        throw refusal(`${item} is over one property, and this names ${properties.length}.`);
    }
    return properties[0];
}

/** How a value an option holds reads in a refusal. */
function shown(value: unknown): string {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function config(options: Record<string, unknown>): Record<string, unknown> {
    const found = options.indexConfig;
    if (found === undefined || found === null) {
        return {};
    }
    if (typeof found !== 'object' || Array.isArray(found)) {
        throw refusal('OPTIONS indexConfig is a map.');
    }
    return found as Record<string, unknown>;
}

function analyzer(options: Record<string, unknown>): string | undefined {
    const found = config(options)['fulltext.analyzer'];
    if (found === undefined || found === null) {
        return undefined;
    }
    if (typeof found !== 'string') {
        throw refusal(`A full-text index's \`fulltext.analyzer\` is the name of an analyzer, not ${shown(found)}.`);
    }
    return found;
}

function vector(label: string, property: string, options: Record<string, unknown>): VectorIndexSpec {
    const indexConfig = config(options);
    const dimensions = whole(indexConfig, 'vector.dimensions');
    if (dimensions === undefined) {
        throw refusal(
            'A vector index on a SQL store needs `vector.dimensions` in its OPTIONS indexConfig: nothing else gives the size of its embeddings.'
        );
    }
    const fn = indexConfig['vector.similarity_function'];
    let similarity: SimilarityFunction = 'COSINE';
    if (fn !== undefined && fn !== null) {
        const named = typeof fn === 'string' ? fn.toUpperCase() : undefined;
        if (named !== 'COSINE' && named !== 'EUCLIDEAN') {
            throw refusal(
                `A vector index's \`vector.similarity_function\` is 'cosine' or 'euclidean', not ${
                    typeof fn === 'string' ? `'${fn}'` : shown(fn)
                }.`
            );
        }
        similarity = named;
    }
    const enabled = indexConfig['vector.quantization.enabled'];
    if (enabled !== undefined && enabled !== null && typeof enabled !== 'boolean') {
        throw refusal(`A vector index's \`vector.quantization.enabled\` is true or false, not ${shown(enabled)}.`);
    }
    return vectorIndex(label, property, dimensions, similarity, {
        hnswM: whole(indexConfig, 'vector.hnsw.m'),
        hnswEfConstruction: whole(indexConfig, 'vector.hnsw.ef_construction'),
        engineOptions: typeof enabled === 'boolean' ? [neo4jVectorOptions({ quantizationEnabled: enabled })] : []
    });
}

/** The positive whole number `key` holds in the config; undefined where it holds none. */
function whole(indexConfig: Record<string, unknown>, key: string): number | undefined {
    const value = indexConfig[key];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647) {
        return value;
    }
    throw refusal(`A vector index's \`${key}\` is a positive whole number, not ${shown(value)}.`);
}

/** The name the schema API gives a spec: `itemName`, and `<label>_<property>_text` for a TEXT index. */
export function defaultName(spec: DdlSpec): string {
    return spec.kind === 'TEXT' ? `${spec.label}_${spec.properties[0]}_text` : itemName(spec);
}

/** Whether the spec is the uniqueness constraint of one of Drivine's own nodes, by any name. */
export function isReserved(spec: DdlSpec): boolean {
    const own = RESERVED.get(spec.label);
    return (
        spec.kind === 'UNIQUE' &&
        own !== undefined &&
        own.properties.length === spec.properties.length &&
        own.properties.every((it, k) => it === spec.properties[k])
    );
}
