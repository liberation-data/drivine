import { DrivineError } from '@/DrivineError';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';
import { parseExactIntegers } from '@/utils/ExactIntegers';

/**
 * A column of a statement's rows, its JSON text as the store gave it, read as the value it holds in the store layout
 * (drivine-cypher-spec#161): each temporal value's tag (`{"$t": "date", "v": "2024-01-01", "s": …}`) read as its text,
 * and each map's keys unescaped (`$$k` read as `$k`), at any depth, as the shared module reads it (its `read` request,
 * drivine4j's `ValueLayout.read`), so the three libraries read a row alike. `host.yaml`'s reads pin it. Each whole number
 * past 2^53 is a `bigint` of its digits (see parseExactIntegers).
 *
 * A text that holds neither `"$` nor `\u0024` (a dollar escaped) has no tag and no key that begins with `$` in it, and is
 * read as it is: the module is asked only of a column it has something to decide of, as a call of it costs some twenty
 * times a parse. The test is conservative: a text that holds either goes to the module, so a match that is neither a tag
 * nor a key (a text value `"$5"`) costs a call, never a wrong value. The module's ValueLayoutTest pins that every tag and
 * escaped key it writes holds `"$`, and that its read changes no text that holds neither.
 *
 * @param parse how a column with nothing of the layout in it is read: as JSON, keeping its whole numbers
 */
export function readLayout(text: string, parse: (text: string) => any = parseExactIntegers): any {
    if (!text.includes('"$') && !text.includes('\\u0024')) {
        return parse(text);
    }
    const answer = parseExactIntegers(cypherCompilerModule().compile(JSON.stringify({ read: text, typed: false })));
    if (answer && typeof answer === 'object' && 'error' in answer) {
        throw new DrivineError(`A row's value can't be read in the store layout: ${answer.error}`);
    }
    return answer.value;
}
