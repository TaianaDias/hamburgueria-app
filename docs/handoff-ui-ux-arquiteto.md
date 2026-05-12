# Resumo técnico — Hamburgueria App (handoff para auditoria UI/UX)

## 1. Estrutura de pastas (visão de arquitetura)

| Área | Caminho | Função |
|------|---------|--------|
| App web (HTML estático + módulos JS) | `public/` | Páginas `.html` por módulo (estoque, compras, dashboard, login, etc.), `style.css` + CSS de dashboard, `app.js`, `firebase.js`, `operational-core.js`, `premium-shell.js`, PWA (`sw.js`, `manifest.json`). |
| API Node (Express) | `server.js` (raiz) | Servidor principal: estáticos, Firebase Admin, permissões, rotas auxiliares. |
| Módulos de servidor | `server/` | Ex.: `stock-alerts.js` (alertas de estoque), `notification-channels.js`. |
| Rotas / serviços adicionais | `src/routes/`, `src/services/` | WhatsApp (`whatsappRoutes.js`), Evolution API (`evolutionService.js`). |
| Scripts de qualidade e automação | `scripts/` | `check-html-modules`, `smoke-test`, `phase3-visual-check` (Playwright), fases 4–5, shell approved, etc. |
| Mobile (Capacitor) | `android/`, `ios/`, `capacitor.config.json` | Wrappers nativos apontando para o conteúdo em `public/`. |
| Documentação operacional | `docs/`, `AUDITORIA.md`, `CHECKLIST_TESTES.md`, `RENDER.md`, etc. | Roadmap, auditoria manual, deploy. |
| CI | `.github/workflows/ci.yml` | Pipeline (ex.: `npm run ci`). |

**Padrão arquitetural:** o front-end usa sobretudo **Firestore no cliente** (SDK web) com páginas independentes; o backend Express expõe **APIs pontuais** (usuários, auditoria, WhatsApp, alertas), não um BFF que renderiza views.

---

## 2. Fichas técnicas e “cálculo” no backend

### O que o produto chama de ficha técnica hoje

No cadastro de insumo (`public/estoque.html`), a aba **Ficha Técnica** persiste **texto livre** no documento Firestore da coleção `estoque`:

- `fichaTecnicaVinculos` — vínculos descritos em texto (ex.: produtos do cardápio).
- `fichaTecnicaObservacoes` — observações de rendimento e custo.

Trecho representativo do payload de criação (campos relevantes):

```javascript
fichaTecnicaVinculos: recipeLinksInput.value.trim(),
fichaTecnicaObservacoes: recipeNotesInput.value.trim(),
```

A lista operacional usa **estado declarativo**, não um motor de receita no servidor: o badge “Sem ficha técnica” aparece quando `statusProduto === "sem_ficha_tecnica"` ou `fichaTecnicaStatus === "pendente"`.

### Papel do backend (Node)

- **Não existe** endpoint que monte receita, some insumos por SKU ou calcule CMV agregado por item de cardápio a partir da ficha técnica.
- Em `server.js`, “ficha técnica” entra apenas no **modelo de permissões**: aliases `ficha_tecnica`, `ficha_tecnica_cmv`, `ficha_técnica_cmv` normalizam para a função adicional `cmv`.
- Em `public/app.js`, a árvore de permissões do módulo `cmv` (ver/criar/editar ficha, ver CMV) é **autorização**, não cálculo.

### Onde há cálculo numérico de custo

- **Cliente:** `public/app.js` — custo unitário efetivo (fornecedores, promoções, conversão de embalagem), usado na experiência de estoque.
- **Servidor:** `server/stock-alerts.js` — lógica análoga para **alertas e sugestões de compra**, não para fichas de receita.

### Implicação para a auditoria UX

A ficha técnica é hoje **documentação e governança** (texto + status). Fluxos narrados como “insumo → receita → CMV%” têm **gap** em relação a dados estruturados e a cálculo no backend; a auditoria premium deve tratar CMV por receita como **evolução de produto**, não como capacidade fechada no servidor.

---

## 3. Organização do CSS global

### Ficheiros

1. **`public/style.css`** (~11k linhas) — `:root` com tokens (tema escuro, marca vermelha, raios, sombras), aliases “SaaS premium”, reset leve, tipografia **Inter**, botões, inputs, painéis e utilitários compartilhados pela maior parte das páginas (ex.: `login.html` só com este ficheiro).

2. **`public/dashboard-saas-page.css`** — regras sob `body.dashboard-saas-page` (grid do shell, sidebar, navegação). Comentário do ficheiro: carregar **após** `style.css`; no layout executivo, `dashboard-approved-real.css` **por último**.

3. **`public/dashboard-approved-real.css`** — regras sob `body.dashboard-approved-real`: paleta “approved”, **Plus Jakarta Sans**, gradientes; **oculta** o shell antigo (`premium-app-shell.dashboard-shell`, drawers mobile não “approved”, etc.) para evitar **dois layouts** sobrepostos.

### Ordem de carregamento típica

`dashboard-saas.html`, `estoque.html`:

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="dashboard-saas-page.css">
<link rel="stylesheet" href="dashboard-approved-real.css">
```

O `body` combina classes (ex.: `premium-app-body dashboard-saas-page dashboard-approved-real`) para cascata em camadas: **base global → grid SaaS → tema approved** (o último ficheiro tende a prevalecer em conflitos).

### Implicações para UI/UX

- **`style.css` centraliza** a maior parte do visual: alterações em tokens globais têm **alto risco de regressão** transversal.
- **Dois temas de dashboard** coexistem por classe no `body`; o “approved” é o que **ganha** em sobreposições recentes.
- Páginas só com `style.css` (ex.: `index.html`) têm **subset** visual; mockups podem usar **inline** ou padrões divergentes — relevante para matriz de consistência na auditoria.
