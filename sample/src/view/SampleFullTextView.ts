import { GraphView, Root } from '@liberation-data/drivine';
import { SampleArticleNode } from '../fragment/SampleArticleNode';

@GraphView()
export class SampleFullTextView {
    @Root() article: SampleArticleNode;
}
