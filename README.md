# HAVEN

Aplicativo Windows para chamadas e espaços privados. A versão 0.3.0 usa LiveKit para mídia e um backend separado para contas, conversas e arquivos.

Para atualizar uma instalação existente no tablet, veja o [guia da versão 0.3.0](ATUALIZAR-TABLET-0.3.0.md).

## Primeira execução no PC

Pré-requisitos do backend e do desenvolvimento: Node.js 24 e pnpm 11. O instalador do cliente já inclui o Electron.

1. Execute `pnpm install --frozen-lockfile` na raiz do código. Copie `.env.example` para `.env`.
2. Preencha `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` com os valores do LiveKit de teste do tablet. Confira o endereço em `LIVEKIT_URL`. Mantenha `HAVEN_BIND=127.0.0.1` para usar o backend no mesmo PC.
3. Execute `pnpm backend`. Em outro terminal, execute `pnpm admin invite` e guarde o convite.
4. Abra o HAVEN pelo instalador ou execute `pnpm build` seguido de `pnpm start`. Para criar a conta, clique em **Tenho um convite**, cole a chave e preencha o perfil. Em **Servidor de contas**, informe outra origem apenas se mudou a configuração padrão.
5. Crie a conta do segundo participante com outro convite. Em **Chamadas**, inicie uma chamada privada e copie o código, ou adicione o participante como amigo e ligue.

Os convites pela CLI têm validade de dois dias e um uso por padrão. `pnpm admin invite 2` gera um convite com dois usos. Donos e administradores podem gerar convites de espaço dentro do app.

## Verificação e build

```powershell
pnpm check
pnpm test
pnpm build
pnpm package:win
```

O instalador NSIS x64 sai em `release/`. A compilação local é sem assinatura. Use assinatura aprovada se a política do Windows exigir assinaturas.

## Tablet e dados

Para servir amigos em outras redes sem VPN no cliente, consulte o [guia de hospedagem em VPS](deploy/README.md).

No Debian ARM64 em PRoot, copie o repositório sem `node_modules`. Use Node.js 24 ARM64 e pnpm 11. Rode `sh scripts/install-arm64.sh`, preencha `.env` e depois rode `sh scripts/run-backend.sh`. Para um cliente Windows da mesma LAN, informe o IP privado atual do tablet em `HAVEN_BIND` e, no login, a origem do backend em **Servidor de contas**. Nesse arranjo, o backend e o banco podem funcionar com o PC desligado, sujeito à homologação no tablet. Mantenha o LiveKit existente em seu processo independente.

O SQLite aplica migrações ao abrir. Rode `pnpm admin backup caminho-do-backup.sqlite` para obter uma cópia consistente inclusive com o serviço ativo. Para restaurar, pare o backend, preserve o banco atual e seus arquivos WAL/SHM juntos em outro diretório, coloque uma cópia do backup no caminho de `HAVEN_DB` e reabra o serviço. Restrinja o acesso ao banco e aos backups.

Mantenha o modo LAN em uma rede confiável. Para uso remoto futuro, veja [ARQUITETURA](ARCHITECTURE.md) e [validação](TASKS.md).
