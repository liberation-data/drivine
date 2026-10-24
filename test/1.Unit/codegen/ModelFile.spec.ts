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

    it('says how it is used, and fails on what it does not know', () => {
        const { lines, out }: { lines: string[]; out: Output } = output();
        expect(main(['--help'], out)).toEqual(0);
        expect(main(['other'], out)).toEqual(1);
        expect(main(['model', '--project'], out)).toEqual(1);
        expect(lines.every((it) => it.startsWith('Usage: drivine model'))).toBe(true);
    });
});
