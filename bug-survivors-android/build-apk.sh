#!/usr/bin/env bash
# Build the Bug Survivors Android app: the web build first (packed into the APK as its assets), then the APK.
#   bug-survivors-android/build-apk.sh           -> app/build/outputs/apk/debug/app-debug.apk
#   bug-survivors-android/build-apk.sh install   -> also installs on the connected phone (adb, USB debugging on)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
[ -f "$HERE/local.properties" ] || echo "sdk.dir=$SDK" > "$HERE/local.properties"

(cd "$ROOT" && node build-kits.mjs bug-survivors)
(cd "$HERE" && ./gradlew --console=plain -q assembleDebug)
APK="$HERE/app/build/outputs/apk/debug/app-debug.apk"
cp "$APK" "$ROOT/out/bug-survivors.apk" 2>/dev/null || { mkdir -p "$ROOT/out" && cp "$APK" "$ROOT/out/bug-survivors.apk"; }
echo "APK: $ROOT/out/bug-survivors.apk ($(du -h "$APK" | cut -f1))"
if [ "${1:-}" = "install" ]; then
  "$SDK/platform-tools/adb" install -r "$APK"
  "$SDK/platform-tools/adb" shell am start -n es.funglass.bugsurvivors/.MainActivity
fi
