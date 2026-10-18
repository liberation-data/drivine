import { plainToInstance } from 'class-transformer';
import { FragmentModel } from '@/model/FragmentModel';

/** Property names beginning with this are Drivine's own, and are never mapped onto an object. */
export const RESERVED_PREFIX = '__drivine.';

/**
 * A node as a fragment load returns it: its properties, and its labels apart from them.
 */
export interface FragmentRow {
    props: Record<string, any>;
    labels: string[];
}

/**
 * Turns the rows the object manager's statements return into instances of the mapped classes.
 */
export class GraphObjectMapper {
    fragment<T>(model: FragmentModel, row: FragmentRow): T {
        const fields: Record<string, any> = {};
        const byGraphName = new Map([...model.graphProperties].map(([field, name]) => [name, field]));
        for (const [name, value] of Object.entries(row.props ?? {})) {
            if (name.startsWith(RESERVED_PREFIX)) {
                continue;
            }
            const field = byGraphName.get(name) ?? (model.graphProperties.has(name) ? undefined : name);
            if (field !== undefined && !model.transientFields.has(field)) {
                fields[field] = value;
            }
        }
        return plainToInstance(model.type, fields) as T;
    }
}
