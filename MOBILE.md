# Publicacao Online E Mobile

Para subir no Google Cloud Run, siga [CLOUDRUN.md](/C:/Users/cario/Downloads/hamburgueria-app/CLOUDRUN.md).

## Objetivo

O projeto agora esta preparado para rodar online sem depender do seu PC ligado.
O caminho mais simples para Android e iPhone e publicar este servidor Node em HTTPS e abrir o sistema pelo link.

## Como fica a arquitetura

- O mesmo servidor entrega o frontend em `public/`
- O mesmo servidor expõe as rotas `/api/...`
- O Firebase Web continua cuidando de `Auth` e `Firestore`
- O Firebase Admin fica no backend para bootstrap e cadastro de funcionarios

## O que configurar na hospedagem

Defina as variaveis de ambiente do Firebase Admin.
Voce pode usar o modelo em `.env.example`.

Opcoes aceitas pelo backend:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## Publicacao

1. Suba este projeto em uma hospedagem que rode Node.js com HTTPS.
2. Configure as variaveis de ambiente do Firebase Admin.
3. Rode o comando de start:

```bash
npm start
```

4. Abra o link publico da hospedagem.

## Link no Android e iPhone

### Android

1. Abra o link do sistema no Chrome.
2. Faça login.
3. Use `Adicionar a tela inicial`.

### iPhone

1. Abra o link do sistema no Safari.
2. Faça login.
3. Toque em `Compartilhar`.
4. Use `Adicionar a Tela de Inicio`.

## Runtime config

O arquivo `public/runtime-config.json` foi limpo para publicacao online.
Quando frontend e backend estiverem no mesmo dominio, nao precisa mudar nada.

## Ambiente local

Para continuar testando localmente:

```bash
npm start
```

Depois abra:

```text
http://localhost:3000/login.html
```

## Observacoes

- Para uso por link no celular, prefira sempre HTTPS.
- O backend ainda aceita `server/serviceAccountKey.json` localmente.
- A importacao de notas ficou somente por XML, sem consulta por chave de acesso.
