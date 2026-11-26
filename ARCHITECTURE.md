# Arquitetura do HAVEN

- Electron 45, React e TypeScript. O esquema local serve a interface empacotada. Renderer isolado, sandbox, CSP, navegação bloqueada e IPC limitado a janela e seleção de captura. O desktop solicita consentimento para a fonte e para o áudio do sistema.
- Fastify, Node 24 e SQLite embutido. SQLite usa WAL, chaves estrangeiras e migração por schema versionado. O banco armazena histórico e anexos locais, que são acessíveis via rotas autenticadas. Sessões e convites ficam hashados, senhas usam scrypt com salt, e login tem limite de tentativas.
- O backend emite JWTs de cinco minutos com identidade da sessão, sala e escopos de mídia. O LiveKit distribui uma publicação por tela, com WebRTC e controle de congestionamento. O cliente usa H.264 quando negociado e solicita áudio de tela estéreo. A área de vídeo usa encaixe proporcional. Resolução e FPS recebidos dependem da fonte, do codificador e da rede.
- As alterações chegam por SSE autenticado e a aplicação faz atualização periódica para presença e recuperação. O SFU responde pela ocupação real de salas e pelas telas publicadas. Mensagens de texto e arquivos usam o backend, sem gravação automática de chamadas.
- Rede e privacidade. `LIVEKIT_URL` é o WebSocket do cliente. `LIVEKIT_API_URL` pode apontar para o endpoint administrativo interno. A origem do backend é independente. Modo normal exige TLS externo e WSS de mídia. HTTP/WS privado é laboratório. Sessões, chats e anexos ficam acessíveis ao operador do backend. A mídia ainda não tem E2EE e o app informa isso na chamada. O SDK oferece E2EE para a mídia, mas exige distribuição e rotação autenticadas sem entregar chaves de conteúdo ao backend ou ao SFU. A reconexão e revogação também precisam ser validadas com o SFU autogerenciado. [E2EE no LiveKit](https://docs.livekit.io/transport/encryption/)
- O acesso remoto fica desabilitado pela configuração inicial. Para habilitá-lo depois da homologação, validar VPN privada ou domínio e TLS, ICE/UDP/TCP, relay TURN quando necessário, CGNAT, credenciais LiveKit próprias, backup, restauração e limites de tráfego. Não encaminhar portas do laboratório. O tablet usa TCP 7880/7881 e UDP 7882 em LAN. Se o DHCP mudar o endereço, ajuste `LIVEKIT_URL`, `LIVEKIT_API_URL` se usada e o bind do backend quando necessário. Reserva DHCP requer configuração autorizada. [Implantação e TURN no LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/)

## LiveKit experimental do tablet

O script `node scripts/tablet-livekit-patch.mjs protocol RAIZ_DO_MÓDULO` ou `node scripts/tablet-livekit-patch.mjs livekit RAIZ_DO_CHECKOUT` gera o diff correspondente na saída padrão. Ele usa `diff` do Debian e para se o código divergir da assinatura esperada. Revise e teste o diff em uma cópia antes de aplicar. Preserve o binário de trabalho e compile apenas para um nome de teste.

1. Em `haven.yaml`, garanta `node_stats:` com `host_cpu: true`.
2. Em `github.com/livekit/protocol/utils/hwstats/memory_linux.go`, na função `newPlatformMemoryGetter()`, após testar `e, err := fileExists(k)`, troque o retorno do ramo de erro de `return nil, err` por `return osStat, nil`. Faça uma cópia do arquivo antes da edição.
3. Em `pkg/telemetry/prometheus/node_linux.go`, use o corpo `return 0, 0, nil` em `func getTCStats() (packets, drops uint32, err error)`. Remova imports que ficarem sem uso. Os zeros dessa função são artificiais. Use estatísticas WebRTC para medir perda.
4. No checkout, com Go 1.26.9, rode `GOTOOLCHAIN=local GODEBUG=asyncpreemptoff=1 GOMAXPROCS=2 CGO_ENABLED=0 /opt/go126/go/bin/go build -p 2 -o livekit-haven-repro ./cmd/server`. Essa reconstrução ainda depende do checkout do tablet e o `/proc/stat` do PRoot pode ser virtualizado.

## Operação 0.4.0

- O backend concede administração de servidor por papel separado dos espaços. O primeiro papel é concedido pelo CLI local. O painel acessa estado, inventário de chamadas, auditoria resumida e backups por rotas autenticadas.
- O supervisor usa o LiveKit existente, verifica ambos os processos, limita logs e gera cópias SQLite consistentes. O procedimento de atualização preserva o ambiente e testa a migração em uma cópia.
- O backend pode servir uma pasta de versões. O desktop valida assinatura Ed25519, versão e SHA-256 antes de abrir o instalador. O endereço padrão do cliente pode ser alterado em build via VITE_HAVEN_SERVER e em execução nos ajustes.

- Acesso direto no Samsung é um perfil opt-in. Caddy termina HTTPS/WSS em portas não privilegiadas, o backend e a API do LiveKit ficam em loopback, e o roteador entrega ICE TCP/UDP ao LiveKit. .env.public sobrepõe a rede, preservando SQLite, .env e binário.

## Interface e mídia 0.5.0

- Os sons são buffers mono sintetizados no cliente a partir das frases criadas no Astra. Um som toca por vez. As chamadas usam o prazo existente do convite e notificações são silenciadas durante a captura de áudio do sistema.
- Com SSE ativo, a consulta periódica de estado passa de 12 para 24 s e deixa de requisitar novamente as conversas. Em caso de queda, a consulta a cada 12 s continua, e o SSE é reaberto com atraso progressivo.
- Os elementos de mídia permanecem montados durante a navegação. A tela oculta suspende a telemetria e a conversa. O LiveKit decide quando pausar a recepção de vídeo oculto. Os indicadores de fala atualizam somente o cartão do participante.
