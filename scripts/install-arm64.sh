#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
case "$(node -p "process.platform + '/' + process.arch + '/' + process.versions.node.split('.')[0]")" in
  linux/arm64/24) ;;
  *) echo 'Use Node.js 24 para Linux ARM64.' >&2; exit 1 ;;
esac
node -e "require('node:sqlite')"
pnpm install --prod --frozen-lockfile
if [ ! -e .env ]; then
  (umask 077 && cp .env.example .env)
  echo 'Preencha as credenciais LiveKit em .env antes de iniciar.'
fi
