# Integração WhatsApp com Evolution API v2

Este projeto usa a Evolution API v2 no backend Node.js/Express para enviar notificações internas do estoque da hamburgueria pelo WhatsApp.

## Variáveis de ambiente

Configure no `.env` local ou nas variáveis do Render:

```env
EVOLUTION_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=colocar_chave_aqui
EVOLUTION_INSTANCE=cariocas-estoque
EVOLUTION_INSTANCE_TOKEN=token_da_instancia_se_existir
EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000/webhook/evolution
ADMIN_WHATSAPP=5521999999999
# Separe por vírgula se quiser liberar outros números sem cadastrar usuário:
# WHATSAPP_ALLOWED_PHONES=5521988888888,5521977777777
# Opcional para proteger POST /webhook/evolution:
# EVOLUTION_WEBHOOK_TOKEN=token-interno
# AUTHENTICATION_API_KEY=mesma_chave_global_do_docker_compose
```

Campos:

- `EVOLUTION_BASE_URL`: URL onde a Evolution API está rodando.
- `EVOLUTION_API_KEY`: chave definida no `AUTHENTICATION_API_KEY` da Evolution API.
- `EVOLUTION_INSTANCE`: nome da instância do WhatsApp.
- `EVOLUTION_INSTANCE_TOKEN`: token da instância quando existir; mantido no backend para compatibilidade.
- `EVOLUTION_WEBHOOK_URL`: URL que a Evolution API chama ao receber mensagens. Em Docker Desktop local, use `http://host.docker.internal:3000/webhook/evolution`.
- `ADMIN_WHATSAPP`: número que receberá alertas internos, com DDI e DDD.
- `WHATSAPP_ALLOWED_PHONES`: lista opcional de números autorizados a conversar com o robô sem depender do cadastro de funcionário.
- `AUTHENTICATION_API_KEY`: fallback compatível com o nome usado no Docker Compose oficial.
- `EVOLUTION_WEBHOOK_TOKEN`: token opcional para validar chamadas recebidas em `POST /webhook/evolution`.

Se `EVOLUTION_WEBHOOK_TOKEN` estiver configurado, o backend adiciona `?token=...` automaticamente ao configurar o webhook na Evolution API.

Nunca coloque a chave da Evolution API em HTML, CSS ou JavaScript público.

## Exemplo de Docker Compose da Evolution API

Use este exemplo como base local:

```yaml
services:
  evolution-api:
    image: atendai/evolution-api:v2.2.3
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      - AUTHENTICATION_API_KEY=colocar_chave_aqui
      - DATABASE_ENABLED=false
      - CACHE_REDIS_ENABLED=false
      - LOG_LEVEL=ERROR
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_instances:
```

Depois de subir:

```bash
docker compose up -d
```

## Rotas criadas no sistema

Rotas protegidas por autenticação Firebase:

- `GET /whatsapp/status`
- `GET /whatsapp/qrcode`
- `POST /whatsapp/configure-webhook`
- `POST /whatsapp/send-test`
- `POST /whatsapp/stock-entry`
- `POST /whatsapp/stock-exit`
- `POST /whatsapp/low-stock`
- `POST /whatsapp/supplier-order-suggestion`

Webhook público para eventos da Evolution:

- `POST /webhook/evolution`

Compatibilidade existente:

- `POST /api/whatsapp/send`

## Fluxo de conexão

1. Suba a Evolution API.
2. Configure `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` e `ADMIN_WHATSAPP`.
3. Inicie o sistema:

```bash
npm start
```

4. Faça login no sistema.
5. Acesse a aba `WhatsApp e IA`.
6. Use `GET /whatsapp/qrcode` ou o painel da Evolution para gerar o QR Code.
7. Escaneie o QR Code com o WhatsApp do dono ou responsável.
8. Confira `GET /whatsapp/status`; o estado esperado é `open`.
9. Teste o envio pela aba `WhatsApp e IA` ou por API.

## Teste por API

Com usuário autenticado no app, o front usa o token Firebase automaticamente via `apiFetch`.

Teste manual com token Firebase:

```bash
curl -X POST http://localhost:3000/whatsapp/send-test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_ID_TOKEN_FIREBASE" \
  -d "{\"phone\":\"5521999999999\",\"message\":\"Teste de integração Evolution API - Carioca's Estoque\"}"
```

## Mensagens automáticas

Entrada de estoque:

```text
✅ *Entrada no estoque*
Produto: Pão brioche
Quantidade: 10 caixas
Unidade interna: 60 unidades
Fornecedor: Nome do fornecedor
Responsável: Nome do funcionário
Data: data/hora
```

Saída para produção:

```text
📦 *Saída para produção*
Produto: Cheddar
Quantidade: 2 caixas
Destino: Produção
Responsável: Nome
Data: data/hora
```

Estoque mínimo:

```text
⚠️ *Atenção: estoque mínimo atingido*
Produto: Batata Bem Brasil
Quantidade atual: 1 caixa
Estoque mínimo: 2 caixas
Fornecedor sugerido: Nome do fornecedor
Ação recomendada: Realizar reposição
```

Sugestão de pedido:

```text
🛒 *Sugestão de pedido para fornecedor*
Fornecedor: Nome
Itens:
- Produto X: 3 caixas
- Produto Y: 5 unidades
Mensagem gerada automaticamente pelo sistema Carioca's Estoque.
```

## Logs no Firestore

Cada tentativa de envio ou webhook recebido é salva em:

```text
whatsapp_logs
```

Campos principais:

- `tipo`
- `telefone`
- `mensagem`
- `status`
- `erro`
- `dataCriacao`
- `usuarioResponsavel`
- `empresaId`
- `lojaId`
- `providerMessageId`

## Integração com o estoque

O estoque já chama a automação após:

- Entrada de produto
- Saída de produto
- Estoque atual menor ou igual ao mínimo

O salvamento principal do estoque não depende do WhatsApp. Se a Evolution API estiver offline, o sistema registra o erro e mantém o fluxo operacional funcionando.

## Resposta automática para mensagens recebidas

O webhook `POST /webhook/evolution` responde automaticamente quando recebe mensagens de números autorizados.

Números autorizados:

- `ADMIN_WHATSAPP`
- telefones cadastrados nos documentos da coleção `usuarios`
- números informados em `WHATSAPP_ALLOWED_PHONES`

Comandos suportados:

- `O que preciso comprar hoje?`
- `Quais itens estão baixos?`
- `Resumo do estoque`
- `Produtos vencendo`
- `Ajuda`

Números não autorizados recebem uma resposta orientando solicitar liberação ao administrador.

## Trocar número do administrador

Altere:

```env
ADMIN_WHATSAPP=5521999999999
```

Reinicie o backend depois da alteração.

## Endpoints oficiais usados

- Criar instância: `POST /instance/create`
- Conectar/QR Code: `GET /instance/connect/{instance}`
- Estado da conexão: `GET /instance/connectionState/{instance}`
- Enviar texto: `POST /message/sendText/{instance}`
- Configurar webhook: `POST /webhook/set/{instance}`

Documentação oficial:

- https://doc.evolution-api.com/v2/api-reference/instance-controller/create-instance-basic
- https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect
- https://doc.evolution-api.com/v2/api-reference/instance-controller/connection-state
- https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
- https://doc.evolution-api.com/v2/en/configuration/webhooks
