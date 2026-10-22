/**
 * One node of what drivine4j's write function hands back, `index/found=stamp`: the index a step gave it, what it carried
 * before the save (empty for a node the save made, `-` for one that was there without a stamp, or a patch's outcome),
 * and the stamp it carries now.
 */
export class FoundStamp {
    /** Reads an entry. An index holds no `/`, and what is found holds no `=`. */
    static of(entry: string): FoundStamp {
        const slash = entry.indexOf('/');
        const equals = entry.indexOf('=', slash + 1);
        return new FoundStamp(entry.slice(0, slash), entry.slice(slash + 1, equals), entry.slice(equals + 1));
    }

    /**
     * The entries as the manager reads a save's stamps: for each of `groups` (a stamped class), the `{id, stamp}` of
     * each of its nodes before the write and after it. A node held twice is found by its first step as it was before
     * the write, and its last says what it is now: the manager keeps one `{id, stamp}` per id.
     *
     * @param handed for each index a step was given, the group its node is of and its id
     */
    static grouped(
        entries: string[],
        groups: number,
        handed: Map<string, { group: number; id: any }>
    ): { before: { id: any; stamp: string }[]; after: { id: any; stamp: string }[] }[] {
        const related = Array.from({ length: groups }, () => ({
            before: new Map<any, string>(),
            after: new Map<any, string>()
        }));
        for (const entry of entries.map((it) => FoundStamp.of(it))) {
            const node = handed.get(entry.index)!;
            const { before, after }: { before: Map<any, string>; after: Map<any, string> } = related[node.group];
            if (!before.has(node.id)) {
                before.set(node.id, entry.found);
            }
            after.set(node.id, entry.stamp);
        }
        return related.map(({ before, after }: { before: Map<any, string>; after: Map<any, string> }) => ({
            before: [...before].map(([id, stamp]) => ({ id, stamp })),
            after: [...after].map(([id, stamp]) => ({ id, stamp }))
        }));
    }

    private constructor(
        readonly index: string,
        readonly found: string,
        readonly stamp: string
    ) {}
}
