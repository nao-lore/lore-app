#!/usr/bin/env bash
# check-links.sh — Validate all URLs in key project files before launch.
# Usage: bash scripts/check-links.sh

set -euo pipefail

FILES=(
  "index.html"
  "src/LandingPage.tsx"
  "README.md"
  "package.json"
  "public/sitemap.xml"
  "public/robots.txt"
  "public/tokushoho.html"
)

BROKEN=0
CHECKED=0

# Collect unique URLs from all key files
urls=""
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    found=$(grep -oE 'https://[^"'"'"'<>\` )\]]+' "$file" 2>/dev/null || true)
    urls="$urls"$'\n'"$found"
  else
    echo "[SKIP] $file not found"
  fi
done

# Deduplicate
urls=$(echo "$urls" | sort -u | grep -v '^$')

if [ -z "$urls" ]; then
  echo "No URLs found."
  exit 0
fi

echo "Checking URLs..."
echo ""

while IFS= read -r url; do
  CHECKED=$((CHECKED + 1))
  status=$(curl -o /dev/null -s -w "%{http_code}" -L --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "200" ] || [ "$status" = "301" ] || [ "$status" = "302" ]; then
    echo "[OK]     $status  $url"
  else
    echo "[BROKEN] $status  $url"
    BROKEN=$((BROKEN + 1))
  fi
done <<< "$urls"

echo ""
echo "Checked: $CHECKED | Broken: $BROKEN"

if [ "$BROKEN" -gt 0 ]; then
  echo "FAIL: $BROKEN broken link(s) found."
  exit 1
else
  echo "PASS: All links are valid."
  exit 0
fi
