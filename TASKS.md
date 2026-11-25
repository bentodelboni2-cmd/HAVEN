# Tarefas e validação

## Implementado

- Contas por convite, sessões, amigos e presença. Espaços com papéis e permissões, canais de texto e voz, mensagens diretas, não lidas, mural, biblioteca e agenda.
- Electron Windows com seleção explícita de tela/janela e opção de áudio do sistema, chamadas privadas e em grupo, áudio, câmera, volume por participante, foco, tela cheia, reações e modo flutuante. PTT está disponível com o app em foco.
- Backend separado com migração, backup, configuração de rede e scripts para Debian ARM64/PRoot. Arte de Início, Espaço e Chamada orientada pelo Astra, com banner local.

## Evidência

- `pnpm check`, teste de integração e build passaram. O teste verifica validade dos convites, permissões de espaço e arquivo, amizade, revogação de sessão, persistência do histórico e identidade/escopo/expiração do JWT.
- Em 25/11/2026, duas instâncias Electron no PC, com contas distintas e o LiveKit real do tablet, criaram espaço, aceitaram amizade, trocaram DM e mantiveram a chamada durante a navegação. O receptor recebeu uma trilha de microfone.
- Em uma amostra de janela em movimento com o perfil 1080p60, o receptor reportou 1824×1080, 39 FPS, 299 quadros decodificados, 0,18 Mbps, 13 ms de RTT e zero pacotes perdidos naquele instante. A trilha de áudio do sistema foi publicada e recebida. A verificação do tom de teste ficou inconclusiva.
- Início, Espaço e Chamada foram abertos e inspecionados a 1280×720. O executável empacotado repetiu o teste com dois clientes. O instalador NSIS x64 sem assinatura foi gerado. A execução temporária do instalador para QA foi bloqueada por política do ambiente.

## Homologação pendente

1. Com dois PCs na LAN, use o perfil 1080p60 e uma fonte 16:9 em movimento contínuo. Use fones. Confirme voz em ambos os sentidos e, com o microfone do transmissor silenciado, confirme que o receptor ouve um trecho de teste do sistema. Verifique eco e teste também janela, monitor ultrawide, desconexão de dispositivo e mudança de rede.
2. Compare a configuração solicitada aos valores do receptor durante 10 minutos. Registre resolução, FPS, quadros decodificados, bitrate, RTT e aumento de perda e teste com dois espectadores. Zero perda em uma amostra não demonstra ausência de perda.
3. No tablet, valide SQLite ARM64, restauração, tela desligada, Android em segundo plano, temperatura, CPU/memória, vários participantes e reinício, mantendo o PC de desenvolvimento desligado. Os contadores TC modificados do LiveKit retornam valores artificiais.
4. Implementar E2EE com distribuição e rotação de chaves autenticadas e validar acesso externo com TLS, ICE/TURN e revogação. A configuração atual é para laboratório em rede confiável.
