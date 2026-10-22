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

    private constructor(
        readonly index: string,
        readonly found: string,
        readonly stamp: string
    ) {}
}
