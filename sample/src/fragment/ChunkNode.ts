import { GraphProperty, NodeFragment, NodeId } from '@liberation-data/drivine';

/** A field stored under another name: queries over containerSectionId read container_section_id. */
@NodeFragment({ labels: ['ContentElement', 'Chunk'] })
export class ChunkNode {
    @NodeId() id: string;
    text: string;
    @GraphProperty('container_section_id') containerSectionId?: string;
}
