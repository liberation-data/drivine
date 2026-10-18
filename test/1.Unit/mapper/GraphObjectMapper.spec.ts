import {
    GraphObjectMapper,
    GraphProperty,
    GraphTransient,
    ModelRegistry,
    NodeFragment,
    NodeId
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
});
