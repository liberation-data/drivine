/**
 * Whether CI (ci.yml) has already passed on the git tree a release is about to build, so that release.yml can skip its
 * gate, the full CI run again. See RELEASING.md.
 *
 *     node scripts/ci-trust.js <owner/repo> <tree> <commit> [<pull request head>]
 *
 * <tree> is `git rev-parse HEAD^{tree}` of <commit>, the commit release.yml checked out. On a pull request, <commit>
 * is its merge ref and the head is the pull request's head commit, which is what ci.yml's runs for it name. It asks
 * the GitHub API with `gh api`, reading only, and decides one of:
 *
 * - trust: a ci.yml run on this tree passed. It writes `trusted=true` to $GITHUB_OUTPUT and the gate is skipped.
 * - gate: none did, so the gate runs the full CI as before. `trusted=false`.
 * - fail: a run on this tree that it waited for failed or was cancelled. It exits 1, naming the run.
 *
 * Either way it says what it decided, and why, in $GITHUB_STEP_SUMMARY, linking the run it trusted or waited for.
 *
 * Trees are compared, not commits: a squash merge of a pull request that is up to date with master has the same tree
 * as the pull request's merge ref, which its pull_request run tested. A run counts when:
 *
 * - it is a ci.yml run in this repository, from a push or a pull request. The nightly (schedule) runs without the
 *   FalkorDB pin, and a workflow_call run is some other workflow's, so neither counts;
 * - its own commit, head_commit, which GitHub reports and nothing in the run can change, has this tree. A push run
 *   tested that commit, so that is all it needs;
 * - a pull_request run tested its merge ref instead, which is the same tree only when the pull request was up to date
 *   with its base. ci.yml's first job records the tree it checked out as an artifact named `ci-tree-<tree>`, and a
 *   pull_request run counts only when it recorded this tree, besides its head commit having it;
 * - it passed: concluded success, with every job of its latest attempt concluded success. A job skipped by a
 *   condition would leave part of the tree untested and the run still green, so a skipped job means it doesn't count.
 *
 * Why a record a run makes of itself can be believed: a pull_request run runs the ci.yml of its merge ref, which a
 * fork could change, and its jobs run the fork's code. But a run counts only when its head commit has this tree, so
 * the head's ci.yml and code are byte for byte the ones being released, and its merge ref holds nothing else but
 * what master had, which is trusted. When it then records this tree, the ci.yml it ran is the one being released,
 * unchanged, with every job in it. A fork's own ci.yml can upload `ci-tree-<anything>`, but on a head commit of
 * another tree, so it is never looked at.
 *
 * A run on this tree that is still going, as ci.yml's push run on a merge commit is when this starts beside it, is
 * waited for, up to CI_TRUST_WAIT_MINUTES (60), polling every CI_TRUST_POLL_SECONDS (30). If it passes the gate is
 * skipped, and if it fails or is cancelled the release fails, linking it. A wait that runs out runs the gate. So does
 * an API call that fails: not trusting a run is always safe, as the gate is what ran before.
 *
 * It reads Node alone, so it runs before `npm ci`.
 */
const CI = '.github/workflows/ci.yml';
const EVENTS = ['push', 'pull_request'];
const RECORD = 'ci-tree-';

/** `gh api <path>`, parsed. The token is the workflow's (GH_TOKEN), or gh's own login when run by hand. */
function gh(path) {
    const { execFileSync } = require('child_process');
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

/**
 * The ci.yml runs that might be on this tree: those on the commit or the pull request head given (a push run on the
 * commit has its tree; a run there that has only just started has recorded nothing yet), and those whose record says
 * this tree (the pull request's run, when a squash merge is released). Each comes with the trees it recorded, which
 * are asked for only on a pull_request run whose head commit has this tree, the only runs whose record is read.
 */
async function gather(api, repo, tree, shas) {
    const runs = new Map();
    for (const sha of new Set(shas)) {
        const found = await api(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=30`);
        for (const run of found.workflow_runs) runs.set(run.id, run);
    }
    const records = await api(`repos/${repo}/actions/artifacts?name=${RECORD}${tree}&per_page=100`);
    for (const artifact of records.artifacts) {
        const id = artifact.workflow_run?.id;
        if (id !== undefined && !runs.has(id)) runs.set(id, await api(`repos/${repo}/actions/runs/${id}`));
    }
    const gathered = [];
    for (const run of [...runs.values()].sort((a, b) => b.id - a.id)) {
        let trees = [];
        if (run.event === 'pull_request' && run.head_commit?.tree_id === tree) {
            const artifacts = await api(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`);
            trees = artifacts.artifacts
                .filter((a) => a.name.startsWith(RECORD))
                .map((a) => a.name.slice(RECORD.length));
        }
        gathered.push({ run, trees });
    }
    return gathered;
}

/**
 * What one run says about this tree: `passed`, `failed` or `running` when it is a run on this tree; `maybe` when it is
 * a pull_request run whose head has this tree and which hasn't recorded its merge ref's tree yet; `ignored`, with the
 * reason, when it doesn't count.
 */
function classify({ run, trees }, tree) {
    const path = (run.path ?? '').split('@')[0];
    const sha = (run.head_sha ?? '').slice(0, 7);
    if (path !== CI) return { state: 'ignored', reason: `it is a run of ${path || 'another workflow'}, not ${CI}` };
    if (!EVENTS.includes(run.event)) {
        return { state: 'ignored', reason: `it ran on ${run.event}, and only push and pull_request runs count` };
    }
    if (run.head_commit?.tree_id !== tree) return { state: 'ignored', reason: `its commit ${sha} is another tree` };
    const done = run.status === 'completed';
    if (run.event === 'pull_request' && !trees.includes(tree)) {
        if (trees.length) {
            return { state: 'ignored', reason: `it tested its merge ref, tree ${trees[0]}, as its base had moved on` };
        }
        if (!done) return { state: 'maybe', reason: 'it has not yet recorded the tree of the merge ref it tests' };
        return {
            state: 'ignored',
            reason: "it recorded no tree: it ran before ci.yml recorded trees, or its job 'record the tree' failed"
        };
    }
    if (!done) return { state: 'running', reason: `it is ${run.status}` };
    if (run.conclusion === 'success') return { state: 'passed', reason: 'it passed' };
    return { state: 'failed', reason: `it concluded ${run.conclusion}` };
}

/** The jobs of a run's latest attempt that didn't conclude success, as `name (conclusion)`. None means it passed. */
async function unpassedJobs(api, repo, run) {
    const { jobs } = await api(`repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    if (!jobs.length) return ['no jobs at all'];
    return jobs.filter((job) => job.conclusion !== 'success').map((job) => `${job.name} (${job.conclusion})`);
}

const link = (run) => `[${run.event} run ${run.id}](${run.html_url}) on ${(run.head_sha ?? '').slice(0, 7)}`;

/**
 * Decides, waiting while a run on this tree is going. Returns `{ decision, run?, reason, looked }`, where looked is
 * each run it considered and why it did or didn't count.
 */
async function assess({ api, repo, tree, shas, waitSeconds = 3600, pollSeconds = 30, now, sleep, log = () => {} }) {
    const deadline = now() + waitSeconds * 1000;
    const waited = new Set();
    for (;;) {
        const looked = (await gather(api, repo, tree, shas)).map((g) => ({ run: g.run, ...classify(g, tree) }));
        for (const entry of looked.filter((e) => e.state === 'passed')) {
            const unpassed = await unpassedJobs(api, repo, entry.run);
            if (!unpassed.length) return { decision: 'trust', run: entry.run, reason: 'it passed', looked };
            Object.assign(entry, { state: 'ignored', reason: `not every job passed: ${unpassed.join(', ')}` });
        }
        const failed = looked.find((e) => e.state === 'failed' && waited.has(e.run.id));
        if (failed) return { decision: 'fail', run: failed.run, reason: failed.reason, looked };
        const going = looked.filter((e) => e.state === 'running' || e.state === 'maybe');
        if (!going.length) {
            const why = looked.length ? 'no run on this tree passed' : 'no ci.yml run was found on this tree';
            return { decision: 'gate', reason: why, looked };
        }
        if (now() >= deadline) {
            const minutes = Math.round(waitSeconds / 60);
            return { decision: 'gate', reason: `it waited ${minutes} minutes and a run was still going`, looked };
        }
        for (const entry of going) {
            if (entry.state === 'running') waited.add(entry.run.id);
            log(`Waiting for ${entry.run.html_url}: ${entry.reason}.`);
        }
        await sleep(pollSeconds * 1000);
    }
}

/** The step summary: the decision, the run it rests on, and each run looked at with why it did or didn't count. */
function summary({ decision, run, reason, looked = [] }, tree) {
    const lines = ['### CI gate', ''];
    if (decision === 'trust') {
        lines.push(`Skipped: CI already passed on this tree (${tree}), in ${link(run)}.`);
    } else if (decision === 'fail') {
        lines.push(`Failed: ${link(run)}, on this tree (${tree}), ${reason.replace(/^it /, '')}. Nothing is released.`);
    } else {
        lines.push(`The gate runs the full CI on this tree (${tree}): ${reason}.`);
    }
    const others = looked.filter((entry) => entry.run !== run);
    if (others.length) {
        lines.push('', 'Runs looked at:', '');
        for (const entry of others) lines.push(`- ${link(entry.run)}: ${entry.reason}.`);
    }
    return lines.join('\n') + '\n';
}

async function main(args) {
    if (args.length < 3 || args.length > 4) {
        console.error('Usage: node scripts/ci-trust.js <owner/repo> <tree> <commit> [<pull request head>]');
        return 2;
    }
    const [repo, tree, ...shas] = args;
    // They go into the API's paths, so each must be what it says: a repository's name, and git object names.
    const objects = [tree, ...shas.filter(Boolean)];
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !objects.every((name) => /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(name))) {
        console.error(`Not a repository, a tree and commits: ${args.join(' ')}`);
        return 2;
    }
    const fs = require('fs');
    const env = process.env;
    let result;
    try {
        result = await assess({
            api: async (path) => gh(path),
            repo,
            tree,
            shas: shas.filter(Boolean),
            waitSeconds: Number(env.CI_TRUST_WAIT_MINUTES ?? 60) * 60,
            pollSeconds: Number(env.CI_TRUST_POLL_SECONDS ?? 30),
            now: Date.now,
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            log: console.log
        });
    } catch (error) {
        result = { decision: 'gate', reason: `the GitHub API couldn't be asked (${error.message.trim()})` };
    }
    const text = summary(result, tree);
    console.log(text);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, text);
    if (env.GITHUB_OUTPUT) {
        const url = result.decision === 'gate' ? '' : result.run.html_url;
        fs.appendFileSync(env.GITHUB_OUTPUT, `trusted=${result.decision === 'trust'}\nrun=${url}\n`);
    }
    if (result.decision === 'fail') {
        console.log(`::error::CI failed on this tree, in ${result.run.html_url}: ${result.reason}.`);
        return 1;
    }
    return 0;
}

module.exports = { assess, classify, summary };

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => (process.exitCode = code));
}
