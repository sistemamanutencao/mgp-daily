# Nexo v1.0.0 — primeira versão funcional

Substitui a interface do MGP Daily mantendo as credenciais públicas do projeto Firebase, o login e as regras Firestore existentes. **Não apaga as coleções antigas.**

## Instalação
1. Faça backup completo da pasta `C:\MGP\mgp-daily`.
2. Copie o conteúdo deste pacote para `C:\MGP\mgp-daily`, substituindo os arquivos, mas **preserve a pasta `.git`**.
3. Remova arquivos antigos não utilizados (por exemplo, o modelo Excel de pedidos) se desejar; isso não é necessário para o funcionamento.
4. Publique com GitHub Desktop: Commit to master → Push origin.
5. Abra a PWA online e entre com a mesma conta.

## Incluído nesta versão
- Contas bancárias e saldos iniciais;
- Receitas e despesas manuais, pendentes ou pagas;
- Gastos por categoria, mês e visualização;
- Cadastro de cartões (limite, fechamento, vencimento);
- Categorias editáveis;
- Extrato, edição e exclusão;
- IndexedDB isolado (`nexo-finance-db`), sincronização Firestore em novas coleções;
- Login com o mesmo UID.

## Ainda não incluído
- Parcelamento automático de compras; a alternância entre compras e parcelas está preparada, mas **não distribui parcelas automaticamente**.
- Faturas e pagamento de faturas, recorrências, projeções de saldo e exportação Excel.
- Transferências entre contas e reconciliação bancária.

**Atenção:** compras no crédito não reduzem o saldo da conta. Não registre pagamentos de fatura como despesa comum nesta versão, para evitar dupla contagem; o módulo de faturas será implementado posteriormente.

## Segurança
As regras de Firestore atuais limitam o acesso ao UID já configurado. Não altere a configuração pública do Firebase nem substitua `firestore.rules` sem revisão. O banco local antigo permanece intacto, mas não é carregado pelo Nexo.
