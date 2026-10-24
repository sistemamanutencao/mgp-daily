# Nexo 1.7.0 — Ícones bancários e gráfico de saldos

- Cinco ícones recortados das imagens enviadas pelo usuário, armazenados localmente em `assets/banks/` para funcionamento offline. Recortes têm origem em capturas de tela e podem ter artefatos de compressão.
- Exibição uniforme e sem bordas extras nas contas.
- Nome Caixa abreviado, com compatibilidade de leitura para contas antigas que guardam Caixa Econômica Federal.
- Novo gráfico de barras de saldo por conta, com degradês metálicos das cores dos bancos. Não altera o gráfico de despesas por categoria.
- Barras mostram somente valores positivos; saldos negativos aparecem numericamente. Sem mutações de dados ou mudanças nas regras financeiras, Firebase, autenticação ou esquema IndexedDB.
- Cache do service worker atualizado e ícones incluídos no pré-cache.

Validação: verificação de sintaxe JavaScript e service worker, integridade ZIP, referências a imagens e verificação estática de regras de negócio. Não foi realizado teste com login Firebase real.
