#!/usr/bin/env bash
# Collects everything FLP needs at runtime into build/bundle so the packaged app runs on Macs
# without Homebrew: the mpv addon + libmpv and its libraries, ffmpeg/ffprobe, and yt-dlp.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/bundle
rm -rf "$OUT"
mkdir -p "$OUT/native" "$OUT/bin"

echo "• mpv addon + libraries"
cp native/mpv-view/build/Release/mpv_view.node "$OUT/native/"
dylibbundler -of -b -x "$OUT/native/mpv_view.node" -d "$OUT/native/libs" -p @loader_path/libs/ -cd -s /opt/homebrew/lib >/dev/null

echo "• ffmpeg + ffprobe"
cp -L /opt/homebrew/bin/ffmpeg /opt/homebrew/bin/ffprobe "$OUT/bin/"
chmod u+w "$OUT/bin/ffmpeg" "$OUT/bin/ffprobe"
dylibbundler -of -b -x "$OUT/bin/ffmpeg" -x "$OUT/bin/ffprobe" -d "$OUT/bin/libs" -p @executable_path/libs/ -cd -s /opt/homebrew/lib >/dev/null

echo "• yt-dlp (official standalone build)"
if [ ! -f build/cache/yt-dlp_macos ]; then
  mkdir -p build/cache
  curl -fsSL -o build/cache/yt-dlp_macos https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
fi
cp build/cache/yt-dlp_macos "$OUT/bin/yt-dlp"
chmod +x "$OUT/bin/yt-dlp"

echo "• fixing library-to-library paths"
# Libraries in native/libs must find each other next to themselves, not in libs/libs.
for f in "$OUT"/native/libs/*.dylib; do
  otool -L "$f" | awk 'NR>1{print $1}' | grep '^@loader_path/libs/' | while read -r dep; do
    install_name_tool -change "$dep" "@loader_path/${dep#@loader_path/libs/}" "$f" 2>/dev/null
  done
  install_name_tool -id "@loader_path/$(basename "$f")" "$f" 2>/dev/null
done

echo "• removing duplicate rpaths (newer macOS refuses to load libraries that have them)"
find "$OUT" -type f \( -name '*.dylib' -o -name '*.node' -o -name ffmpeg -o -name ffprobe \) | while read -r f; do
  otool -l "$f" | awk '/cmd LC_RPATH/{getline; getline; print $2}' | sort | uniq -d | while read -r rp; do
    # Delete until only one copy is left.
    while [ "$(otool -l "$f" | awk '/cmd LC_RPATH/{getline; getline; print $2}' | grep -cxF "$rp")" -gt 1 ]; do
      install_name_tool -delete_rpath "$rp" "$f" 2>/dev/null
    done
  done
done

echo "• ad-hoc signing"
find "$OUT" -type f \( -name '*.dylib' -o -name '*.node' -o -perm -u+x \) -print0 | xargs -0 codesign --force --sign - --timestamp=none 2>/dev/null

echo "• check: no Homebrew paths left"
if find "$OUT" -type f \( -name '*.dylib' -o -name '*.node' -o -name ffmpeg -o -name ffprobe \) -exec otool -L {} \; | grep -q /opt/homebrew; then
  echo "  ✗ still linked to Homebrew:"; find "$OUT" -type f \( -name '*.dylib' -o -name '*.node' \) -exec sh -c 'otool -L "$1" | grep -q /opt/homebrew && echo "    $1"' _ {} \;; exit 1
fi
du -sh "$OUT/native" "$OUT/bin"

echo "• check: the bundled addon loads"
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  -e "require(process.argv[1]); console.log('  ✓ mpv addon loads')" "$PWD/$OUT/native/mpv_view.node"
