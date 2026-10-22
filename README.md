# Nexo v1.3.1 — Correção de edição de dívidas recorrentes

Correção: cada série mensal terá no máximo uma ocorrência por competência. A edição preserva o ID da ocorrência e sua competência original, mesmo se o vencimento for alterado. Ocorrências canceladas bloqueiam a projeção automática correspondente. Também evita envio duplicado por duplo clique em Salvar.

**Não apaga nem mescla automaticamente dívidas já duplicadas na nuvem.** Faça backup e revise duplicatas preexistentes manualmente. Firebase, UID, coleções, ícones e estrutura de dados permanecem inalterados.

Instalação: backup da pasta C:\MGP\mgp-daily; copiar arquivos para a raiz do repositório preservando .git; GitHub Desktop commit/push. Testar em navegador e confirmar sincronização antes de excluir qualquer lançamento.
