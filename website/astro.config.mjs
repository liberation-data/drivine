// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { readFileSync } from 'node:fs';

// Written by scripts/import-readmes.mjs, which `npm run dev` and `npm run build` run first.
const sidebar = JSON.parse(readFileSync(new URL('./src/generated/sidebar.json', import.meta.url), 'utf8'));

// Served by GitHub Pages at drivine.org; liberation-data.github.io/drivine redirects there.
export default defineConfig({
    site: 'https://drivine.org',
    integrations: [
        starlight({
            title: 'Drivine',
            description: 'Graph database client for TypeScript and the JVM.',
            logo: { light: './src/assets/cow-black.png', dark: './src/assets/cow-white.png' },
            favicon: '/favicon.ico',
            // The header's GitHub link follows the open docs: Drivine's repository, or drivine4j's.
            components: { SocialIcons: './src/components/SocialIcons.astro' },
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
            // drivine4j's README marks Groovy build scripts as gradle.
            expressiveCode: { shiki: { langAlias: { gradle: 'groovy' } } },
            plugins: [
                // One sidebar per library, each in its README's order.
                starlightSidebarTopics([
                    { label: 'TypeScript', link: '/ts/', items: sidebar.ts },
                    { label: 'Kotlin & Java', link: '/jvm/', items: sidebar.jvm }
                ])
            ]
        })
    ]
});
