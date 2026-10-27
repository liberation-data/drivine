# Releasing

Drivine for TypeScript, [drivine4j](https://github.com/liberation-data/drivine4j) and
[drivine-python](https://github.com/liberation-data/drivine-python) are released the same way, from a tag. Only the
publish step differs.

## The process

1. **Release PR.** A PR bumps the version (`package.json`) and the changelog, if the repo has one. It is reviewed and
   passes CI like any other PR.
2. **Tag the merge commit.** Merging the release PR is the release point. The maintainer then tags the merge commit on
   the default branch `vX.Y.Z` and pushes the tag.
3. **CI publishes.** The tag push runs `.github/workflows/release.yml`, which checks out the tag, runs the full gate,
   builds, checks, and publishes. Nothing is built from a laptop.
4. **Credentials.** Repository secrets or trusted publishing (OIDC), held in a GitHub environment named `release`.

For example, to release 3.4.0 once its release PR is merged:

```sh
git fetch origin
git checkout origin/master    # the release PR's merge commit
git tag v3.4.0
git push origin v3.4.0
```

## What release.yml does

Triggers:

-   **A push of a `v*` tag** publishes.
-   **A manual run** (`workflow_dispatch`, on the branch or tag picked in "Use workflow from") is always a dry run and
    never publishes.
-   **A pull request** that changes `release.yml`, `RELEASING.md` or the build and publish config is a dry run, so a
    change to the release machinery is tested on its PR.

Jobs:

1. **`check`** works out the version: the tag name without its `v` on a tag push, or `package.json`'s version
   otherwise. On a tag push it fails, with a message saying why, unless the tag matches
   `^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$`, its version equals `package.json`'s version, and the tagged commit is
   on the default branch.
2. **`gate`** is the repo's full CI: `ci.yml`, called as is.
3. **`build`** builds from the checked-out ref with a clean install, checks the package, runs a smoke test and
   uploads the artifacts, so a dry run leaves something to inspect.
4. **`publish`** runs only on a tag push, in the `release` environment. It publishes the files `build` made, without
   rebuilding them.
5. **`github-release`** creates the GitHub release for the tag, with generated notes.

A tag that fails `check` publishes nothing. Delete it (`git push origin :refs/tags/vX.Y.Z`), fix what the message
says, and tag again.

## Drivine for TypeScript: the publish step

`@liberation-data/drivine` is published to npm from `dist/`, which `npm run build` makes, with `package.json`, the
README and the licence copied in.

-   **`build`:** `npm ci`, `npm run build`, then `npm pack ./dist`. It checks that the package holds the entry points
    (`index.js`, `index.d.ts`, `codegen/cli.js`, `testing/` and `nest/`) and no sources or tests. The smoke test
    installs the tarball into an empty project, loads the package and runs `drivine --help`. Then
    `npm publish ./dist --dry-run`. npm refuses even a dry run of a version it already has, so a dry run on a released
    version publishes a copy under a throwaway version `X.Y.Z-dryrun.<run id>` instead. The artifacts are `dist`, the
    directory that is published, and `npm-package`, the tarball with its file list.
-   **`publish`:** `npm publish ./dist --provenance --access public`, with npm 11.5.1 or later. A prerelease
    (`vX.Y.Z-rc.1`) is published under the `next` dist-tag, so `latest` stays on the last release.

## Secrets and settings

The maintainer sets these up once:

-   **A `release` environment** (Settings → Environments). It can carry required reviewers and a deployment tag rule
    (`v*`).
-   **npm trusted publishing:** on npmjs.com, `@liberation-data/drivine` → Settings → Trusted publishing, add a GitHub
    Actions publisher with organization `liberation-data`, repository `drivine`, workflow `release.yml` and environment
    `release`. No secret is needed then. Once a release has gone out this way, the package's publishing access can be
    set to disallow tokens.
-   **Or an `NPM_TOKEN` secret** in the `release` environment: an npm granular access token that can publish
    `@liberation-data/drivine`. It is used only when it is set.
