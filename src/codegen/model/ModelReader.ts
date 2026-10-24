import * as path from 'path';
import type * as TS from 'typescript';

/** One entry of the model file: its keys in the order the format's schema lists them; undefined ones left out. */
export type Entry = Record<string, unknown>;

/** What a module declares, read from its source. */
export interface ReadModel {
    fragments: Entry[];
    relationshipFragments: Entry[];
    views: Entry[];
    /** What could not be read, each with where it is. */
    problems: string[];
}

/** The package Drivine's decorators are imported from, its subpaths among them. */
const DRIVINE = /^@liberation-data\/drivine(\/.*)?$/;

/** Each index decorator and its kind in the format: first wins when a property has several. */
const INDEXES: [string, string][] = [
    ['Unique', 'unique'],
    ['RangeIndex', 'range'],
    ['FullTextIndex', 'fullText']
];

/** The decorators that map a view's field to something other than its root. */
const AGGREGATES = ['Count', 'Aggregate'];

/**
 * Reads a module's `@NodeFragment`, `@RelationshipFragment` and `@GraphView` classes from their source, with the
 * TypeScript compiler, as the model file describes them: what each stores, and under which names, as ModelRegistry
 * reads the same classes when the application runs. Read from the source rather than from the classes once loaded,
 * since a field no decorator marks leaves nothing at run time, and its type is known only to the compiler.
 *
 * A decorator's arguments are read as the compiler can tell them: literals, constants, enum members, and `() => Class`.
 */
export class ModelReader {
    private readonly checker: TS.TypeChecker;
    private readonly strictNulls: boolean;
    private readonly problems: string[] = [];

    /**
     * @param ts the TypeScript compiler, as the project has it.
     * @param program the project's program.
     * @param root the package's directory, which ids are relative to.
     */
    constructor(
        private readonly ts: typeof TS,
        private readonly program: TS.Program,
        private readonly root: string
    ) {
        this.checker = program.getTypeChecker();
        const options = program.getCompilerOptions();
        this.strictNulls = !!(options.strictNullChecks ?? options.strict);
    }

    /**
     * The id of a class: its file's path from the package's directory, without the extension, and its name, as
     * `src/fragments/Person#Person`.
     */
    id(decl: TS.ClassDeclaration): string {
        const file = path.relative(this.root, decl.getSourceFile().fileName).replace(/\\/g, '/');
        return `${file.replace(/\.(d\.)?[cm]?tsx?$/, '')}#${decl.name!.text}`;
    }

    /** Every entry the package's own source declares, each list sorted by id; what it could not read, in `problems`. */
    read(): ReadModel {
        const classes = this.classes();
        const of = (decorator: string): TS.ClassDeclaration[] => classes.filter((it) => this.decorator(it, decorator));
        const fragments = of('NodeFragment');
        const model: ReadModel = {
            fragments: fragments.map((it) => this.attempt(it, () => this.fragment(it, fragments))),
            relationshipFragments: of('RelationshipFragment').map((it) =>
                this.attempt(it, () => this.relationshipFragment(it))
            ),
            views: of('GraphView').map((it) => this.attempt(it, () => this.view(it))),
            problems: this.problems
        };
        for (const key of ['fragments', 'relationshipFragments', 'views'] as const) {
            model[key] = model[key].filter((it) => it.id).sort((a, b) => compare(a.id as string, b.id as string));
        }
        return model;
    }

    private attempt(decl: TS.ClassDeclaration, read: () => Entry): Entry {
        try {
            return read();
        } catch (e) {
            this.problems.push(`${this.id(decl)}: ${e instanceof Error ? e.message : String(e)}`);
            return {};
        }
    }

    /** Every class the package's own source declares. */
    private classes(): TS.ClassDeclaration[] {
        const found: TS.ClassDeclaration[] = [];
        for (const file of this.program.getSourceFiles()) {
            if (!this.isOwn(file)) {
                continue;
            }
            const visit = (node: TS.Node): void => {
                if (this.ts.isClassDeclaration(node) && node.name) {
                    found.push(node);
                }
                this.ts.forEachChild(node, visit);
            };
            visit(file);
        }
        return found;
    }

    /** Whether a file is the package's own source, rather than a declaration file or another package's. */
    private isOwn(file: TS.SourceFile): boolean {
        if (file.isDeclarationFile || this.program.isSourceFileFromExternalLibrary(file)) {
            return false;
        }
        const relative = path.relative(this.root, file.fileName);
        return !relative.startsWith('..') && !relative.split(/[\\/]/).includes('node_modules');
    }

    private fragment(decl: TS.ClassDeclaration, fragments: TS.ClassDeclaration[]): Entry {
        const chain = this.chain(decl);
        const labels: string[] = [];
        for (const it of chain) {
            const options = this.options(this.decorator(it, 'NodeFragment'), `@NodeFragment ${it.name!.text}`);
            // A label read wrong would name nodes the fragment never loads: one that can't be read is a problem.
            if ('labels' in options && !isStrings(options.labels)) {
                throw new Error(
                    `Can't read the labels of @NodeFragment ${it.name!.text}. Name each with a literal or a constant.`
                );
            }
            for (const label of strings(options.labels)) {
                if (!labels.includes(label)) {
                    labels.push(label);
                }
            }
        }
        if (!labels.length) {
            throw new Error(`@NodeFragment ${decl.name!.text} has no labels.`);
        }

        const properties = this.properties(chain).filter((it) => !this.on(it, 'GraphTransient'));
        const bags = properties.filter((it) => this.on(it, 'PropertyBag'));
        const labelSet = properties.find((it) => this.on(it, 'NodeLabels'));
        const stamp = properties.filter((it) => this.on(it, 'NodeStamp'));
        const plain = properties.filter((it) => !bags.includes(it) && !stamp.includes(it) && it !== labelSet);

        // A class's index over one property is that property's own.
        const classIndexes = INDEXES.flatMap(([decorator, kind]) =>
            chain.flatMap((it) =>
                this.decorators(it, decorator).map((d) => {
                    const what = `@${decorator} on ${it.name!.text}`;
                    const options = this.options(d, what);
                    return {
                        kind,
                        properties: this.given(options, 'properties', isStrings, `the properties of ${what}`) ?? []
                    };
                })
            )
        ).filter((it) => it.properties.length);
        const single = new Map(
            classIndexes.filter((it) => it.properties.length === 1).map((it) => [it.properties[0], it.kind])
        );
        const subtypes = fragments
            .filter((it) => it !== decl && this.chain(it).includes(decl))
            .map((it) => this.id(it));

        return {
            id: this.id(decl),
            name: decl.name!.text,
            labels,
            nodeId: properties.find((it) => this.on(it, 'NodeId'))?.name,
            stamp: stamp.length ? true : undefined,
            subtypes: subtypes.length ? subtypes.sort(compare) : undefined,
            // ModelRegistry.registerSubtype can add a subtype to any fragment in code, which the source doesn't show:
            // and a load gives the fragment itself for a node no subtype's labels match.
            subtypesComplete: false,
            labelSet: labelSet ? this.labelSet(labelSet) : undefined,
            bags: bags.length ? bags.sort(byName).map((it) => this.bag(it)) : undefined,
            properties: plain.sort(byName).map((it) => this.property(it, single.get(it.name))),
            indexes: classIndexes.some((it) => it.properties.length > 1)
                ? classIndexes.filter((it) => it.properties.length > 1)
                : undefined
        };
    }

    private relationshipFragment(decl: TS.ClassDeclaration): Entry {
        const properties = this.properties(this.chain(decl)).filter((it) => !this.on(it, 'GraphTransient'));
        const target = properties.find((it) => this.on(it, 'TargetNode'));
        if (!target) {
            throw new Error(`@RelationshipFragment ${decl.name!.text} has no @TargetNode property.`);
        }
        return {
            id: this.id(decl),
            name: decl.name!.text,
            target: {
                field: target.name,
                fragment: this.related(target, this.thunk(target, 'TargetNode'), ['NodeFragment', 'GraphView'])
            },
            properties: properties
                .filter((it) => it !== target)
                .sort(byName)
                .map((it) => this.property(it, undefined))
        };
    }

    private view(decl: TS.ClassDeclaration): Entry {
        const properties = this.properties(this.chain(decl));
        const root = properties.find((it) => this.on(it, 'Root'));
        if (!root) {
            throw new Error(`@GraphView ${decl.name!.text} has no @Root property.`);
        }
        const aggregates = properties.filter((it) => AGGREGATES.some((name) => this.on(it, name)));
        return {
            id: this.id(decl),
            name: decl.name!.text,
            root: { field: root.name, fragment: this.related(root, this.thunk(root, 'Root'), ['NodeFragment']) },
            relationships: properties
                .filter((it) => this.on(it, 'GraphRelationship') || this.on(it, 'GraphPath'))
                .sort(byName)
                .map((it) => this.relationship(it)),
            aggregates: aggregates.length ? aggregates.sort(byName).map((it) => this.aggregate(it)) : undefined
        };
    }

    private relationship(prop: Property): Entry {
        const many = this.isList(prop.type);
        const path = this.on(prop, 'GraphPath');
        if (path) {
            return this.path(prop, path, many);
        }
        const field = this.field(prop);
        const options = this.options(this.on(prop, 'GraphRelationship'), `@GraphRelationship ${field}`);
        const type = this.named(options.type, `the type of ${field}`);
        const target = this.given(options, 'target', this.isClass, `the class ${field} holds`, '() => Class');
        const into = this.kindOf(this.targetClass(prop, target));
        const depth = this.given(options, 'maxDepth', isNumber, `the maxDepth of ${field}`) ?? 1;
        // A relationship fragment is one relationship, whatever maxDepth says.
        const maxDepth = into === 'RelationshipFragment' ? 1 : depth;
        return {
            field: prop.name,
            type,
            direction: this.oneOf(options, 'direction', DIRECTIONS, `the direction of ${field}`),
            target: this.related(prop, target),
            many,
            required: this.given(options, 'required', isBoolean, `whether ${field} is required`) ?? false,
            maxDepth: maxDepth > 1 ? maxDepth : undefined,
            sortedBy: this.sortedBy(prop),
            // As ModelRegistry marks it: a list of fragments read over several hops is never written.
            readOnly: this.on(prop, 'ReadOnly') || (maxDepth > 1 && into !== 'GraphView') ? true : undefined
        };
    }

    private sortedBy(prop: Property): Entry | undefined {
        const sortedBy = this.on(prop, 'SortedBy');
        if (!sortedBy) {
            return undefined;
        }
        const args = this.keyed(sortedBy, ['property', 'ascending']);
        return {
            property: this.named(args.property, `what @SortedBy ${this.field(prop)} sorts by`),
            ascending: this.given(args, 'ascending', isBoolean, `which way @SortedBy ${this.field(prop)} sorts`) ?? true
        };
    }

    /** A path: never written, nor sorted, as ModelRegistry reads it. */
    private path(prop: Property, path: TS.Decorator, many: boolean): Entry {
        const field = this.field(prop);
        const hops = this.keyed(path, ['hops']).hops;
        const options = this.options(path, `@GraphPath ${field}`, 1);
        // A hop read wrong would lead the path elsewhere: hops that can't be read are a problem.
        if (!Array.isArray(hops) || !hops.length || !hops.every((it) => isObject(it) && typeof it.type === 'string')) {
            throw new Error(
                `Can't read the hops of @GraphPath ${field}. Name each with a literal, a constant or hop().`
            );
        }
        // As ModelRegistry refuses it: a path is read in one order.
        if (hops.filter((it) => it.orderBy).length > 1) {
            throw new Error(`@GraphPath ${field} names an order on more than one hop; a path is read in one order.`);
        }
        return {
            field: prop.name,
            target: this.related(
                prop,
                this.given(options, 'target', this.isClass, `the class ${field} holds`, '() => Class'),
                ['NodeFragment']
            ),
            many,
            required: this.given(options, 'required', isBoolean, `whether ${field} is required`) ?? false,
            readOnly: true,
            path: hops.map((it: Record<string, unknown>) => {
                const hop = `a hop of ${field}`;
                const orderBy = this.given(it, 'orderBy', isString, `what ${hop} sorts by`) || undefined;
                return {
                    type: it.type,
                    direction: this.oneOf(it, 'direction', DIRECTIONS, `the direction of ${hop}`),
                    label: this.given(it, 'label', isString, `the label of ${hop}`) || undefined,
                    orderBy,
                    ascending: orderBy
                        ? this.given(it, 'ascending', isBoolean, `which way ${hop} sorts`) ?? true
                        : undefined
                };
            })
        };
    }

    private aggregate(prop: Property): Entry {
        const field = this.field(prop);
        const count = this.on(prop, 'Count');
        if (count) {
            const args = this.keyed(count, ['type', 'direction']);
            return {
                field: prop.name,
                function: 'COUNT',
                type: this.named(args.type, `the type of ${field}`),
                direction: this.oneOf(args, 'direction', DIRECTIONS, `the direction of ${field}`)
            };
        }
        const options = this.options(this.on(prop, 'Aggregate'), `@Aggregate ${field}`);
        const fn = this.oneOf(options, 'function', FUNCTIONS, `the function of ${field}`);
        const property = this.given(options, 'property', isString, `the property ${field} aggregates`) || undefined;
        // As ModelRegistry refuses it: only a count needs no property.
        if (fn !== 'COUNT' && !property) {
            throw new Error(`The ${fn} ${field} needs the property it aggregates.`);
        }
        return {
            field: prop.name,
            function: fn,
            type: this.named(options.type, `the type of ${field}`),
            direction: this.oneOf(options, 'direction', DIRECTIONS, `the direction of ${field}`),
            property
        };
    }

    private property(prop: Property, classIndex: string | undefined): Entry {
        const typed = this.typed(prop.type);
        const packed = !!this.on(prop, 'JsonPacked');
        const vector = this.on(prop, 'VectorIndex');
        const vectorOptions = this.options(vector, `@VectorIndex ${this.field(prop)}`);
        const renamed = this.on(prop, 'GraphProperty');
        return {
            name: prop.name,
            stored: renamed
                ? this.named(this.args(renamed)[0], `the name of @GraphProperty ${this.field(prop)}`)
                : prop.name,
            // A packed value the format has no type for is JSON text, whatever it is in the code.
            type: packed && typed.type === 'any' ? 'json' : typed.type,
            of: typed.of,
            values: typed.values,
            nullable: prop.nullable,
            whenAbsent: this.on(prop, 'Default') ? 'default' : this.on(prop, 'EmptyWhenAbsent') ? 'empty' : undefined,
            packed: packed ? 'json' : undefined,
            index: INDEXES.find(([decorator]) => this.on(prop, decorator))?.[1] ?? classIndex,
            vector: vector ? this.vector(prop, vectorOptions) : undefined,
            source: this.checker.typeToString(this.nonNull(prop.type, true))
        };
    }

    private vector(prop: Property, options: Record<string, unknown>): Entry {
        return {
            similarity: this.oneOf(options, 'similarity', SIMILARITIES, `the similarity of ${this.field(prop)}`),
            dimensions: this.given(options, 'dimensions', isNumber, `the dimensions of ${this.field(prop)}`)
        };
    }

    private bag(prop: Property): Entry {
        const what = `@PropertyBag ${this.field(prop)}`;
        const options = this.options(this.on(prop, 'PropertyBag'), what);
        const flat = this.given(options, 'flat', isBoolean, `whether ${what} is flat`) ?? false;
        const prefix = (): string => this.given(options, 'prefix', isString, `the prefix of ${what}`) ?? prop.name;
        const delimiter = (): string => this.given(options, 'delimiter', isString, `the delimiter of ${what}`) ?? '.';
        return {
            field: prop.name,
            // As ModelRegistry resolves it: a flat bag stores each entry under its bare key.
            prefix: flat ? '' : `${prefix()}${delimiter()}`,
            flat: flat ? true : undefined,
            type: this.typed(prop.type).of ?? 'any'
        };
    }

    private labelSet(prop: Property): Entry {
        const decorator = this.on(prop, 'NodeLabels')!;
        const members = this.args(decorator)[0];
        const given = this.ts.isCallExpression(decorator.expression) && decorator.expression.arguments.length > 0;
        // Members read wrong would make a closed set open, or own labels it doesn't: ones that can't be read are a problem.
        if (given && !(Array.isArray(members) ? isStrings(members) : isObject(members))) {
            const field = this.field(prop);
            throw new Error(
                `Can't read the members of @NodeLabels ${field}. Name them with a list, an enum or a constant.`
            );
        }
        // As the decorator takes them: a list's, or an object's values that are strings.
        const values = given ? strings(Array.isArray(members) ? members : Object.values(members as object)) : undefined;
        return { field: prop.name, values };
    }

    /** A name a decorator gives, which a guess would write wrong: one that can't be read is a problem. */
    private named(value: unknown, what: string): string {
        if (typeof value !== 'string' || !value) {
            throw new Error(`Can't read ${what}. Name it with a literal or a constant.`);
        }
        return value;
    }

    /**
     * One of the values a decorator's option may take: the first when the option is not given, and a problem when it
     * is given and can't be read, which the compiler can't tell from one left out.
     */
    private oneOf(options: Record<string, unknown>, key: string, allowed: readonly string[], what: string): string {
        const is = (value: unknown): value is string => typeof value === 'string' && allowed.includes(value);
        return this.given(options, key, is, what, `${allowed.join(', ')}, or a constant of one`) ?? allowed[0];
    }

    /**
     * An option a decorator may leave out: undefined when it is not given, and a problem when it is given and can't be
     * read, rather than the default it would otherwise be written as.
     */
    private given<T>(
        options: Record<string, unknown>,
        key: string,
        is: (value: unknown) => value is T,
        what: string,
        how: string = 'a literal or a constant'
    ): T | undefined {
        if (!(key in options)) {
            return undefined;
        }
        const value = options[key];
        if (!is(value)) {
            throw new Error(`Can't read ${what}. Name it with ${how}.`);
        }
        return value;
    }

    /** A decorator's options object: none when it is not given, and a problem when it is given and can't be read. */
    private options(decorator: TS.Decorator | undefined, what: string, index: number = 0): Record<string, unknown> {
        const names = [...Array(index + 1).keys()].map(String);
        return this.given(this.keyed(decorator, names), names[index], isObject, `the options of ${what}`) ?? {};
    }

    /** A decorator's arguments, keyed by the names given, each left out when it is not given, or given as none. */
    private keyed(decorator: TS.Decorator | undefined, names: string[]): Record<string, unknown> {
        if (!decorator || !this.ts.isCallExpression(decorator.expression)) {
            return {};
        }
        return this.positional(decorator.expression.arguments, names);
    }

    private positional(args: TS.NodeArray<TS.Expression>, names: string[]): Record<string, unknown> {
        return Object.fromEntries(
            args.flatMap((it, i) => (i < names.length && !this.isNone(it) ? [[names[i], this.value(it)]] : []))
        );
    }

    /** Whether an expression is `undefined` or `null`, which leaves an option out as surely as not giving it. */
    private isNone(node: TS.Expression): boolean {
        const ts = this.ts;
        const bare = this.bare(node);
        return bare.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(bare) && bare.text === 'undefined');
    }

    /** A field as `Class.field`, by the class whose declaration of it carries its decorators. */
    private field(prop: Property): string {
        return `${this.ts.findAncestor(prop.decorated, this.ts.isClassDeclaration)?.name?.text}.${prop.name}`;
    }

    /**
     * The id of what a relationship, a root or a target node leads to: the class its decorator names, or its type. One
     * of this package's classes that is not of a kind the field may hold is a problem, as ModelRegistry refuses it,
     * rather than an id no entry has.
     */
    private related(prop: Property, thunk: TS.ClassDeclaration | undefined, kinds: string[] = KINDS): string {
        const decl = this.targetClass(prop, thunk);
        const kind = this.kindOf(decl);
        if (this.isOwn(decl.getSourceFile()) && !(kind && kinds.includes(kind))) {
            const what = kinds
                .map((it) => `@${it}`)
                .join(', ')
                .replace(/, (?=[^,]*$)/, ' or ');
            throw new Error(`${this.field(prop)} holds ${decl.name!.text}, which is not a ${what}.`);
        }
        return this.id(decl);
    }

    /** The class a `@Root` or `@TargetNode` names, when it names one. */
    private thunk(prop: Property, decorator: string): TS.ClassDeclaration | undefined {
        const args = this.keyed(this.on(prop, decorator), ['target']);
        return this.given(args, 'target', this.isClass, `the class ${this.field(prop)} holds`, '() => Class');
    }

    private readonly isClass = (value: unknown): value is TS.ClassDeclaration =>
        !!value && this.ts.isClassDeclaration(value as TS.Node);

    private targetClass(prop: Property, thunk: TS.ClassDeclaration | undefined): TS.ClassDeclaration {
        if (thunk) {
            return thunk;
        }
        const type = this.nonNull(prop.type);
        const element = this.isList(type) ? this.elementOf(type) : type;
        const decl = element
            ?.getSymbol()
            ?.declarations?.find((it): it is TS.ClassDeclaration => this.ts.isClassDeclaration(it));
        if (!decl) {
            throw new Error(
                `Can't tell what ${this.field(prop)} holds. Name its class in the decorator, e.g. () => Item.`
            );
        }
        return decl;
    }

    private kindOf(decl: TS.ClassDeclaration): string | undefined {
        return KINDS.find((it) => this.decorator(decl, it));
    }

    // Types

    private typed(type: TS.Type): Typed {
        const t = this.nonNull(type);
        return this.enumerated(t) ?? this.scalar(t) ?? this.collection(t) ?? { type: 'any' };
    }

    /** A union of string literals, or an enum: a string enum's values, or a number enum's numbers. */
    private enumerated(t: TS.Type): Typed | undefined {
        const members = t.isUnion() ? t.types : [t];
        const strings = members.every((it) => it.isStringLiteral());
        if (!(t.isUnion() && strings) && !(t.flags & this.ts.TypeFlags.EnumLike)) {
            return undefined;
        }
        return strings
            ? { type: 'enum', values: members.map((it) => (it as TS.StringLiteralType).value).sort(compare) }
            : { type: 'int' };
    }

    private scalar(t: TS.Type): Typed | undefined {
        const flags = this.ts.TypeFlags;
        const kinds: [number, string][] = [
            [flags.String | flags.StringLiteral | flags.TemplateLiteral, 'string'],
            [flags.Number | flags.NumberLiteral, 'float'],
            [flags.BigInt | flags.BigIntLiteral, 'int'],
            [flags.Boolean | flags.BooleanLiteral, 'boolean']
        ];
        const kindOf = (it: TS.Type): string | undefined => kinds.find(([flag]) => it.flags & flag)?.[1];
        // A union of literals of one kind, as `1 | 2`, is that kind.
        const members = t.isUnion() && !(t.flags & flags.Boolean) ? t.types.map(kindOf) : [kindOf(t)];
        const kind = members[0];
        if (kind && members.every((it) => it === kind)) {
            return { type: kind };
        }
        return t.getSymbol()?.getName() === 'Date' ? { type: 'datetime' } : undefined;
    }

    /** A list, of its elements' type, or a map, of its values'. */
    private collection(t: TS.Type): Typed | undefined {
        if (this.isList(t)) {
            // A tuple's elements are of one type only when each is.
            const elements = this.checker.isTupleType(t)
                ? this.checker.getTypeArguments(t as TS.TypeReference)
                : [this.elementOf(t)];
            const types = new Set(elements.map((it) => (it ? this.typed(it).type : 'any')));
            return { type: 'list', of: types.size === 1 ? [...types][0] : 'any' };
        }
        const name = t.getSymbol()?.getName();
        const indexed = this.checker.getIndexInfoOfType(t, this.ts.IndexKind.String)?.type;
        if (name !== 'Map' && !indexed) {
            return undefined;
        }
        const value = name === 'Map' ? this.checker.getTypeArguments(t as TS.TypeReference)[1] : indexed;
        return { type: 'map', of: value ? this.typed(value).type : 'any' };
    }

    /** Whether a value of the type is a list: an array, a tuple or a Set. */
    private isList(type: TS.Type): boolean {
        const t = this.nonNull(type);
        return (
            this.checker.isArrayType(t) ||
            this.checker.isTupleType(t) ||
            ['Set', 'ReadonlySet', 'ReadonlyArray'].includes(t.getSymbol()?.getName() ?? '')
        );
    }

    private elementOf(type: TS.Type): TS.Type | undefined {
        const args = this.checker.getTypeArguments(this.nonNull(type) as TS.TypeReference);
        return args[0];
    }

    /** The type without `null` and `undefined`; `unknown` as it is, for showing, where the compiler would give `{}`. */
    private nonNull(type: TS.Type, shown: boolean = false): TS.Type {
        return shown && type.flags & this.ts.TypeFlags.Unknown ? type : this.checker.getNonNullableType(type);
    }

    // Classes and their properties

    /** The class and the classes it extends, nearest first, as ModelRegistry's classChain has them. */
    private chain(decl: TS.ClassDeclaration): TS.ClassDeclaration[] {
        const chain: TS.ClassDeclaration[] = [];
        for (let it: TS.ClassDeclaration | undefined = decl; it && !chain.includes(it); it = this.superclass(it)) {
            chain.push(it);
        }
        return chain;
    }

    private superclass(decl: TS.ClassDeclaration): TS.ClassDeclaration | undefined {
        const extended = decl.heritageClauses?.find((it) => it.token === this.ts.SyntaxKind.ExtendsKeyword)?.types[0];
        if (!extended) {
            return undefined;
        }
        return this.classOf(extended.expression);
    }

    /** The class an expression names, through imports. */
    private classOf(node: TS.Node): TS.ClassDeclaration | undefined {
        let symbol = this.checker.getSymbolAtLocation(node);
        if (symbol && symbol.flags & this.ts.SymbolFlags.Alias) {
            symbol = this.checker.getAliasedSymbol(symbol);
        }
        return symbol?.declarations?.find((it): it is TS.ClassDeclaration => this.ts.isClassDeclaration(it));
    }

    /**
     * The fields of a class and those it inherits, a subclass's declaration of a field over its superclass's: the
     * instance properties it declares, and those its constructor's parameters do.
     */
    private properties(chain: TS.ClassDeclaration[]): Property[] {
        const found = new Map<string, Property>();
        for (const decl of chain) {
            const members: TS.Declaration[] = [];
            for (const member of decl.members) {
                if (this.ts.isPropertyDeclaration(member) && !this.isStatic(member)) {
                    members.push(member);
                }
                if (this.ts.isConstructorDeclaration(member)) {
                    members.push(...member.parameters.filter((it) => this.ts.getModifiers(it)?.length));
                }
            }
            for (const member of members) {
                const named = member as TS.PropertyDeclaration | TS.ParameterDeclaration;
                if (!this.ts.isIdentifier(named.name)) {
                    continue;
                }
                const nearer = found.get(named.name.text);
                // A field a subclass declares again without Drivine's decorators keeps its superclass's, as at run time.
                if (nearer && !this.drivineDecorators(nearer.decorated).length) {
                    nearer.decorated = named;
                }
                if (nearer) {
                    continue;
                }
                const type = this.checker.getTypeAtLocation(named);
                found.set(named.name.text, {
                    name: named.name.text,
                    decorated: named,
                    type,
                    nullable: this.nullable(named, type)
                });
            }
        }
        return [...found.values()];
    }

    private isStatic(member: TS.PropertyDeclaration): boolean {
        return !!this.ts.getModifiers(member)?.some((it) => it.kind === this.ts.SyntaxKind.StaticKeyword);
    }

    private nullable(decl: TS.PropertyDeclaration | TS.ParameterDeclaration, type: TS.Type): boolean | 'unknown' {
        if (decl.questionToken) {
            return true;
        }
        // Without strict null checks, the compiler erases `| undefined` and `| null`, and can't say.
        if (!this.strictNulls) {
            return 'unknown';
        }
        // `any` and `unknown` hold null too, though the compiler takes nothing out of them.
        return !!(type.flags & (this.ts.TypeFlags.Any | this.ts.TypeFlags.Unknown)) || type !== this.nonNull(type);
    }

    // Decorators

    /** A Drivine decorator on a class or a field, by name, imported from Drivine rather than from elsewhere. */
    private decorator(node: TS.Node, name: string): TS.Decorator | undefined {
        return this.decorators(node, name)[0];
    }

    private decorators(node: TS.Node, name: string): TS.Decorator[] {
        return this.drivineDecorators(node).filter((it) => this.drivineName(this.callee(it)) === name);
    }

    /** The decorators on a class or a field that Drivine exports, whatever the module imports them as. */
    private drivineDecorators(node: TS.Node): TS.Decorator[] {
        const all = this.ts.canHaveDecorators(node) ? this.ts.getDecorators(node) ?? [] : [];
        return all.filter((it) => this.drivineName(this.callee(it)) !== undefined);
    }

    /** What a decorator names: `NodeFragment` of `@NodeFragment({ ... })` as of `@NodeFragment`. */
    private callee(decorator: TS.Decorator): TS.Expression {
        const expression = decorator.expression;
        return this.ts.isCallExpression(expression) ? expression.expression : expression;
    }

    private on(prop: Property, name: string): TS.Decorator | undefined {
        return this.decorator(prop.decorated, name);
    }

    /**
     * The name Drivine exports what an expression names under, when it is imported from Drivine rather than declared
     * here or taken from another library: `NodeFragment` for `NodeFragment`, for `Fragment` imported as
     * `{ NodeFragment as Fragment }`, and for `drivine.NodeFragment` with `import * as drivine`.
     */
    private drivineName(node: TS.Expression): string | undefined {
        const ts = this.ts;
        const qualified = ts.isPropertyAccessExpression(node);
        const named = qualified ? node.expression : node;
        const declaration = ts.isIdentifier(named)
            ? this.checker.getSymbolAtLocation(named)?.declarations?.[0]
            : undefined;
        if (!qualified && declaration && ts.isImportSpecifier(declaration)) {
            const name = (declaration.propertyName ?? declaration.name).text;
            return isDrivine(ts, declaration.parent.parent.parent.moduleSpecifier) ? name : undefined;
        }
        if (qualified && declaration && ts.isNamespaceImport(declaration)) {
            return isDrivine(ts, declaration.parent.parent.moduleSpecifier) ? node.name.text : undefined;
        }
        return undefined;
    }

    /** A decorator's arguments, each as its value: what the compiler can tell of it. */
    private args(decorator: TS.Decorator | undefined): unknown[] {
        if (!decorator || !this.ts.isCallExpression(decorator.expression)) {
            return [];
        }
        return decorator.expression.arguments.map((it) => this.value(it));
    }

    /**
     * An expression's value, as far as the compiler can tell it without running it: a literal, a list, an object, a
     * constant or an enum member, a call of Drivine's `hop`, or, for `() => Class`, the class.
     */
    private value(node: TS.Expression): unknown {
        for (const read of [this.literal, this.structure, this.reference]) {
            const found = read.call(this, this.bare(node));
            if (found !== NOTHING) {
                return found;
            }
        }
        return undefined;
    }

    /** The expression inside parentheses, `as` and `satisfies`, which leave its value as it is. */
    private bare(node: TS.Expression): TS.Expression {
        const ts = this.ts;
        const wrapped = ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node);
        return wrapped ? this.bare(node.expression) : node;
    }

    /** A string, a number, a boolean, or none. */
    private literal(node: TS.Expression): unknown {
        const ts = this.ts;
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            return node.text;
        }
        if (ts.isNumericLiteral(node)) {
            return Number(node.text);
        }
        if (
            ts.isPrefixUnaryExpression(node) &&
            node.operator === ts.SyntaxKind.MinusToken &&
            ts.isNumericLiteral(node.operand)
        ) {
            return -Number(node.operand.text);
        }
        const keywords: Partial<Record<TS.SyntaxKind, unknown>> = {
            [ts.SyntaxKind.TrueKeyword]: true,
            [ts.SyntaxKind.FalseKeyword]: false,
            [ts.SyntaxKind.NullKeyword]: undefined,
            [ts.SyntaxKind.UndefinedKeyword]: undefined
        };
        return node.kind in keywords ? keywords[node.kind] : NOTHING;
    }

    /** A list, an object, `() => Class`, or a call of Drivine's `hop`. */
    private structure(node: TS.Expression): unknown {
        const ts = this.ts;
        if (ts.isArrayLiteralExpression(node)) {
            return node.elements.flatMap((it) => {
                const value = this.value(ts.isSpreadElement(it) ? it.expression : it);
                return ts.isSpreadElement(it) && Array.isArray(value) ? value : [value];
            });
        }
        if (ts.isObjectLiteralExpression(node)) {
            return this.object(node);
        }
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const body = ts.isBlock(node.body)
                ? node.body.statements.find(ts.isReturnStatement)?.expression
                : (node.body as TS.Expression);
            return body ? this.classOf(body) : undefined;
        }
        if (ts.isCallExpression(node) && this.drivineName(node.expression) === 'hop') {
            // Keyed by the arguments given, so one left out is told from one that can't be read.
            return this.positional(node.arguments, ['type', 'direction', 'label', 'orderBy', 'ascending']);
        }
        return NOTHING;
    }

    private object(node: TS.ObjectLiteralExpression): Record<string, unknown> {
        const ts = this.ts;
        const object: Record<string, unknown> = {};
        for (const it of node.properties) {
            if (ts.isPropertyAssignment(it) && (ts.isIdentifier(it.name) || ts.isStringLiteral(it.name))) {
                if (!this.isNone(it.initializer)) {
                    object[it.name.text] = this.value(it.initializer);
                }
            } else if (ts.isShorthandPropertyAssignment(it)) {
                object[it.name.text] = this.value(it.name);
            }
        }
        return object;
    }

    /** An enum member, or a constant the compiler knows the value of; an enum, passed whole; or a class. */
    private reference(node: TS.Expression): unknown {
        const ts = this.ts;
        if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node) && !ts.isIdentifier(node)) {
            return NOTHING;
        }
        const constant = this.checker.getConstantValue(node as TS.PropertyAccessExpression);
        if (constant !== undefined) {
            return constant;
        }
        const type = this.checker.getTypeAtLocation(node);
        if (type.isStringLiteral() || type.isNumberLiteral()) {
            return type.value;
        }
        if (ts.isPropertyAccessExpression(node)) {
            // A member of a constant object, `as const` or not.
            const object = this.value(node.expression);
            return isObject(object) ? object[node.name.text] : undefined;
        }
        return ts.isIdentifier(node) ? this.declared(node) : undefined;
    }

    /** What a name declares: an enum's members' values, as @NodeLabels takes them; a constant's value; a class. */
    private declared(node: TS.Identifier): unknown {
        const ts = this.ts;
        let symbol = this.checker.getSymbolAtLocation(node);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            symbol = this.checker.getAliasedSymbol(symbol);
        }
        const declaration = symbol?.declarations?.[0];
        if (declaration && ts.isEnumDeclaration(declaration)) {
            // As the enum is at run time: a number member also maps its number back to its name.
            const members: Record<string, unknown> = {};
            for (const it of declaration.members) {
                const name = (it.name as TS.Identifier).text;
                const value = this.checker.getConstantValue(it);
                members[name] = value;
                if (typeof value === 'number') {
                    members[value] = name;
                }
            }
            return members;
        }
        if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
            return this.value(declaration.initializer);
        }
        return declaration && ts.isClassDeclaration(declaration) ? declaration : undefined;
    }
}

/** The kinds of class a model file has an entry for. */
const KINDS = ['NodeFragment', 'RelationshipFragment', 'GraphView'];

/** A relationship's directions, the default first. */
const DIRECTIONS = ['OUTGOING', 'INCOMING', 'UNDIRECTED'] as const;

/** How a vector index compares, the default first. */
const SIMILARITIES = ['COSINE', 'EUCLIDEAN'] as const;

/** What @Aggregate computes, as Drivine's AggregateFunction names it. */
const FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const;

/** Told apart from undefined, which an expression may be: what a reader has nothing to say of. */
const NOTHING = Symbol('nothing');

interface Typed {
    type: string;
    of?: string;
    values?: string[];
}

interface Property {
    name: string;
    /** Where its Drivine decorators are: the nearest declaration that has any, or else its own. */
    decorated: TS.PropertyDeclaration | TS.ParameterDeclaration;
    type: TS.Type;
    nullable: boolean | 'unknown';
}

/** Whether an import's module is Drivine. */
const isDrivine = (ts: typeof TS, module: TS.Expression): boolean =>
    ts.isStringLiteral(module) && DRIVINE.test(module.text);

/** An object a decorator's argument or a constant is, as `object` reads it: not a list, nor one of the compiler's nodes. */
const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && Object.getPrototypeOf(value) === Object.prototype;

const isString = (value: unknown): value is string => typeof value === 'string';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isNumber = (value: unknown): value is number => typeof value === 'number';

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((it): it is string => typeof it === 'string') : [];

/** Sorts as the format asks, by code point, the same whatever the machine's locale. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byName = (a: Property, b: Property): number => compare(a.name, b.name);
