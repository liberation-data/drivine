import { GraphProperty, NodeFragment, NodeId, PropertyBag } from '@liberation-data/drivine';

/** A promoted field beside a free-form bag: `sectionId` is stored as section_id, bag entries under `metadata.`. */
@NodeFragment({ labels: ['SampleResolver'] })
export class SampleResolverNode {
    @NodeId() id: string;
    @GraphProperty('section_id') sectionId?: string;
    @PropertyBag({ prefix: 'metadata' }) metadata: Record<string, any> = {};
}
