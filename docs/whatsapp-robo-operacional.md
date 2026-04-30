# Robo WhatsApp do Copiloto Operacional

## Objetivo

Permitir que o dono, gerente ou funcionario responsavel opere o sistema pelo WhatsApp com mensagens naturais, sem abrir o app para tarefas rapidas.

Exemplos:

- `Entrou 2 caixas de pao brioche com 96 unidades cada por R$142`
- `Saiu para producao 40 paes, 40 carnes e 2kg de batata`
- `10kg de batata virou 40 porcoes`
- `Me manda o relatorio de hoje`
- `O que preciso comprar amanha?`

## Arquitetura recomendada

```text
WhatsApp do responsavel
  -> Provedor WhatsApp
  -> Webhook /api/webhooks/whatsapp
  -> Parser/IA operacional
  -> Pedido de confirmacao
  -> Atualizacao Firestore
  -> Auditoria
  -> Resposta no WhatsApp
```

## Provedores possiveis

1. Meta WhatsApp Business Cloud API
   - Mais oficial e escalavel.
   - Exige configuracao no Meta Business, numero aprovado e token.

2. Twilio WhatsApp
   - Mais simples para MVP.
   - Bom para testes e ambiente controlado.

3. Z-API ou Evolution API
   - Mais rapidas para operacao local.
   - Exigem mais cuidado com estabilidade, politicas e manutencao.

## O que ja existe no sistema

- Endpoint base: `POST /api/webhooks/whatsapp`
- Endpoint autenticado: `POST /api/operational/interpret`
- Colecao de logs: `comandosWhatsApp`
- Colecao de auditoria: `auditoriaOperacional`
- Tela de simulacao: `whatsapp-ia.html`
- Parser inicial para intencoes:
  - `entrada_estoque`
  - `saida_producao`
  - `porcionamento`
  - `relatorio_diario`
  - `sugestao_compra`
  - `validade`

## Variaveis de ambiente sugeridas

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_WEBHOOK_TOKEN=token-interno-para-validar-webhook
WHATSAPP_ADMIN_PHONE=5511999999999
WHATSAPP_STORE_PHONE=5511888888888
WHATSAPP_META_TOKEN=
WHATSAPP_META_PHONE_NUMBER_ID=
WHATSAPP_TWILIO_ACCOUNT_SID=
WHATSAPP_TWILIO_AUTH_TOKEN=
WHATSAPP_TWILIO_FROM=
```

## Regras para funcionar direto no WhatsApp do dono ou funcionario

- Cada usuario deve ter telefone cadastrado no perfil.
- O sistema valida se o telefone recebido no webhook pertence a um usuario ativo.
- O tipo do usuario define permissao:
  - Funcionario: entrada, saida, producao, etiqueta e desperdicio.
  - Gerente: tudo do funcionario + compras e relatorios operacionais.
  - Admin/dono: custos, dashboards financeiros, fornecedores, usuarios e configuracoes.
- Toda acao que altera estoque deve pedir confirmacao antes de gravar.
- Toda acao confirmada deve gerar auditoria.
- Mensagens ambíguas devem retornar pergunta objetiva.

## Fluxo de confirmacao

1. Usuario envia: `Entrou 2 caixas de pao brioche por R$142`
2. Sistema interpreta:
   - produto: pao brioche
   - quantidade: 2 caixas
   - custo total: R$142
   - intencao: entrada_estoque
3. Sistema responde:
   - `Confirma entrada de 2 caixas de pao brioche, total R$142? Responda SIM para confirmar.`
4. Usuario responde: `SIM`
5. Sistema atualiza estoque, compra, custo e auditoria.
6. Sistema responde:
   - `Entrada registrada. Estoque atual de pao brioche: 192 un.`

## Etapas que ainda faltam para ficar 100%

1. Escolher provedor WhatsApp.
2. Configurar numero oficial.
3. Criar adaptador de envio para o provedor escolhido.
4. Vincular telefone recebido ao usuario do sistema.
5. Implementar estado de conversa pendente por telefone.
6. Implementar confirmacao `SIM/NAO`.
7. Aplicar movimentacoes reais no Firestore apos confirmacao.
8. Melhorar parser com IA real para produto, unidade, quantidade, fornecedor e custo.
9. Criar testes para comandos principais.
10. Criar painel de monitoramento de mensagens com falhas, pendencias e confirmacoes.

## Proxima implementacao recomendada

Criar `server/integrations/whatsapp-provider.js` com adaptadores:

- `sendWhatsAppMessage(to, text)`
- `normalizeIncomingMessage(payload)`
- `verifyWebhook(req)`

Depois criar `server/services/operational-command-service.js` para:

- interpretar comando
- validar permissao
- guardar pendencia
- confirmar comando
- aplicar movimentacao
- registrar auditoria
