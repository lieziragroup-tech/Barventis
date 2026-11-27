#!/usr/bin/env bash
# Bundle skrip TS (alias @ → src, stub import.meta.env) lalu jalankan dengan Node. Pemakaian: scripts/build-run.sh scripts/render-samples.ts
set -euo pipefail
ENTRY="$1"; OUTFILE="$(mktemp -d)/run.mjs"
npx esbuild "$ENTRY" --bundle --platform=node --format=esm --target=node20 --outfile="$OUTFILE" \
  --alias:@=./src --alias:jspdf=./node_modules/jspdf/dist/jspdf.es.min.js --external:canvg --external:html2canvas --external:dompurify --log-level=warning \
  --define:import.meta.env='{"PROD":false,"DEV":true,"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"stub"}' \
  --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
node "$OUTFILE"
