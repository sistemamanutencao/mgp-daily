# Nexo 1.9.0 — Formatação de anotações

O editor das anotações agora permite negrito, itálico, sublinhado e listas. Selecione um trecho e pressione os botões da barra de ferramentas; atalhos de teclado também funcionam. A cor de fundo e a edição das anotações continuam disponíveis.

Compatibilidade: `body` continua como texto puro e `bodyHtml` guarda somente HTML sanitizado, preservando anotações antigas. A limpeza de HTML impede scripts, atributos, links e estilos injetados. Nenhuma alteração nas contas, autenticação ou cálculos.

Verificações: sintaxe JS e integridade ZIP; ainda não há teste em navegador autenticado ou sincronização Firebase real. O editor usa o comando nativo `execCommand` por compatibilidade com navegadores móveis e desktop; comportamento de seleção deve ser verificado no celular.
