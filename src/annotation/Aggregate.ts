import { Direction, definePropertyMetadata } from '@/annotation/Metadata';

export enum AggregateFunction {
    COUNT = 'COUNT',
    SUM = 'SUM',
    AVG = 'AVG',
    MIN = 'MIN',
    MAX = 'MAX'
}

export interface AggregateOptions {
    function: AggregateFunction;
    /** The relationship type to follow from the root, one hop. */
    type: string;
    /** The property of the related nodes to aggregate. Not needed for COUNT, which then counts the nodes. */
    property?: string;
    /** Defaults to OUTGOING. */
    direction?: Direction;
}

/**
 * A field of a view computed in the query from the nodes one relationship type leads to: their number, or the SUM, AVG,
 * MIN or MAX of a numeric property. SUM and COUNT of none are 0; AVG, MIN and MAX of none are undefined. Read-only.
 */
export function Aggregate(options: AggregateOptions): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { aggregate: options });
}

/** The number of nodes a relationship type leads to from the view's root. Read-only. */
export function Count(type: string, direction: Direction = Direction.OUTGOING): PropertyDecorator {
    return Aggregate({ function: AggregateFunction.COUNT, type, direction });
}
