#!/usr/bin/env bash
# Builds FLP.app + a .dmg. Packaging happens outside ~/Documents because iCloud Drive stamps files
# with attributes codesign rejects; the finished .dmg is copied back into ./dist.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$HOME/Library/Caches/FLP-build"
npm run native
npx electron-vite build
./scripts/bundle-macos.sh
rm -rf "$OUT"
npx electron-builder --mac --config.directories.output="$OUT"
mkdir -p dist
cp "$OUT"/*.dmg dist/
echo "✓ $(ls dist/*.dmg)"
