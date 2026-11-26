# Atualizar o HAVEN para 0.5.0

O instalador atualiza o HAVEN no mesmo perfil do Windows. O endereço do servidor, as preferências e as sessões continuam no perfil atual.

Para oferecer a atualização dentro do app, copie o instalador e o `manifest.json` assinado para a pasta configurada em `HAVEN_RELEASE_DIR` no servidor de contas. Transfira o instalador primeiro e publique o manifesto por último. O app valida a assinatura e a integridade ao atualizar em **Perfil e ajustes**.

O backend 0.5.0 também permite avisar sobre novas mensagens na conversa da chamada enquanto outra página está aberta. Com o backend anterior, o aviso da conversa da chamada funciona enquanto ela está aberta.

## Atualizar o backend no tablet

No Debian, extraia o pacote do servidor de contas na pasta pessoal. Pare apenas o servidor de contas se o LiveKit rodar em outra sessão. Depois execute:

```sh
cd "$HOME"
tar -xzf /sdcard/Download/HAVEN-0.5.0-backend-tablet.tar.gz
sh "$HOME/haven-050/scripts/update-samsung.sh" "$HOME/haven-contas"
```

Se quiser habilitar atualizações integradas, use `HAVEN_RELEASE_DIR=data/releases` no `.env` existente e crie a pasta `data/releases` dentro de `haven-contas`. Copie os arquivos do feed conforme descrito acima.

Reinicie o servidor pelo comando que você já usa. Se os dois serviços estiverem no supervisor, reinicie o supervisor. O atualizador salva uma cópia consistente do SQLite e preserva a configuração e o LiveKit personalizado.
