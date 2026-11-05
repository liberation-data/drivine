/**
 * Each docs page's markdown, beside the page: /jvm/testing/ is also /jvm/testing.md. It is the page's own text, the
 * title as its `#` heading and the body as the libraries' docs/ have it, without the site's sidebar, header or footer,
 * for readers that want the docs as text, such as Embabel Guide's search, which keeps the page's URL for its links.
 * Each heading of the body carries the id it has on the page, `## Testing {#testing}`, so a reader can link to it.
 * Written at build time, so GitHub Pages serves each as a file.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, render, type CollectionEntry } from 'astro:content';
import type { MarkdownHeading } from 'astro';

export const getStaticPaths = (async () => {
    const docs = await getCollection('docs', (doc) => doc.body !== undefined);
    return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
}) satisfies GetStaticPaths;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * The body with each ATX heading outside code given the id of the page's heading at its place. The page's headings are
 * the body's, in order; should they not line up (a heading form this doesn't read), the body is left as it is.
 */
export function withHeadingIds(body: string, headings: MarkdownHeading[]): string {
    const lines = body.split('\n');
    let fence: string | undefined;
    let next = 0;
    let aligned = true;
    const marked = lines.map((line) => {
        const opening = FENCE.exec(line)?.[1];
        if (fence) {
            if (opening && opening[0] === fence[0] && opening.length >= fence.length) fence = undefined;
            return line;
        }
        if (opening) {
            fence = opening;
            return line;
        }
        const heading = HEADING.exec(line);
        if (!heading) return line;
        const page = headings[next++];
        if (page?.depth !== heading[1].length) aligned = false;
        return page ? `${heading[1]} ${heading[2]} {#${page.slug}}` : line;
    });
    return aligned && next === headings.length ? marked.join('\n') : body;
}

export const GET: APIRoute<{ doc: CollectionEntry<'docs'> }> = async ({ props: { doc } }) => {
    const { headings } = await render(doc);
    return new Response(`# ${doc.data.title}\n\n${withHeadingIds(doc.body!.trim(), headings)}\n`, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    });
};
