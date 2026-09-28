#!/bin/sh
# Bundle and run the headless balance sim: hogtopia/tools/run-sim.sh [N] [difficulties] [extra args]
cd "$(dirname "$0")" && S=${SIM:-sim} && ../../node_modules/.bin/esbuild $S.ts --bundle --platform=node --format=esm --log-level=warning --outfile=/tmp/hogtopia-$S.mjs && node /tmp/hogtopia-$S.mjs "$@"
