import {
    GraphObjectMapper,
    GraphProperty,
    GraphTransient,
    JsonPacked,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    packedTextOf
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() uuid: string;
    name: string;
    @GraphProperty('biography') bio?: string;
    @GraphTransient() displayName?: string;
    nickname = 'none';

    greeting(): string {
        return `Hi, ${this.name}`;
    }
}

@NodeFragment({ labels: ['Settings'] })
class Settings {
    @NodeId() uuid: string;
    @JsonPacked() @GraphProperty('prefs_json') prefs?: Record<string, any>;
    @NodeStamp() stamp?: string;
}

describe('GraphObjectMapper', () => {
    const mapper = new GraphObjectMapper();
    const model = new ModelRegistry().fragment(Person);

    it('should make an instance of the class, with its methods', () => {
        const person = mapper.fragment<Person>(model, { props: { uuid: '1', name: 'Moon Girl' }, labels: ['Person'] });
        expect(person).toBeInstanceOf(Person);
        expect(person.greeting()).toEqual('Hi, Moon Girl');
    });

    it('should read a renamed field from its graph name, and not from its field name', () => {
        const person = mapper.fragment<Person>(model, {
            props: { uuid: '1', biography: 'Genius', bio: 'stray' },
            labels: ['Person']
        });
        expect(person.bio).toEqual('Genius');
        expect(Object.keys(person)).not.toContain('biography');
    });

    it('should leave out transient fields and properties that are Drivine’s own', () => {
        const person = mapper.fragment<Person>(model, {
            props: { uuid: '1', displayName: 'from the graph', '__drivine.stamp': 'abc' },
            labels: ['Person']
        });
        expect(person.displayName).toBeUndefined();
        expect(Object.keys(person)).not.toContain('__drivine.stamp');
    });

    it('should keep a field initializer where the node has no such property', () => {
        expect(mapper.fragment<Person>(model, { props: { uuid: '1' }, labels: ['Person'] }).nickname).toEqual('none');
        expect(
            mapper.fragment<Person>(model, { props: { uuid: '1', nickname: 'MG' }, labels: ['Person'] }).nickname
        ).toEqual('MG');
    });

    it('should keep the text a packed property held, for a save given the fragment as loaded', () => {
        const settings = mapper.fragment<Settings>(new ModelRegistry().fragment(Settings), {
            props: { uuid: '1', prefs_json: '{"a": 1}', '__drivine.stamp': 'abc' },
            labels: ['Settings']
        });
        expect(settings.prefs).toEqual({ a: 1 });
        expect(packedTextOf(settings)).toEqual({ prefs_json: '{"a": 1}' });
        // A copy, or a fragment of a class with nothing packed, holds none.
        expect(packedTextOf({ ...settings })).toBeUndefined();
        expect(
            packedTextOf(mapper.fragment<Person>(model, { props: { uuid: '1' }, labels: ['Person'] }))
        ).toBeUndefined();
    });
});
