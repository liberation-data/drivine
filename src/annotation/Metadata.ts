import 'reflect-metadata';
import { ClassType } from '@/query/QuerySpecification';

/**
 * A function returning a class. Decorators take one, rather than the class, so that two classes that refer to each
 * other can be declared in either order, or in modules that import each other.
 */
export type ClassThunk<T = any> = () => ClassType<T>;

export enum ClassKind {
    NODE_FRAGMENT = 'NODE_FRAGMENT',
    RELATIONSHIP_FRAGMENT = 'RELATIONSHIP_FRAGMENT',
    GRAPH_VIEW = 'GRAPH_VIEW'
}

export interface ClassMetadata {
    kind: ClassKind;
    labels?: string[];
}

export enum Direction {
    OUTGOING = 'OUTGOING',
    INCOMING = 'INCOMING',
    UNDIRECTED = 'UNDIRECTED'
}

export interface RelationshipOptions {
    /** The relationship type, e.g. `HAS_HOLIDAY`. */
    type: string;
    /** Defaults to OUTGOING. */
    direction?: Direction;
    /** Max expansion depth for recursive relationships. Defaults to 1. */
    maxDepth?: number;
    /**
     * Whether the view requires the relationship to exist: a root without it is not loaded. Defaults to false.
     * TypeScript erases `?:` and `| undefined`, so this can't be read from the property's type.
     */
    required?: boolean;
    /**
     * The class of the related item: a node fragment, a relationship fragment or a view. Required for a list; for a
     * single item it defaults to the property's declared type.
     */
    target?: ClassThunk;
}

export interface PropertyMetadata {
    root?: { target?: ClassThunk };
    nodeId?: boolean;
    relationship?: RelationshipOptions;
    graphProperty?: string;
    transient?: boolean;
    targetNode?: { target?: ClassThunk };
    /** The property's declared type, from `design:type`. Array for a list. */
    designType?: Function;
}

const CLASS_KEY = Symbol('drivine:class');
const PROPERTIES_KEY = Symbol('drivine:properties');

export function defineClassMetadata(target: Function, metadata: ClassMetadata): void {
    const existing = Reflect.getOwnMetadata(CLASS_KEY, target) as ClassMetadata | undefined;
    if (existing && existing.kind !== metadata.kind) {
        throw new Error(`${target.name} can't be both a ${existing.kind} and a ${metadata.kind}.`);
    }
    Reflect.defineMetadata(CLASS_KEY, metadata, target);
}

/**
 * The class's own metadata, not inherited.
 */
export function ownClassMetadata(target: Function): ClassMetadata | undefined {
    return Reflect.getOwnMetadata(CLASS_KEY, target);
}

export function definePropertyMetadata(prototype: object, property: string, metadata: Partial<PropertyMetadata>): void {
    const target = prototype.constructor;
    const all: Map<string, PropertyMetadata> = Reflect.getOwnMetadata(PROPERTIES_KEY, target) ?? new Map();
    const designType = Reflect.getMetadata('design:type', prototype, property);
    all.set(property, { ...all.get(property), designType, ...metadata });
    Reflect.defineMetadata(PROPERTIES_KEY, all, target);
}

/**
 * The decorated properties of a class and its superclasses. A subclass's decorators on a property replace those of
 * its superclass.
 */
export function propertyMetadata(target: Function): Map<string, PropertyMetadata> {
    const chain: Function[] = [];
    for (let it = target; it && it !== Function.prototype; it = Object.getPrototypeOf(it)) {
        chain.unshift(it);
    }
    const result = new Map<string, PropertyMetadata>();
    for (const type of chain) {
        const own: Map<string, PropertyMetadata> | undefined = Reflect.getOwnMetadata(PROPERTIES_KEY, type);
        own?.forEach((value, key) => result.set(key, value));
    }
    return result;
}

/**
 * The classes from `target` up its superclass chain, nearest first.
 */
export function classChain(target: Function): Function[] {
    const chain: Function[] = [];
    for (let it = target; it && it !== Function.prototype; it = Object.getPrototypeOf(it)) {
        chain.push(it);
    }
    return chain;
}

/**
 * Wraps the type of a property that refers to a class declared later in the same module, e.g. two views that refer
 * to each other: `@GraphRelationship({ type: 'TO_B', target: () => B }) b?: Related<B>`.
 *
 * Without it, TypeScript's decorator metadata reads the class when the property is decorated, before it is
 * declared, and throws. Through the alias it records Object instead, and the decorator's target names the class.
 */
export type Related<T> = T;
