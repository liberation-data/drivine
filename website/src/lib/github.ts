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
 * Where to get Drivine Studio, for the panels that ask the reader to try it. There are no published downloads yet, so it
 * is the README's steps to build the app on the machine that runs it. When signed downloads ship, point it at their page
 * and change the label: every panel follows.
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
