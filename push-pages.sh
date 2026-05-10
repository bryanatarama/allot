#!/bin/bash
set -e
mkdir -p /tmp/budgeter-pages
cp index.html /tmp/budgeter-pages/index.html
cp _headers /tmp/budgeter-pages/_headers
npx wrangler pages deploy /tmp/budgeter-pages --project-name budgeter-app --branch main
echo "Done: https://budgeter-app.pages.dev"

# Keep reference doc in sync with current build
BUILD=$(grep -o 'BUILD_STAMP = "[^"]*"' index.html | head -1 | grep -o '"[^"]*"' | tr -d '"')
TODAY=$(date +%Y-%m-%d)
sed -i '' "s/^\*\*Last updated:\*\* .* | \*\*BUILD_STAMP:\*\* .*/**Last updated:** $TODAY | **BUILD_STAMP:** $BUILD/" BUDGETER_PROJECT_REFERENCE_v9.md
bash push-ref.sh
echo "Reference doc updated and pushed (BUILD_STAMP: $BUILD)"
