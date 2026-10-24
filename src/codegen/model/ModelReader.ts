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
    private drivineExports?: Map<TS.Symbol, string>;

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
        const classes = this.classes().filter((it) => this.oneKind(it));
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

    /**
     * Whether a class is of one kind. One given two is refused as its module loads, by `defineClassMetadata`, which
     * names the kind applied first, the decorator nearest the class, and the first other kind applied after it.
     */
    private oneKind(decl: TS.ClassDeclaration): boolean {
        const kinds = this.drivineDecorators(decl)
            .map((it) => this.drivineName(this.callee(it))!)
            .filter((it) => KINDS.includes(it))
            .reverse();
        const other = kinds.find((it) => it !== kinds[0]);
        if (other) {
            const kind = (name: string): string => name.replace(/(?<=.)(?=[A-Z])/g, '_').toUpperCase();
            this.problems.push(
                `${this.id(decl)}: ${decl.name!.text} can't be both a ${kind(kinds[0])} and a ${kind(other)}.`
            );
        }
        return !other;
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
            const name = decl.name!.text;
            throw new Error(
                `@NodeFragment ${name} has no labels. Give it at least one: @NodeFragment({ labels: ['${name}'] }).`
            );
        }

        this.checkFragment(decl, this.decorated(chain), labels);
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
                    const properties = this.given(options, 'properties', isStrings, `the properties of ${what}`);
                    // As the decorator refuses it when the class is declared.
                    if (!properties?.length) {
                        throw new Error(
                            `On a class, a ${kind.toUpperCase()} declaration names its properties: { properties: [...] }.`
                        );
                    }
                    return { kind, properties };
                })
            )
        );
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

    /** What ModelRegistry refuses of a fragment's decorators, in the order it checks them. */
    private checkFragment(decl: TS.ClassDeclaration, decorated: Property[], labels: string[]): void {
        const name = decl.name!.text;
        this.assertOnly(decl, decorated, FRAGMENT_MAPPINGS, 'a @NodeFragment');
        const ids = this.marked(decorated, 'NodeId');
        if (ids.length > 1) {
            throw new Error(`${name} has ${ids.length} @NodeId properties (${ids.join(', ')}). A node has one id.`);
        }
        const stamps = this.marked(decorated, 'NodeStamp');
        if (stamps.length > 1) {
            throw new Error(
                `${name} has ${stamps.length} @NodeStamp properties (${stamps.join(', ')}). A node has one stamp.`
            );
        }
        const stamp = decorated.find((it) => it.name === stamps[0]);
        if (stamp && (this.on(stamp, 'GraphProperty') || this.on(stamp, 'GraphTransient') || stamp.name === ids[0])) {
            throw new Error(`@NodeStamp ${name}.${stamp.name} can't carry another mapping decorator.`);
        }
        const marking = (decorator: string): Property[] => decorated.filter((it) => this.on(it, decorator));
        this.checkBags(name, marking('PropertyBag'));
        this.checkLabelSet(name, marking('NodeLabels'), labels);
    }

    private checkBags(name: string, bags: Property[]): void {
        const read = bags.map((it) => this.bag(it) as { field: string; prefix: string; flat?: boolean });
        if (read.filter((it) => it.flat).length > 1) {
            throw new Error(`${name} has more than one flat @PropertyBag; a fragment may have one.`);
        }
        const prefixed = read.filter((it) => !it.flat);
        const [a, b] =
            prefixed.flatMap((one) =>
                prefixed.filter((other) => other !== one && other.prefix.startsWith(one.prefix)).map((it) => [one, it])
            )[0] ?? [];
        if (a) {
            throw new Error(
                `The @PropertyBag namespaces of ${name}.${a.field} ('${a.prefix}') and ${b.field} ('${b.prefix}') ` +
                    `overlap: one would read the other's entries.`
            );
        }
    }

    private checkLabelSet(name: string, sets: Property[], labels: string[]): void {
        if (sets.length > 1) {
            throw new Error(`${name} has ${sets.length} @NodeLabels fields; a fragment may have one.`);
        }
        const values = sets.length ? (this.labelSet(sets[0]).values as string[] | undefined) : undefined;
        const fixed = (values?.filter((it) => labels.includes(it)) ?? []).join(', ');
        const what = `@NodeLabels ${name}.${sets[0]?.name}`;
        if (fixed) {
            throw new Error(`${what} names ${fixed}, the fragment's own label: those are fixed.`);
        }
        if (values?.some((it) => it.startsWith('__drivine.'))) {
            throw new Error(`${what} names a label beginning '__drivine.', which is reserved.`);
        }
    }

    private relationshipFragment(decl: TS.ClassDeclaration): Entry {
        const decorated = this.decorated(this.chain(decl));
        this.assertOnly(decl, decorated, RELATIONSHIP_FRAGMENT_MAPPINGS, 'a @RelationshipFragment');
        const targets = decorated.filter((it) => this.on(it, 'TargetNode'));
        if (targets.length !== 1) {
            throw new Error(
                `@RelationshipFragment ${decl.name!.text} needs exactly one @TargetNode property, the node the ` +
                    `relationship leads to. It has ${targets.length}.`
            );
        }
        const target = targets[0];
        const properties = this.properties(this.chain(decl)).filter((it) => !this.on(it, 'GraphTransient'));
        return {
            id: this.id(decl),
            name: decl.name!.text,
            target: {
                field: target.name,
                fragment: this.related(target, this.thunk(target, 'TargetNode'), ['NodeFragment', 'GraphView'])
            },
            properties: properties
                .filter((it) => it.name !== target.name)
                .sort(byName)
                .map((it) => this.property(it, undefined))
        };
    }

    private view(decl: TS.ClassDeclaration): Entry {
        const properties = this.properties(this.chain(decl));
        this.checkView(decl, this.decorated(this.chain(decl)));
        const root = properties.find((it) => this.on(it, 'Root'))!;
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

    /** What ModelRegistry refuses of a view's decorators before it reads its relationships. */
    private checkView(decl: TS.ClassDeclaration, decorated: Property[]): void {
        const name = decl.name!.text;
        this.assertOnly(decl, decorated, VIEW_MAPPINGS, 'a @GraphView');
        for (const it of decorated) {
            const aggregate = AGGREGATES.some((decorator) => this.on(it, decorator));
            const kinds = [aggregate, this.on(it, 'GraphRelationship'), this.on(it, 'GraphPath')].filter(Boolean);
            if (this.on(it, 'ReadOnly') && !kinds.length) {
                throw new Error(`@ReadOnly ${name}.${it.name} marks a relationship field; it has none.`);
            }
            if (kinds.length > 1) {
                throw new Error(`${name}.${it.name} can be one of a relationship, a path or an aggregate.`);
            }
        }
        const roots = this.marked(decorated, 'Root').length;
        if (roots !== 1) {
            throw new Error(`@GraphView ${name} needs exactly one @Root property. It has ${roots}.`);
        }
    }

    /** As ModelRegistry refuses them: decorators that map a field of another kind of class. */
    private assertOnly(decl: TS.ClassDeclaration, decorated: Property[], allowed: string[], what: string): void {
        for (const prop of decorated) {
            const misplaced = MAPPINGS.filter(([, names]) => names.some((it) => this.on(prop, it)))
                .map(([shown]) => shown)
                .filter((it) => !allowed.includes(it));
            if (misplaced.length) {
                throw new Error(`${decl.name!.text}.${prop.name}: ${misplaced.join(', ')} can't be used on ${what}.`);
            }
        }
    }

    /** The names of the fields a decorator marks. */
    private marked(decorated: Property[], decorator: string): string[] {
        return decorated.filter((it) => this.on(it, decorator)).map((it) => it.name);
    }

    /** A relationship's type, which ModelRegistry refuses, with `refused`, when it is left out or empty. */
    private relationshipType(options: Record<string, unknown>, field: string, refused: string): string {
        if (!('type' in options) || options.type === '') {
            throw new Error(refused);
        }
        return this.named(options.type, `the type of ${field}`);
    }

    /** A list's class, which its decorator must name, as ModelRegistry asks: its metadata records only an Array. */
    private assertNamed(prop: Property, target: TS.ClassDeclaration | undefined, how: string): void {
        if (!target && this.designType(prop.decorated.type) === 'Array') {
            const field = this.field(prop);
            throw new Error(
                `${field} is a list, and TypeScript does not keep the type of a list's items. Name it: ${how}.`
            );
        }
    }

    private relationship(prop: Property): Entry {
        // As ModelRegistry reads it: a list only where the field's metadata records an Array.
        const many = this.designType(prop.decorated.type) === 'Array';
        const path = this.on(prop, 'GraphPath');
        if (path) {
            return this.path(prop, path, many);
        }
        const field = this.field(prop);
        const options = this.options(this.on(prop, 'GraphRelationship'), `@GraphRelationship ${field}`);
        const type = this.relationshipType(options, field, `@GraphRelationship on ${field} needs a type.`);
        const target = this.given(options, 'target', this.isClass, `the class ${field} holds`, '() => Class');
        this.assertNamed(prop, target, `@GraphRelationship({ type: '${type}', target: () => Item })`);
        const maxDepth = this.given(options, 'maxDepth', isNumber, `the maxDepth of ${field}`) ?? 1;
        if (!Number.isInteger(maxDepth) || maxDepth < 1) {
            throw new Error(`maxDepth on ${field} must be a whole number of at least 1.`);
        }
        const into = this.kindOf(this.targetClass(prop, target));
        if (into === 'RelationshipFragment' && maxDepth > 1) {
            throw new Error(
                `${field} holds relationship fragments, which are one relationship each: maxDepth can't be above 1.`
            );
        }
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
        // A type given that can't be read is kept, as undefined, apart from one left out.
        const untyped = (it: Record<string, unknown>): boolean => !('type' in it) || it.type === '';
        if (Array.isArray(hops) && hops.every(isObject) && (!hops.length || hops.some(untyped))) {
            throw new Error(`@GraphPath on ${field} needs at least one hop, each with a type.`);
        }
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
        const target = this.given(options, 'target', this.isClass, `the class ${field} holds`, '() => Class');
        this.assertNamed(prop, target, '@GraphPath([...], { target: () => Item })');
        return {
            field: prop.name,
            target: this.related(prop, target, ['NodeFragment']),
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
                type: this.relationshipType(args, field, `The aggregate ${field} needs a relationship type.`),
                direction: this.oneOf(args, 'direction', DIRECTIONS, `the direction of ${field}`)
            };
        }
        const options = this.options(this.on(prop, 'Aggregate'), `@Aggregate ${field}`);
        const type = this.relationshipType(options, field, `The aggregate ${field} needs a relationship type.`);
        const fn = this.oneOf(options, 'function', FUNCTIONS, `the function of ${field}`);
        const property = this.given(options, 'property', isString, `the property ${field} aggregates`) || undefined;
        // As ModelRegistry refuses it: only a count needs no property.
        if (fn !== 'COUNT' && !property) {
            throw new Error(`The ${fn} ${field} needs the property it aggregates.`);
        }
        return {
            field: prop.name,
            function: fn,
            type,
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
        // As ModelRegistry reads it: an empty list only where the field's metadata records an Array, and else {}.
        // The class loads, so it is written, and the field is named, for a load gives it what its type does not say.
        if (
            this.on(prop, 'EmptyWhenAbsent') &&
            typed.type === 'list' &&
            this.designType(prop.decorated.type) !== 'Array'
        ) {
            this.problems.push(
                `${this.id(
                    this.ts.findAncestor(prop.decorated, this.ts.isClassDeclaration)!
                )}: @EmptyWhenAbsent ${this.field(prop)} is a list TypeScript does not ` +
                    `record as an Array, so a load gives {} for it, not []. Declare it as an array, optional with ? ` +
                    `rather than | null.`
            );
        }
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

    /** The class a decorator names, or else, as ModelRegistry takes it, the class the field's metadata records. */
    private targetClass(prop: Property, thunk: TS.ClassDeclaration | undefined): TS.ClassDeclaration {
        const decl = thunk ?? this.designType(prop.decorated.type);
        if (!decl || decl === 'Array') {
            throw new Error(
                `Can't tell what ${this.field(prop)} holds. Name its class in the decorator, e.g. () => Item.`
            );
        }
        return decl;
    }

    /**
     * The class TypeScript's decorator metadata records as a field's type, as it writes `design:type`: Array for a list,
     * an alias of one among them, and none for an alias of anything else, an interface, or a union of more than one
     * class, `null` and `undefined` among them under strict null checks, which it records as Object, or a class
     * imported as a type, which it records as Function.
     */
    private designType(node: TS.TypeNode | undefined): TS.ClassDeclaration | 'Array' | undefined {
        const ts = this.ts;
        if (!node || !this.program.getCompilerOptions().emitDecoratorMetadata) {
            return undefined;
        }
        if (ts.isParenthesizedTypeNode(node)) {
            return this.designType(node.type);
        }
        if (ts.isUnionTypeNode(node)) {
            const types = node.types
                .filter((it) => this.strictNulls || !this.isNullish(it))
                .map((it) => this.designType(it));
            return types.every((it) => it === types[0]) ? types[0] : undefined;
        }
        if (ts.isArrayTypeNode(node) || ts.isTupleTypeNode(node)) {
            return 'Array';
        }
        if (ts.isTypeOperatorNode(node)) {
            return node.operator === ts.SyntaxKind.ReadonlyKeyword ? 'Array' : undefined;
        }
        return ts.isTypeReferenceNode(node) ? this.designReference(node) : undefined;
    }

    private designReference(node: TS.TypeReferenceNode): TS.ClassDeclaration | 'Array' | undefined {
        const ts = this.ts;
        let symbol = this.checker.getSymbolAtLocation(node.typeName);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            if (symbol.declarations?.some((it) => ts.isTypeOnlyImportOrExportDeclaration(it))) {
                return undefined;
            }
            symbol = this.checker.getAliasedSymbol(symbol);
        }
        if (symbol && symbol.flags & ts.SymbolFlags.TypeAlias) {
            const aliased = this.checker.getDeclaredTypeOfSymbol(symbol);
            return this.checker.isArrayType(aliased) || this.checker.isTupleType(aliased) ? 'Array' : undefined;
        }
        if (['Array', 'ReadonlyArray'].includes(symbol?.getName() ?? '')) {
            return 'Array';
        }
        return symbol?.declarations?.find((it): it is TS.ClassDeclaration => ts.isClassDeclaration(it));
    }

    private isNullish(node: TS.TypeNode): boolean {
        const ts = this.ts;
        return (
            node.kind === ts.SyntaxKind.UndefinedKeyword ||
            (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
        );
    }

    /** A class's kind, as ModelRegistry's kindOf has it: that of the nearest class in its chain that declares one. */
    private kindOf(decl: TS.ClassDeclaration): string | undefined {
        for (const it of this.chain(decl)) {
            const kind = KINDS.find((name) => this.decorator(it, name));
            if (kind) {
                return kind;
            }
        }
        return undefined;
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
        return this.symbolOf(node)?.declarations?.find((it): it is TS.ClassDeclaration =>
            this.ts.isClassDeclaration(it)
        );
    }

    /** What a name refers to, through imports: for `{ labels }`, the variable of that name, not the object's property. */
    private symbolOf(node: TS.Node): TS.Symbol | undefined {
        const ts = this.ts;
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
            ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
            : this.checker.getSymbolAtLocation(node);
        return symbol && symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
    }

    /**
     * The fields of a class and those it inherits, a subclass's declaration of a field over its superclass's: the
     * instance properties it declares, and those its constructor's parameters do.
     */
    private properties(chain: TS.ClassDeclaration[]): Property[] {
        const found = new Map<string, Property>();
        for (const decl of chain) {
            for (const named of this.members(decl)) {
                const name = (named.name as TS.Identifier | TS.StringLiteral).text;
                const nearer = found.get(name);
                // A field a subclass declares again without Drivine's decorators keeps its superclass's, as at run time.
                if (nearer && !this.drivineDecorators(nearer.decorated).length) {
                    nearer.decorated = named;
                }
                if (nearer) {
                    continue;
                }
                // As the class has it: a field a generic superclass declares, of the type the class gives it.
                const symbol = this.checker.getPropertyOfType(this.checker.getTypeAtLocation(chain[0]), name);
                const type = symbol
                    ? this.checker.getTypeOfSymbolAtLocation(symbol, chain[0])
                    : this.checker.getTypeAtLocation(named);
                found.set(name, {
                    name,
                    decorated: named,
                    type,
                    nullable: this.nullable(named, type)
                });
            }
        }
        return [...found.values()];
    }

    /** The instance properties a class declares, and those its constructor's parameters do, in order. */
    private members(decl: TS.ClassDeclaration): Member[] {
        const members: Member[] = [];
        for (const member of decl.members) {
            if (this.ts.isPropertyDeclaration(member) && !this.isStatic(member)) {
                members.push(member);
            }
            if (this.ts.isConstructorDeclaration(member)) {
                members.push(...member.parameters.filter((it) => this.ts.getModifiers(it)?.length));
            }
        }
        // A name in quotes, as `'first-name'`, is a field as much as one that is not.
        return members.filter((it) => this.ts.isIdentifier(it.name) || this.ts.isStringLiteral(it.name));
    }

    /**
     * The fields Drivine's decorators mark, in the order ModelRegistry has them: each where the furthest class that
     * decorates it declares it, superclasses first.
     */
    private decorated(chain: TS.ClassDeclaration[]): Property[] {
        const order = [...chain]
            .reverse()
            .flatMap((it) => this.members(it))
            .filter((it) => this.drivineDecorators(it).length)
            .map((it) => (it.name as TS.Identifier | TS.StringLiteral).text);
        return this.properties(chain)
            .filter((it) => order.includes(it.name))
            .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
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
     * The name Drivine exports what an expression names under, when it is Drivine's rather than declared here or taken
     * from another library: `NodeFragment` for `NodeFragment`, for `Fragment` imported as `{ NodeFragment as Fragment }`,
     * for `drivine.NodeFragment` with `import * as drivine`, and for any of these through a module that re-exports it.
     */
    private drivineName(node: TS.Expression): string | undefined {
        const ts = this.ts;
        const symbol = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
        return symbol && this.exported().get(this.resolved(symbol));
    }

    /** What Drivine exports, by what each export is, from every module the program imports or re-exports it in. */
    private exported(): Map<TS.Symbol, string> {
        const ts = this.ts;
        if (!this.drivineExports) {
            this.drivineExports = new Map();
            for (const statement of this.program.getSourceFiles().flatMap((it) => [...it.statements])) {
                const module =
                    ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
                        ? statement.moduleSpecifier
                        : undefined;
                const symbol = module && isDrivine(ts, module) ? this.checker.getSymbolAtLocation(module) : undefined;
                for (const it of symbol ? this.checker.getExportsOfModule(symbol) : []) {
                    this.drivineExports.set(this.resolved(it), it.name);
                }
            }
        }
        return this.drivineExports;
    }

    private resolved(symbol: TS.Symbol): TS.Symbol {
        return symbol.flags & this.ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
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

    /** An object's entries, the last given of each; none when it spreads one that can't be read. */
    private object(node: TS.ObjectLiteralExpression): Record<string, unknown> | undefined {
        const ts = this.ts;
        const object: Record<string, unknown> = {};
        for (const it of node.properties) {
            if (ts.isPropertyAssignment(it) && (ts.isIdentifier(it.name) || ts.isStringLiteral(it.name))) {
                delete object[it.name.text];
                if (!this.isNone(it.initializer)) {
                    object[it.name.text] = this.value(it.initializer);
                }
            } else if (ts.isShorthandPropertyAssignment(it)) {
                object[it.name.text] = this.value(it.name);
            } else if (ts.isSpreadAssignment(it)) {
                const spread = this.value(it.expression);
                if (!isObject(spread)) {
                    return undefined;
                }
                Object.assign(object, spread);
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
        if (!ts.isIdentifier(node)) {
            // A member of a constant object, `as const` or not, as `Labels.A` or `Labels['A']`.
            const object = this.value(node.expression);
            const key = ts.isPropertyAccessExpression(node) ? node.name.text : this.value(node.argumentExpression);
            return isObject(object) && isString(key) ? object[key] : undefined;
        }
        return this.declared(node);
    }

    /** What a name declares: an enum's members' values, as @NodeLabels takes them; a constant's value; a class. */
    private declared(node: TS.Identifier): unknown {
        const ts = this.ts;
        const declaration = this.symbolOf(node)?.declarations?.[0];
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

/** Each property decorator, as ModelRegistry names it, in the order it names them, and Drivine's decorators of it. */
const MAPPINGS: [string, string[]][] = [
    ['@Root', ['Root']],
    ['@NodeId', ['NodeId']],
    ['@NodeStamp', ['NodeStamp']],
    ['@GraphRelationship', ['GraphRelationship']],
    ['@GraphProperty', ['GraphProperty']],
    ['@GraphTransient', ['GraphTransient']],
    ['@TargetNode', ['TargetNode']],
    ['@ReadOnly', ['ReadOnly']],
    ['@Count or @Aggregate', AGGREGATES],
    ['@GraphPath', ['GraphPath']],
    ['@JsonPacked', ['JsonPacked']],
    ['@Default', ['Default']],
    ['@EmptyWhenAbsent', ['EmptyWhenAbsent']],
    ['@SortedBy', ['SortedBy']],
    ['@PropertyBag', ['PropertyBag']],
    ['@NodeLabels', ['NodeLabels']],
    ['a schema decorator', ['Unique', 'RangeIndex', 'FullTextIndex', 'VectorIndex']]
];

/** The decorators that shape how a plain field is stored, allowed on node and relationship fragments. */
const STORED = [
    '@GraphProperty',
    '@GraphTransient',
    '@JsonPacked',
    '@Default',
    '@EmptyWhenAbsent',
    'a schema decorator'
];

/** The decorators each kind of class may carry on its fields, as ModelRegistry allows them. */
const FRAGMENT_MAPPINGS = ['@NodeId', '@NodeStamp', '@PropertyBag', '@NodeLabels', ...STORED];

const RELATIONSHIP_FRAGMENT_MAPPINGS = ['@TargetNode', ...STORED];

const VIEW_MAPPINGS = [
    '@Root',
    '@GraphRelationship',
    '@GraphTransient',
    '@ReadOnly',
    '@Count or @Aggregate',
    '@GraphPath',
    '@SortedBy'
];

type Member = TS.PropertyDeclaration | TS.ParameterDeclaration;

interface Property {
    name: string;
    /** Where its Drivine decorators are: the nearest declaration that has any, or else its own. */
    decorated: Member;
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
