# Operação do HAVEN 0.4.0

## Windows e Tailscale

Instale a versão 0.4.0 uma vez pelo instalador. O endereço padrão é `http://192.168.0.4:8787`, no tablet. Fora da sua Wi-Fi, conecte o Tailscale com acesso à rota privada atual. Para trocar de servidor, abra **Perfil e ajustes → Configuração avançada do servidor**, ou **Servidor de contas** na entrada. Em uma futura mudança para HTTPS, aponte o cliente para o novo endereço e entre com a mesma conta do mesmo banco. O backend informa ao cliente o endereço WSS da mídia.

O HAVEN recupera a sessão e acompanha a volta da conexão. Em uma chamada, o LiveKit tenta reconectar. Se for preciso entrar de novo na sala, reative câmera e compartilhamento de tela conforme necessário.

## Atualizar o tablet

Dentro do Debian do Termux, extraia o pacote separado da instalação. O exemplo usa o arquivo nas transferências do Android. Se ele já estiver na pasta pessoal, troque somente o caminho do arquivo.

```sh
cd "$HOME"
tar -xzf /sdcard/Download/HAVEN-0.4.0-backend-tablet.tar.gz
```

Encerre com Ctrl+C os processos antigos do servidor de contas e do LiveKit, ou o supervisor se já estiver em uso. Então rode:

```sh
sh "$HOME/haven-040/scripts/update-samsung.sh" "$HOME/haven-contas"
cd "$HOME/haven-contas"
node --env-file=.env backend/admin.mjs grant SEU_USUARIO
sh scripts/samsung.sh
```

Troque `SEU_USUARIO` pelo seu nome de usuário já cadastrado neste servidor. O comando de permissão é necessário só para o primeiro administrador. Depois, abra **Perfil e ajustes → Administração** para gerar convites e administrar o servidor. Copie os convites quando forem exibidos. Depois disso, a lista usa identificadores para revogação.

O supervisor reutiliza `~/livekit/livekit-haven`, `haven.yaml` e o `.env` já configurado. A instalação habitual usa o endereço privado atual para o LiveKit. Para outro layout, use `HAVEN_LIVEKIT_DIR`, `HAVEN_LIVEKIT_BIND`, `HAVEN_LIVEKIT_NODE_IP` e `HAVEN_LIVEKIT_CONFIG`. Logs ficam em `ops`, ao lado do banco, com uma cópia anterior de até 2 MiB por serviço. Os sete backups diários mais recentes ficam em `backups/automaticos`. Backups do painel ficam em `backups`. Guarde uma cópia em outro dispositivo para recuperar o servidor em caso de falha do tablet. Os arquivos contêm dados privados.

A inicialização no boot é opcional. Com o Termux:Boot assinado pela mesma distribuição do Termux, abra o app uma vez e copie o script `termux-boot-haven.sh` para `~/.termux/boot/` **no Termux, fora do Debian**. Se a pasta de instalação for diferente, ajuste o caminho do script. Após reiniciar o tablet, confira os dois serviços. O Android pode restringir processos em segundo plano.

## Publicar uma versão

Incremente a versão em `package.json`. No Windows, aponte `HAVEN_SIGNING_KEY` para o PEM Ed25519 privado correspondente à chave pública do aplicativo. Em seguida configure um destino de testes ou uma pasta de publicação acessível pela rede privada:

```powershell
$env:HAVEN_SIGNING_KEY = 'C:\caminho\privado\haven-release-signing.pem'
$env:HAVEN_RELEASE_TARGET = 'C:\caminho\publicacao'
pnpm release
```

O comando testa, compila, gera o instalador e publica o binário e o manifesto assinado na pasta escolhida. No tablet, configure `HAVEN_RELEASE_DIR=data/releases` no `.env` e disponibilize os dois arquivos nessa pasta. Se o destino Windows apontar para uma pasta montada do servidor, o próprio comando publica. Para transferência manual, copie primeiro o instalador e substitua `manifest.json` por último. A versão 0.4.0 verifica atualizações ao entrar e periodicamente. A instalação é confirmada em **Perfil e ajustes** e continua no instalador do Windows. O instalador desta distribuição não tem assinatura Authenticode. A assinatura Ed25519 valida as atualizações distribuídas pelo HAVEN.

## Recuperação do backend

O script de atualização valida a migração SQLite em uma cópia e guarda o banco consistente e o código antigo na pasta `.rollback-0.4.0.*` que imprime. Para voltar à versão anterior, pare os serviços e guarde o banco atual e seus arquivos auxiliares `-wal` e `-shm` em uma pasta separada, se existirem. Restaure o código salvo em `backend/` e copie `before.sqlite` para o caminho configurado em `HAVEN_DB` (padrão `data/haven.sqlite`). Restaure o script anterior de inicialização, se existir. Inicie a versão antiga e confira `/health`. O banco restaurado reflete o momento anterior à atualização. O painel cria e lista backups. A restauração exige acesso ao host.
