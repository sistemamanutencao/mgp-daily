# MGP Daily v0.5.0

PWA pessoal para organização operacional da manutenção predial, com jornada diária, prioridades, pendências, materiais, histórico, login exclusivo e sincronização offline com Firebase.

## Mantido das versões anteriores

- Login exclusivo pela conta autorizada no Firebase Authentication.
- Firestore restrito ao UID autorizado.
- IndexedDB local + fila de sincronização para uso offline.
- Prioridades: Emergência, Alta, Média e Baixa.
- Estados: Planejada, Em execução, Interrompida, Aguardando material, Aguardando ambiente, Sábado e Concluída.
- Decisão operacional ao surgir uma emergência durante outra tarefa.
- Central de Pendências com retomada e desbloqueio consciente.
- Histórico de movimentações das tarefas.
- Estoque essencial com nível mínimo.
- Tempo estimado em minutos ou Tempo indeterminado.
- Backup e restauração em JSON.

## v0.5.0 — Materiais para Solicitação

A aba Materiais passa a ter duas áreas independentes:

1. **Estoque essencial** — mantém o controle operacional já existente.
2. **Para solicitar** — lista de materiais que precisam entrar no próximo pedido de compras.

### Registro rápido

Cada item para solicitação guarda:

- Produto/Serviço
- Quantidade
- Especificação
- vínculo opcional com uma tarefa em `Aguardando material`

Na Central de Pendências, uma tarefa em `Aguardando material` recebe a ação **Anotar material**, permitindo criar o item de compra já relacionado à tarefa.

### Exportação para Excel

O app inclui o modelo original `assets/pedido-compras-template.xlsx` e gera uma cópia preservando a estrutura da planilha. Antes da exportação são informados:

- DATA
- Nº DA SOLICITAÇÃO
- DATA DA UTILIZAÇÃO

Os itens selecionados preenchem automaticamente:

- PRODUTO/SERVIÇO — `E10:E38`
- QUANTIDADE — `F10:F38`
- ESPECIFICAÇÃO — `H10:H38`
- DATA DA UTILIZAÇÃO — `K10:K38`

A DATA é preenchida em `I5` e o Nº DA SOLICITAÇÃO em `K5`.

O modelo possui 29 linhas para itens. Se houver mais materiais pendentes, gere mais de uma solicitação.

Depois de gerar o Excel, o app pergunta se os itens devem ser marcados como **Solicitados**. Eles permanecem no histórico e podem ser devolvidos para **Para solicitar** se necessário.

### Offline

A lista de materiais para solicitação também é gravada primeiro no IndexedDB e sincronizada com o Firestore. O modelo Excel é armazenado no cache da PWA. O componente JSZip é carregado pelo jsDelivr e armazenado pelo service worker após a primeira execução online da v0.5.0; portanto, para garantir exportação offline, abra a versão uma vez com internet antes de depender dela sem conexão.

## Publicação

Use a pasta fixa do repositório local e copie apenas os arquivos desta versão para ela, sem substituir a pasta `.git`.

Diretório recomendado já adotado no projeto:

`C:\MGP\mgp-daily`
