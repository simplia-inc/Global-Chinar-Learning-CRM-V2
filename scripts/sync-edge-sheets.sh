#!/usr/bin/env bash
# The scheduled-sync Edge Function reuses the exact same import code as the web server.
# Run this after changing anything in server/sheets/, then redeploy the function.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in url csv mapping fetchers service; do cp "server/sheets/$f.js" "supabase/functions/sheet-sync/sheets/$f.js"; done
echo "Copied server/sheets/*.js into supabase/functions/sheet-sync/sheets/"
