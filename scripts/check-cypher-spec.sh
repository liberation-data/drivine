#!/usr/bin/env bash
# Checks test/cypher against the Cypher spec (github.com/liberation-data/drivine-cypher-spec):
# - fails when a file differs from the tag VERSION names, as a case edited here and not in the spec does;
# - warns when the spec has a later tag than VERSION, so Drivine can move to it.
#
#   scripts/check-cypher-spec.sh
set -euo pipefail

repo="https://github.com/liberation-data/drivine-cypher-spec"
dir="$(cd "$(dirname "$0")/.." && pwd)/test/cypher"
tag="$(tr -d '[:space:]' < "$dir/VERSION")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# As GitHub Actions shows a warning or an error, and plain elsewhere.
say() {
    if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::$1::$2"; else echo "$1: $2"; fi
}

curl -fsSL "$repo/archive/refs/tags/$tag.tar.gz" | tar -xz -C "$tmp" --strip-components=1
changed=0
for file in queries.yaml writes.yaml temporal.yaml refusals.yaml README.md model/schema.json model/README.md; do
    if ! diff -q "$tmp/$file" "$dir/$file" > /dev/null; then
        say error "test/cypher/$file differs from the spec at $tag. Change the spec, tag it, and run scripts/sync-cypher-spec.sh <tag>."
        changed=1
    fi
done

latest="$(git ls-remote --tags --refs "$repo" 'v*' | sed 's|.*refs/tags/||' | sort -V | tail -n 1)"
if [ "$latest" != "$tag" ] && [ "$(printf '%s\n%s\n' "$tag" "$latest" | sort -V | tail -n 1)" = "$latest" ]; then
    say warning "The Cypher spec is at $latest; Drivine runs $tag. Move to it with scripts/sync-cypher-spec.sh $latest."
fi

[ "$changed" = 0 ] && echo "test/cypher is the spec at $tag."
exit "$changed"
