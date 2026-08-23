# MGP Daily v0.4.0

PWA pessoal para organizar a rotina de manutenção predial com foco em jornada diária, prioridades, bloqueios, materiais, histórico e sincronização offline com Firebase.

## Base mantida da v0.3.0

- Login exclusivo pela conta autorizada no Firebase Authentication.
- Firestore restrito ao UID autorizado.
- IndexedDB local + fila de sincronização para uso offline.
- Prioridades: Emergência, Alta, Média e Baixa.
- Estados: Planejada, Em execução, Interrompida, Aguardando material, Aguardando ambiente, Sábado e Concluída.
- Histórico de movimentações das tarefas.
- Materiais essenciais e estoque mínimo.
- Backup e restauração em JSON.
- Tempo estimado em minutos ou **Tempo indeterminado**.

## Novidade da v0.3.1 — decisão operacional de emergência

Quando uma tarefa de prioridade **Emergência** surge enquanto outra tarefa está em execução, o MGP Daily não interrompe o serviço atual sozinho. Ele exige uma decisão:

- **Assumir emergência**: interrompe a tarefa atual, registra no histórico qual emergência provocou a interrupção e inicia a emergência.
- **Manter tarefa atual**: preserva o serviço em andamento e mantém a emergência destacada na tela Hoje para atendimento posterior.
- Uma emergência com decisão pendente ou adiada permanece visivelmente sinalizada até ser assumida.
- Iniciar manualmente uma emergência pela aba Tarefas enquanto outra atividade está em execução também exige a mesma decisão.

## Firebase

A configuração Web do projeto já está incorporada ao app. Para publicar em outro domínio, lembre-se de autorizá-lo em Authentication > Settings > Authorized domains.

## Segurança

O app aceita somente o UID autorizado. As regras do Firestore repetem a mesma restrição no servidor. A configuração Web do Firebase não é um segredo; a proteção dos dados depende do Authentication e das regras do Firestore.

## Offline

As alterações são gravadas primeiro no IndexedDB. Quando a internet retorna e a sessão está autenticada, a fila local é sincronizada com o Firestore.


## v0.4.0 — Central de Pendências

- Nova aba **Pendências** substitui a aba isolada de Sábado.
- Agrupa **Interrompidas**, **Aguardando material**, **Aguardando ambiente** e **Sábado**.
- `Retomar agora` para tarefas interrompidas.
- `Material disponível` devolve a tarefa para `Planejada` e para a Jornada.
- `Ambiente liberado` devolve a tarefa para `Planejada` e para a Jornada.
- `Executar agora` inicia tarefas de sábado quando a janela de execução estiver disponível.
- Nenhuma pendência é desbloqueada automaticamente por tempo: a mudança depende de confirmação explícita.
- A tela Hoje ganha atalho para a Central sempre que houver pendências.
