# Handoff

A 0.4.0 inclui automação do desktop, painel administrativo, supervisor do tablet e publicação assinada. As evidências estão em [TASKS.md](TASKS.md).

Próximo passo: atualizar o tablet conforme [Operação 0.4.0](OPERACAO-0.4.0.md), conceder o primeiro papel administrativo e iniciar o supervisor. A publicação foi testada localmente. A pasta efetiva de atualizações e o boot Android ainda precisam ser configurados e validados.

O perfil de acesso direto está em [deploy/SAMSUNG.md](deploy/SAMSUNG.md). Após recuperar o painel do roteador, escolha os dois nomes DNS, prepare o perfil no tablet e faça a troca de rede com o mesmo banco.

O cliente 0.4.1 também funciona com o domínio de desenvolvimento do ngrok. O túnel temporário do Windows aponta somente para o servidor de contas do tablet. Para reiniciar, execute `ngrok http http://192.168.0.4:8787 --inspect=false --url=https://`. A mídia externa ainda depende da etapa do LiveKit.
