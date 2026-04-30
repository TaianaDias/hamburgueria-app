# Modelo SaaS Multiempresa e Multiloja

## Principio

Toda colecao operacional deve carregar `empresaId` e `lojaId`. Isso permite vender o produto como SaaS, comparar unidades, isolar dados por cliente e evoluir para franquias.

## Colecoes principais

```text
empresas/{empresaId}
unidades/{lojaId}
usuarios/{usuarioId}
estoque/{produtoId}
movimentacoesEstoque/{movimentacaoId}
comprasMensais/{compraId}
fornecedores/{fornecedorId}
producoes/{producaoId}
etiquetasHistorico/{etiquetaId}
desperdicios/{desperdicioId}
inventarios/{inventarioId}
comandosWhatsApp/{comandoId}
auditoriaOperacional/{auditoriaId}
assinaturas/{assinaturaId}
```

## Campos obrigatorios por documento operacional

```json
{
  "empresaId": "empresa_123",
  "lojaId": "matriz",
  "criadoEm": "serverTimestamp",
  "atualizadoEm": "serverTimestamp",
  "origem": "app | whatsapp | ia | manual | api",
  "responsavel": "email ou uid"
}
```

## Permissoes por papel

- `admin`: gerencia custos, usuarios, fornecedores, SaaS e relatorios financeiros.
- `gerente`: opera loja, aprova inventario e acompanha relatorios operacionais.
- `estoque`: entrada, saida, producao, desperdicio, etiquetas e inventario.
- `caixa`: leitura limitada e operacoes simples, quando houver integracao com venda.

## Auditoria

Cada acao relevante deve gravar em `auditoriaOperacional`:

```json
{
  "empresaId": "empresa_123",
  "lojaId": "matriz",
  "tipo": "entrada_estoque",
  "origem": "whatsapp",
  "actor": "operador@empresa.com",
  "payload": {},
  "before": {},
  "after": {},
  "criadoEm": "serverTimestamp"
}
```

## Estado atual implementado

- Backend agora possui helpers de tenant:
  - `resolveTenantContext`
  - `withTenantMetadata`
  - `recordAuditLog`
- Endpoint SaaS:
  - `GET /api/saas/context`
- Comandos WhatsApp passam a salvar:
  - `empresaId`
  - `lojaId`
  - `usuarioId`
  - auditoria em `auditoriaOperacional`

## Proxima etapa

Migrar cada tela existente para gravar `empresaId` e `lojaId` em novas escritas, mantendo fallback para dados legados sem esses campos.
