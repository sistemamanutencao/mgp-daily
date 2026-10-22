# Nexo v1.3.2 — Categorias personalizadas

Análise: as nove categorias predefinidas eram criadas automaticamente na inicialização quando a base local estava vazia. A edição de lançamentos dependia de IDs de categoria, portanto apagar categorias utilizadas quebraria o histórico.

Mudanças:
- Desativada a criação automática de categorias padrão.
- Cadastro de categoria (nome e cor) diretamente no formulário de dívida/despesa/receita; nomes existentes são reutilizados, sem duplicar.
- Botão em Contas > Categorias para remover categorias padrão **não utilizadas**. As que já possuem lançamentos são preservadas para não corromper o histórico; podem ser renomeadas ou os lançamentos reclassificados antes da exclusão.
- Nenhuma alteração no Firebase, UID ou formato dos lançamentos.

Instalação: faça backup do projeto, substitua arquivos na raiz do repositório mantendo .git, publique pelo GitHub Desktop. Teste online/offline e sincronização. Não há migração destrutiva automática.
