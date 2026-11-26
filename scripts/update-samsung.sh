#!/bin/sh
set -eu
umask 077
source_root=$(cd "$(dirname "$0")/.." && pwd)
cd "${1:-$HOME/haven-contas}"
target=$(pwd)
if [ "$source_root" = "$target" ]; then
  echo 'Extraia a atualização em uma pasta separada.' >&2
  exit 1
fi
if [ ! -f .env ] || [ ! -f backend/admin.mjs ] || [ ! -d node_modules ]; then
  echo 'Instalação existente do HAVEN não encontrada.' >&2
  exit 1
fi

node --env-file=.env -e '
  const host = process.env.HAVEN_BIND || "127.0.0.1"
  const port = process.env.HAVEN_PORT || 8787
  fetch("http://" + host + ":" + port + "/health", {signal:AbortSignal.timeout(1500)})
    .then(r => { if(r.ok){console.error("Pare o servidor de contas antes da atualização.");process.exitCode=1} })
    .catch(()=>{})
'
saved=$(mktemp -d "$target/.rollback-0.4.0.XXXXXX")
cp -pR backend "$saved/backend"
if [ -f scripts/samsung.sh ]; then cp -p scripts/samsung.sh "$saved/samsung.sh"; fi
node --env-file=.env backend/admin.mjs backup "$saved/before.sqlite"
cp -p "$saved/before.sqlite" "$saved/preflight.sqlite"

for file in "$source_root"/backend/*.mjs; do node --check "$file"; done
node --input-type=module - "$source_root" "$saved/preflight.sqlite" <<'NODE'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [, , source, snapshot] = process.argv
const {openDb} = await import(pathToFileURL(join(source,'backend/db.mjs')).href)
const db = openDb(snapshot)
try {
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Banco não passou na verificação.')
} finally { db.close() }
NODE

restore_files() {
  cp -pR "$saved/backend/." "$target/backend/"
  if [ -f "$saved/samsung.sh" ]; then cp -p "$saved/samsung.sh" "$target/scripts/samsung.sh"; fi
}
if ! cp -p "$source_root"/backend/*.mjs backend/ ||
   ! cp -p "$source_root/scripts/samsung.sh" scripts/samsung.sh; then
  restore_files
  echo 'A cópia falhou. Os arquivos anteriores foram repostos.' >&2
  exit 1
fi
echo "Atualização copiada. Backup e dados de recuperação em $saved"
echo 'Inicie os dois serviços com sh scripts/samsung.sh.'
