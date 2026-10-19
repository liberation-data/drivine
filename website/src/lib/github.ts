/**
 * The two libraries' repositories, and their stars as GitHub counts them when the site is built: the daily build keeps
 * the counts fresh, and a visitor's browser never calls GitHub. A count that can't be fetched is left out.
 */
export const REPOS = {
    ts: { name: 'Drivine', language: 'TypeScript', repo: 'liberation-data/drivine' },
    jvm: { name: 'drivine4j', language: 'Kotlin & Java', repo: 'liberation-data/drivine4j' }
} as const;

export type Topic = keyof typeof REPOS;

export const repoUrl = (topic: Topic): string => `https://github.com/${REPOS[topic].repo}`;

const counts = new Map<string, Promise<number | undefined>>();

/** The repository's star count, fetched once per build. */
export function stars(topic: Topic): Promise<number | undefined> {
    const { repo } = REPOS[topic];
    if (!counts.has(repo)) {
        const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
        counts.set(
            repo,
            fetch(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(10_000) })
                .then(async (response) => (response.ok ? ((await response.json()).stargazers_count as number) : undefined))
                .catch(() => undefined)
        );
    }
    return counts.get(repo)!;
}

/** 174, or 1.2k. */
export const formatStars = (count: number): string =>
    count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
