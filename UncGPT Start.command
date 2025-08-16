#!/bin/zsh
set -euo pipefail

# always run from this folder
cd "$(dirname "$0")"

# load .env if present
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

PORT="${PORT:-3000}"

echo
echo "🚀 UncGPT starting on http://localhost:${PORT}"
echo "   Overlay : http://localhost:${PORT}/overlay.html"
echo "   ModPanel: http://localhost:${PORT}/modpanel.html"
echo

exec /usr/bin/env node server.mjs
