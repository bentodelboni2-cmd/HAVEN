#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') exec node --env-file=.env backend/supervisor.mjs ;;
  --publico) exec node --env-file=.env --env-file=.env.public backend/supervisor.mjs ;;
  *) echo 'Use sh scripts/samsung.sh [--publico].' >&2; exit 1 ;;
esac
