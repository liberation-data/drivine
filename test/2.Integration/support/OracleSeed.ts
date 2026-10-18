import { PersistenceManager, QuerySpecification } from '@liberation-data/drivine';

/**
 * Writes a graph into Oracle's tables directly, for reads to be tested before writes are: nodes by labels and
 * properties, relationships between nodes found by a key property among those carrying `scope`.
 */
export class OracleSeed {
    constructor(
        private readonly pm: PersistenceManager,
        private readonly scope: string,
        private readonly key: string = 'id'
    ) {}

    async clear(): Promise<void> {
        await this.pm.execute(
            new QuerySpecification(`DELETE FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "${this.scope}")')`)
        );
    }

    async node(labels: string[], props: Record<string, any>, stamp?: string): Promise<void> {
        await this.pm.execute(
            new QuerySpecification(
                'INSERT INTO drivine_node (labels, props, stamp) VALUES (JSON($labels), JSON($props), $stamp)'
            ).bind({ labels: [this.scope, ...labels], props, stamp: stamp ?? null })
        );
    }

    async edge(from: string, type: string, to: string, props: Record<string, any> = {}): Promise<void> {
        const at = (alias: string): string =>
            `JSON_EXISTS(${alias}.labels, '$?(@ == "${this.scope}")') AND JSON_VALUE(${alias}.props, '$.${this.key}') = $${alias}`;
        await this.pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_edge (src, dst, type, props) SELECT a.nid, b.nid, $type, JSON($props) ` +
                    `FROM drivine_node a, drivine_node b WHERE ${at('a')} AND ${at('b')}`
            ).bind({ a: from, b: to, type, props })
        );
    }
}
