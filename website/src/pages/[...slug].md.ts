/**
 * Each docs page's markdown, beside the page: /jvm/testing/ is also /jvm/testing.md. It is the page's own text, the
 * title as its `#` heading and the body as the libraries' docs/ have it, without the site's sidebar, header or footer,
 * for readers that want the docs as text, such as Embabel Guide's search, which keeps the page's URL for its links.
 * Written at build time, so GitHub Pages serves each as a file.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';

export const getStaticPaths = (async () => {
    const docs = await getCollection('docs', (doc) => doc.body !== undefined);
    return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ doc: CollectionEntry<'docs'> }> = ({ props: { doc } }) =>
    new Response(`# ${doc.data.title}\n\n${doc.body!.trim()}\n`, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    });
