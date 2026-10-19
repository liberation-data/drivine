import { NodeFragment, NodeId, VectorIndex } from '@liberation-data/drivine';

/** A fragment with a vector index, which loadNearest searches. */
@NodeFragment({ labels: ['SampleDoc'] })
export class SampleDocNode {
    @NodeId() id: string;
    title: string;
    @VectorIndex({ similarity: 'COSINE' }) embedding?: number[];
}
