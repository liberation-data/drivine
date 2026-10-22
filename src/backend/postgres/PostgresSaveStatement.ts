import { FoundStamp } from '@/backend/postgres/FoundStamp';
import { SaveStatement } from '@/backend/SaveStatement';
import { FragmentModel } from '@/model/FragmentModel';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A save on Postgres: a call of drivine4j's write function, whose one row is the root's stamp as handed back, then
 * `index/found=stamp` for each stamped related node. It is read as the manager reads a save's result, `{found, now,
 * related}`: the root found as the stamp the object carried and now as the stamp handed back, so the manager hands back
 * that stamp; and each related node's stamp before and after, from which the manager hands back its own.
 */
export class PostgresSaveStatement extends SaveStatement {
    /**
     * @param handed for each index a related node's step was given, the stamped model it is of, by its place among
     * `stampedModels`, and its id
     */
    constructor(
        text: string,
        bindings: Record<string, any>,
        root: FragmentModel,
        rootObject: any,
        expectedStamp: string | undefined,
        stampedModels: FragmentModel[],
        private readonly handed: Map<string, { model: number; id: any }>
    ) {
        super(text, bindings, root, rootObject, expectedStamp, stampedModels);
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        return super.spec<T>(more).addPostProcessors({
            apply: (rows: any[]) => rows.map((row) => this.result(Object.values(row)[0] as string))
        });
    }

    private result(row: string): Record<string, any> {
        const [stamp, ...entries]: string[] = row.split(',');
        const related = this.stampedModels.map(() => ({
            before: new Map<any, string>(),
            after: new Map<any, string>()
        }));
        for (const entry of entries.map((it) => FoundStamp.of(it))) {
            const node = this.handed.get(entry.index)!;
            const { before, after }: { before: Map<any, string>; after: Map<any, string> } = related[node.model];
            // A node held twice was found by its first step as it was before the save; its last says what it is now.
            if (!before.has(node.id)) {
                before.set(node.id, entry.found);
            }
            after.set(node.id, entry.stamp);
        }
        return {
            found: this.expectedStamp ?? '',
            now: stamp,
            related: related.map(({ before, after }: { before: Map<any, string>; after: Map<any, string> }) => ({
                before: [...before].map(([id, it]) => ({ id, stamp: it })),
                after: [...after].map(([id, it]) => ({ id, stamp: it }))
            }))
        };
    }
}
