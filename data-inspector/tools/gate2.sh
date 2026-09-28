#!/usr/bin/env bash
# Gate 2: re-assemble every real prospect game that uses this kit with the current dist and check it.
#   data-inspector/tools/gate2.sh [out_root]   (run from the kits root after node build-kits.mjs data-inspector)
set -u
KIT=data-inspector
OUT=${1:-/tmp/di-gate2}
rc=0
for m in ~/games/play/*/theme/manifest.json; do
  grep -q "\"kit\": *\"$KIT\"" "$m" || continue
  slug=$(basename "$(dirname "$(dirname "$m")")")
  T=$(mktemp -d)
  cp -r $KIT/dist "$T/game"; rm -rf "$T/game/theme"; cp -r ~/games/play/$slug/theme "$T/game/theme"
  if uv run -q --with playwright --with pillow python ~/games/tools/game_check.py "$T/game" "$OUT/$slug" > "$OUT-$slug.log" 2>&1; then
    echo "gate2 $slug: PASS ($OUT/$slug)"
  else
    echo "gate2 $slug: FAIL (see $OUT-$slug.log)"; rc=1
  fi
  rm -rf "$T"
done
exit $rc
