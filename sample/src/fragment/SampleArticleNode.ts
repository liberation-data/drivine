import { FullTextIndex, NodeFragment, NodeId } from '@liberation-data/drivine';

/** A fragment with a full-text index, which loadMatching searches. */
@NodeFragment({ labels: ['SampleArticle'] })
export class SampleArticleNode {
    @NodeId() id: string;
    @FullTextIndex() body: string;
}
