# Handoff

A 0.4.0 inclui automação do desktop, painel administrativo, supervisor do tablet e publicação assinada. As evidências estão em [TASKS.md](TASKS.md).

Próximo passo: atualizar o tablet conforme [Operação 0.4.0](OPERACAO-0.4.0.md), conceder o primeiro papel administrativo e iniciar o supervisor. A publicação foi testada localmente. A pasta efetiva de atualizações e o boot Android ainda precisam ser configurados e validados.

O perfil de acesso direto está em [deploy/SAMSUNG.md](deploy/SAMSUNG.md). Após recuperar o painel do roteador, escolha os dois nomes DNS, prepare o perfil no tablet e faça a troca de rede com o mesmo banco.

No teste com Playit, o ngrok passou a apontar para o Caddy no Windows (`127.0.0.1:8791`). O proxy encaminha as contas e a sinalização WSS para o tablet. O agente Playit e o repetidor UDP local do Windows encaminham mídia para a porta 14066 do tablet. As configurações locais do Windows ficam em `work/playit-haven`; no Debian, os scripts `~/.haven-playit/accounts.sh` e `livekit.sh` carregam o perfil separado. O SQLite existente foi preservado e o backup passou em `quick_check`. O teste externo com outro Wi-Fi e a inicialização após reboot continuam pendentes.

O cliente 0.4.2 já preenche o endereço HTTPS do ngrok e oferece Lembrar de mim. A sessão usa o token atual do servidor, com validade de sete dias.

A versão 0.4.3 precisa do backend atualizado para emitir sessões sem vencimento. O tablet ativo ainda serve a versão anterior. A atualização preserva as contas e está em [deploy/SESSOES.md](deploy/SESSOES.md).

A 0.5.0 prepara o pacote assinado para o mesmo app. O feed no servidor ativo respondeu 404. Para ativar atualizações integradas e avisos de chat de chamada em outras páginas, use [deploy/ATUALIZAR-0.5.0.md](deploy/ATUALIZAR-0.5.0.md). A homologação em redes externas continua descrita em TASKS.md.

A 0.5.1 acrescenta alças de redimensionamento com persistência local. Arraste uma quina ou use as setas com foco na alça. Clique duas vezes na alça ou pressione Home para restaurar o tamanho.

A revisão de interface da 0.5.1 aparece em Perfil e ajustes. Seu manifesto usa a versão interna 0.5.2 para o atualizador existente. O ngrok passou a encaminhar para o Caddy em `127.0.0.1:8792`. O perfil `work/playit-haven/Caddyfile.update` serve o manifesto assinado, o instalador referenciado e as rotas de contas e mídia.
