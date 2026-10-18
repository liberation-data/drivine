/** A range index over one or more properties of a label's nodes. */
export interface RangeIndexSpec {
    kind: 'RANGE';
    label: string;
    properties: string[];
}

/** A constraint that no two of a label's nodes hold the same values of the properties. */
export interface UniquenessConstraintSpec {
    kind: 'UNIQUE';
    label: string;
    properties: string[];
}

export function rangeIndex(label: string, properties: string | string[]): RangeIndexSpec {
    return { kind: 'RANGE', label, properties: [properties].flat() };
}

export function uniquenessConstraint(label: string, properties: string | string[]): UniquenessConstraintSpec {
    return { kind: 'UNIQUE', label, properties: [properties].flat() };
}

export type EnsureStatus = 'CREATED' | 'ALREADY_MATCHING' | 'VIOLATION' | 'RECREATED';

export interface EnsureResult<S> {
    status: EnsureStatus;
    spec: S;
    /** For a VIOLATION: a sample of the values more than one node holds. */
    sample?: unknown[];
}

/** The name Drivine gives an item on an engine that names them. */
export function itemName(spec: RangeIndexSpec | UniquenessConstraintSpec): string {
    const clean = (it: string): string => it.replace(/[^A-Za-z0-9]/g, '_');
    return `drivine_${spec.kind.toLowerCase()}_${clean(spec.label)}_${spec.properties.map(clean).join('_')}`;
}
