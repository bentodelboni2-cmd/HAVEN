# Ativar sessões sem vencimento no tablet

Use o HAVEN 0.4.3 no Windows. A atualização do servidor de contas mantém o banco, as contas, as chaves de convite e o endereço do ngrok.

No Debian do tablet, extraia o pacote a partir da pasta pessoal:

```sh
cd "$HOME"
tar -xzf /sdcard/Download/HAVEN-0.4.3-backend-tablet.tar.gz
```

Pare o servidor de contas com Ctrl+C e rode:

```sh
sh "$HOME/haven-043/scripts/update-samsung.sh" "$HOME/haven-contas"
cd "$HOME/haven-contas"
sh scripts/run-backend.sh
```

Use o comando que já iniciava o servidor de contas caso seja diferente de `sh scripts/run-backend.sh`. Se os dois serviços eram gerenciados pelo supervisor, reinicie pelo mesmo comando que usava antes. Uma sessão LiveKit iniciada separadamente pode continuar rodando.

O script valida uma cópia do banco e guarda o backup que imprime no terminal. Entre uma vez no Windows com **Lembrar de mim** marcado para criar a nova sessão. Uma sessão emitida pelo backend antigo mantém seu prazo original. Para invalidar a sessão no servidor, encerre-a com o app conectado ou suspenda a conta no painel administrativo.
