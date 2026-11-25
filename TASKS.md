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

## Homologação pendente

1. Com dois PCs na LAN, use o perfil 1080p60 e uma fonte 16:9 em movimento contínuo. Use fones. Confirme voz em ambos os sentidos e, com o microfone do transmissor silenciado, confirme que o receptor ouve um trecho de teste do sistema. Verifique eco e teste também janela, monitor ultrawide, desconexão de dispositivo e mudança de rede.
2. Compare a configuração solicitada aos valores do receptor durante 10 minutos. Registre resolução, FPS, quadros decodificados, bitrate, RTT e aumento de perda e teste com dois espectadores. Zero perda em uma amostra não demonstra ausência de perda.
3. No tablet, valide SQLite ARM64, restauração, tela desligada, Android em segundo plano, temperatura, CPU/memória, vários participantes e reinício, mantendo o PC de desenvolvimento desligado. Os contadores TC modificados do LiveKit retornam valores artificiais.
4. Implementar E2EE com distribuição e rotação de chaves autenticadas e validar acesso externo com TLS, ICE/TURN e revogação. A configuração atual é para laboratório em rede confiável.
