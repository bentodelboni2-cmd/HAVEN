# Acesso direto ao HAVEN no tablet

Este perfil usa o servidor de contas e o LiveKit existentes no Samsung, atrás do Caddy. Os dois nomes DNS apontam para o mesmo IPv4 público, por exemplo `contas.exemplo.com` e `voz.exemplo.com`. Reserve o IP LAN do tablet antes de encaminhar as portas. Publique registros A. Acrescente AAAA só depois de validar a rota IPv6.

## Preparar sem interromper o Tailscale

Copie o pacote para as transferências do tablet. Extraia a partir da pasta pessoal do Debian para criar `~/haven-direto`, fora da instalação atual. Tenha o [Caddy oficial para Linux ARM64](https://github.com/caddyserver/caddy/releases) disponível no Debian. Na pasta do servidor de contas, gere o perfil com os nomes DNS efetivos:

```sh
cd "$HOME"
tar -xzf /sdcard/Download/HAVEN-0.4.0-acesso-direto-tablet.tar.gz
cd "$HOME/haven-contas"
node "$HOME/haven-direto/scripts/samsung-public.mjs" contas.exemplo.com voz.exemplo.com
caddy validate --config "$HOME/haven-direto/deploy/Caddyfile.samsung" --adapter caddyfile --envfile .env.public
```

Isso cria `.env.public` com novas credenciais internas para o LiveKit. Guarde o arquivo no tablet. O `.env` atual e o banco SQLite continuam nos locais atuais. O perfil público usa o mesmo banco e sobrepõe apenas as configurações de rede e mídia.

## Ativação após obter acesso ao roteador

Configure o encaminhamento para o IP LAN fixo do tablet. Os números internos 8080 e 8443 permitem executar o Caddy sem portas privilegiadas no Android. [HTTPS no Caddy](https://caddyserver.com/docs/automatic-https) · [Portas do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

| Porta externa | Porta no tablet | Uso |
| --- | --- | --- |
| TCP 80 | TCP 8080 | Validação de certificado |
| TCP 443 | TCP 8443 | Contas HTTPS e sinalização WSS |
| TCP 7881 | TCP 7881 | Mídia WebRTC em TCP |
| UDP 7882 | UDP 7882 | Mídia WebRTC em UDP |

Mantenha 8787 e 7880 locais. O Caddy encaminha apenas as rotas de sinalização do LiveKit no domínio de voz. A API administrativa do LiveKit fica em loopback. O painel do HAVEN continua exigindo a permissão de administrador do backend.

No momento da troca, pare o servidor de contas e o LiveKit atuais. Atualize o código do HAVEN, preservando o backup que o comando informa, e inicie o perfil público:

```sh
sh "$HOME/haven-direto/scripts/update-samsung.sh" "$HOME/haven-contas"
cd "$HOME/haven-contas"
sh scripts/samsung.sh --publico
```

Em outra sessão do Debian, na pasta do servidor de contas, inicie o Caddy:

```sh
cd "$HOME/haven-contas"
caddy run --config "$HOME/haven-direto/deploy/Caddyfile.samsung" --adapter caddyfile --envfile .env.public
```

Pela rede móvel, com o Tailscale desligado no dispositivo de teste, confira `https://contas.exemplo.com/health`. No HAVEN, use `https://contas.exemplo.com` em **Servidor de contas**. Entre com uma conta existente e teste também cadastro com convite em outro PC. Confirme voz nos dois sentidos e compartilhamento de tela em redes diferentes. Acesse pelo domínio também na sua LAN caso o roteador ofereça NAT loopback ou resolva os domínios localmente para o tablet. Redes muito restritas podem exigir TURN. [Guia do LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/)

Se precisar voltar ao acesso pelo Tailscale, pare o Caddy e o supervisor público. Inicie com `sh scripts/samsung.sh`, sem `--publico`, e use o endereço anterior no app. Esse retorno mantém os dados do banco da versão atual. A configuração inicial e o binário personalizado do LiveKit permanecem no tablet.
