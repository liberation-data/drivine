import { GraphView, Root } from '@liberation-data/drivine';
import { SampleDocNode } from '../fragment/SampleDocNode';

@GraphView()
export class SampleVectorView {
    @Root() doc: SampleDocNode;
}
