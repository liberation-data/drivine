// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Written by scripts/import-readmes.mjs, which `npm run dev` and `npm run build` run first.
const sidebar = JSON.parse(readFileSync(new URL('./src/generated/sidebar.json', import.meta.url), 'utf8'));

/**
 * On the dev server, the playground's bundle (public/playground) served as it is, as the built site serves it. The page
 * imports engine.mjs itself, and Vite's dev server refuses a module from public/ ("should not be imported from source
 * code"), with a 403 for `engine.mjs?import`. Its middleware is added before Vite's own, so the request never reaches it.
 */
const playgroundOnDevServer = {
    name: 'drivine-playground-on-dev-server',
    configureServer(server) {
        const dir = fileURLToPath(new URL('./public/playground/', import.meta.url));
        const types = { '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
        server.middlewares.use('/playground/', (req, res, next) => {
            const file = join(dir, basename((req.url ?? '').split('?')[0]));
            const type = types[file.slice(file.lastIndexOf('.'))];
            if (!type || !existsSync(file)) return next();
            res.setHeader('Content-Type', type);
            createReadStream(file).pipe(res);
        });
    }
};

// Served by GitHub Pages at drivine.org; liberation-data.github.io/drivine redirects there.
export default defineConfig({
    site: 'https://drivine.org',
    vite: { plugins: [playgroundOnDevServer] },
    integrations: [
        starlight({
            title: 'Drivine',
            description: 'Graph database client for TypeScript, Python and the JVM.',
            logo: { light: './src/assets/cow-black.png', dark: './src/assets/cow-white.png' },
            // The SVG icon turns white on a dark browser theme; Safari doesn't take SVG tab icons and keeps the .ico.
            favicon: '/favicon.svg',
            // The header's GitHub link follows the open docs: Drivine's repository, drivine-python's, or drivine4j's.
            // Each docs page's title has Share beside it.
            components: { SocialIcons: './src/components/SocialIcons.astro', PageTitle: './src/components/PageTitle.astro' },
            // A shared docs page shows the explainer's title card, with the page's own title and the site's description (the
            // generated docs pages have none of their own).
            head: [
                { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
                { tag: 'meta', attrs: { property: 'og:image', content: 'https://drivine.org/og-card.jpg' } },
                { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
                { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
                { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } }
            ],
            // The fonts are served from the site itself (Fontsource), not from Google, and only their Latin subset: the
            // full stylesheets declare every subset, which grows the CSS a first paint waits on.
            customCss: [
                '@fontsource/ubuntu/latin-400.css',
                '@fontsource/ubuntu/latin-500.css',
                '@fontsource/ubuntu/latin-700.css',
                '@fontsource/jetbrains-mono/latin-400.css',
                '@fontsource/jetbrains-mono/latin-500.css',
                './src/styles/custom.css'
            ],
            // drivine4j's docs mark Groovy build scripts as gradle.
            expressiveCode: { shiki: { langAlias: { gradle: 'groovy' } } },
            plugins: [
                // One sidebar per library, each in its docs' order.
                starlightSidebarTopics([
                    { label: 'TypeScript', link: '/ts/', items: sidebar.ts },
                    { label: 'Python', link: '/py/', items: sidebar.py },
                    { label: 'Kotlin & Java', link: '/jvm/', items: sidebar.jvm }
                ], {
                    // The playground is for every library's readers, so it sits in none of their sidebars, and shows none
                    // (hasSidebar in src/pages/playground.astro).
                    exclude: ['/playground']
                })
            ]
        })
    ]
});
