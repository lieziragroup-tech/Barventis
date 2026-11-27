#!/usr/bin/env bash
# Uji lapisan kompatibilitas Firestore→Supabase memakai klien Supabase tiruan (scripts/stubs/supabase.ts).
set -euo pipefail
TMP=src/shared/lib/__firebase_under_test.ts
trap 'rm -f "$TMP"' EXIT
sed 's#"./supabase"#"../../../scripts/stubs/supabase"#' src/shared/lib/firebase.ts > "$TMP"
sed "s#'../src/shared/lib/firebase'#'../src/shared/lib/__firebase_under_test'#" scripts/shim-test.ts > scripts/.shim-test.run.ts
trap 'rm -f "$TMP" scripts/.shim-test.run.ts' EXIT
bash scripts/build-run.sh scripts/.shim-test.run.ts
