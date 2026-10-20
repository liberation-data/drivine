/**
 * Turns the libraries' READMEs into the site's docs, so the READMEs stay the one source. Each `##` section becomes a
 * page of its library's topic (`src/content/docs/ts/`, `src/content/docs/py/`, `src/content/docs/jvm/`), and the text
 * before the first `##`
 * its introduction. A long section becomes a group instead: its lead an overview, and each `###` a page of its own.
 * Headings move up to suit, links to the README's own anchors are pointed at the page and heading that now hold them,
 * and links to files in the repository at those files on GitHub. The sidebars, in the READMEs' order, are written to
 * `src/generated/sidebar.json` for astro.config.mjs.
 *
 * drivine-python's and drivine4j's READMEs are fetched from GitHub; DRIVINE_PYTHON_README=<path> and
 * DRIVINE4J_README=<path> read local copies instead.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const docs = join(site, 'src', 'content', 'docs');
const generated = join(site, 'src', 'generated');

const SOURCES = [
    {
        topic: 'ts',
        name: 'Drivine',
        repo: 'liberation-data/drivine',
        branch: 'master',
        read: () => readFile(join(site, '..', 'README.md'), 'utf8')
    },
    {
        topic: 'py',
        name: 'drivine-python',
        repo: 'liberation-data/drivine-python',
        branch: 'main',
        read: () => remote('DRIVINE_PYTHON_README', 'liberation-data/drivine-python', 'main')
    },
    {
        topic: 'jvm',
        name: 'drivine4j',
        repo: 'liberation-data/drivine4j',
        branch: 'main',
        read: () => remote('DRIVINE4J_README', 'liberation-data/drivine4j', 'main')
    }
];

/** A README from GitHub, or from the local copy the environment variable names. */
async function remote(variable, repo, branch) {
    if (process.env[variable]) {
        return readFile(process.env[variable], 'utf8');
    }
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/README.md`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not fetch ${url}: ${response.status}`);
    }
    return response.text();
}

/** Sections that only list the others, which the sidebar does now. */
const SKIPPED = /^(table of )?contents$/i;

/** A section longer than this many lines becomes a group, a page to each of its `###` subsections. */
const SPLIT_LINES = 300;

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** A heading's text without its markdown: what GitHub and Starlight make its anchor from, and a page's title. */
function plain(text) {
    return text
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[`*]/g, '')
        .trim();
}

/** GitHub's anchors (github-slugger): lower case, punctuation dropped, each space a hyphen, repeats numbered. */
function slugger() {
    const seen = new Map();
    return (text) => {
        const slug = plain(text)
            .toLowerCase()
            .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
            .replace(/\s/g, '-');
        const count = seen.get(slug);
        seen.set(slug, (count ?? -1) + 1);
        return count === undefined ? slug : `${slug}-${count + 1}`;
    };
}

/** A page's path under its topic, as a short, readable URL segment. */
function segment(text) {
    return plain(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-|-$/g, '');
}

/** The lines with their headings found, outside fences: [{ line, level?, text? }]. */
function scan(lines) {
    let fenced = false;
    return lines.map((line) => {
        if (FENCE.test(line)) {
            fenced = !fenced;
            return { line };
        }
        const heading = fenced ? null : HEADING.exec(line);
        return heading ? { line, level: heading[1].length, text: heading[2] } : { line };
    });
}

/** The README after its title, in `##` sections; the text before the first, the introduction, has no title. */
function sections(markdown) {
    const found = [];
    let current = null;
    for (const entry of scan(markdown.split('\n'))) {
        if (entry.level === 1) {
            current = { title: null, entries: [] };
            found.push(current);
        } else if (entry.level === 2) {
            current = { title: entry.text, entries: [] };
            found.push(current);
        } else if (current) {
            current.entries.push(entry);
        }
    }
    return found;
}

/**
 * Applies fn to a line with its inline code set aside, so nothing in code is rewritten, while a link whose text is
 * code (`` [`@NodeStamp`](#nodestamp) ``) is still seen whole.
 */
function outsideCode(line, fn) {
    const code = [];
    const held = line.replace(/`[^`]*`/g, (it) => `\u0000${code.push(it) - 1}\u0000`);
    return fn(held).replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)]);
}

async function importReadme(source) {
    const readmeAnchors = slugger();
    const pages = [];
    const sidebar = [];
    // Where each of the README's anchors is now: the page's path, and the heading's id on it (none for its title).
    const anchors = new Map();

    /** A page of the entries, its headings raised by `raise` levels, each anchor recorded against it. */
    const page = (path, title, entries, raise, extra = {}) => {
        const pageAnchors = slugger();
        const lines = entries.map((entry) => {
            if (!entry.level) {
                return entry.line;
            }
            anchors.set(readmeAnchors(entry.text), { path, id: pageAnchors(entry.text) });
            return `${'#'.repeat(Math.max(2, entry.level - raise))} ${entry.text}`;
        });
        pages.push({ path, title, lines, ...extra });
    };

    for (const section of sections(await source.read())) {
        if (section.title === null) {
            page('', source.name, section.entries, 1, { label: 'Introduction' });
            sidebar.push({ label: 'Introduction', slug: source.topic });
            continue;
        }
        const anchor = readmeAnchors(section.title);
        if (SKIPPED.test(plain(section.title))) {
            continue;
        }
        const path = segment(section.title);
        const title = plain(section.title);
        const splits = section.entries.flatMap((entry, i) => (entry.level === 3 ? [i] : []));
        if (section.entries.length <= SPLIT_LINES || splits.length < 2) {
            anchors.set(anchor, { path, id: null });
            page(path, title, section.entries, 1);
            sidebar.push({ slug: `${source.topic}/${path}` });
            continue;
        }
        const group = { label: title, collapsed: false, items: [] };
        sidebar.push(group);
        const lead = section.entries.slice(0, splits[0]);
        if (lead.some((entry) => entry.line.trim() !== '')) {
            anchors.set(anchor, { path, id: null });
            page(path, title, lead, 1, { label: 'Overview' });
            group.items.push({ label: 'Overview', slug: `${source.topic}/${path}` });
        }
        splits.forEach((start, n) => {
            const heading = section.entries[start];
            const sub = `${path}/${segment(heading.text)}`;
            if (!anchors.has(anchor)) {
                anchors.set(anchor, { path: sub, id: null });
            }
            anchors.set(readmeAnchors(heading.text), { path: sub, id: null });
            page(sub, plain(heading.text), section.entries.slice(start + 1, splits[n + 1]), 2);
            group.items.push({ slug: `${source.topic}/${sub}` });
        });
    }

    const blob = (path) => `https://github.com/${source.repo}/blob/${source.branch}/${path}`;
    const raw = (path) => `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${path}`;
    const target = (from, link, image) => {
        if (link.startsWith('#')) {
            const at = anchors.get(link.slice(1));
            if (!at) {
                return link;
            }
            const hash = at.id ? `#${at.id}` : '';
            if (at.path === from) {
                return hash || '#';
            }
            const relative = posix.relative(`/${from}`, `/${at.path}`);
            return `${relative.startsWith('.') ? '' : './'}${relative}/${hash}`.replace(/^\.\/\/$/, './');
        }
        if (/^([a-z]+:|\/\/|\/)/i.test(link)) {
            return link;
        }
        return image ? raw(link) : blob(link);
    };

    for (const [n, { path, title, label, lines }] of pages.entries()) {
        const body = scan(lines)
            .map((entry, i, all) => {
                const inFence = all.slice(0, i + 1).filter((it) => FENCE.test(it.line)).length % 2 === 1;
                if (inFence || FENCE.test(entry.line)) {
                    return entry.line;
                }
                return outsideCode(entry.line, (part) =>
                    part
                        .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g, (_, bang, text, link, rest) => {
                            return `${bang}[${text}](${target(path, link, bang === '!')}${rest})`;
                        })
                        .replace(/(href|src)="([^"]+)"/g, (_, attr, link) => {
                            return `${attr}="${target(path, link, attr === 'src')}"`;
                        })
                );
            })
            .join('\n')
            .trim();
        const frontmatter = [
            '---',
            `title: ${JSON.stringify(title)}`,
            ...(label ? ['sidebar:', `  label: ${JSON.stringify(label)}`] : []),
            // Previous and next stay within the library: the other's pages follow in Starlight's list.
            ...(n === 0 ? ['prev: false'] : []),
            ...(n === pages.length - 1 ? ['next: false'] : []),
            `editUrl: ${JSON.stringify(`https://github.com/${source.repo}/edit/${source.branch}/README.md`)}`,
            '---'
        ].join('\n');
        const file = join(docs, source.topic, path === '' ? 'index.md' : `${path}.md`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, `${frontmatter}\n\n${body}\n`);
    }
    return { pages: pages.length, sidebar };
}

await rm(docs, { recursive: true, force: true });
const sidebars = {};
for (const source of SOURCES) {
    const { pages, sidebar } = await importReadme(source);
    sidebars[source.topic] = sidebar;
    process.stdout.write(`${source.repo}: ${pages} pages\n`);
}
await mkdir(generated, { recursive: true });
await writeFile(join(generated, 'sidebar.json'), `${JSON.stringify(sidebars, null, 2)}\n`);
