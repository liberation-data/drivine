/**
 * The libraries' repositories, their stars as GitHub counts them when the site is built, and the newest release train:
 * the daily build keeps them fresh, and a visitor's browser never calls GitHub. What can't be fetched is left out.
 */
export const REPOS = {
    ts: { name: 'Drivine', language: 'TypeScript', repo: 'liberation-data/drivine' },
    py: { name: 'drivine-python', language: 'Python', repo: 'liberation-data/drivine-python' },
    jvm: { name: 'drivine4j', language: 'Kotlin & Java', repo: 'liberation-data/drivine4j' }
} as const;

export type Topic = keyof typeof REPOS;

/** Drivine Studio: not a library with docs of its own, so not a topic, but in the GitHub menu beside them. */
export const STUDIO = { name: 'Drivine Studio', language: 'Desktop app', repo: 'liberation-data/drivine-studio' } as const;
export const studioUrl = `https://github.com/${STUDIO.repo}`;

/**
 * Building Drivine Studio from source: the README's steps to build the app on the machine that runs it. It is the
 * fallback when `studioRelease()` has no installer for the reader's platform — Windows has no packaged build — or when a
 * build couldn't reach GitHub for the release.
 */
export const STUDIO_GET = { url: `${studioUrl}#install-it-yourself`, label: 'Build it from source' } as const;

export const repoUrl = (topic: Topic): string => `https://github.com/${REPOS[topic].repo}`;

/** A GET of GitHub's API, with GITHUB_TOKEN if it's set, given up after 10 s. */
const github = (path: string): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return fetch(`https://api.github.com/${path}`, { headers, signal: AbortSignal.timeout(10_000) });
};

const counts = new Map<string, Promise<number | undefined>>();

/** The repository's star count, fetched once per build. */
export const stars = (topic: Topic): Promise<number | undefined> => starsOf(REPOS[topic].repo);

/** Any of the project's repositories' star count, fetched once per build. */
export function starsOf(repo: string): Promise<number | undefined> {
    if (!counts.has(repo)) {
        counts.set(
            repo,
            github(`repos/${repo}`)
                .then(async (response) => (response.ok ? ((await response.json()).stargazers_count as number) : undefined))
                .catch(() => undefined)
        );
    }
    return counts.get(repo)!;
}

/** 174, or 1.2k. */
export const formatStars = (count: number): string =>
    count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;

/**
 * A release train: the library versions that shipped together, and the Cypher spec tag they were tested against, as
 * recorded in liberation-data/drivine-release's `trains/<train>.json`.
 */
export interface Train {
    train: string;
    spec: string;
    libraries: Record<string, string>;
    released: string;
}

const RELEASE_REPO = 'liberation-data/drivine-release';

export const trainUrl = (train: string): string => `https://github.com/${RELEASE_REPO}/blob/main/trains/${train}.json`;

/** Train names are YYYY.MM or YYYY.MM.N: compared part by part as numbers, so 2026.10 is after 2026.9, and 2026.11.1 after 2026.11. */
export const compareTrains = (a: string, b: string): number => {
    const [x, y] = [a, b].map((name) => name.split('.').map(Number));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] !== y[i]) {
            return (x[i] ?? -1) - (y[i] ?? -1);
        }
    }
    return 0;
};

const TRAIN_FILE = /^\d{4}\.\d{2}(\.\d+)?\.json$/;

const githubJson = async (path: string): Promise<any> => {
    const response = await github(path);
    if (!response.ok) {
        throw new Error(`GitHub answered ${response.status} for ${path}`);
    }
    return response.json();
};

const isReleased = (manifest: any): manifest is Train =>
    typeof manifest?.train === 'string' &&
    typeof manifest.spec === 'string' &&
    typeof manifest.released === 'string' &&
    typeof manifest.libraries === 'object' &&
    manifest.libraries !== null &&
    Object.values(manifest.libraries).every((version) => typeof version === 'string');

async function fetchReleasedTrain(): Promise<Train | undefined> {
    const listing: { name: string; type: string }[] = await githubJson(`repos/${RELEASE_REPO}/contents/trains`);
    const manifests = await Promise.all(
        listing
            .filter((entry) => entry.type === 'file' && TRAIN_FILE.test(entry.name))
            .map(async (entry) => {
                const file = await githubJson(`repos/${RELEASE_REPO}/contents/trains/${entry.name}`);
                try {
                    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
                } catch {
                    return undefined; // a manifest that isn't JSON is no released train
                }
            })
    );
    return manifests.filter(isReleased).sort((a, b) => compareTrains(b.train, a.train))[0];
}

let train: Promise<Train | undefined> | undefined;

/**
 * The newest train that has been released, fetched once per build. A draft (`"released": null`) has not published, so it
 * is never the answer. If any fetch fails, or no train is released, there is none, and the page goes without it.
 */
export function releasedTrain(): Promise<Train | undefined> {
    train ??= fetchReleasedTrain().catch(() => undefined);
    return train;
}

/** One downloadable build of Drivine Studio: a short label for its button, where GitHub serves the file, and its size. */
export interface Download {
    label: string;
    url: string;
    size: string;
}

/** Drivine Studio's latest release: its version, its release page, and the per-platform installers attached to it. */
export interface StudioRelease {
    version: string;
    url: string;
    mac: { appleSilicon?: Download; intel?: Download };
    linux: Download[];
}

interface Asset {
    name: string;
    size: number;
    browser_download_url: string;
}

/** A GitHub asset's size the way a download link shows it: whole megabytes. */
const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`;

async function fetchStudioRelease(): Promise<StudioRelease | undefined> {
    // `releases/latest` is GitHub's newest published, non-prerelease, non-draft release, so a draft or a pre-release
    // build is never offered here.
    const release = await githubJson(`repos/${STUDIO.repo}/releases/latest`);
    const version = typeof release?.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : undefined;
    if (!version || typeof release.html_url !== 'string') {
        return undefined;
    }
    const assets: Asset[] = Array.isArray(release.assets) ? release.assets : [];
    const download = (match: (name: string) => boolean, label: string): Download | undefined => {
        const asset = assets.find((a) => match(a.name));
        return asset ? { label, url: asset.browser_download_url, size: megabytes(asset.size) } : undefined;
    };
    const mac = {
        appleSilicon: download((name) => name.endsWith('.dmg') && name.includes('arm64'), 'Apple Silicon'),
        intel: download((name) => name.endsWith('.dmg') && name.includes('x64'), 'Intel'),
    };
    const linux = [
        download((name) => name.endsWith('.AppImage'), 'AppImage'),
        download((name) => name.endsWith('.deb'), '.deb'),
        download((name) => name.endsWith('.tar.gz'), 'tarball'),
    ].filter((d): d is Download => d !== undefined);
    // A release with no installer for any platform is no download: the page falls back to building from source.
    if (!mac.appleSilicon && !mac.intel && linux.length === 0) {
        return undefined;
    }
    return { version, url: release.html_url, mac, linux };
}

let studio: Promise<StudioRelease | undefined> | undefined;

/**
 * Drivine Studio's latest release and the installers it attached, fetched once per build, like the stars and the train:
 * the visitor's browser never calls GitHub. If the fetch fails, or the release has no installers, there is none, and the
 * page falls back to the README's steps to build it from source.
 */
export function studioRelease(): Promise<StudioRelease | undefined> {
    studio ??= fetchStudioRelease().catch(() => undefined);
    return studio;
}
