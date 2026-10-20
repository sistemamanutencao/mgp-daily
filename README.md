# Nexo v1.1.0 — Contas fixas e ícone

- Nova identidade visual (carteira azul e cartões verdes), ícones 192, 512 e maskable.
- UID autorizado corrigido para o usuário confirmado.
- Novo campo **Repetição: Conta fixa mensal** ao registrar uma despesa.
- Contas fixas aparecem nos meses seguintes como **Previsto**, sem reduzir o saldo bancário até confirmação.
- Gastos avulsos permanecem apenas no mês de competência.
- Para registrar pagamento de uma ocorrência futura, abra-a no mês correspondente, marque **Pago / recebido** e salve. Isso cria uma ocorrência específica e evita repetição no mesmo mês.
- É possível alterar o valor de uma ocorrência futura sem mudar o lançamento original.
- Para interromper uma recorrência, edite o lançamento original e defina a data de fim.

**Limitações:** recorrência mensal de despesas apenas nesta versão. Parcelamentos de cartão e cálculo completo de faturas ainda não estão implementados. O gráfico de compras por competência continua simplificado.

**Instalação:** faça backup da pasta do projeto; substitua os arquivos do repositório, sem apagar `.git`; publique via GitHub Desktop. O aplicativo usa o Firebase existente.


## v1.2.0 — Boletos mensais
- Ao cadastrar uma despesa, selecione Boleto, informe vencimento, conta e situação Pendente.
- Em Repetição, escolha Mensal para projetar os boletos de cada mês.
- O painel Boletos do mês mostra Total previsto, Saldo devedor e Pago para o mês selecionado.
- Clique na ocorrência futura para registrar pagamento ou ajustar apenas aquele mês.
- Os boletos pendentes entram nos gastos previstos, mas não diminuem o saldo bancário até o pagamento.
- A alteração de uma ocorrência futura cria um registro específico e preserva os demais meses.
- A recorrência pode ser encerrada definindo a data final no lançamento original.
- Faça backup antes da atualização. Não substitua a pasta .git.


## v1.2.1 — Identificação visual de valores
Entradas do mês e receitas em verde; gastos do mês, valores por categoria e saídas do extrato em vermelho. Sem alteração dos cálculos, dados ou Firebase.
