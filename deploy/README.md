# Hospedar o HAVEN

Use um VPS Linux com IPv4 público, Docker Engine, Compose v2 e OpenSSL. Aponte dois registros DNS A para o VPS. Um será o endereço do app, por exemplo `contas.exemplo.com`. O outro será usado pelo LiveKit, por exemplo `voz.exemplo.com`.

No firewall do VPS, permita TCP 80 e 443 para HTTPS, TCP 7881 e UDP 7882 para a mídia. Mantenha 7880 e 8787 locais. Restrinja o SSH a quem administra o servidor. Configure os registros como DNS direto se o provedor também oferecer proxy. [Portas do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

Na pasta `deploy` do pacote:

```sh
sh init.sh contas.exemplo.com voz.exemplo.com
docker compose up -d --build
curl -fsS https://contas.exemplo.com/health
docker compose exec accounts node backend/admin.mjs invite
```

Seu amigo preenche `https://contas.exemplo.com` em **Servidor de contas** no HAVEN e usa um convite emitido no VPS. Para validar a mídia, abra uma chamada e confirme voz e compartilhamento com o outro PC em uma rede diferente. O perfil inicial usa ICE direto por UDP ou TCP. Redes mais restritas podem exigir um serviço TURN. [Implantação do LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/)

## Migrar as contas do tablet

Em uma sessão do Debian no tablet, gere um backup SQLite consistente:

```sh
cd ~/haven-contas
node --env-file=.env backend/admin.mjs backup ~/haven-migracao.sqlite
```

Transfira o backup por SCP ou SFTP. Depois de gerar `deploy/.env` e **antes de iniciar o backend no VPS**, importe o arquivo assim:

```sh
docker compose build accounts
docker compose run --rm -T --no-deps accounts sh -ec '
  umask 077
  tmp=$(mktemp /app/data/.restore.XXXXXX)
  trap "rm -f \"$tmp\"" EXIT
  cat > "$tmp"
  node -e "
    const { DatabaseSync } = require(\"node:sqlite\")
    const db = new DatabaseSync(process.argv[1], { readOnly: true })
    if (db.prepare(\"PRAGMA quick_check\").get().quick_check !== \"ok\") process.exit(1)
    db.prepare(\"SELECT id FROM users LIMIT 1\").get()
    db.close()
  " "$tmp"
  ln "$tmp" /app/data/haven.sqlite
' < ./haven-migracao.sqlite
```

A importação verifica o arquivo e recusa substituir um banco existente. Para migrar o uso diário, combine a troca de endereço para evitar novos dados em bases separadas. Proteja `deploy/.env` e os backups. O volume `accounts-data` preserva os dados entre reinicializações.
