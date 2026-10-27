# Releasing

drivine, drivine4j and drivine-python are released the same way, by CI. Each repository has this file, differing
only in its publish step. Each library keeps its own version. A release train, named by date ("Drivine 2026.11"),
records which versions of the three, and which Cypher spec tag, ship together. The train controller,
[liberation-data/drivine-release](https://github.com/liberation-data/drivine-release), runs the steps below in all
three repositories at once.

## The process

1. **Prepare release.** In the Actions tab, run "Prepare release" (`.github/workflows/prepare-release.yml`) with a
   `bump` of `patch`, `minor`, `major` or `prerelease`, or an exact `version`. It bumps the version
   (build.gradle / package.json / pyproject.toml) on a branch `release/vX.Y.Z`, and opens a PR "Release vX.Y.Z" that
   lists the commits since the last tag.
2. **Review and merge the release PR.** It passes CI like any other PR. Merging it is the release point.
3. **CI publishes.** The merge, a push to the default branch that changes the version file, runs
   `.github/workflows/release.yml`. It runs the full gate, builds, checks, publishes, and creates the GitHub release
   with its tag `vX.Y.Z` on the merge commit. Nothing is built from a laptop.
4. **Credentials.** Repository secrets or trusted publishing (OIDC), held in a GitHub environment named `release`.
   Give that environment required reviewers: now that merging publishes, their approval of the run is the human
   checkpoint before anything goes out.

A PR that "Prepare release" opens with the default `GITHUB_TOKEN` starts no workflows, so CI doesn't run on it by
itself. Push an empty commit to its branch, or close and reopen it, to start CI. With a `RELEASE_PR_TOKEN` secret set
(below), the PR is opened with that token and CI runs. "Prepare release" fails, saying why, when the version is
already tagged, isn't later than the last release, or its `release/vX.Y.Z` branch already exists.

**Tagging by hand is the fallback.** A pushed tag `vX.Y.Z` still releases the tagged commit. Use it when a
merge didn't release, for example when the bump was merged before the release machinery was in place:

```
git switch master && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

## What release.yml does

- **`check`** works out the version: the tag without its `v` on a tag push, or the build file's version otherwise.
  - On a push to the default branch that changes the version file, it releases when the version is new: no tag
    `vX.Y.Z` exists yet, and the version is later than every `vX.Y.Z` tag (a prerelease `vX.Y.Z-rc.N` sorts below
    `vX.Y.Z`). Otherwise the run releases nothing, and its notice says why: a change to the file that isn't a version
    bump, for example.
  - On a tag push it fails, saying why, unless the tag is `vX.Y.Z` (or `vX.Y.Z-suffix`), its version equals the build
    file's, and the tagged commit is on the default branch.
- **`gate`** runs the repository's full CI, `ci.yml`, unchanged. A push to the default branch that releases nothing
  skips it, as `ci.yml` runs on that push anyway.
- **`build`** builds the release artifacts from the checked-out ref, checks them, runs a smoke test, and uploads them
  as the run's artifact.
- **`publish`** runs on a release alone, in the `release` environment. It publishes the exact files `build` made.
- **`github-release`** then creates the GitHub release, with generated notes, marked a prerelease when the version has
  a `-suffix`. On a push to the default branch it also creates the tag `vX.Y.Z`, on the commit that was released. A
  tag made this way starts no workflow, so it doesn't release again.

A tag that fails `check` publishes nothing. Delete it (`git push origin :refs/tags/vX.Y.Z`), fix what the message
says, and tag again. A tag pushed by hand for a version that merging has already released fails in `build`, as the
registry already has that version; nothing is published twice. If a release failed after publishing, re-run its
failed jobs.

A **dry run** is everything but `publish` and `github-release`. Run it from the Actions tab (Release, Run workflow,
on any branch or tag), and it runs by itself on a pull request that changes the release machinery, a release PR
included. Only a merged version bump or a pushed tag publishes.

## drivine: npm

- **Version:** `version` in `package.json`. The tag must be `v` and that version, character for character: `v3.4.0`
  for `3.4.0`. `package-lock.json` records the version too; Prepare release updates both with
  `npm version --no-git-tag-version --ignore-scripts`.
- **Push trigger:** a push to `master` that changes `package.json`.
- **Build:** `npm ci` then `npm run build`, which makes `dist/`: the compiled package, with `package.json`, the README
  and the licence copied in. `dist/` is what is published.
- **Checks:** `dist/package.json` is the version being released. `npm pack ./dist` holds the entry points
  (`index.js`, `index.d.ts`, `codegen/cli.js`, `testing/` and `nest/`) and no sources or tests. The smoke test
  installs the tarball into an empty project, loads the package and runs `drivine --help`. Then
  `npm publish ./dist --dry-run`. `build` fails a release whose version npm already has. npm refuses even a dry run of a
  version it has, so a dry run on a released version tries a copy under a throwaway version `X.Y.Z-dryrun.<run id>`,
  with `--dry-run` still: nothing is published.
- **Publish:** `npm publish ./dist --provenance --access public`, with npm 11.21.1 (trusted publishing needs 11.5.1 or
  later). A prerelease (`v3.4.0-rc.1`) is published under the `next` dist-tag, so `latest` stays on the last release.
- **Dry run:** leaves two artifacts on the run: `dist`, the directory that would be published, and `npm-package`, the
  tarball with its file list.

The same checks, locally, publishing nothing:

```
npm ci && npm run build
npm pack ./dist --dry-run
```

### Settings, made once

- **GitHub:** Settings, Environments, a `release` environment, with required reviewers. Its deployment branches and
  tags, if limited, must allow both the branch `master` (a merged bump) and the tags `v*` (a tag pushed by hand).
- **GitHub Actions and PRs:** Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests",
  so "Prepare release" can open its PR with `GITHUB_TOKEN`.
- **Optional, a `RELEASE_PR_TOKEN` secret:** a fine-grained personal access token with Contents and Pull requests
  read and write on this repository. "Prepare release" pushes its branch and opens its PR with it, so CI runs
  on the PR. The train controller passes its own token the same way.
- **npm trusted publishing:** on npmjs.com, `@liberation-data/drivine`, Settings, Trusted publishing, a GitHub Actions
  publisher with organization `liberation-data`, repository `drivine`, workflow `release.yml` and environment
  `release`. No token is held then. Once a release has gone out this way, the package's publishing access can be set
  to disallow tokens.
- **Or an `NPM_TOKEN` secret** in the `release` environment: an npm granular access token that can publish
  `@liberation-data/drivine`. It is used only when it is set, and only if trusted publishing isn't configured.
