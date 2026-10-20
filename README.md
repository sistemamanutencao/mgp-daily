# Nexo v1.3.0 — Contas mensais

Atualização sobre a v1.2.1, preservando o Firebase, o UID autorizado, as coleções e os ícones.

- Aba **Mensais**: obrigações recorrentes, previstas, pendentes e pagas.
- Ao marcar **Conta mensal — repetir automaticamente**, a despesa aparece nos meses seguintes, sem duplicar lançamentos no banco.
- **Número de meses** opcional para empréstimos com prazo definido; **fim da recorrência** opcional.
- Alterações em um mês criam uma exceção independente para aquela competência.
- Excluir uma ocorrência projetada impede apenas a exibição daquela competência.
- Exclusão de despesas sem confirmação, conforme solicitado.
- Despesas pendentes não reduzem o saldo bancário até o registro do pagamento.

## Instalação

Faça backup da pasta local. Copie os arquivos desta pasta para a raiz do repositório local, sem substituir a pasta `.git`. Publique pelo GitHub Desktop (Commit e Push). O Firebase e os dados remotos não são redefinidos.

## Atenção

O total "A pagar no mês" refere-se apenas às despesas pendentes com competência no mês selecionado; atrasados de meses anteriores não são transportados para o total do mês seguinte. Eles permanecem em seus meses de origem.

Verificação automatizada: sintaxe JavaScript com `node --check`. Teste manual de navegador e sincronização Firebase ainda necessário.
