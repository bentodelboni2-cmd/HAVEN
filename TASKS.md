# Tarefas e validação

## Implementado

- Contas por convite, sessões, amigos e presença. Espaços com papéis e permissões, canais de texto e voz, mensagens diretas, não lidas, mural, biblioteca e agenda.
- Electron Windows com seleção explícita de tela/janela e opção de áudio do sistema, chamadas privadas e em grupo, áudio, câmera, volume por participante, foco, tela cheia, reações e modo flutuante. PTT está disponível com o app em foco.
- Backend separado com migração, backup, configuração de rede e scripts para Debian ARM64/PRoot. Arte de Início, Espaço e Chamada orientada pelo Astra, com banner local.

## Evidência

- `pnpm check`, teste de integração e build passaram. O teste verifica validade dos convites, permissões de espaço e arquivo, amizade, revogação de sessão, persistência do histórico e identidade/escopo/expiração do JWT.
- Em 25/11/2026, duas instâncias Electron no PC, com contas distintas e o LiveKit real do tablet, criaram espaço, aceitaram amizade, trocaram DM e mantiveram a chamada durante a navegação. O receptor recebeu uma trilha de microfone.
- Em duas amostras de janela em movimento solicitando 1080p60, o receptor reportou 1824×1080, 15 e 39 FPS, 0,02 e 0,18 Mbps, RTT de 13 ms e zero pacotes perdidos nos instantes medidos. Na amostra de 39 FPS, eram 299 quadros decodificados. A trilha de áudio do sistema foi recebida, com pico detectado na frequência do tom de teste de 440 Hz (aproximadamente −57 dBFS). A audição física e os 60 FPS sustentados seguem pendentes.
- Início, Espaço e Chamada foram abertos a 1280×720. Início foi verificado também a 2560×1080. O executável empacotado repetiu o teste com dois clientes e alternou o HUD de 460×160 para o modo normal. Instalador NSIS x64 sem assinatura gerado. A execução temporária do instalador para QA foi bloqueada por política do ambiente.
- Os scripts shell passaram em verificação de sintaxe. Os diffs do tablet passaram em `git apply --check` contra os arquivos públicos upstream correspondentes. A revisão específica do tablet ainda não foi verificada.

## Interface 0.2.0

O executável passou no fluxo de cadastro por convite, saída e novo login com uma conta isolada. Testes cobriram chave incompleta, inválida e já usada, senha incorreta, servidor de contas indisponível, recuperação, navegação pela Home e verificação de largura em 850×580 e 3440×1440. A composição foi inspecionada em 1280×720. Dois clientes confirmaram criação de espaço, amizade e DM. O LiveKit do tablet recusou a conexão nesta rodada. O cliente exibiu o erro de mídia em português e permitiu voltar à Home.

## Estabilidade 0.3.0

- Sessão Windows persistida com Electron safeStorage. Dois reinícios confirmaram restauração e rejeição após revogação. Foram verificados logout com servidor ativo, remoção do arquivo criptografado e saída local com o servidor offline. Quando o servidor está offline, um token anterior que não pôde ser revogado ainda segue o prazo do servidor.
- Teste de integração do backend cobre convites inválidos, expirados e usados, sessão, permissões, histórico SQLite, amizade, mensagens, anexos e tokens de mídia. Inclui regressões para reenvios concorrentes, chamada em sentido inverso, recusa, cancelamento e expiração em 60 s.
- Três clientes do Electron empacotado, em um mesmo PC Windows, conectaram a um LiveKit 1.13.11 isolado. Foram verificados cadastro, espaço, amizade, remoção de amigo, DM, não lidas, cancelamento sincronizado, aceite de chamada em grupo, silenciamento e volume locais, HUD e saída. Uma janela de teste foi transmitida com e sem áudio, com parada e repetição, ampliação, retorno e troca de qualidade ao vivo. As amostras de vídeo foram 1824×1080 com 15 a 46 FPS, 0,07 a 2,57 Mbps e RTT de 0 a 1 ms em loopback.
- Na medição final com o executável empacotado, a fonte externa de 440 Hz chegou a −44 dBFS. Ao ligar o tom de 920 Hz no HAVEN, a banda correspondente passou de −64 para −57 dBFS, dentro da tolerância do teste. O Electron oferece loopback do sistema e exclusão do próprio aplicativo em Windows compatível. A API usada não oferece áudio isolado de uma janela externa. Em sistemas sem isolamento nativo ou quando o usuário escolhe o modo alternativo, o áudio que o HAVEN reproduz no transmissor fica pausado enquanto o áudio do sistema é publicado.
- Permanecem pendentes câmera física, captura em múltiplos monitores e GPUs distintas, perda de rede entre PCs, chamadas em dispositivos físicos separados, estabilidade prolongada e desempenho através do tablet e do Tailscale. O tablet não respondeu aos testes desta rodada. O painel de conversa pode ser recolhido e acompanha o tamanho da janela. A divisão manual por arraste não está disponível.
- Para repetir os testes Windows com o app compilado, execute `node scripts/qa/sessions.mjs`, `node scripts/qa/group.mjs` e `node scripts/qa/capture.mjs --capture` de forma sequencial. Para grupo e captura, execute `livekit-server --dev --config scripts/qa/livekit.yaml --bind 127.0.0.1 --node-ip 127.0.0.1` em outro terminal. Acrescente `--package` aos testes para usar a pasta `release/0.3.0/win-unpacked`.

## Homologação pendente

1. Com dois PCs na LAN, use o perfil 1080p60 e uma fonte 16:9 em movimento contínuo. Use fones. Confirme voz em ambos os sentidos e, com o microfone do transmissor silenciado, confirme que o receptor ouve um trecho de teste do sistema. Verifique eco e teste também janela, monitor ultrawide, desconexão de dispositivo e mudança de rede.
2. Compare a configuração solicitada aos valores do receptor durante 10 minutos. Registre resolução, FPS, quadros decodificados, bitrate, RTT e aumento de perda e teste com dois espectadores. Zero perda em uma amostra não demonstra ausência de perda.
3. No tablet, valide SQLite ARM64, restauração, tela desligada, Android em segundo plano, temperatura, CPU/memória, vários participantes e reinício, mantendo o PC de desenvolvimento desligado. Os contadores TC modificados do LiveKit retornam valores artificiais.
4. Implementar E2EE com distribuição e rotação de chaves autenticadas e validar acesso externo com TLS, ICE/TURN e revogação. A configuração atual é para laboratório em rede confiável.

## Operação 0.4.0

- Validado no Windows empacotado: cadastro, sessão persistente, login, saída offline, painel exclusivo de administrador, lote de convites, backup, reconexão após queda do backend e bloqueio de instalador alterado.
- Validados em ambiente isolado: reinício do LiveKit sem reiniciar contas, backup inicial e migração v1 → v2 com configuração e convite preservados. Build e publicação assinada passaram no destino local.
- Pendente no tablet: instalar o pacote, conceder o primeiro papel, configurar o destino de atualização e validar boot, retenção e chamadas entre duas redes pelo Tailscale.
