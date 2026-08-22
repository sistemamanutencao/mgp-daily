# MGP Daily v0.2.0

PWA de apoio operacional para manutenção predial.

## Novidades da v0.2.0

- Login por e-mail e senha com Firebase Authentication.
- Sincronização de tarefas e materiais com Cloud Firestore.
- Operação offline preservada via IndexedDB local.
- Fila de sincronização: alterações feitas sem internet são enviadas quando a conexão volta.
- Mesma conta pode recuperar os dados em outro dispositivo.
- Indicador de estado da nuvem no topo do app.
- Configuração do Firebase feita pela própria interface, sem editar código.
- Backup JSON continua disponível como cópia independente.

## Como os dados funcionam

1. Toda alteração é salva primeiro no IndexedDB do dispositivo.
2. Uma operação pendente é registrada na fila local de sincronização.
3. Quando há internet e o usuário está autenticado, a fila é enviada ao Firestore.
4. Alterações vindas de outro dispositivo são recebidas em tempo real.
5. Se o navegador for limpo, basta entrar novamente com a mesma conta para recuperar os dados que já estavam sincronizados.

Atenção: alterações criadas offline e ainda não sincronizadas continuam existindo somente no dispositivo até a conexão voltar.

## Configuração do Firebase

### 1. Criar ou escolher um projeto

Acesse o Firebase Console e crie um projeto específico para o MGP Daily ou escolha um projeto destinado a ele.

### 2. Criar um App Web

Em Configurações do projeto > Seus apps, crie um app Web. O Firebase exibirá uma configuração semelhante a:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

No MGP Daily, clique no indicador de nuvem no topo > Configurar e copie cada valor para o campo correspondente.

### 3. Ativar login por e-mail e senha

Firebase Console > Authentication > Sign-in method > Email/Password > Ativar.

### 4. Autorizar o domínio onde o PWA será publicado

Firebase Console > Authentication > Settings > Authorized domains.

Adicione o domínio do site publicado, por exemplo:

- `seuusuario.github.io`

Não inclua `https://` nem o caminho do repositório.

### 5. Criar o Cloud Firestore

Firebase Console > Firestore Database > Create database.

Depois substitua as regras pelas regras contidas em `firestore.rules` deste projeto:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Publique as regras.

### 6. Criar a conta no app

Abra o MGP Daily > indicador de nuvem > informe e-mail e senha > Criar minha conta.

Depois de autenticado, o indicador deve mudar para `Nuvem OK` quando a sincronização terminar.

## Teste de sincronização recomendado

1. Cadastre uma tarefa no computador.
2. Espere aparecer `Nuvem OK`.
3. Abra o PWA em outro navegador/dispositivo.
4. Configure o mesmo Firebase e entre com a mesma conta.
5. A tarefa deve ser baixada automaticamente.
6. Desconecte a internet, altere uma tarefa e reconecte. A alteração deve ser sincronizada automaticamente.

## Segurança

Os documentos são armazenados em:

- `users/{uid}/tasks/{taskId}`
- `users/{uid}/materials/{materialId}`

As regras incluídas impedem que um usuário autenticado leia ou altere os dados de outro `uid`.

A configuração Web do Firebase identifica o projeto e não substitui as regras de segurança. A proteção dos dados depende principalmente do Authentication e das regras do Firestore.

## Publicação

Esta versão continua sendo uma PWA estática. Publique `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` e a pasta `assets` na mesma raiz do site.
