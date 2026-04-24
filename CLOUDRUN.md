# Cloud Run

## O que ja esta pronto

- O backend ja respeita a porta do Cloud Run via `PORT`
- O frontend e servido pelo mesmo `server.js`
- O Firebase Admin pode usar `Application Default Credentials` no Cloud Run
- A importacao de nota ficou somente por XML
- O sistema pode abrir por link no Android e no iPhone

## Melhor forma de publicar

Use uma `service account` do proprio Google no Cloud Run.
Assim voce nao precisa subir `serviceAccountKey.json` nem colar chave privada em variavel de ambiente.

## Passo a passo

### 1. Preparar o projeto no Google Cloud

1. Crie ou escolha um projeto no Google Cloud.
2. Ative o faturamento do projeto.
3. Se o Firebase ainda nao estiver ligado a esse projeto, vincule o mesmo projeto no console do Firebase.

### 2. Abrir o terminal com `gcloud`

Voce pode usar um destes caminhos:

- `Cloud Shell` no navegador
- `Google Cloud CLI` instalado no seu computador

Se estiver localmente, rode:

```powershell
gcloud auth login
gcloud config set project SEU_PROJECT_ID
```

### 3. Habilitar os servicos necessarios

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com
```

### 4. Criar a service account do app

```powershell
gcloud iam service-accounts create hamburgueria-app --display-name "Hamburgueria App"
```

O email dela vai ficar assim:

```text
hamburgueria-app@SEU_PROJECT_ID.iam.gserviceaccount.com
```

### 5. Dar permissao para o backend falar com Firebase

Para este projeto, o backend precisa criar usuarios no Firebase Auth e ler/gravar no Firestore.
Rode:

```powershell
gcloud projects add-iam-policy-binding SEU_PROJECT_ID --member "serviceAccount:hamburgueria-app@SEU_PROJECT_ID.iam.gserviceaccount.com" --role "roles/firebaseauth.admin"
gcloud projects add-iam-policy-binding SEU_PROJECT_ID --member "serviceAccount:hamburgueria-app@SEU_PROJECT_ID.iam.gserviceaccount.com" --role "roles/datastore.user"
```

Se a conta que vai fazer o deploy nao for `Owner` do projeto, ela tambem precisa poder usar essa service account.

### 6. Publicar no Cloud Run

Na raiz deste projeto, rode:

```powershell
gcloud run deploy hamburgueria-app --source . --region southamerica-east1 --allow-unauthenticated --service-account hamburgueria-app@SEU_PROJECT_ID.iam.gserviceaccount.com
```

Observacoes:

- `southamerica-east1` e Sao Paulo
- `--allow-unauthenticated` deixa o sistema abrir pelo link publico
- O Cloud Run vai usar o `Dockerfile` deste projeto na hora do build

### 7. Abrir o sistema

No fim do deploy, o Google vai mostrar uma URL publica parecida com:

```text
https://hamburgueria-app-xxxxx-uc.a.run.app
```

Abra:

```text
https://.../login.html
```

### 8. Ajuste recomendado no Firebase

Se voce usar dominio proprio depois, ou se adicionar login social no futuro, entre em:

- `Firebase Console`
- `Authentication`
- `Settings`
- `Authorized domains`

E adicione o dominio publico do Cloud Run e o seu dominio customizado, se houver.

### 9. Colocar no celular

#### Android

1. Abra o link no Chrome.
2. Faca login.
3. Use `Adicionar a tela inicial`.

#### iPhone

1. Abra o link no Safari.
2. Faca login.
3. Toque em `Compartilhar`.
4. Use `Adicionar a Tela de Inicio`.

## Variaveis de ambiente

### Cloud Run recomendado

Se voce usar a `service account` no deploy, nao precisa definir:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### Ambiente local

Para rodar fora do Cloud Run, voce pode continuar usando `.env` ou `server/serviceAccountKey.json`.
O modelo esta em `.env.example`.

## Comandos uteis

### Novo deploy

```powershell
gcloud run deploy hamburgueria-app --source . --region southamerica-east1 --allow-unauthenticated --service-account hamburgueria-app@SEU_PROJECT_ID.iam.gserviceaccount.com
```

### Ver logs

```powershell
gcloud run services logs read hamburgueria-app --region southamerica-east1
```

### Abrir no navegador

```powershell
gcloud run services describe hamburgueria-app --region southamerica-east1 --format "value(status.url)"
```

## Custo baixo

- Deixe o `min instances` em `0`
- Use a URL padrao do Cloud Run no comeco
- Crie um alerta de orcamento no Google Cloud

## Checklist final

- Projeto Google Cloud com billing ativo
- Firebase no mesmo projeto
- APIs do Cloud Run habilitadas
- Service account criada
- Permissoes `roles/firebaseauth.admin` e `roles/datastore.user` aplicadas
- Deploy feito com `--service-account`
- Link publico abrindo `login.html`
