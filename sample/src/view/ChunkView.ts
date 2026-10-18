import { GraphView, Root } from '@liberation-data/drivine';
import { ChunkNode } from '../fragment/ChunkNode';

@GraphView()
export class ChunkView {
    @Root() chunk: ChunkNode;
}
