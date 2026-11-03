# Notes for coding agents

This repository is Drivine for TypeScript, one of three Drivine libraries. The other two are [drivine4j](https://github.com/liberation-data/drivine4j) and [drivine-python](https://github.com/liberation-data/drivine-python). All three read and write the same stores in the same layout, so a graph written by one is loaded, stamped and checked alike by the others. [drivine4j](https://github.com/liberation-data/drivine4j) is the reference: where the libraries disagree, its behaviour is the spec unless an issue says otherwise.

## A bug found here is checked for in the other two

When you find or fix a bug here, check the other two libraries for the same defect before you finish:

1. **Read their code.** Find the equivalent of the code you changed, and note file:line.
2. **Look for an existing report.** Search their issues and pull requests, open and closed (`gh issue list --repo liberation-data/<repo> --state all --search ...`, `gh pr list --repo liberation-data/<repo> --state all --search ...`).
3. **File what isn't reported yet.** Open one issue per library that has the defect. Start its body with "Port of liberation-data/drivine#<n>." Then say what happens there now, with file:line, what the fix here does, and which tests can be ported. A library that already has the fix needs nothing.

Do the same for a change of behaviour or a new feature. A library without the feature needs no issue for a bug in it, but one that the feature would naturally belong in can get an `enhancement` issue.

## Shared formats are contracts

These are read by all three libraries. Change them here only together with the others, and file the ports in the same change:

- **The store layout:** node and edge tables on Oracle and Postgres, labels and properties on the graph engines, and the stamp each node carries.
- **The schema marker** (`_DrivineSchema`): its version and its inventory of items, including the `runtime:` and `runtime-stale:` entries.
- **The golden statements:** `test/1.Unit/golden/statements.json` in Drivine for TypeScript is copied byte for byte to `tests/golden/statements.json` in drivine-python. A change to a statement that the goldens pin is made in both.
- **The Cypher spec:** what each Cypher statement gives on each store, compiled to SQL or not, lives in [drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec). `scripts/sync-cypher-spec.sh <tag>` copies a tagged version into `test/cypher`, unchanged; the other two libraries copy the same tag. `scripts/check-cypher-spec.sh`, run in CI, fails when a copy differs from its tag and warns when the spec has a later one. A change to what the compiler gives or refuses goes to the spec first.

## Releases go out as trains

The three libraries are released together, as a train recorded in
[liberation-data/drivine-release](https://github.com/liberation-data/drivine-release); see RELEASING.md. Don't run
"Prepare release" in one repository on its own. Start a train from drivine-release, which opens the release PRs in all
three, once the fixes the train is to carry are in all three. A person merges the release PRs, and merging publishes.

## Pull requests

- Base each pull request on `master`, not on another open pull request's branch. Branches aren't deleted on merge here, so a stacked pull request merges into its parent's old branch and its change never reaches `master`.
- No AI attribution in commits or pull requests: no `Co-Authored-By` trailer, and no "Generated with" line.
