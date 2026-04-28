# Render

## O que ficou pronto

- O projeto agora tem `render.yaml` na raiz
- O backend aceita credenciais do Firebase por `FIREBASE_SERVICE_ACCOUNT_JSON`
- O backend tambem aceita `FIREBASE_SERVICE_ACCOUNT_FILE`, incluindo secret file do Render
- O health check ja esta em `/api/health`

## Melhor forma de publicar

Para este app, use um unico `Web Service` Node.js no Render.
O mesmo `server.js` serve a interface e a API no mesmo dominio.

## Opcao recomendada: Blueprint com `render.yaml`

1. Suba este projeto para GitHub, GitLab ou Bitbucket.
2. No Render, clique em `New +`.
3. Escolha `Blueprint`.
4. Conecte o repositorio.
5. O Render vai ler o arquivo `render.yaml`.
6. Quando ele pedir o valor de `FIREBASE_SERVICE_ACCOUNT_JSON`, cole o JSON completo da sua service account em uma unica linha.
7. Quando ele pedir `COSMOS_API_TOKEN`, cole o token da API Cosmos/Bluesoft.
8. Finalize a criacao.

Configuracao incluida no `render.yaml`:

- `runtime: node`
- `plan: free`
- `buildCommand: npm install`
- `startCommand: npm start`
- `healthCheckPath: /api/health`
- `NODE_VERSION=20`
- `COSMOS_API_TOKEN` como valor secreto
- `COSMOS_USER_AGENT=HamburgueriaApp/1.0`

## Opcao alternativa: criar o Web Service manualmente

Se voce preferir configurar pela interface:

1. Clique em `New +` > `Web Service`.
2. Selecione o repositorio.
3. Preencha:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

4. Em `Environment`, adicione:

```text
NODE_VERSION=20
FIREBASE_SERVICE_ACCOUNT_JSON=...json completo...
COSMOS_API_TOKEN=...token do Cosmos...
COSMOS_USER_AGENT=HamburgueriaApp/1.0
```

## Como obter o `FIREBASE_SERVICE_ACCOUNT_JSON`

No Firebase Console:

1. Abra `Project settings`
2. Entre em `Service accounts`
3. Gere uma nova chave privada
4. Abra o arquivo JSON
5. Cole o conteudo inteiro no Render

Se voce preferir usar secret file em vez de variavel:

1. No Render, abra o servico
2. Va em `Environment`
3. Adicione um `Secret File`
4. Salve com nome `firebase-service-account.json`
5. Defina `FIREBASE_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json`

## Depois do deploy

1. Abra a URL publica do Render
2. Teste `https://SEU-APP.onrender.com/api/health`
3. Abra `https://SEU-APP.onrender.com/login.html`
4. No Firebase Console, adicione o dominio `SEU-APP.onrender.com` em `Authentication` > `Settings` > `Authorized domains`

## Observacoes importantes

- No plano gratis, o Render coloca o servico em idle apos 15 minutos sem trafego
- O primeiro acesso depois disso pode levar perto de 1 minuto para voltar
- Isso afeta login e abertura inicial, mas nao perde seus dados do Firebase
- O filesystem do Render e temporario, entao nao salve dados locais no servidor

## Mobile

Se depois voce quiser que o app do iPhone/Android fale com o Render em vez do PC local:

1. abra [public/runtime-config.json](/C:/Users/cario/Downloads/hamburgueria-app/public/runtime-config.json:1)
2. troque `apiBaseUrl` pela URL publica do Render
3. rode `npm run mobile:sync`
