# Nexo v1.4.0 — Simplificação de telas e reinício de dados

## Análise prévia
O app separava boletos em painéis próprios, apesar de o cadastro mensal já admitir forma de pagamento boleto. Cartões possuíam vínculos em lançamentos; remover toda a lógica de cartões quebraria registros existentes. Categorias em uso eram protegidas por uma regra que impedia sua exclusão. O armazenamento local é IndexedDB e sincroniza com Firebase Firestore; limpar apenas o dispositivo permite reimportação dos registros remotos.

## Mudanças
- Início: removido atalho de novo boleto e painel Boletos do mês.
- Gastos: removido painel Boletos do mês.
- Contas: removido painel Cartões de crédito, mantendo compatibilidade interna com dados antigos e formas de pagamento.
- Categorias: removido botão de limpeza de padrões; botão Nova categoria preservado. Excluir categoria em uso agora desassocia os lançamentos, sem apagá-los.
- Contas > Dados do aplicativo: opção explícita de apagar todos os dados financeiros deste usuário do Firestore e IndexedDB, com conexão obrigatória e confirmação digitada `APAGAR TUDO`. Preserva Firebase, login e UID. A operação é irreversível e não é executada automaticamente na instalação.

## Limitações e testes
Verificada sintaxe JS, integridade ZIP e presença/ausência dos elementos relevantes no código. Não foi realizado teste em navegador autenticado ou com Firestore real. Se a limpeza falhar parcialmente, verifique a sincronização antes de registrar novos dados. Faça backup antes de atualizar.

## Publicação
Copie o conteúdo da pasta `nexo-v1.4.0` para a raiz do projeto preservando `.git`, commit e push pelo GitHub Desktop. Atualize o PWA.
