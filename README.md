# MGP Daily v0.3.0 — Firebase pré-configurado

PWA pessoal de manutenção predial, restrita ao UID autorizado.

## Alterações desta versão

- Firebase Web já incorporado ao aplicativo.
- UID autorizado já incorporado ao aplicativo e às regras do Firestore.
- Removida a tela de configuração manual do Firebase.
- A primeira tela agora pede apenas e-mail e senha da conta criada no Firebase Authentication.
- IndexedDB continua sendo a camada local/offline.
- Firestore permanece como sincronização e recuperação em nuvem.

## Ainda falta no Firebase Console

1. Criar o Cloud Firestore, se ainda não foi criado.
2. Publicar o conteúdo de `firestore.rules`.
3. Em Authentication > Settings > Authorized domains, autorizar o domínio onde a PWA será publicada.
4. Publicar os arquivos do ZIP.
5. Entrar no MGP Daily com a conta já criada no Authentication.

## Segurança

O app aceita somente o UID autorizado. As regras do Firestore repetem a mesma restrição no servidor. A configuração Web do Firebase não é um segredo; a proteção dos dados depende do Authentication e das regras do Firestore.

## Offline

As alterações são gravadas primeiro no IndexedDB. Quando a internet retorna e a sessão está autenticada, a fila local é sincronizada com o Firestore.


## Novidades da v0.3.0

- Campo **Tempo indeterminado** para tarefas cuja duração não pode ser prevista.
- Quando marcado, o campo de minutos é desativado e a tarefa exibe **Tempo indeterminado**.
- Tarefas antigas continuam compatíveis e mantêm seus tempos estimados.
- Mantidos login exclusivo, Firestore e sincronização offline.
