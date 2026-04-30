# Copiloto Operacional Inteligente para Food Service

## Analise do codigo atual

- O app atual usa HTML estatico em `public/`, JavaScript modular no navegador, Firebase Auth/Firestore e um backend Express em `server.js`.
- As telas principais ja existem para estoque, compras, fornecedores, desperdicio, funcionarios, dashboards e reposicao.
- A tela `public/estoque.html` concentra muita regra de UI e dados no mesmo arquivo: cadastro, XML, busca, fornecedores, movimentacao por caixa e renderizacao dos cards.
- `public/app.js` ja centraliza funcoes reutilizaveis importantes: auth, API, fornecedores por produto, custo unitario, dias da semana, formatacao e agregacoes de compras.
- O caminho mais seguro de evolucao e extrair componentes e servicos aos poucos, mantendo compatibilidade com os documentos atuais do Firestore.

## Plano tecnico de melhoria

1. Separar UI, dados e regras de dominio por modulo.
2. Criar um design system leve em CSS com cards, badges, bottom nav, drawers, modais, toasts, skeletons e estados vazios.
3. Migrar regras repetidas para `public/app.js` ou novos modulos em `public/modules/`.
4. Padronizar modelos do Firestore com campos novos opcionais, sem quebrar dados legados.
5. Criar logs/auditoria para toda movimentacao antes de automatizar WhatsApp e IA.
6. Evoluir backend para webhooks, etiquetas, relatorios, filas e integracoes externas.

## Estrutura sugerida

```text
public/
  modules/
    estoque/
      estoque-service.js
      estoque-ui.js
      estoque-models.js
    fornecedores/
    producao/
    etiquetas/
    whatsapp/
    relatorios/
  components/
    badges.js
    cards.js
    drawers.js
    toast.js
server/
  services/
    whatsapp-parser.js
    label-renderer.js
    reports.js
    audit-log.js
  integrations/
    whatsapp/
    printers/
    ai/
docs/
  copiloto-operacional-roadmap.md
```

## Modelos de dados

### estoque

Campos principais: `empresaId`, `lojaId`, `nome`, `categoria`, `tipo`, `unidadeCompra`, `unidadeMedida`, `conversao`, `quantidade`, `minimo`, `ideal`, `maximo`, `custoCompra`, `custoUnitario`, `fornecedores`, `validadePadraoHoras`, `localArmazenamento`, `codigoBarras`, `ativo`.

### fornecedores

Campos principais: `empresaId`, `nome`, `telefone`, `whatsapp`, `produtos`, `diasPedido`, `diasEntrega`, `prazoMedioDias`, `observacoes`, `ativo`.

### movimentacoesEstoque

Campos principais: `empresaId`, `lojaId`, `produtoId`, `tipo`, `origem`, `quantidadeAnterior`, `quantidadeMovimentada`, `quantidadeNova`, `responsavelId`, `observacao`, `criadoEm`.

### producoes

Campos principais: `empresaId`, `lojaId`, `produtoId`, `insumos`, `quantidadeProduzida`, `rendimento`, `perda`, `custoTotal`, `custoUnitario`, `lote`, `validade`, `responsavelId`.

### etiquetas

Campos principais: `empresaId`, `lojaId`, `produtoId`, `lote`, `modelo`, `quantidade`, `impressoraId`, `status`, `html`, `criadoEm`, `responsavelId`.

### comandosWhatsApp

Campos principais: `empresaId`, `lojaId`, `telefone`, `mensagem`, `intencao`, `entidades`, `statusConfirmacao`, `resultado`, `criadoEm`.

## Fluxos prioritarios

- Estoque: cadastrar item, vincular fornecedores, registrar entrada, registrar saida, ajustar inventario, gerar alerta.
- Producao: selecionar insumo, informar rendimento, calcular perda, gerar lote, atualizar estoque, emitir etiqueta.
- Etiqueta: escolher produto/lote, renderizar HTML/PDF, imprimir teste, registrar historico.
- WhatsApp: receber webhook, interpretar comando, pedir confirmacao, aplicar movimentacao, responder e auditar.

## Recomendacoes para escalar

- Adotar `empresaId` e `lojaId` em todas as colecoes antes do multiempresa.
- Criar uma camada de permissao por papel: admin, gerente e funcionario.
- Manter eventos de auditoria imutaveis para relatorios, IA e reconstrucao de saldo.
- Usar filas para WhatsApp, relatorios PDF, etiquetas e tarefas de IA.
- Comecar impressao com HTML/CSS e preparar adaptadores para QZ Tray, WebUSB, Bluetooth, ESC/POS, ZPL e TSPL.

## Falta implementar

- Dashboard premium consolidado com saude do estoque e alertas de IA.
- Modulos completos de producao, porcionamento, padronizacao e etiquetas.
- Configuracao de impressora e historico de impressoes.
- Relatorio diario automatico no app, PDF e WhatsApp.
- Parser de comandos WhatsApp com confirmacao.
- Desperdicio com custo, foto e rankings.
- Ficha tecnica, CMV, inventario, multiempresa, planos pagos e cobranca.
