#!/bin/bash
set -euo pipefail
echo "Running golden tests with real API..."
GOLDEN_API_KEY="${1:?Usage: $0 <api-key>}" npx vitest run src/transform.golden.test.ts --reporter=verbose
