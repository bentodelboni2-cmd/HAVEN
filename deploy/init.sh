#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ "$#" -ne 2 ] || [ "$1" = "$2" ]; then
  echo "Uso: sh init.sh contas.exemplo.com voz.exemplo.com" >&2
  exit 1
fi

for host; do
  if ! printf '%s\n' "$host" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$'; then
    echo "Informe dois nomes DNS em letras minúsculas." >&2
    exit 1
  fi
done

if [ -e .env ]; then
  echo ".env já existe. Preserve suas credenciais." >&2
  exit 1
fi

key="haven_$(openssl rand -hex 12)"
secret="$(openssl rand -hex 32)"
umask 077
set -C
printf 'HAVEN_HOST=%s\nLIVEKIT_HOST=%s\nLIVEKIT_API_KEY=%s\nLIVEKIT_API_SECRET=%s\n' \
  "$1" "$2" "$key" "$secret" > .env
echo "Configuração salva. Execute docker compose up -d --build."
