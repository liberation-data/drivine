import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import { ModelRegistry } from '@liberation-data/drivine';
import { main } from '@/codegen/command';
import type { Output } from '@/codegen/command';
import { generateModelFile } from '@/codegen/model/ModelFileGenerator';
import { FORMAT } from '@/codegen/model/ModelFiles';
import { Author } from './fixture/src/fragments/Author';
import { Organization } from './fixture/src/fragments/Organization';
import { Person } from './fixture/src/fragments/Person';
import { WorkHistory } from './fixture/src/fragments/WorkHistory';
import { PersonCareer } from './fixture/src/views/PersonCareer';
import { Team } from './fixture/src/views/Team';

const FIXTURE = path.join(__dirname, 'fixture');
const SRC = path.resolve(__dirname, '../../../src');
const quiet = () => undefined;

/** The fixture's model, written to a copy of it, so the one kept in the repository is not touched. */
function generated(): any {
    const dir = copy(FIXTURE);
    generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet });
    return JSON.parse(fs.readFileSync(path.join(dir, '.drivine', 'model.json'), 'utf8'));
}

function copy(from: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-model-'));
    fs.cpSync(from, dir, { recursive: true, filter: (it) => !it.includes(`${path.sep}.drivine`) });
    // Drivine's own source, by its path wherever the copy is.
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
    config.compilerOptions.paths = {
        '@liberation-data/drivine': [path.join(SRC, 'index.ts')],
        '@/*': [path.join(SRC, '*')]
    };
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(config));
    return dir;
}

/** A project of its own, of the files given. */
function project(files: Record<string, string>): string {
    const dir = copy(FIXTURE);
    fs.rmSync(path.join(dir, 'src'), { recursive: true });
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

const read = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.drivine', 'model.json'), 'utf8'));
const byId = (entries: any[], id: string) => entries.find((it) => it.id === id);

describe('The model file', () => {
    const model = generated();

    it('is the one kept beside the fixture, so a change to what is written shows in review', () => {
        const kept = fs.readFileSync(path.join(FIXTURE, '.drivine', 'model.json'), 'utf8');
        expect(`${JSON.stringify(model, null, 2)}\n`).toEqual(kept);
    });

    it("passes the format's schema", () => {
        const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../cypher/model/schema.json'), 'utf8'));
        const validate = new Ajv2020({ allErrors: true }).compile(schema);
        expect(validate(model) ? [] : validate.errors).toEqual([]);
        expect(model.format).toEqual(FORMAT);
        expect(model.generator).toMatchObject({ library: 'drivine', language: 'typescript' });
    });

    it('names each class by its file, from the package, and its name', () => {
        expect(model.fragments.map((it: any) => it.id)).toEqual([
            'src/fragments/Author#Author',
            'src/fragments/Organization#Organization',
            'src/fragments/Person#Person'
        ]);
    });

    it('reads the fields no decorator marks, with their types and whether they may be absent', () => {
        const person = byId(model.fragments, 'src/fragments/Person#Person');
        const property = (name: string) => person.properties.find((it: any) => it.name === name);
        expect(property('name')).toMatchObject({ type: 'string', nullable: false });
        expect(property('nickname')).toMatchObject({ type: 'string', nullable: true });
        expect(property('age')).toMatchObject({ type: 'float', nullable: true });
        expect(property('role')).toMatchObject({ type: 'enum', values: ['Admin', 'Editor'] });
        expect(property('status')).toMatchObject({ type: 'enum', values: ['active', 'away'] });
        expect(property('tags')).toMatchObject({ type: 'list', of: 'string' });
        expect(property('scores')).toMatchObject({ type: 'map', of: 'float' });
        expect(property('born')).toMatchObject({ stored: 'born_on', type: 'datetime' });
        expect(property('address')).toMatchObject({ type: 'json', packed: 'json' });
        expect(property('big')).toMatchObject({ type: 'int' });
        // Not stored: a transient field, and a static one.
        expect(property('cache')).toBeUndefined();
        expect(property('KIND')).toBeUndefined();
        // A constructor's parameter property is a field.
        expect(
            byId(model.fragments, 'src/fragments/Organization#Organization').properties.map((it: any) => it.name)
        ).toContain('motto');
    });

    it('says the subtypes a load may give, and takes the labels and fields a subtype inherits', () => {
        expect(byId(model.fragments, 'src/fragments/Person#Person').subtypes).toEqual(['src/fragments/Author#Author']);
        // One registered in code with ModelRegistry.registerSubtype is not in the source, so no list is complete.
        expect(model.fragments.map((it: any) => it.subtypesComplete)).toEqual([false, false, false]);
        const author = byId(model.fragments, 'src/fragments/Author#Author');
        expect(author.properties.map((it: any) => it.name)).toContain('nickname');
    });
});

/**
 * The file against what ModelRegistry reads from the same classes when the application runs: the file must say what
 * a load does.
 */
describe('The model file, beside ModelRegistry', () => {
    const model = generated();
    const registry = new ModelRegistry();
    const id = (type: Function) =>
        [Author, Organization, Person, WorkHistory, PersonCareer, Team].includes(type as any)
            ? model.fragments.concat(model.relationshipFragments, model.views).find((it: any) => it.name === type.name)
                  .id
            : undefined;

    it.each([Person, Author, Organization])('says what %p stores, as the registry does', (type) => {
        const runtime = registry.fragment(type);
        const entry = byId(model.fragments, id(type)!);
        expect(entry.labels).toEqual(runtime.labels);
        expect(entry.nodeId).toEqual(runtime.nodeIdField);
        const stored = Object.fromEntries(entry.properties.map((it: any) => [it.name, it.stored]));
        runtime.graphProperties.forEach((property, field) => expect(stored[field]).toEqual(property));
        expect(entry.properties.filter((it: any) => it.packed).map((it: any) => it.name)).toEqual(
            [...runtime.jsonPacked].sort()
        );
        expect(entry.properties.filter((it: any) => it.whenAbsent === 'default').map((it: any) => it.name)).toEqual([
            ...runtime.defaults
        ]);
        expect(entry.properties.filter((it: any) => it.whenAbsent === 'empty').map((it: any) => it.name)).toEqual([
            ...runtime.emptyWhenAbsent.keys()
        ]);
        expect((entry.bags ?? []).map((it: any) => [it.field, it.prefix, !!it.flat])).toEqual(
            runtime.propertyBags.map((it) => [it.field, it.namespace, it.flat]).sort()
        );
        expect(entry.labelSet?.field).toEqual(runtime.nodeLabels?.field);
        expect(entry.labelSet?.values).toEqual(runtime.nodeLabels?.members);
        expect(!!entry.stamp).toEqual(!!runtime.stampField);
        expect(
            entry.properties.filter((it: any) => it.vector).map((it: any) => [it.name, it.vector.similarity])
        ).toEqual([...runtime.vectorFields].map(([field, it]) => [field, it.similarity]));
    });

    it('says what a relationship fragment holds, as the registry does', () => {
        const runtime = registry.relationshipFragment(WorkHistory);
        const entry = byId(model.relationshipFragments, id(WorkHistory)!);
        expect(entry.target).toEqual({ field: runtime.targetField, fragment: id(runtime.target.model.type) });
    });

    it.each([PersonCareer, Team])('says what %p loads, as the registry does', (type) => {
        const runtime = registry.view(type);
        const entry = byId(model.views, id(type)!);
        expect(entry.root).toEqual({ field: runtime.rootField, fragment: id(runtime.root.type) });
        const relationships = entry.relationships.filter((it: any) => !it.path);
        expect(relationships.map((it: any) => it.field)).toEqual(runtime.relationships.map((it) => it.field).sort());
        for (const rel of runtime.relationships) {
            const written = relationships.find((it: any) => it.field === rel.field);
            expect(written).toMatchObject({
                type: rel.type,
                direction: rel.direction,
                target: id(rel.related.model.type),
                many: rel.isCollection,
                required: rel.required
            });
            expect(written.maxDepth ?? 1).toEqual(rel.maxDepth);
            expect(!!written.readOnly).toEqual(rel.readOnly);
            expect(written.sortedBy).toEqual(rel.sortedBy);
        }
        const paths = entry.relationships.filter((it: any) => it.path);
        expect(paths.map((it: any) => it.field)).toEqual(runtime.paths.map((it) => it.field));
        for (const it of runtime.paths) {
            const written = paths.find((p: any) => p.field === it.field);
            expect(written.target).toEqual(id(it.target.type));
            expect(written.path).toEqual(
                it.hops.map((hop) => ({
                    type: hop.type,
                    direction: hop.direction,
                    ...(hop.label ? { label: hop.label } : {}),
                    ...(hop.orderBy ? { orderBy: hop.orderBy, ascending: hop.ascending } : {})
                }))
            );
        }
        expect(
            (entry.aggregates ?? []).map((it: any) => [it.field, it.function, it.type, it.direction, it.property])
        ).toEqual(runtime.aggregates.map((it) => [it.field, it.function, it.type, it.direction, it.property]).sort());
    });
});

describe("The sample app's model file", () => {
    it('is current: run npx drivine model --project sample/tsconfig.json after changing the sample', () => {
        const project = path.resolve(__dirname, '../../../sample/tsconfig.json');
        expect(generateModelFile({ project, check: true, warn: quiet }).outcome).toEqual('current');
    });
});

describe('Writing the model file', () => {
    it('writes it once, and leaves it be while the model is the same', () => {
        const dir = copy(FIXTURE);
        const tsconfig = path.join(dir, 'tsconfig.json');
        expect(generateModelFile({ project: tsconfig, check: true, warn: quiet }).outcome).toEqual('stale');
        expect(generateModelFile({ project: tsconfig, warn: quiet }).outcome).toEqual('written');
        expect(generateModelFile({ project: tsconfig, warn: quiet }).outcome).toEqual('current');
        expect(generateModelFile({ project: tsconfig, check: true, warn: quiet }).outcome).toEqual('current');
    });

    const fragment = (name: string) =>
        `import { NodeFragment } from '@liberation-data/drivine';\n@NodeFragment({ labels: ['${name}'] })\nexport class ${name} { id: string; }\n`;

    it('keeps an entry the code no longer declares, marked removed, until it comes back', () => {
        const dir = project({ 'src/A.ts': fragment('A'), 'src/B.ts': fragment('B') });
        const tsconfig = path.join(dir, 'tsconfig.json');
        generateModelFile({ project: tsconfig, warn: quiet });
        const b = fs.readFileSync(path.join(dir, 'src/B.ts'), 'utf8');
        fs.rmSync(path.join(dir, 'src/B.ts'));

        expect(generateModelFile({ project: tsconfig, warn: quiet }).outcome).toEqual('written');
        const removed = byId(read(dir).fragments, 'src/B#B');
        expect(Object.keys(removed).slice(0, 3)).toEqual(['id', 'name', 'removed']);
        expect(removed.removed).toBe(true);
        expect(generateModelFile({ project: tsconfig, warn: quiet }).outcome).toEqual('current');

        fs.writeFileSync(path.join(dir, 'src/B.ts'), b);
        generateModelFile({ project: tsconfig, warn: quiet });
        expect(byId(read(dir).fragments, 'src/B#B').removed).toBeUndefined();
    });

    it('keeps the file of a project that declares nothing any more, with every entry removed', () => {
        const dir = project({ 'src/A.ts': fragment('A') });
        const tsconfig = path.join(dir, 'tsconfig.json');
        generateModelFile({ project: tsconfig, warn: quiet });
        fs.writeFileSync(path.join(dir, 'src/A.ts'), 'export class A {}\n');
        expect(generateModelFile({ project: tsconfig, warn: quiet }).outcome).toEqual('written');
        expect(read(dir).fragments).toEqual([expect.objectContaining({ id: 'src/A#A', removed: true })]);
    });

    it('writes nothing for a project that never declared anything', () => {
        const dir = project({ 'src/A.ts': 'export class A {}\n' });
        expect(generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet }).outcome).toEqual('empty');
        expect(fs.existsSync(path.join(dir, '.drivine'))).toBe(false);
    });

    it('writes over a file of another format, and says so', () => {
        const dir = project({ 'src/A.ts': fragment('A') });
        fs.mkdirSync(path.join(dir, '.drivine'));
        fs.writeFileSync(
            path.join(dir, '.drivine', 'model.json'),
            '{"format": "drivine-model/9", "fragments": [{"id": "x"}]}'
        );
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([expect.stringContaining('is not a drivine-model/1 file, so nothing in it is kept')]);
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#A']);
    });

    it('is turned off by "drivine": { "model": false } in package.json', () => {
        const dir = project({ 'src/A.ts': fragment('A') });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'off', drivine: { model: false } }));
        expect(generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet }).outcome).toEqual('off');
        expect(fs.existsSync(path.join(dir, '.drivine'))).toBe(false);
    });

    it("takes only Drivine's own decorators, not another library's of the same name", () => {
        const dir = project({
            'src/other.ts': 'export const NodeFragment = (_: unknown) => (_t: Function) => undefined;\n',
            'src/A.ts': `import { NodeFragment } from './other';\n@NodeFragment({ labels: ['A'] })\nexport class A {}\n`
        });
        expect(generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet }).outcome).toEqual('empty');
    });

    it("fails on a tsconfig.json it can't read, rather than read the source by the compiler's defaults", () => {
        const dir = project({ 'src/A.ts': fragment('A') });
        const tsconfig = path.join(dir, 'tsconfig.json');
        expect(() => generateModelFile({ project: path.join(dir, 'missing.json'), warn: quiet })).toThrow(
            'could not be read as a tsconfig.json.'
        );
        fs.writeFileSync(tsconfig, JSON.stringify({ extends: './missing.json', include: ['src'] }));
        expect(() => generateModelFile({ project: tsconfig, warn: quiet })).toThrow(/Cannot read file .*missing\.json/);
        expect(fs.existsSync(path.join(dir, '.drivine'))).toBe(false);
    });

    it("names the projects a solution's tsconfig.json references, as it declares nothing itself", () => {
        const dir = project({ 'src/A.ts': fragment('A') });
        const tsconfig = path.join(dir, 'tsconfig.json');
        fs.renameSync(tsconfig, path.join(dir, 'tsconfig.app.json'));
        fs.writeFileSync(tsconfig, JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }));
        expect(() => generateModelFile({ project: tsconfig, warn: quiet })).toThrow(
            /only references other projects. Name the one that declares the model with --project: .*tsconfig\.app\.json/
        );
    });

    it('names what it cannot read, and writes the rest', () => {
        const dir = project({
            'src/A.ts': fragment('A'),
            'src/V.ts': `import { GraphView } from '@liberation-data/drivine';\n@GraphView()\nexport class V { x: string; }\n`
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual(['Drivine model file: src/V#V: @GraphView V has no @Root property.']);
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#A']);
        expect(read(dir).views).toEqual([]);
    });
});

describe("Reading Drivine's decorators", () => {
    const written = (files: Record<string, string>): any => {
        const dir = project(files);
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([]);
        return read(dir);
    };

    it('reads them imported under other names', () => {
        const model = written({
            'src/A.ts': [
                "import { NodeFragment as Fragment, GraphProperty as Stored } from '@liberation-data/drivine';",
                "@Fragment({ labels: ['A'] })",
                "export class A { @Stored('full_name') name: string; }"
            ].join('\n')
        });
        expect(byId(model.fragments, 'src/A#A').properties).toEqual([
            expect.objectContaining({ name: 'name', stored: 'full_name' })
        ]);
    });

    it('reads them from a namespace import', () => {
        const model = written({
            'src/A.ts': [
                "import * as drivine from '@liberation-data/drivine';",
                "@drivine.NodeFragment({ labels: ['A'] })",
                "export class A { @drivine.NodeId() id: string; @drivine.GraphProperty('full_name') name: string; }",
                '@drivine.GraphView()',
                'export class V {',
                '    @drivine.Root() a: A;',
                "    @drivine.GraphPath([drivine.hop('TO', drivine.Direction.INCOMING)]) far: A;",
                '}'
            ].join('\n')
        });
        const a = byId(model.fragments, 'src/A#A');
        expect(a.nodeId).toEqual('id');
        expect(a.properties.find((it: any) => it.name === 'name').stored).toEqual('full_name');
        expect(byId(model.views, 'src/A#V').relationships).toEqual([
            expect.objectContaining({ field: 'far', path: [{ type: 'TO', direction: 'INCOMING' }] })
        ]);
    });

    it("keeps a superclass's decorators on a field a subclass declares again without them, as at run time", () => {
        const model = written({
            'src/A.ts': [
                "import { GraphProperty, NodeFragment } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                "export class A { @GraphProperty('full_name') name: string | undefined; }",
                "@NodeFragment({ labels: ['B'] })",
                'export class B extends A { declare name: string; }'
            ].join('\n')
        });
        expect(byId(model.fragments, 'src/A#B').properties).toEqual([
            expect.objectContaining({ name: 'name', stored: 'full_name', nullable: false })
        ]);
    });
    it('reads the members of @NodeLabels as the decorator takes them: a list, a string enum, or a number enum by name', () => {
        const fragment = (name: string, members: string) =>
            `@NodeFragment({ labels: ['${name}'] })\nexport class ${name} { @NodeLabels(${members}) roles: string[]; }`;
        const model = written({
            'src/A.ts': [
                "import { NodeFragment, NodeLabels } from '@liberation-data/drivine';",
                "enum Named { X = 'Ex', Y = 'Why' }",
                'enum Numbered { Low, High }',
                fragment('List', "['P', 'Q']"),
                fragment('Strings', 'Named'),
                fragment('Numbers', 'Numbered'),
                fragment('Open', '')
            ].join('\n')
        });
        const values = (name: string) => byId(model.fragments, `src/A#${name}`).labelSet;
        expect(values('List')).toEqual({ field: 'roles', values: ['P', 'Q'] });
        expect(values('Strings')).toEqual({ field: 'roles', values: ['Ex', 'Why'] });
        // At run time a number enum maps each number back to its name, and the decorator keeps the names.
        expect(values('Numbers')).toEqual({ field: 'roles', values: ['Low', 'High'] });
        expect(values('Open')).toEqual({ field: 'roles' });
    });

    it('names a @NodeLabels whose members it cannot read, rather than write a closed set as open', () => {
        const dir = project({
            'src/A.ts': [
                "import { NodeFragment, NodeLabels } from '@liberation-data/drivine';",
                "const roles = (): string[] => ['P'];",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { @NodeLabels(roles()) roles: string[]; }'
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            "Drivine model file: src/A#A: Can't read the members of @NodeLabels A.roles. Name them with a list, an enum or a constant."
        ]);
    });

    it("reads a view's counts and aggregates, sorting, read-only paths, and a target named by its field's type", () => {
        const model = written({
            'src/A.ts': [
                "import { Aggregate, AggregateFunction, Count, Direction, GraphPath, GraphRelationship, GraphView, hop, NodeFragment, ReadOnly, Root, SortedBy } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                "const TOTAL = { function: AggregateFunction.SUM, type: 'HAS', property: 'size', direction: Direction.INCOMING };",
                '@GraphView()',
                'export class Inner { @Root() a: A; }',
                '@GraphView()',
                'export class V {',
                '    @Root() a: A;',
                "    @GraphRelationship({ type: 'NEXT', direction: Direction.UNDIRECTED, maxDepth: 2 }) inner: Inner;",
                "    @SortedBy('id') @GraphRelationship({ type: 'KNOWS', target: () => A }) known: A[];",
                "    @ReadOnly() @GraphPath([{ type: 'TO' }]) far: A;",
                "    @Count('HAS', Direction.INCOMING) parts: number;",
                '    @Aggregate(TOTAL) total: number;',
                '}'
            ].join('\n')
        });
        const view = byId(model.views, 'src/A#V');
        expect(view.relationships).toEqual([
            {
                field: 'far',
                target: 'src/A#A',
                many: false,
                required: false,
                readOnly: true,
                path: [{ type: 'TO', direction: 'OUTGOING' }]
            },
            // A view over several hops is written: only a list of fragments read so is not.
            {
                field: 'inner',
                type: 'NEXT',
                direction: 'UNDIRECTED',
                target: 'src/A#Inner',
                many: false,
                required: false,
                maxDepth: 2
            },
            {
                field: 'known',
                type: 'KNOWS',
                direction: 'OUTGOING',
                target: 'src/A#A',
                many: true,
                required: false,
                sortedBy: { property: 'id', ascending: true }
            }
        ]);
        expect(view.aggregates).toEqual([
            { field: 'parts', function: 'COUNT', type: 'HAS', direction: 'INCOMING' },
            { field: 'total', function: 'SUM', type: 'HAS', direction: 'INCOMING', property: 'size' }
        ]);
    });

    it("gives a fragment the indexes its superclasses declare, and a relationship fragment's target a view", () => {
        const model = written({
            'src/A.ts': [
                "import { GraphView, NodeFragment, RangeIndex, RelationshipFragment, Root, TargetNode, Unique } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                "@Unique({ properties: ['x', 'y'] })",
                "@RangeIndex({ properties: ['x'] })",
                'export class A { x: string; y: string; }',
                "@NodeFragment({ labels: ['B'] })",
                'export class B extends A {}',
                '@GraphView()',
                'export class V { @Root() a: A; }',
                '@RelationshipFragment()',
                'export class R { @TargetNode() to: V; }'
            ].join('\n')
        });
        const b = byId(model.fragments, 'src/A#B');
        expect(b.indexes).toEqual([{ kind: 'unique', properties: ['x', 'y'] }]);
        expect(b.properties.find((it: any) => it.name === 'x').index).toEqual('range');
        expect(byId(model.relationshipFragments, 'src/A#R').target).toEqual({ field: 'to', fragment: 'src/A#V' });
    });

    it('names a class in a .tsx or .mts file, or outside src, by its path without the extension', () => {
        const fragment = (name: string) =>
            `import { NodeFragment } from '@liberation-data/drivine';\n@NodeFragment({ labels: ['${name}'] })\nexport class ${name} {}\n`;
        const dir = project({ 'src/A.tsx': fragment('A'), 'lib/B.mts': fragment('B') });
        const tsconfig = path.join(dir, 'tsconfig.json');
        const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
        config.include = ['src', 'lib'];
        config.compilerOptions.jsx = 'preserve';
        fs.writeFileSync(tsconfig, JSON.stringify(config));
        generateModelFile({ project: tsconfig, warn: quiet });
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['lib/B#B', 'src/A#A']);
    });
});

describe('Reading constants and types', () => {
    type Written = { warnings: string[]; entry: any };
    const fragment = (files: Record<string, string>, strict = true): Written => {
        const dir = project(files);
        const tsconfig = path.join(dir, 'tsconfig.json');
        const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
        config.compilerOptions.strict = strict;
        fs.writeFileSync(tsconfig, JSON.stringify(config));
        const warnings: string[] = [];
        generateModelFile({ project: tsconfig, warn: (it) => warnings.push(it) });
        return { warnings, entry: fs.existsSync(path.join(dir, '.drivine')) ? read(dir).fragments[0] : undefined };
    };
    const properties = (entry: any) => Object.fromEntries(entry.properties.map((it: any) => [it.name, it]));

    it('reads labels spread from a constant list, and from a constant object, `as const` or not', () => {
        const { warnings, entry }: Written = fragment({
            'src/A.ts': [
                "import { NodeFragment } from '@liberation-data/drivine';",
                "const LABELS = ['A', 'Extra'] as const;",
                "const Fixed = { B: 'Bee' } as const;",
                "const Loose = { C: 'Cee' };",
                '@NodeFragment({ labels: [...LABELS, Fixed.B, Loose.C] })',
                'export class A { id: string; }'
            ].join('\n')
        });
        expect(warnings).toEqual([]);
        expect(entry.labels).toEqual(['A', 'Extra', 'Bee', 'Cee']);
    });

    it('names a fragment whose labels it cannot read, rather than write it with labels missing', () => {
        const { warnings, entry }: Written = fragment({
            'src/A.ts': [
                "import { NodeFragment } from '@liberation-data/drivine';",
                "const label = (): string => 'B';",
                "@NodeFragment({ labels: ['A', label()] })",
                'export class A { id: string; }'
            ].join('\n')
        });
        expect(warnings).toEqual([
            "Drivine model file: src/A#A: Can't read the labels of @NodeFragment A. Name each with a literal or a constant."
        ]);
        expect(entry).toBeUndefined();
    });

    it('names a direction or an aggregate function it cannot read, rather than write the default', () => {
        const dir = project({
            'src/A.ts': [
                "import { Aggregate, Count, Direction, GraphPath, GraphRelationship, GraphView, hop, NodeFragment, Root } from '@liberation-data/drivine';",
                'const way = (): Direction => Direction.INCOMING;',
                'const fn = (): any => "MAX";',
                "@NodeFragment({ labels: ['B'] })",
                'export class B { id: string; }',
                '@GraphView()',
                "export class P { @Root() b: B; @GraphRelationship({ type: 'TO', direction: way() }) to: B; }",
                '@GraphView()',
                "export class Q { @Root() b: B; @GraphPath([hop('TO', way())]) far: B; }",
                '@GraphView()',
                "export class R { @Root() b: B; @Count('TO', way()) n: number; }",
                '@GraphView()',
                "export class S { @Root() b: B; @Aggregate({ function: fn(), type: 'TO', property: 'x' }) m: number; }",
                '@GraphView()',
                "export class T { @Root() b: B; @Count('TO') n: number; @GraphPath([hop('TO')]) far: B; @GraphRelationship({ type: 'TO' }) to: B; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            "Drivine model file: src/A#P: Can't read the direction of P.to. Name it with OUTGOING, INCOMING, UNDIRECTED, or a constant of one.",
            "Drivine model file: src/A#Q: Can't read the direction of a hop of Q.far. Name it with OUTGOING, INCOMING, UNDIRECTED, or a constant of one.",
            "Drivine model file: src/A#R: Can't read the direction of R.n. Name it with OUTGOING, INCOMING, UNDIRECTED, or a constant of one.",
            "Drivine model file: src/A#S: Can't read the function of S.m. Name it with COUNT, SUM, AVG, MIN, MAX, or a constant of one."
        ]);
        // Left out, each takes its default.
        const t = byId(read(dir).views, 'src/A#T');
        expect(t.aggregates).toEqual([{ field: 'n', function: 'COUNT', type: 'TO', direction: 'OUTGOING' }]);
        expect(t.relationships.map((it: any) => it.direction ?? it.path[0].direction)).toEqual([
            'OUTGOING',
            'OUTGOING'
        ]);
    });

    it('names a stored name, a relationship type or a path it cannot read, rather than write them wrong', () => {
        const dir = project({
            'src/A.ts': [
                "import { Count, GraphPath, GraphProperty, GraphRelationship, GraphView, NodeFragment, Root, SortedBy } from '@liberation-data/drivine';",
                "const name = (): string => 'n';",
                "const hops = () => [{ type: 'TO' }];",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { @GraphProperty(name()) id: string; }',
                "@NodeFragment({ labels: ['B'] })",
                'export class B { id: string; }',
                '@GraphView()',
                'export class V { @Root() b: B; @GraphRelationship({ type: name() }) next: B; }',
                '@GraphView()',
                'export class W { @Root() b: B; @GraphPath(hops()) far: B; }',
                '@GraphView()',
                "export class X { @Root() b: B; @GraphPath([{ type: 'TO' }, hops()[0]]) far: B; }",
                '@GraphView()',
                'export class Y { @Root() b: B; @Count(name()) n: number; }',
                '@GraphView()',
                "export class Z { @Root() b: B; @SortedBy(name()) @GraphRelationship({ type: 'TO' }) to: B[]; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            "Drivine model file: src/A#A: Can't read the name of @GraphProperty A.id. Name it with a literal or a constant.",
            "Drivine model file: src/A#V: Can't read the type of V.next. Name it with a literal or a constant.",
            "Drivine model file: src/A#W: Can't read the hops of @GraphPath W.far. Name each with a literal, a constant or hop().",
            "Drivine model file: src/A#X: Can't read the hops of @GraphPath X.far. Name each with a literal, a constant or hop().",
            "Drivine model file: src/A#Y: Can't read the type of Y.n. Name it with a literal or a constant.",
            "Drivine model file: src/A#Z: Can't read what @SortedBy Z.to sorts by. Name it with a literal or a constant."
        ]);
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#B']);
        expect(read(dir).views).toEqual([]);
    });

    it('reads unions of literals, tuples, and unknown and any', () => {
        const { entry }: Written = fragment({
            'src/A.ts': [
                "import { NodeFragment } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { level: 1 | 2; pair: [string, number]; same: [string, string]; u: unknown; a: any; }'
            ].join('\n')
        });
        const of = properties(entry);
        expect(of.level).toMatchObject({ type: 'float', nullable: false });
        expect(of.pair).toMatchObject({ type: 'list', of: 'any' });
        expect(of.same).toMatchObject({ type: 'list', of: 'string' });
        // Each may hold null, and is shown as the code writes it.
        expect(of.u).toMatchObject({ type: 'any', nullable: true, source: 'unknown' });
        expect(of.a).toMatchObject({ type: 'any', nullable: true, source: 'any' });
    });

    it("says whether a field may be absent only where the compiler can tell: under strict null checks, or for '?'", () => {
        const { entry }: Written = fragment(
            {
                'src/A.ts': [
                    "import { NodeFragment } from '@liberation-data/drivine';",
                    "@NodeFragment({ labels: ['A'] })",
                    'export class A { name: string; maybe: string | null; optional?: string; }'
                ].join('\n')
            },
            false
        );
        const of = properties(entry);
        expect([of.name.nullable, of.maybe.nullable, of.optional.nullable]).toEqual(['unknown', 'unknown', true]);
    });
});

describe('drivine model', () => {
    const output = (): { lines: string[]; out: Output } => {
        const lines: string[] = [];
        return { lines, out: { log: (it: string) => lines.push(it), error: (it: string) => lines.push(it) } };
    };

    it('writes the file, then says it is current, and with --check fails while it is not', () => {
        const dir = copy(FIXTURE);
        const tsconfig = path.join(dir, 'tsconfig.json');
        const { lines, out }: { lines: string[]; out: Output } = output();
        expect(main(['model', '--project', tsconfig, '--check'], out)).toEqual(1);
        expect(main(['model', '--project', tsconfig], out)).toEqual(0);
        expect(main(['model', '--project', tsconfig, '--check'], out)).toEqual(0);
        expect(lines).toEqual([
            expect.stringContaining('is not current. Run drivine model, and commit it.'),
            expect.stringContaining('Drivine model file written to'),
            expect.stringContaining('is current.')
        ]);
    });

    it('says when the package turned it off, and when there is nothing to write', () => {
        const { lines, out }: { lines: string[]; out: Output } = output();
        const off = project({ 'src/A.ts': 'export class A {}\n' });
        fs.writeFileSync(path.join(off, 'package.json'), JSON.stringify({ name: 'off', drivine: { model: false } }));
        expect(main(['model', '--project', path.join(off, 'tsconfig.json')], out)).toEqual(0);
        const empty = project({ 'src/A.ts': 'export class A {}\n' });
        expect(main(['model', '--project', path.join(empty, 'tsconfig.json'), '--check'], out)).toEqual(0);
        expect(lines).toEqual([
            'Drivine model file: turned off in package.json.',
            'Drivine model file: the project declares no fragments or views, so there is nothing to write.'
        ]);
    });

    it('says how it is used, and fails on what it does not know', () => {
        const { lines, out }: { lines: string[]; out: Output } = output();
        expect(main(['--help'], out)).toEqual(0);
        expect(main(['other'], out)).toEqual(1);
        expect(main(['model', '--project'], out)).toEqual(1);
        // A mistyped --check writes nothing, and fails, rather than passing.
        const dir = copy(FIXTURE);
        expect(main(['model', '--project', path.join(dir, 'tsconfig.json'), '--chek'], out)).toEqual(1);
        expect(fs.existsSync(path.join(dir, '.drivine'))).toBe(false);
        expect(lines.every((it) => it.startsWith('Usage: drivine model'))).toBe(true);
    });
});
