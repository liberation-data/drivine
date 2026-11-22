#!/usr/bin/env bash
# Copies a tagged version of the Cypher spec (github.com/liberation-data/drivine-cypher-spec) into test/cypher,
# unchanged, and records the tag in VERSION there. drivine4j and drivine-python copy the same tag.
#
#   scripts/sync-cypher-spec.sh v0.3.0
set -euo pipefail

# Or, with --from, a local checkout of the spec at a commit not yet tagged, its files copied as a tag's would be, and VERSION
# naming the commit: for a build against a local build of the compiler, until the tag is out.
from=""
if [ "${1:-}" = "--from" ]; then from="${2:?usage: scripts/sync-cypher-spec.sh --from <spec checkout>}"; shift 2; fi
tag="${1:-}"
[ -n "$from" ] || [ -n "$tag" ] || { echo "usage: scripts/sync-cypher-spec.sh <tag>, such as v0.3.0, or --from <spec checkout>" >&2; exit 2; }
dir="$(cd "$(dirname "$0")/.." && pwd)/test/cypher"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$dir"
if [ -n "$from" ]; then
  (cd "$from" && git archive HEAD) | tar -x -C "$tmp"
  tag="$(git -C "$from" rev-parse --short=12 HEAD) (untagged)"
else
  curl -fsSL "https://github.com/liberation-data/drivine-cypher-spec/archive/refs/tags/$tag.tar.gz" | tar -xz -C "$tmp" --strip-components=1
fi
# The statements each store answers, and, since store layout 2, the store's own: its DDL and reads (store.yaml), its stamps
# and schema marker (marker.yaml), the fragments the object manager compiles (fragments.yaml), the schema plans (plans.yaml),
# vector search (vector.yaml), and what the schema declarations give the planner (declarations.yaml).
cp "$tmp"/queries.yaml "$tmp"/writes.yaml "$tmp"/temporal.yaml "$tmp"/refusals.yaml "$tmp"/schema.yaml "$tmp"/host.yaml \
  "$tmp"/store.yaml "$tmp"/marker.yaml "$tmp"/fragments.yaml "$tmp"/plans.yaml "$tmp"/vector.yaml "$tmp"/declarations.yaml \
  "$tmp"/README.md "$dir"/
# The model file's format, which the model file generator writes to.
mkdir -p "$dir/model"
cp "$tmp"/model/schema.json "$tmp"/model/README.md "$dir/model/"
echo "$tag" > "$dir/VERSION"
echo "The Cypher spec in $dir is now $tag."
