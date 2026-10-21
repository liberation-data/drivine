import {
    Aggregate,
    AggregateFunction,
    Count,
    Default,
    Direction,
    EmptyWhenAbsent,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphTransient,
    GraphView,
    hop,
    JsonPacked,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    PropertyBag,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

/*
 * The models drivine-python's tests load (its tests/models.py), here so that the statements both write for them can be
 * compared. A change to one is a change to the other.
 */

@NodeFragment({ labels: ['Person'] })
export class Person {
    @NodeId() uuid: string;
    name: string;
    bio?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['Organization'] })
export class Organization {
    @NodeId() uuid: string;
    name: string;
}

@RelationshipFragment()
export class WorkHistory {
    startDate: string;
    role: string;
    @TargetNode() target: Organization;
}

@GraphView()
export class PersonCareer {
    @Root() person: Person;
    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory }) employmentHistory: WorkHistory[] = [];
}

@NodeFragment({ labels: ['Location'] })
export class Location {
    @NodeId() uuid: string;
    name: string;
    type: string;
}

@GraphView()
export class LocationHierarchy {
    @Root() location: Location;
    @GraphRelationship({ type: 'HAS_LOCATION', target: () => LocationHierarchy, maxDepth: 3 })
    subLocations: LocationHierarchy[] = [];
}

@GraphView()
export class LocationAncestors {
    @Root() location: Location;
    @GraphRelationship({ type: 'HAS_LOCATION', direction: Direction.INCOMING, target: () => Location, maxDepth: 5 })
    within: Location[] = [];
}

@NodeFragment({ labels: ['Movie'] })
export class Movie {
    @NodeId() uuid: string;
    title: string;
    released: number;
}

@NodeFragment({ labels: ['Actor'] })
export class Actor {
    @NodeId() uuid: string;
    name: string;
}

@NodeFragment({ labels: ['Director'] })
export class Director {
    @NodeId() uuid: string;
    name: string;
}

@GraphView()
export class ActorStats {
    @Root() actor: Actor;
    @Count('ACTED_IN') movieCount: number;
    @Aggregate({ function: AggregateFunction.AVG, type: 'RATED', property: 'score' }) averageRating?: number;
    @Aggregate({ function: AggregateFunction.MAX, type: 'RATED', property: 'score' }) bestRating?: number;
    @GraphPath([hop('ACTED_IN'), hop('DIRECTED_BY')], { target: () => Director }) directors: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, undefined, 'released'), hop('DIRECTED_BY')], {
        target: () => Director
    })
    firstDirector?: Director;
}

@GraphView()
export class ActorWithDirectors {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie'), hop('DIRECTED_BY', Direction.OUTGOING, 'Person')], {
        target: () => Director,
        required: true
    })
    directors: Director[];
}

@GraphView()
export class ActorWithMovies {
    @Root() actor: Actor;
    @GraphRelationship({ type: 'ACTED_IN', target: () => Movie, required: true }) movies: Movie[];
}

@GraphView()
export class ActorWithLatestMovie {
    @Root() actor: Actor;
    @GraphRelationship({ type: 'ACTED_IN', target: () => Movie, required: true }) movie: Movie;
    @GraphTransient() note = 'not loaded';
}

@NodeFragment({ labels: ['Animal'] })
export class Animal {
    @NodeId() uuid: string;
    name: string;
}

@NodeFragment({ labels: ['Dog'] })
export class Dog extends Animal {
    breed?: string;
}

@NodeFragment({ labels: ['Puppy'] })
export class Puppy extends Dog {
    ageInWeeks = 0;
}

export enum Tier {
    GOLD = 'Gold',
    SILVER = 'Silver'
}

@NodeFragment({ labels: ['Customer'] })
export class Customer {
    @NodeId() uuid: string;
    fullName: string;
    @Default() status = 'active';
    @EmptyWhenAbsent() tags: string[] = [];
    @JsonPacked() preferences: Record<string, any> = {};
    @PropertyBag() metadata: Record<string, any> = {};
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
    @NodeLabels(Tier) tiers: Set<string> = new Set();
    @GraphProperty('LEGACY') legacyCode?: string;
    @GraphTransient() scratch = '';
}
