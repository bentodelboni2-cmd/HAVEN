# Atualizar o servidor de contas no tablet para o HAVEN 0.3.0

Copie `HAVEN-0.3.0-backend-tablet.tar.gz` para a pasta Downloads do tablet. Na sessão do Debian que roda o servidor de contas, pressione Ctrl+C. Mantenha a sessão do LiveKit aberta.

```sh
cd ~/haven-contas
node --env-file=.env backend/admin.mjs backup "$HOME/haven-antes-0.3.0-$(date +%Y%m%d-%H%M%S).sqlite" &&
  cp -n backend/server.mjs backend/server.mjs.antes-0.3.0 &&
  tar -xzf /sdcard/Download/HAVEN-0.3.0-backend-tablet.tar.gz backend/server.mjs &&
  sh scripts/run-backend.sh
```

O pacote atualiza as regras de convites de chamada e amizade. O arquivo de configuração, o SQLite, as dependências e o LiveKit ficam nos locais atuais. Para reverter o código, pare o servidor de contas, copie `backend/server.mjs.antes-0.3.0` sobre `backend/server.mjs` e inicie novamente.

Com os dois serviços em execução, teste cadastro ou login de duas contas que você controla, convite cancelado, voz e compartilhamento. Convites de cadastro mantêm o prazo próprio. Convites de chamada expiram após 60 segundos.
