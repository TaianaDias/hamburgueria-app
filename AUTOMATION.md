# Automacao

## O que ficou automatizado

- O GitHub agora pode rodar validacoes automaticas a cada commit na `main`
- O projeto ganhou um smoke test para subir o servidor e testar as rotas principais
- O projeto ganhou validacao de sintaxe para os scripts `type="module"` das telas HTML

Arquivos principais:

- `.github/workflows/ci.yml`
- `scripts/check-html-modules.mjs`
- `scripts/smoke-test.mjs`

## Como isso ajuda

Quando voce atualizar o projeto no GitHub:

1. O GitHub Actions roda a esteira automaticamente
2. Ele instala dependencias
3. Ele valida os scripts das paginas
4. Ele sobe o servidor e testa as rotas principais

Se algo quebrar, o check falha antes de voce confiar no deploy.

## Passo que ainda precisa ser feito no Render

Como o seu servico atual foi criado manualmente no Render, voce precisa ajustar uma vez pela interface:

1. Abra o servico `hamburgueria-app`
2. Va em `Settings`
3. Procure `Auto-Deploy`
4. Troque de `On Commit` para `After CI Checks Pass`
5. Salve

Isso faz o Render esperar o GitHub Actions passar antes de publicar uma nova versao.

## Como validar no GitHub

Depois de subir os arquivos novos:

1. Abra o repositório no GitHub
2. Va em `Actions`
3. Confira a execucao `CI`
4. Espere o status verde

## Como atualizar daqui para frente

1. Suba os arquivos alterados para o GitHub
2. Espere o check `CI` ficar verde
3. O Render publica sozinho, desde que `Auto-Deploy` esteja em `After CI Checks Pass`

## Comando local util

Se quiser testar antes de subir:

```powershell
npm run ci
```
