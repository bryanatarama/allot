#!/bin/bash
set -e
mkdir -p /tmp/budgeter-pages
cp index.html /tmp/budgeter-pages/index.html
cp _headers /tmp/budgeter-pages/_headers
npx wrangler pages deploy /tmp/budgeter-pages --project-name budgeter-app --branch main
echo "Done: https://budgeter-app.pages.dev"

# Keep reference doc in sync with current build.
# Cross-platform: avoid `sed -i` (BSD/macOS needs `-i ''`, GNU/Windows-git-bash
# needs `-i`). Write to a temp file and move instead, so this works from any machine.
BUILD=$(grep -o 'BUILD_STAMP = "[^"]*"' index.html | head -1 | grep -o '"[^"]*"' | tr -d '"')
TODAY=$(date +%Y-%m-%d)
REF_DOC="$HOME/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md"
if [ -f "$REF_DOC" ]; then
  TMP="$REF_DOC.tmp.$$"
  sed "s/^\*\*Last updated:\*\* .* | \*\*BUILD_STAMP:\*\* .*/**Last updated:** $TODAY | **BUILD_STAMP:** $BUILD/" "$REF_DOC" > "$TMP" && mv "$TMP" "$REF_DOC"
  echo "Reference doc stamped (BUILD_STAMP: $BUILD, $TODAY)"
else
  echo "Reference doc not found at $REF_DOC — skipped stamp (is Dropbox synced on this machine?)"
fi

# push-ref.sh is Mac-only / gitignored and is redundant now that the reference doc
# lives in Dropbox (auto-syncs across machines). Run it only if present so deploys
# from machines without it (e.g. Windows) don't fail.
if [ -f push-ref.sh ]; then
  bash push-ref.sh
fi
