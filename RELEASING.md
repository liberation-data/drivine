# Releasing

drivine, drivine4j and drivine-python are released the same way, from a tag, by CI. Each repository has this file,
differing only in its publish step.

## The process

1. **Release PR.** A PR bumps the version (build.gradle / package.json / pyproject.toml) and the changelog, if the
   repo has one. It is reviewed and passes CI like any other PR.
2. **Tag the merge commit.** Merging the release PR is the release point. The maintainer then tags the merge commit
   on the default branch `vX.Y.Z` and pushes the tag.
3. **CI publishes.** The tag push runs `.github/workflows/release.yml`, which checks out the tag, runs the full gate,
   builds, checks, and publishes. Nothing is built from a laptop.
4. **Credentials.** Repository secrets or trusted publishing (OIDC), held in a GitHub environment named `release`.

For step 2:

```
git switch master && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

## What release.yml does

- **`check`** works out the version: the tag without its `v` on a tag push, or the build file's version otherwise.
  On a tag push it fails, saying why, unless the tag is `vX.Y.Z` (or `vX.Y.Z-suffix`), its version equals the build
  file's, and the tagged commit is on the default branch.
- **`gate`** runs the repository's full CI, `ci.yml`, unchanged.
- **`build`** builds the release artifacts from the checked-out ref, checks them, runs a smoke test, and uploads them
  as the run's artifact.
- **`publish`** runs on a tag push alone, in the `release` environment. It publishes the exact files `build` made.
- **`github-release`** then creates the GitHub release for the tag, with generated notes, marked a prerelease when
  the version has a `-suffix`.

A tag that fails `check` publishes nothing. Delete it (`git push origin :refs/tags/vX.Y.Z`), fix what the message
says, and tag again.

A **dry run** is everything but `publish` and `github-release`. Run it from the Actions tab (Release, Run workflow,
on any branch or tag), and it runs by itself on a pull request that changes the release machinery. A tag push is the
only thing that publishes.

## drivine: npm

- **Version:** `version` in `package.json`. The tag must be `v` and that version, character for character: `v3.4.0`
  for `3.4.0`.
- **Build:** `npm ci` then `npm run build`, which makes `dist/`: the compiled package, with `package.json`, the README
  and the licence copied in. `dist/` is what is published.
- **Checks:** `dist/package.json` is the version being released. `npm pack ./dist` holds the entry points
  (`index.js`, `index.d.ts`, `codegen/cli.js`, `testing/` and `nest/`) and no sources or tests. The smoke test
  installs the tarball into an empty project, loads the package and runs `drivine --help`. Then
  `npm publish ./dist --dry-run`. `build` fails a tag whose version npm already has. npm refuses even a dry run of a
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

- **GitHub:** Settings, Environments, a `release` environment. It can carry required reviewers, and a deployment tag
  rule `v*`.
- **npm trusted publishing:** on npmjs.com, `@liberation-data/drivine`, Settings, Trusted publishing, a GitHub Actions
  publisher with organization `liberation-data`, repository `drivine`, workflow `release.yml` and environment
  `release`. No token is held then. Once a release has gone out this way, the package's publishing access can be set
  to disallow tokens.
- **Or an `NPM_TOKEN` secret** in the `release` environment: an npm granular access token that can publish
  `@liberation-data/drivine`. It is used only when it is set, and only if trusted publishing isn't configured.
