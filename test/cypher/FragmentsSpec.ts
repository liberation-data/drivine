import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { cypherFloat } from '@/cypher/CypherFloat';
import { FragmentPart, FragmentVariable, SharedStore } from '@/cypher/SharedCypherCompiler';

/**
 * The spec's `fragments.yaml`: the parts of a statement a library writes itself, its filters and orders, as the module
 * compiles them (liberation-data/drivine-cypher-spec#161). Each case is one Cypher expression over `variables`, with the
 * terms each store's are pinned to (`sql`) and the ids Neo4j keeps or orders over the nodes `setup` makes (`rows`); the
 * `table` puts each condition form in each of its `positions` and each value form in an order both ways, with the rows and
 * the digests of each store's terms in turn. See its own header.
 */
export interface FragmentsSpec {
    graph: string;
    indexed: [string, string][];
    variables: Record<string, FragmentVariable>;
    setup: string[];
    cases: FragmentCase[];
    table: {
        positions: string[];
        conditions: { form: string; parameters?: Record<string, any>; rows: string[][]; digests: Digests }[];
        orders: { value: string; rows: string[][]; digests: Digests }[];
    };
}

export interface FragmentCase {
    name: string;
    condition?: string;
    order?: string;
    value?: string;
    descending?: boolean;
    parameters?: Record<string, any>;
    rows?: string[];
    sql: Record<SharedStore, string[]>;
}

type Digests = Record<SharedStore, string[]>;

/** The spec's fragments, read with each whole number a `bigint`, so a number in it is a float, as the spec wrote it. */
export function loadFragmentsSpec(): FragmentsSpec {
    return parse(fs.readFileSync(path.join(__dirname, 'fragments.yaml'), 'utf8'), { intAsBigInt: true });
}

/** The part a case is: its condition, its value, or its order, descending or not. */
export function partOf(it: FragmentCase): FragmentPart {
    if (it.condition !== undefined) {
        return { condition: it.condition };
    }
    if (it.value !== undefined) {
        return { value: it.value };
    }
    return { order: it.order!, descending: it.descending ?? false };
}

/**
 * The spec's parameters as a caller binds them: a whole number its `bigint`, a number the float it was written as (`36.0`
 * a {@link cypherFloat}), and a temporal value, `{"$temporal": <kind>, "text": …}`, a value of that kind with that ISO
 * 8601 text, which Drivine binds as the same tag. The Neo4j driver marks each of its temporal kinds by a property, as the
 * stand-in does, so the spec's own text is bound, to the digit.
 */
export function parametersOf(given: Record<string, any> | undefined): Record<string, any> {
    return Object.fromEntries(Object.entries(given ?? {}).map(([name, value]) => [name, valueOf(value)]));
}

const DRIVER_MARKERS: Record<string, string> = {
    DATE: '__isDate__',
    TIME: '__isTime__',
    LOCAL_TIME: '__isLocalTime__',
    LOCAL_DATE_TIME: '__isLocalDateTime__',
    DATE_TIME: '__isDateTime__',
    DURATION: '__isDuration__'
};

function valueOf(value: any): any {
    if (typeof value === 'number') {
        return cypherFloat(value);
    }
    if (Array.isArray(value)) {
        return value.map(valueOf);
    }
    if (value !== null && typeof value === 'object') {
        if ('$temporal' in value) {
            const marker = DRIVER_MARKERS[value.$temporal];
            if (!marker) {
                throw new Error(`No temporal kind ${value.$temporal} in the runner`);
            }
            const text = String(value.text);
            return { [marker]: true, toString: () => text };
        }
        return parametersOf(value);
    }
    return value;
}

/** The first 16 hexadecimal digits of the SHA-256 of `terms` joined by a line feed, as the table's digests are. */
export function digestOf(terms: string[]): string {
    return createHash('sha256').update(terms.join('\n'), 'utf8').digest('hex').substring(0, 16);
}
