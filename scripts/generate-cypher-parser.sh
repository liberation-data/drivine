#!/usr/bin/env bash
# Generates the Cypher parser in src/cypher/grammar from Cypher.g4 there, drivine4j's grammar, with antlr4ng's tool
# (which needs Java). Run it again whenever the grammar changes, and commit what it writes.
#
#   scripts/generate-cypher-parser.sh
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)/src/cypher/grammar"
cd "$dir"
npx antlr4ng -Dlanguage=TypeScript -no-listener -no-visitor -o . Cypher.g4
# What the tool writes for its own use: the parser needs none of it.
rm -f ./*.interp ./*.tokens
echo "The Cypher parser in $dir is generated from Cypher.g4."
