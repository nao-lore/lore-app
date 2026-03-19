#!/usr/bin/env bash
# pre-launch-check.sh — Run all pre-launch smoke tests.
# Usage: bash scripts/pre-launch-check.sh

set -uo pipefail

PASS=0
FAIL=0

report() {
  local label="$1"
  local status="$2"
  if [ "$status" -eq 0 ]; then
    echo "[PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Pre-Launch Smoke Tests ==="
echo ""

# 1. TypeScript type check
echo "Running tsc --noEmit..."
npx tsc --noEmit 2>&1
report "TypeScript type check" $?

# 2. Tests
echo ""
echo "Running vitest..."
npx vitest run 2>&1
report "Vitest tests" $?

# 3. Production build
echo ""
echo "Running vite build..."
npx vite build 2>&1
report "Vite production build" $?

# 4. Build output size
echo ""
echo "Checking build output size..."
if [ -d "dist" ]; then
  BUILD_SIZE=$(du -sh dist | cut -f1)
  echo "  Build size: $BUILD_SIZE"
  report "Build output exists" 0
else
  echo "  dist/ directory not found"
  report "Build output exists" 1
fi

# 5. Check for old URLs
echo ""
echo "Checking for old URLs..."
OLD_URLS="lore-app.vercel.app|lore-lp-one.vercel.app|lore-landing-vert.vercel.app|lore-app-r5dl.vercel.app"
OLD_URL_HITS=$(grep -r -E "$OLD_URLS" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.json" --include="*.xml" --include="*.css" --include="*.js" --include="*.md" src/ public/ index.html README.md package.json 2>/dev/null || true)

if [ -z "$OLD_URL_HITS" ]; then
  report "No old URLs remaining" 0
else
  echo "  Found old URLs:"
  echo "$OLD_URL_HITS" | head -20
  report "No old URLs remaining" 1
fi

# Summary
echo ""
echo "==========================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: Some checks did not pass."
  exit 1
else
  echo "PASS: All checks passed!"
  exit 0
fi
