# Nexo v1.5.0 — Revisão de código e categorias

## Diagnóstico
As categorias exibidas na versão anterior já estavam gravadas no IndexedDB e/ou no Firestore. Remover a criação automática do código não elimina registros persistidos. Também havia trechos órfãos do antigo gerenciamento de cartões e da sincronização `replaceAll`.

## Modificações
- Sem categorias padrão no código e sem recriação automática.
- Nova opção **Contas > Categorias > Limpar categorias existentes**: exclui todas as categorias da nuvem e do dispositivo mediante confirmação, preservando os lançamentos e desvinculando suas categorias. É uma ação separada e voluntária, não executada ao instalar.
- Mantidos **Nova categoria** e **Criar categoria agora** ao cadastrar uma dívida.
- Retirados formulário e listeners de edição de cartões, opção de crédito do cadastro de novas despesas, cálculo morto de cartão e ramo `replaceAll` sem produtor na fila.
- Coleção `cards` mantida no mecanismo de sincronização apenas para compatibilidade com dados legados e para permitir limpeza completa na opção existente **Apagar todos os dados financeiros**.
- Firebase, UID, saldos, recorrências e login mantidos.

## Testes e limitações
- `node --check app.js`: aprovado.
- ZIP: verificação de integridade.
- Inspeção estática de referências e telas.
- Não foi possível executar testes autenticados em Firestore nem testes end-to-end de navegador neste ambiente. Recomenda-se testar primeiro a limpeza das categorias, depois criar uma nova categoria em uma despesa e confirmar sincronização.

## Instalação
Faça backup da pasta `C:\MGP\mgp-daily`, substitua os arquivos sem excluir `.git`, publique com GitHub Desktop. Após atualizar, entre em **Contas > Categorias** e execute **Limpar categorias existentes** para retirar os registros já persistidos. O aplicativo não executará exclusão automática.
