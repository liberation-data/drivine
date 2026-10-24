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
        // Nor one that is not JSON.
        fs.writeFileSync(path.join(dir, '.drivine', 'model.json'), '{"format": "drivine-model/1", ');
        warnings.length = 0;
        expect(
            generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) }).outcome
        ).toEqual('written');
        expect(warnings).toEqual([expect.stringContaining('is not a drivine-model/1 file, so nothing in it is kept')]);
    });

    it('fails on a project with no package.json, which says where the file goes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-model-'));
        fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
        expect(() => generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet })).toThrow(
            'Drivine model file: there is no package.json at or above'
        );
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
        expect(warnings).toEqual([
            'Drivine model file: src/V#V: @GraphView V needs exactly one @Root property. It has 0.'
        ]);
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

    it("names a subtype whose own labels it cannot read, rather than write it with its superclass's alone", () => {
        const { warnings, entry }: Written = fragment({
            'src/A.ts': [
                "import { NodeFragment } from '@liberation-data/drivine';",
                "const labels = (): string[] => ['B'];",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@NodeFragment({ labels: labels() })',
                'export class B extends A {}'
            ].join('\n')
        });
        expect(warnings).toEqual([
            "Drivine model file: src/A#B: Can't read the labels of @NodeFragment B. Name each with a literal or a constant."
        ]);
        expect(entry.id).toEqual('src/A#A');
    });

    it('names a fragment with no labels, a relationship fragment with no target, and a field whose class it cannot tell', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphRelationship, GraphView, NodeFragment, RelationshipFragment, Root } from '@liberation-data/drivine';",
                '@NodeFragment()',
                'export class A { id: string; }',
                "@NodeFragment({ labels: ['B'] })",
                'export class B { id: string; }',
                '@RelationshipFragment()',
                'export class R { since: string; }',
                '@GraphView()',
                "export class V { @Root() b: B; @GraphRelationship({ type: 'T' }) to: string; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            "Drivine model file: src/A#A: @NodeFragment A has no labels. Give it at least one: @NodeFragment({ labels: ['A'] }).",
            'Drivine model file: src/A#R: @RelationshipFragment R needs exactly one @TargetNode property, the node the ' +
                'relationship leads to. It has 0.',
            "Drivine model file: src/A#V: Can't tell what V.to holds. Name its class in the decorator, e.g. () => Item."
        ]);
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#B']);
    });

    it('names a field that holds a class of a kind it may not, as ModelRegistry does, rather than write an id no entry has', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphPath, GraphRelationship, GraphView, NodeFragment, RelationshipFragment, Root, TargetNode } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                'export class Plain { id: string; }',
                '@GraphView()',
                'export class V { @Root() a: A; }',
                '@RelationshipFragment()',
                'export class R { @TargetNode() to: R; }',
                '@GraphView()',
                'export class Rooted { @Root() v: V; }',
                '@GraphView()',
                "export class Pathed { @Root() a: A; @GraphPath([{ type: 'T' }]) far: V; }",
                '@GraphView()',
                "export class Related { @Root() a: A; @GraphRelationship({ type: 'T' }) to: Plain; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            'Drivine model file: src/A#R: R.to holds R, which is not a @NodeFragment or @GraphView.',
            'Drivine model file: src/A#Rooted: Rooted.v holds V, which is not a @NodeFragment.',
            'Drivine model file: src/A#Pathed: Pathed.far holds V, which is not a @NodeFragment.',
            'Drivine model file: src/A#Related: Related.to holds Plain, which is not a @NodeFragment, @RelationshipFragment or @GraphView.'
        ]);
        expect(read(dir).views.map((it: any) => it.id)).toEqual(['src/A#V']);
    });

    it('takes a class that inherits its kind, as ModelRegistry does, as one a field may hold', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphRelationship, GraphView, NodeFragment, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                'export class Sub extends A {}',
                '@GraphView()',
                "export class V { @Root() a: Sub; @GraphRelationship({ type: 'T', target: () => Sub }) to: Sub[]; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([]);
        const view = read(dir).views[0];
        expect(view.root).toEqual({ field: 'a', fragment: 'src/A#Sub' });
        expect(view.relationships[0].target).toEqual('src/A#Sub');
    });

    it('names a path that orders more than one hop, as ModelRegistry does', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphPath, GraphView, hop, NodeFragment, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@GraphView()',
                "export class V { @Root() a: A; @GraphPath([hop('T', undefined, undefined, 'x'), { type: 'U', orderBy: 'y' }]) far: A; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            'Drivine model file: src/A#V: @GraphPath V.far names an order on more than one hop; a path is read in one order.'
        ]);
    });

    it.each([
        // Each class, and what ModelRegistry refuses of it.
        [
            "@GraphView() @NodeFragment({ labels: ['X'] }) export class Kinds { id: string; }",
            "Kinds can't be both a NODE_FRAGMENT and a GRAPH_VIEW."
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Ids { @NodeId() a: string; @NodeId() b: string; }",
            'Ids has 2 @NodeId properties (a, b). A node has one id.'
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Stamps { @NodeStamp() a: number; @NodeStamp() b: number; }",
            'Stamps has 2 @NodeStamp properties (a, b). A node has one stamp.'
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Stamp { @NodeStamp() @GraphProperty('s') a: number; }",
            "@NodeStamp Stamp.a can't carry another mapping decorator."
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Sorted { @SortedBy('x') a: string; }",
            "Sorted.a: @SortedBy can't be used on a @NodeFragment."
        ],
        [
            '@RelationshipFragment() export class Identified { @TargetNode() to: A; @NodeId() id: string; }',
            "Identified.id: @NodeId can't be used on a @RelationshipFragment."
        ],
        [
            '@GraphView() export class Indexed { @Root() a: A; @Unique() u: string; }',
            "Indexed.u: a schema decorator can't be used on a @GraphView."
        ],
        [
            '@GraphView() export class Marked { @Root() a: A; @ReadOnly() @GraphTransient() t: string; }',
            '@ReadOnly Marked.t marks a relationship field; it has none.'
        ],
        [
            "@GraphView() export class Both { @Root() a: A; @Count('T') @GraphRelationship({ type: 'T' }) to: A; }",
            'Both.to can be one of a relationship, a path or an aggregate.'
        ],
        [
            '@GraphView() export class Roots { @Root() a: A; @Root() b: A; }',
            '@GraphView Roots needs exactly one @Root property. It has 2.'
        ],
        [
            '@RelationshipFragment() export class Targets { @TargetNode() a: A; @TargetNode() b: A; }',
            '@RelationshipFragment Targets needs exactly one @TargetNode property, the node the relationship leads to. It has 2.'
        ],
        [
            "@GraphView() export class Untyped { @Root() a: A; @GraphRelationship({ type: '' }) to: A; }",
            '@GraphRelationship on Untyped.to needs a type.'
        ],
        [
            "@GraphView() export class Uncounted { @Root() a: A; @Count('') n: number; }",
            'The aggregate Uncounted.n needs a relationship type.'
        ],
        [
            "@GraphView() export class Shallow { @Root() a: A; @GraphRelationship({ type: 'T', maxDepth: 1.5 }) to: A; }",
            'maxDepth on Shallow.to must be a whole number of at least 1.'
        ],
        [
            "@GraphView() export class Deep { @Root() a: A; @GraphRelationship({ type: 'T', maxDepth: 2 }) to: R; }",
            "Deep.to holds relationship fragments, which are one relationship each: maxDepth can't be above 1."
        ],
        [
            "@GraphView() export class Listed { @Root() a: A; @GraphRelationship({ type: 'T' }) to: A[]; }",
            "Listed.to is a list, and TypeScript does not keep the type of a list's items. Name it: " +
                "@GraphRelationship({ type: 'T', target: () => Item })."
        ],
        [
            "@GraphView() export class Pathed { @Root() a: A; @GraphPath([hop('T')]) far: A[]; }",
            "Pathed.far is a list, and TypeScript does not keep the type of a list's items. Name it: " +
                '@GraphPath([...], { target: () => Item }).'
        ],
        [
            '@GraphView() export class Hopless { @Root() a: A; @GraphPath([]) far: A; }',
            '@GraphPath on Hopless.far needs at least one hop, each with a type.'
        ],
        // TypeScript records Object as the type of an alias's field, and of a union's under strict null checks.
        [
            '@GraphView() export class Aliased { @Root() a: OfA; }',
            "Can't tell what Aliased.a holds. Name its class in the decorator, e.g. () => Item."
        ],
        [
            "@GraphView() export class Nullable { @Root() a: A; @GraphRelationship({ type: 'T' }) to: A | null; }",
            "Can't tell what Nullable.to holds. Name its class in the decorator, e.g. () => Item."
        ],
        [
            '@GraphView() export class Many { @Root() a: A[]; }',
            "Can't tell what Many.a holds. Name its class in the decorator, e.g. () => Item."
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Sets { @NodeLabels() a: string[]; @NodeLabels() b: string[]; }",
            'Sets has 2 @NodeLabels fields; a fragment may have one.'
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Own { @NodeLabels(['X', 'Y']) labels: string[]; }",
            "@NodeLabels Own.labels names X, the fragment's own label: those are fixed."
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Reserved { @NodeLabels(['__drivine.y']) labels: string[]; }",
            "@NodeLabels Reserved.labels names a label beginning '__drivine.', which is reserved."
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Flat { @PropertyBag({ flat: true }) a: Bag; @PropertyBag({ flat: true }) b: Bag; }",
            'Flat has more than one flat @PropertyBag; a fragment may have one.'
        ],
        [
            "@NodeFragment({ labels: ['X'] }) export class Overlap { @PropertyBag() a: Bag; @PropertyBag({ prefix: 'a.b' }) b: Bag; }",
            "The @PropertyBag namespaces of Overlap.a ('a.') and b ('a.b.') overlap: one would read the other's entries."
        ],
        [
            "@Unique() @NodeFragment({ labels: ['X'] }) export class Unindexed { id: string; }",
            'On a class, a UNIQUE declaration names its properties: { properties: [...] }.'
        ]
    ])('names a class ModelRegistry refuses, as it does, rather than write it: %s', (source, warning) => {
        const dir = project({
            'src/A.ts': [
                "import { Count, GraphPath, GraphProperty, GraphRelationship, GraphTransient, GraphView, hop, NodeFragment, NodeId, NodeLabels, NodeStamp, PropertyBag, ReadOnly, RelationshipFragment, Root, SortedBy, TargetNode, Unique } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@RelationshipFragment()',
                'export class R { @TargetNode() a: A; }',
                'type OfA = A;',
                'type Bag = Record<string, string>;',
                source
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        const name = /class (\w+)/.exec(source)![1];
        expect(warnings).toEqual([`Drivine model file: src/A#${name}: ${warning}`]);
        const model = read(dir);
        expect(model.fragments.concat(model.relationshipFragments, model.views).map((it: any) => it.name)).toEqual([
            'A',
            'R'
        ]);
    });

    it("takes a field's class as TypeScript records it: Array for each way of writing a list, none for a class imported as a type", () => {
        const dir = project({
            'src/A.ts': [
                "import { NodeFragment } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }'
            ].join('\n'),
            'src/V.ts': [
                "import { GraphRelationship, GraphView, Root } from '@liberation-data/drivine';",
                "import { A } from './A';",
                "import type { A as OnlyA } from './A';",
                'type As = A[];',
                'type List<T> = T[];',
                '@GraphView()',
                "export class Generic { @Root() a: A; @GraphRelationship({ type: 'T' }) to: Array<A>; }",
                '@GraphView()',
                "export class Fixed { @Root() a: A; @GraphRelationship({ type: 'T' }) to: readonly A[]; }",
                '@GraphView()',
                "export class Wrapped { @Root() a: A; @GraphRelationship({ type: 'T' }) to: (A[]); }",
                '@GraphView()',
                "export class Aliased { @Root() a: A; @GraphRelationship({ type: 'T' }) to: As; }",
                '@GraphView()',
                "export class Listed { @Root() a: A; @GraphRelationship({ type: 'T' }) to: List<A>; }",
                '@GraphView()',
                "export class Typed { @Root() a: A; @GraphRelationship({ type: 'T' }) to: OnlyA; }",
                '@GraphView()',
                "export class Single { @Root() a: (A); @GraphRelationship({ type: 'T' }) to: A; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        const listed = (name: string) =>
            `Drivine model file: src/V#${name}: ${name}.to is a list, and TypeScript does not keep the type of a ` +
            "list's items. Name it: @GraphRelationship({ type: 'T', target: () => Item }).";
        expect(warnings).toEqual([
            listed('Generic'),
            listed('Fixed'),
            listed('Wrapped'),
            listed('Aliased'),
            listed('Listed'),
            "Drivine model file: src/V#Typed: Can't tell what Typed.to holds. Name its class in the decorator, e.g. () => Item."
        ]);
        expect(read(dir).views.map((it: any) => it.name)).toEqual(['Single']);
    });

    it('says a relationship is a list only where TypeScript records an Array, as a load gives one only then', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphPath, GraphRelationship, GraphView, hop, NodeFragment, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@GraphView()',
                'export class V {',
                '    @Root() a: A;',
                "    @GraphRelationship({ type: 'T', target: () => A }) to: A[] | null;",
                "    @GraphPath([hop('T')], { target: () => A }) far: A[] | undefined;",
                "    @GraphRelationship({ type: 'T', target: () => A }) all?: A[];",
                '}'
            ].join('\n')
        });
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: quiet });
        // Under strict null checks, TypeScript records a list that may be null as Object, and a load gives one item.
        expect(read(dir).views[0].relationships.map((it: any) => [it.field, it.many])).toEqual([
            ['all', true],
            ['far', false],
            ['to', false]
        ]);
    });

    it('names an @EmptyWhenAbsent list TypeScript does not record as an Array, as a load gives {} for it, and writes its class', () => {
        const dir = project({
            'src/A.ts': [
                "import { EmptyWhenAbsent, NodeFragment } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { @EmptyWhenAbsent() tags?: string[]; @EmptyWhenAbsent() scores: Map<string, number>; }',
                "@NodeFragment({ labels: ['B'] })",
                'export class B { @EmptyWhenAbsent() tags: string[] | null; }',
                "@NodeFragment({ labels: ['C'] })",
                'export class C { @EmptyWhenAbsent() tags: Set<string>; }'
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        const named = (name: string): string =>
            `Drivine model file: src/A#${name}: @EmptyWhenAbsent ${name}.tags is a list TypeScript does not record ` +
            'as an Array, so a load gives {} for it, not []. Declare it as an array, optional with ? rather than | null.';
        expect(warnings).toEqual([named('B'), named('C')]);
        const a = read(dir).fragments[0];
        expect(a.properties.map((it: any) => [it.name, it.type, it.whenAbsent])).toEqual([
            ['scores', 'map', 'empty'],
            ['tags', 'list', 'empty']
        ]);
        // The classes load, so they are written.
        expect(read(dir).fragments.map((it: any) => it.name)).toEqual(['A', 'B', 'C']);
    });

    it('takes the class of a field that may be null without strict null checks, as TypeScript records it', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphRelationship, GraphView, NodeFragment, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@GraphView()',
                "export class V { @Root() a: A | null; @GraphRelationship({ type: 'T' }) to: A | undefined; }"
            ].join('\n')
        });
        const tsconfig = path.join(dir, 'tsconfig.json');
        const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
        config.compilerOptions.strict = false;
        fs.writeFileSync(tsconfig, JSON.stringify(config));
        const warnings: string[] = [];
        generateModelFile({ project: tsconfig, warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([]);
        const view = read(dir).views[0];
        expect([view.root.fragment, view.relationships[0].target]).toEqual(['src/A#A', 'src/A#A']);
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
                "import { Count, GraphPath, GraphProperty, GraphRelationship, GraphView, hop, NodeFragment, Root, SortedBy } from '@liberation-data/drivine';",
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
                "export class Z { @Root() b: B; @SortedBy(name()) @GraphRelationship({ type: 'TO', target: () => B }) to: B[]; }",
                '@GraphView()',
                'export class Z2 { @Root() b: B; @GraphPath([hop(name()), { type: name() }]) far: B; }'
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
            "Drivine model file: src/A#Z: Can't read what @SortedBy Z.to sorts by. Name it with a literal or a constant.",
            "Drivine model file: src/A#Z2: Can't read the hops of @GraphPath Z2.far. Name each with a literal, a constant or hop()."
        ]);
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#B']);
        expect(read(dir).views).toEqual([]);
    });

    it('names any other option it cannot read, rather than write its default', () => {
        const dir = project({
            'src/A.ts': [
                "import { Aggregate, AggregateFunction, Direction, GraphPath, GraphRelationship, GraphView, hop, NodeFragment, PropertyBag, RelationshipFragment, Root, SortedBy, TargetNode, Unique, VectorIndex } from '@liberation-data/drivine';",
                "const text = (): string => 'x';",
                'const flag = (): boolean => true;',
                'const count = (): number => 2;',
                "const similarity = (): 'COSINE' => 'COSINE';",
                'const options = (): any => ({});',
                'const pick = (): any => B;',
                "@NodeFragment({ labels: ['B'] })",
                'export class B { id: string; }',
                "@NodeFragment({ labels: ['F1'] })",
                'export class F1 { @PropertyBag({ prefix: text() }) bag: Record<string, string>; }',
                "@NodeFragment({ labels: ['F2'] })",
                'export class F2 { @PropertyBag({ flat: flag() }) bag: Record<string, string>; }',
                "@NodeFragment({ labels: ['F3'] })",
                'export class F3 { @PropertyBag(options()) bag: Record<string, string>; }',
                "@NodeFragment({ labels: ['F4'] })",
                'export class F4 { @VectorIndex({ similarity: similarity() }) v: number[]; }',
                "@NodeFragment({ labels: ['F5'] })",
                'export class F5 { @VectorIndex({ dimensions: count() }) v: number[]; }',
                "@NodeFragment({ labels: ['F6'] })",
                "@Unique({ properties: [text(), 'id'] })",
                'export class F6 { id: string; }',
                '@RelationshipFragment()',
                'export class R { @TargetNode(() => pick()) b: B; }',
                '@GraphView()',
                "export class V1 { @Root() b: B; @GraphRelationship({ type: 'T', maxDepth: count() }) to: B; }",
                '@GraphView()',
                "export class V2 { @Root() b: B; @GraphRelationship({ type: 'T', required: flag() }) to: B; }",
                '@GraphView()',
                "export class V3 { @Root() b: B; @GraphRelationship({ type: 'T', target: () => pick() }) to: B; }",
                '@GraphView()',
                'export class V4 { @Root(() => pick()) b: B; }',
                '@GraphView()',
                "export class V5 { @Root() b: B; @SortedBy('id', flag()) @GraphRelationship({ type: 'T', target: () => B }) to: B[]; }",
                '@GraphView()',
                "export class V6 { @Root() b: B; @GraphPath([hop('T', Direction.OUTGOING, text())]) far: B; }",
                '@GraphView()',
                "export class V7 { @Root() b: B; @GraphPath([hop('T', Direction.OUTGOING, undefined, text())]) far: B; }",
                '@GraphView()',
                "export class V8 { @Root() b: B; @GraphPath([hop('T', Direction.OUTGOING, undefined, 'id', flag())]) far: B; }",
                '@GraphView()',
                "export class V9 { @Root() b: B; @GraphPath([{ type: 'T' }], { required: flag() }) far: B; }",
                '@GraphView()',
                "export class V10 { @Root() b: B; @Aggregate({ function: AggregateFunction.SUM, type: 'T', property: text() }) m: number; }",
                '@GraphView()',
                "export class V11 { @Root() b: B; @Aggregate({ function: AggregateFunction.SUM, type: 'T' }) m: number; }"
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        const literal = 'Name it with a literal or a constant.';
        expect(warnings).toEqual(
            [
                `src/A#F1: Can't read the prefix of @PropertyBag F1.bag. ${literal}`,
                `src/A#F2: Can't read whether @PropertyBag F2.bag is flat. ${literal}`,
                `src/A#F3: Can't read the options of @PropertyBag F3.bag. ${literal}`,
                "src/A#F4: Can't read the similarity of F4.v. Name it with COSINE, EUCLIDEAN, or a constant of one.",
                `src/A#F5: Can't read the dimensions of F5.v. ${literal}`,
                `src/A#F6: Can't read the properties of @Unique on F6. ${literal}`,
                "src/A#R: Can't read the class R.b holds. Name it with () => Class.",
                `src/A#V1: Can't read the maxDepth of V1.to. ${literal}`,
                `src/A#V2: Can't read whether V2.to is required. ${literal}`,
                "src/A#V3: Can't read the class V3.to holds. Name it with () => Class.",
                "src/A#V4: Can't read the class V4.b holds. Name it with () => Class.",
                `src/A#V5: Can't read which way @SortedBy V5.to sorts. ${literal}`,
                `src/A#V6: Can't read the label of a hop of V6.far. ${literal}`,
                `src/A#V7: Can't read what a hop of V7.far sorts by. ${literal}`,
                `src/A#V8: Can't read which way a hop of V8.far sorts. ${literal}`,
                `src/A#V9: Can't read whether V9.far is required. ${literal}`,
                `src/A#V10: Can't read the property V10.m aggregates. ${literal}`,
                // As ModelRegistry refuses it.
                'src/A#V11: The SUM V11.m needs the property it aggregates.'
            ].map((it) => `Drivine model file: ${it}`)
        );
        expect(read(dir).fragments.map((it: any) => it.id)).toEqual(['src/A#B']);
        expect(read(dir).relationshipFragments).toEqual([]);
        expect(read(dir).views).toEqual([]);
    });

    it('takes an option given as undefined or null as left out, as the decorator does', () => {
        const dir = project({
            'src/A.ts': [
                "import { Count, GraphPath, GraphRelationship, GraphView, hop, NodeFragment, PropertyBag, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['B'] })",
                'export class B { id: string; @PropertyBag({ prefix: undefined, flat: null as any }) bag: Record<string, string>; }',
                '@GraphView()',
                'export class V {',
                '    @Root(undefined) b: B;',
                "    @GraphRelationship({ type: 'T', direction: undefined, maxDepth: undefined, required: undefined }) to: B;",
                "    @GraphPath([hop('T', undefined, undefined, 'id')], { target: () => B }) far: B[];",
                "    @Count('T', undefined) n: number;",
                '}'
            ].join('\n')
        });
        const warnings: string[] = [];
        generateModelFile({ project: path.join(dir, 'tsconfig.json'), warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([]);
        expect(read(dir).fragments[0].bags).toEqual([{ field: 'bag', prefix: 'bag.', type: 'string' }]);
        const view = read(dir).views[0];
        expect(view.root).toEqual({ field: 'b', fragment: 'src/A#B' });
        expect(view.relationships).toEqual([
            {
                field: 'far',
                target: 'src/A#B',
                many: true,
                required: false,
                readOnly: true,
                path: [{ type: 'T', direction: 'OUTGOING', orderBy: 'id', ascending: true }]
            },
            { field: 'to', type: 'T', direction: 'OUTGOING', target: 'src/A#B', many: false, required: false }
        ]);
        expect(view.aggregates).toEqual([{ field: 'n', function: 'COUNT', type: 'T', direction: 'OUTGOING' }]);
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

    it('reads an option given in shorthand, as `{ labels }`, by the constant of its name', () => {
        const { warnings, entry }: Written = fragment({
            'src/A.ts': [
                "import { NodeFragment, PropertyBag } from '@liberation-data/drivine';",
                "const labels = ['A', 'Extra'];",
                "const prefix = 'meta';",
                '@NodeFragment({ labels })',
                'export class A { @PropertyBag({ prefix }) meta: Record<string, string>; }'
            ].join('\n')
        });
        expect(warnings).toEqual([]);
        expect(entry.labels).toEqual(['A', 'Extra']);
        expect(entry.bags).toEqual([{ field: 'meta', prefix: 'meta.', type: 'string' }]);
    });

    it('reads a field whose name is in quotes, as a load maps it', () => {
        const { entry }: Written = fragment({
            'src/A.ts': [
                "import { GraphProperty, NodeFragment } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                "export class A { 'first-name': string; @GraphProperty('surname') 'last-name': string; }"
            ].join('\n')
        });
        expect(entry.properties.map((it: any) => [it.name, it.stored])).toEqual([
            ['first-name', 'first-name'],
            ['last-name', 'surname']
        ]);
    });

    it('takes no class from a field without decorator metadata, as a load has none to take', () => {
        const dir = project({
            'src/A.ts': [
                "import { GraphRelationship, GraphView, NodeFragment, Root } from '@liberation-data/drivine';",
                "@NodeFragment({ labels: ['A'] })",
                'export class A { id: string; }',
                '@GraphView()',
                "export class V { @Root(() => A) a: A; @GraphRelationship({ type: 'T', target: () => A }) to: A[]; }",
                '@GraphView()',
                "export class W { @Root(() => A) a: A; @GraphRelationship({ type: 'T' }) one: A; }"
            ].join('\n')
        });
        const tsconfig = path.join(dir, 'tsconfig.json');
        const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
        config.compilerOptions.emitDecoratorMetadata = false;
        fs.writeFileSync(tsconfig, JSON.stringify(config));
        const warnings: string[] = [];
        generateModelFile({ project: tsconfig, warn: (it) => warnings.push(it) });
        expect(warnings).toEqual([
            "Drivine model file: src/A#W: Can't tell what W.one holds. Name its class in the decorator, e.g. () => Item."
        ]);
        // Without the metadata recording an Array, a load gives one item.
        expect(read(dir).views.map((it: any) => [it.name, it.relationships[0].many])).toEqual([['V', false]]);
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

    it('says what it cannot read on standard error, and writes the rest', () => {
        const { lines, out }: { lines: string[]; out: Output } = output();
        const dir = project({
            'src/V.ts': `import { GraphView } from '@liberation-data/drivine';\n@GraphView()\nexport class V { x: string; }\n`
        });
        const errors: string[] = [];
        expect(
            main(['model', '--project', path.join(dir, 'tsconfig.json')], { ...out, error: (it) => errors.push(it) })
        ).toEqual(0);
        expect(errors).toEqual([
            'Drivine model file: src/V#V: @GraphView V needs exactly one @Root property. It has 0.'
        ]);
        expect(lines).toEqual([expect.stringContaining('the project declares no fragments or views')]);
    });

    it('says how it is used, and fails on what it does not know', () => {
        const { lines, out }: { lines: string[]; out: Output } = output();
        expect(main(['--help'], out)).toEqual(0);
        expect(main(['other'], out)).toEqual(1);
        expect(main(['model', '--project'], out)).toEqual(1);
        expect(main(['model', '--project', '--check'], out)).toEqual(1);
        // A mistyped --check writes nothing, and fails, rather than passing.
        const dir = copy(FIXTURE);
        expect(main(['model', '--project', path.join(dir, 'tsconfig.json'), '--chek'], out)).toEqual(1);
        expect(fs.existsSync(path.join(dir, '.drivine'))).toBe(false);
        expect(lines.every((it) => it.startsWith('Usage: drivine model'))).toBe(true);
    });
});
