import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/ci-trust.js');
// The script is plain JavaScript, so it runs before `npm ci`; its functions are typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { assess, classify, summary }: Record<string, any> = require(SCRIPT);

const REPO = 'liberation-data/drivine';
const TREE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const SHA = 'c'.repeat(40);
const HEAD = 'd'.repeat(40);

interface Run {
    id: number;
    event: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    head_commit: { id: string; tree_id: string };
    path: string;
    html_url: string;
}

/** A ci.yml run as the API gives it: by default a push run on SHA, of TREE, that passed. */
function run(id: number, fields: Partial<Omit<Run, 'head_commit'>> & { tree?: string } = {}): Run {
    const { tree = TREE, ...rest }: typeof fields = fields;
    const head = rest.head_sha ?? SHA;
    return {
        id,
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        head_sha: head,
        head_commit: { id: head, tree_id: tree },
        path: '.github/workflows/ci.yml',
        html_url: `https://github.com/${REPO}/actions/runs/${id}`,
        ...rest
    };
}

const passedJobs = { jobs: ['record the tree', 'cypher-spec', 'build', 'test (Oracle)'].map(job('success')) };
function job(conclusion: string | null) {
    return (name: string) => ({ name, conclusion });
}

/**
 * The GitHub API, faked: each path gives its answer, or a list of answers, one for each poll in turn and the last
 * from then on. A path not given fails the test, as the script asked for something unexpected.
 */
class Api {
    readonly asked: string[] = [];
    private polls = 0;

    constructor(private readonly answers: Record<string, unknown>) {}

    readonly get = async (p: string): Promise<unknown> => {
        this.asked.push(p);
        if (!(p in this.answers)) {
            throw new Error(`Not faked: ${p}`);
        }
        const answer = await this.answers[p];
        return Array.isArray(answer) ? answer[Math.min(this.polls, answer.length - 1)] : answer;
    };

    poll() {
        this.polls++;
    }
}

const runsOn = (sha: string) => `repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=30`;
const records = `repos/${REPO}/actions/artifacts?name=ci-tree-${TREE}&per_page=100`;
const runPath = (id: number) => `repos/${REPO}/actions/runs/${id}`;
const artifactsOf = (id: number) => `repos/${REPO}/actions/runs/${id}/artifacts?per_page=100`;
const jobsOf = (id: number) => `repos/${REPO}/actions/runs/${id}/jobs?filter=latest&per_page=100`;
const recorded = (...trees: string[]) => ({ artifacts: trees.map((tree) => ({ name: `ci-tree-${tree}` })) });
const recordOn = (...ids: number[]) => ({
    artifacts: ids.map((id) => ({ name: `ci-tree-${TREE}`, workflow_run: { id } }))
});

/** Runs assess against the fake API, on a fake clock that each poll's wait moves on. */
async function decide(answers: Record<string, unknown>, shas: string[] = [SHA], waitSeconds: number = 3600) {
    const api = new Api(answers);
    let clock = 0;
    const sleeps: number[] = [];
    const result = await assess({
        api: api.get,
        repo: REPO,
        tree: TREE,
        shas,
        waitSeconds,
        pollSeconds: 30,
        now: () => clock,
        sleep: async (ms: number) => {
            sleeps.push(ms);
            clock += ms;
            api.poll();
            await Promise.resolve();
        }
    });
    return { ...result, sleeps, asked: api.asked, text: summary(result, TREE) };
}

describe('ci-trust.js', () => {
    it("trusts a push run on the release's own commit that passed, and links it", async () => {
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [run(1)] },
            [records]: recordOn(),
            [jobsOf(1)]: passedJobs
        });

        expect(result).toMatchObject({ decision: 'trust', run: { id: 1 }, sleeps: [] });
        expect(result.text).toContain(`Skipped: CI already passed on this tree (${TREE}), in [push run 1]`);
    });

    it("trusts a squash-merged pull request's run, found by the tree it recorded of its merge ref", async () => {
        const pr = run(2, { event: 'pull_request', head_sha: HEAD });
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [] },
            [records]: recordOn(2),
            [runPath(2)]: pr,
            [artifactsOf(2)]: recorded(TREE),
            [jobsOf(2)]: passedJobs
        });

        expect(result).toMatchObject({ decision: 'trust', run: { id: 2, event: 'pull_request' } });
    });

    it("looks for a pull request's runs by its head commit as well, on a dry run on the pull request", async () => {
        const result = await decide(
            {
                [runsOn(SHA)]: { workflow_runs: [] },
                [runsOn(HEAD)]: { workflow_runs: [run(3, { event: 'pull_request', head_sha: HEAD })] },
                [records]: recordOn(3),
                [artifactsOf(3)]: recorded(TREE),
                [jobsOf(3)]: passedJobs
            },
            [SHA, HEAD]
        );

        expect(result).toMatchObject({ decision: 'trust', run: { id: 3 } });
    });

    it("doesn't trust a pull request's run that tested another tree, as its base had moved on", async () => {
        const result = await decide(
            {
                [runsOn(SHA)]: { workflow_runs: [] },
                [records]: recordOn(),
                [runsOn(HEAD)]: { workflow_runs: [run(4, { event: 'pull_request', head_sha: HEAD })] },
                [artifactsOf(4)]: recorded(OTHER)
            },
            [SHA, HEAD]
        );

        expect(result.decision).toBe('gate');
        expect(result.text).toContain(`it tested its merge ref, tree ${OTHER}, as its base had moved on`);
    });

    it("doesn't believe a record on a run whose head commit is another tree, as a fork's ci.yml could make it", async () => {
        const forged = run(5, { event: 'pull_request', head_sha: HEAD, tree: OTHER });
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [] },
            [records]: recordOn(5),
            [runPath(5)]: forged
        });

        expect(result.decision).toBe('gate');
        expect(result.text).toContain('its commit ddddddd is another tree');
        expect(result.asked).not.toContain(artifactsOf(5));
        expect(result.asked).not.toContain(jobsOf(5));
    });

    it("doesn't trust a pull request's run that recorded no tree, as one before ci.yml recorded trees", async () => {
        const result = await decide(
            {
                [runsOn(SHA)]: { workflow_runs: [] },
                [runsOn(HEAD)]: { workflow_runs: [run(6, { event: 'pull_request', head_sha: HEAD })] },
                [records]: recordOn(),
                [artifactsOf(6)]: recorded()
            },
            [SHA, HEAD]
        );

        expect(result.decision).toBe('gate');
        expect(result.text).toContain('it recorded no tree');
    });

    it('counts neither the nightly, which drops the FalkorDB pin, nor a run of another workflow', async () => {
        const result = await decide({
            [runsOn(SHA)]: {
                workflow_runs: [run(7, { event: 'schedule' }), run(8, { path: '.github/workflows/release.yml' })]
            },
            [records]: recordOn()
        });

        expect(result.decision).toBe('gate');
        expect(result.text).toContain('it ran on schedule, and only push and pull_request runs count');
        expect(result.text).toContain('it is a run of .github/workflows/release.yml, not .github/workflows/ci.yml');
    });

    it("reads a workflow's path with the ref GitHub can append to it", () => {
        const entry = { run: run(9, { path: '.github/workflows/ci.yml@refs/heads/master' }), trees: [] };
        expect(classify(entry, TREE).state).toBe('passed');
    });

    it("doesn't trust a green run with a job that was skipped, which left part of the tree untested", async () => {
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [run(10)] },
            [records]: recordOn(),
            [jobsOf(10)]: { jobs: [job('success')('build'), job('skipped')('test (Oracle)')] }
        });

        expect(result.decision).toBe('gate');
        expect(result.text).toContain('not every job passed: test (Oracle) (skipped)');
    });

    it('runs the gate after a run on this tree that had already failed, as a re-run might pass', async () => {
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [run(11, { conclusion: 'failure' })] },
            [records]: recordOn()
        });

        expect(result).toMatchObject({ decision: 'gate', reason: 'no run on this tree passed', sleeps: [] });
        expect(result.text).toContain('it concluded failure');
    });

    it('runs the gate when there is no run at all, and says so', async () => {
        const result = await decide({ [runsOn(SHA)]: { workflow_runs: [] }, [records]: recordOn() });

        expect(result.decision).toBe('gate');
        expect(result.text).toContain(
            `The gate runs the full CI on this tree (${TREE}): no ci.yml run was found on this tree.`
        );
    });

    it('waits for the push run on the merge commit, started beside the release, and trusts it when it passes', async () => {
        const result = await decide({
            [runsOn(SHA)]: [
                { workflow_runs: [run(12, { status: 'queued', conclusion: null })] },
                { workflow_runs: [run(12, { status: 'in_progress', conclusion: null })] },
                { workflow_runs: [run(12)] }
            ],
            [records]: recordOn(),
            [jobsOf(12)]: passedJobs
        });

        expect(result).toMatchObject({ decision: 'trust', run: { id: 12 }, sleeps: [30000, 30000] });
    });

    it('fails the release when a run on this tree that it waited for fails, and links it', async () => {
        const result = await decide({
            [runsOn(SHA)]: [
                { workflow_runs: [run(13, { status: 'in_progress', conclusion: null })] },
                { workflow_runs: [run(13, { conclusion: 'cancelled' })] }
            ],
            [records]: recordOn()
        });

        expect(result).toMatchObject({ decision: 'fail', run: { id: 13 } });
        expect(result.text).toContain(`Failed: [push run 13](https://github.com/${REPO}/actions/runs/13)`);
        expect(result.text).toContain('concluded cancelled. Nothing is released.');
    });

    it("waits for a pull request's run to record its tree, then for it to pass", async () => {
        const going = run(14, { event: 'pull_request', head_sha: HEAD, status: 'in_progress', conclusion: null });
        const result = await decide(
            {
                [runsOn(SHA)]: { workflow_runs: [] },
                [runsOn(HEAD)]: [
                    { workflow_runs: [going] },
                    { workflow_runs: [going] },
                    { workflow_runs: [run(14, { event: 'pull_request', head_sha: HEAD })] }
                ],
                [records]: [recordOn(), recordOn(14)],
                [artifactsOf(14)]: [recorded(), recorded(TREE)],
                [jobsOf(14)]: passedJobs
            },
            [SHA, HEAD]
        );

        expect(result).toMatchObject({ decision: 'trust', run: { id: 14 }, sleeps: [30000, 30000] });
    });

    it('runs the gate when a run is still going once the wait is up', async () => {
        const result = await decide(
            {
                [runsOn(SHA)]: { workflow_runs: [run(15, { status: 'in_progress', conclusion: null })] },
                [records]: recordOn()
            },
            [SHA],
            90
        );

        expect(result).toMatchObject({ decision: 'gate', sleeps: [30000, 30000, 30000] });
        expect(result.text).toContain('it waited 2 minutes and a run was still going');
    });

    it('prefers the newest run that passed', async () => {
        const result = await decide({
            [runsOn(SHA)]: { workflow_runs: [run(16), run(17)] },
            [records]: recordOn(),
            [jobsOf(17)]: passedJobs
        });

        expect(result.run.id).toBe(17);
        expect(result.text).toContain('Runs looked at:\n\n- [push run 16]');
    });
});

describe('ci-trust.js, run as the workflow runs it', () => {
    /**
     * Runs the script with a `gh` on PATH that answers from the answers given, a list of answers being one for each
     * time it is asked in turn and the last from then on, and fails on a path it has no answer for.
     */
    function main(answers: Record<string, unknown> | undefined) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-ci-trust-'));
        const fake = path.join(dir, 'fake-gh.js');
        fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(answers ?? {}));
        fs.writeFileSync(
            fake,
            `const fs = require('fs');\n` +
                `const answers = require(${JSON.stringify(path.join(dir, 'answers.json'))});\n` +
                `const asked = ${JSON.stringify(path.join(dir, 'asked'))};\n` +
                `const p = process.argv[3];\n` +
                `if (!(p in answers)) { console.error('HTTP 502: Bad gateway (' + p + ')'); process.exit(1); }\n` +
                `const times = fs.existsSync(asked) ? fs.readFileSync(asked, 'utf8').split('\\n').filter((l) => l === p).length : 0;\n` +
                `fs.appendFileSync(asked, p + '\\n');\n` +
                `const answer = answers[p];\n` +
                `console.log(JSON.stringify(Array.isArray(answer) ? answer[Math.min(times, answer.length - 1)] : answer));\n`
        );
        fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, {
            mode: 0o755
        });
        const [output, stepSummary] = [path.join(dir, 'output'), path.join(dir, 'summary')];
        const result = spawnSync(process.execPath, [SCRIPT, REPO, TREE, SHA, ''], {
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${dir}${path.delimiter}${process.env.PATH}`,
                GITHUB_OUTPUT: output,
                GITHUB_STEP_SUMMARY: stepSummary,
                CI_TRUST_POLL_SECONDS: '0'
            }
        });
        const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
        return { status: result.status, stdout: result.stdout, output: read(output), summary: read(stepSummary) };
    }

    it('writes trusted=true and the run it trusted, and the summary', () => {
        const result = main({
            [runsOn(SHA)]: { workflow_runs: [run(18)] },
            [records]: recordOn(),
            [jobsOf(18)]: passedJobs
        });

        expect(result).toMatchObject({ status: 0, output: `trusted=true\nrun=${run(18).html_url}\n` });
        expect(result.summary).toContain('### CI gate\n\nSkipped: CI already passed on this tree');
    });

    it('fails, with an error naming the run, when a run on this tree it waited for failed', () => {
        const result = main({
            [runsOn(SHA)]: [
                { workflow_runs: [run(19, { status: 'in_progress', conclusion: null })] },
                { workflow_runs: [run(19, { conclusion: 'failure' })] }
            ],
            [records]: recordOn()
        });

        expect(result).toMatchObject({ status: 1, output: `trusted=false\nrun=${run(19).html_url}\n` });
        expect(result.stdout).toContain(`Waiting for ${run(19).html_url}: it is in_progress.`);
        expect(result.stdout).toContain(
            `::error::CI failed on this tree, in ${run(19).html_url}: it concluded failure.`
        );
        expect(result.summary).toContain('Failed: [push run 19]');
    });

    it("runs the gate when the API can't be asked, as not trusting a run is always safe", () => {
        const result = main(undefined);

        expect(result).toMatchObject({ status: 0, output: 'trusted=false\nrun=\n' });
        expect(result.summary).toContain("): the GitHub API couldn't be asked (");
    });

    it("refuses a tree or a commit that isn't a git object's name, as each goes into the API's paths", () => {
        for (const args of [
            [REPO, '../../x', SHA],
            [REPO, TREE, `${SHA}&per_page=1`],
            ['a/b/c', TREE, SHA]
        ]) {
            const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
            expect(result).toMatchObject({ status: 2, stderr: expect.stringContaining('Not a repository') });
        }
    });

    it('prints the usage when not given a repository, a tree and a commit', () => {
        const result = spawnSync(process.execPath, [SCRIPT, REPO, TREE], { encoding: 'utf8' });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Usage: node scripts/ci-trust.js <owner/repo> <tree> <commit>');
    });
});
