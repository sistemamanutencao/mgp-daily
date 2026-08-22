# MGP Daily v0.2.2 — Single User

PWA pessoal de apoio operacional para manutenção predial.

## O que mudou na v0.2.2

Esta versão foi convertida para **uso exclusivo de um único usuário**.

- Não existe cadastro público dentro do aplicativo.
- A conta é criada manualmente no Firebase Authentication.
- O acesso é autorizado pelo **UID** da conta, não apenas pelo e-mail.
- Qualquer login com UID diferente é recusado automaticamente.
- As regras do Firestore também restringem leitura e escrita ao mesmo UID.
- O aplicativo fica bloqueado até a configuração/login serem concluídos.
- Depois de um login autorizado, o dispositivo pode continuar operando offline.
- Tarefas e materiais continuam salvos primeiro no IndexedDB e sincronizados com o Firestore quando a internet volta.
- Backup JSON continua disponível como cópia independente.

## Como funciona o acesso

1. Você cria sua conta manualmente em Firebase Authentication.
2. O Firebase gera um UID único para essa conta.
3. Esse UID é informado no MGP Daily e também fixado nas regras do Firestore.
4. No login, o app compara o UID autenticado com o UID autorizado.
5. Se forem diferentes, o app encerra a sessão e nega o acesso.

O UID é preferível ao e-mail como chave de autorização porque é o identificador interno e imutável da conta Firebase.

## Funcionamento offline

Toda alteração é salva primeiro no IndexedDB do dispositivo. Quando houver internet e a conta autorizada estiver autenticada, a fila local é sincronizada com o Firestore.

Depois que este dispositivo tiver realizado ao menos um login autorizado, o MGP Daily registra localmente que ele já foi validado. Se o aplicativo for aberto sem internet, os dados locais continuam disponíveis. Quando a conexão voltar, o Firebase valida a sessão e sincroniza as alterações.

Atenção: alterações feitas offline e ainda não sincronizadas existem somente naquele dispositivo até a conexão retornar.

## Configuração do Firebase

### 1. Criar um App Web

No Firebase Console, abra **Configurações do projeto > Seus apps** e crie um App Web. Guarde:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

### 2. Ativar Authentication

Abra **Authentication > Sign-in method > Email/Password** e ative o provedor.

### 3. Criar somente sua conta

Abra **Authentication > Users > Add user** e crie sua conta com e-mail e senha.

Depois copie o **UID** exibido para esse usuário.

Não é necessário e não é recomendado habilitar criação de conta dentro do MGP Daily.

### 4. Criar o Firestore e restringir ao seu UID

Crie o Cloud Firestore. Depois abra `firestore.rules` e substitua **as duas ocorrências** de:

```text
r7phpAeSu2TKzettmItVRC6qZ6j2
```

pelo UID copiado do Firebase Authentication.

As regras ficarão conceitualmente assim:

```text
request.auth.uid == "SEU_UID"
userId == "SEU_UID"
```

Publique essas regras no Firebase Console.

### 5. Autorizar o domínio publicado

Em **Authentication > Settings > Authorized domains**, adicione o domínio onde a PWA será publicada, por exemplo `seuusuario.github.io`.

### 6. Configurar o MGP Daily

Na primeira abertura, o aplicativo mostrará **Configuração inicial**. Clique em **Configurar Firebase** e informe:

- UID autorizado (o mesmo UID usado nas regras)
- API Key
- Auth Domain
- Project ID
- App ID
- Messaging Sender ID
- Storage Bucket

Depois clique em **Entrar** e use a conta criada manualmente no Firebase.

## Estrutura dos dados

Os documentos permanecem em:

- `users/{uid}/tasks/{taskId}`
- `users/{uid}/materials/{materialId}`

Há duas barreiras de acesso: o aplicativo valida o UID e o Firestore valida novamente o UID nas regras. A segurança efetiva dos dados depende das regras do Firestore; a verificação no aplicativo é uma proteção adicional de interface.

## Teste recomendado

1. Entre no computador e crie uma tarefa.
2. Aguarde `Nuvem OK`.
3. Abra o PWA em outro dispositivo.
4. Configure o mesmo projeto e o mesmo UID autorizado.
5. Entre com a mesma conta.
6. Confirme que a tarefa aparece.
7. Desconecte a internet, altere uma tarefa e reconecte.
8. Confirme a sincronização.
9. Opcionalmente tente outra conta Firebase: o app deve exibir **Acesso negado** e o Firestore também deve negar acesso.

## Publicação

A PWA continua estática. Publique na mesma raiz:

- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- pasta `assets`

O arquivo `firestore.rules` não precisa ser publicado no site; ele serve para configurar as regras no Console do Firebase.
