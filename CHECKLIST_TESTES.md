# Checklist de testes — Operação / Dashboard SaaS

**Última atualização:** 9 de maio de 2026 — **FASE 4: auditoria autenticada (Firebase + Playwright)**  
**Métodos Fase 4:** `npm run check:phase4` com `PHASE4_EMAIL` e `PHASE4_PASSWORD` no ambiente (nunca commite credenciais); `node scripts/phase4-firestore-usuario.mjs` com `PHASE4_EMAIL` ou `PHASE4_UID` (Admin SDK local).  
**Fases anteriores:** Fase 3 (`check:phase3`), Fase 2 (`check:smoke`, `check:html`).

**Legenda:** OK | FALHA | N/A | **OK\*** (OK com ressalva documentada)

**Gravidade:** crítica | alta | média | baixa | —

---

## FASE 4 — Auditoria autenticada (Firebase)

### Conta de auditoria (atual)

- **Ativa:** a conta definida **no momento da execução** por `PHASE4_EMAIL` e `PHASE4_PASSWORD` (ambiente local ou CI seguro). **Não** versionar e-mail, UID ou senha no repositório.
- **Descontinuada:** uma conta de auditoria anterior foi **eliminada no Firebase** (senha perdida); **não** a utilize nem restaure artefactos (`reports/*.json`, capturas) que a identifiquem. Apague ficheiros locais antigos em `reports/` se existirem.

### FASE 5 (quando existir)

- Deve usar **exclusivamente** as mesmas variáveis `PHASE4_EMAIL` / `PHASE4_PASSWORD` (ou sucessor documentado) para a conta de auditoria **atual**. Não codificar UIDs nem e-mails de teste em scripts.

### Comandos

| Comando | Descrição |
|---------|-----------|
| `PHASE4_EMAIL=... PHASE4_PASSWORD=... npm run check:phase4` | Login real + percorrer módulos em 7 viewports + shell + logout. |
| `PHASE4_EMAIL=... node scripts/phase4-firestore-usuario.mjs` | Resolve UID por e-mail e lê `usuarios/{uid}` via Admin SDK. |
| `PHASE4_UID=... node scripts/phase4-firestore-usuario.mjs` | Lê `usuarios/{uid}` quando o UID já é conhecido (conta atual). |
| `... phase4-firestore-usuario.mjs --remove-permissoes` | Remove campo `permissoes` (só se alinhado com política de dados). |

### Dados de teste padronizados (nomes canónicos)

Usar **exatamente** estes identificadores ao criar registos manuais na conta de auditoria, para busca, limpeza e relatórios sem colidir com produção:

| Identificador | Uso recomendado |
|---------------|-----------------|
| `TESTE_AUDITORIA_INSUMO` | Nome (ou parte do nome/SKU) do **insumo** em `estoque.html`. |
| `TESTE_AUDITORIA_FORNECEDOR` | Nome do **fornecedor** em `fornecedores.html` (e associação ao insumo, se aplicável). |
| `TESTE_AUDITORIA_ENTRADA` | Referência em **entrada de estoque** (nota, observação ou lote ligado ao insumo de teste). |
| `TESTE_AUDITORIA_SAIDA` | Referência em **saída de estoque** (motivo, observação ou documento de teste). |

**Limpeza:** após a auditoria, filtrar por estes textos no Firestore ou nas listagens e apagar só o que foi criado com estes nomes.

### Execução dos scripts (conta atual)

Correr `npm run check:phase4` e `npm run audit:firestore-user` com **`PHASE4_EMAIL` / `PHASE4_PASSWORD` da conta nova**; guardar resultados **fora do git** se necessário. Não há tabela de resultados fixa versionada — evita amarrar a documentação a contas revogadas.

| Verificação | Como validar |
|-------------|----------------|
| Login → sessão | Após `check:phase4`, deve chegar a `dashboard-saas.html`. |
| Módulos operacionais | O script percorre as rotas listadas na Fase 4 em `AUDITORIA.md`. |
| Firestore `usuarios/{uid}` | `audit:firestore-user` com `PHASE4_EMAIL` da conta **atual** deve encontrar o documento se existir em `usuarios/`. |
| Shell / logout | Incluídos no `check:phase4`. |

### Respostas objetivas (Fase 4)

1. **Alimentar produtos reais?** **Sim**, com perfil testado nas rotas; confirmar regras Firestore e backup antes de carga massiva.  
2. **Cadastrar fornecedores reais?** **Sim** (módulo carregou); operação de gravação não coberta pelo headless.  
3. **Estoque funcional?** **Sim** a nível de acesso e página; fluxos de movimento **OK\*** manual.  
4. **Reposição funcional?** **Sim** (página OK); lógica de alertas depende de dados + scheduler.  
5. **Etiquetas prontas?** **OK\*** em `producao-etiquetas.html`; hardware/impressora fora do âmbito.  
6. **Erro crítico?** **Corrigido:** bloqueio indevido de **Desperdício** para `proprietario`.  
7. **Falha de segurança?** **Não detetada** neste run; **não** colocar senhas em ficheiros; API key Firebase no front é padrão SDK (não é secret).  
8. **Módulos a tratar com cuidado em produção:** **WhatsApp/IA** (dependências externas), **relatórios** (dados sensíveis), qualquer módulo sem validação manual de gravação.

---

## Relatório de status — páginas principais (Fase 3)

| Página | Status visual F3 | Observação | Gravidade | Correção / arquivo |
|--------|------------------|------------|-----------|---------------------|
| `dashboard-saas.html` | **OK\*** | Sem auth: URL final `login.html` em todos os viewports; sem overflow horizontal nem erros de consola (após filtros do script). ☰ / gaveta do dashboard **não** exercitados no headless (mesma lógica que `premium-shell.js`, `localStorage` `dashboard-sidebar-collapsed`). | média | Confirmar ☰ e gaveta **com sessão** em `dashboard-saas.html`. |
| `estoque.html` | **OK\*** | Sem auth → `login.html`. Layout de estoque com KPIs/tabelas **não** medido neste run. | média | Revalidar tabelas e formulários autenticado. |
| `compras.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `fornecedores.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `desperdicio.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `etiquetas.html` | **N/A** | Redirect client-side para `impressora.html`, depois auth → `login.html` no ambiente de teste. | — | Validar `impressora.html` autenticado. |
| `funcionarios.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `whatsapp-ia.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `configuracoes.html` | **N/A** | Redirect para `saas.html`, depois auth → `login.html`. | — | Validar `saas.html` autenticado. |
| `login.html` | **OK** | Permanece em `login.html` nos 7 viewports; `scrollWidth − innerWidth ≤ 0`; **nenhum** erro de consola capturado pelo Playwright (além de filtros de rede/SDK). | — | — |
| `alertas-reposicao.html` | **OK\*** | Idem → `login.html`. | média | Idem. |
| `producao-etiquetas.html` | **OK\*** | Idem → `login.html`. | média | Idem. |

**`dev-shell-probe.html` (apoio técnico, não é rota de produto):** **OK** — injeta `premium-shell.js` sem Firebase; usada para toggles ☰ desktop, gaveta mobile (fecho com Escape) e overflow.

---

## Shell global (sidebar recolhível, topbar, ☰)

| # | Teste | Status | Observação | Gravidade | Correção aplicada / recomendada |
|---|--------|--------|------------|-----------|----------------------------------|
| S1 | Sidebar recolhível desktop (`premium-shell.js`, `localStorage`) | **OK** | Antes: `.top-menu` estava `display: none` fora do mobile — ☰ inexistente no desktop. Corrigido para `display: flex`. Toggle + persistência `premium-shell-sidebar-collapsed` validados no probe. | alta | `public/style.css` — `body.premium-clean-shell:not(.dashboard-approved-real) .top-menu` |
| S2 | Topbar injetada | **OK\*** | Estrutura estável; diferença vs dashboard nativo mantida (aceitável). | baixa | — |
| S3 | ☰ mobile + gaveta | **OK** | Gaveta abre; **Escape** fecha (painel pode ocupar 100% da largura — “clique no escuro” pode não existir). | baixa | Comportamento documentado; fecho alternativo: botão ×. |
| S4 | Notificações (placeholder) | **OK** | `title` explicativo no botão (sem integração backend). | baixa | `public/premium-shell.js` |

---

## Viewports (medição `scrollWidth` vs `innerWidth`)

| Viewport | Status | Observação | Gravidade |
|----------|--------|------------|-----------|
| 1440, 1280, 1024, 768, 640, 480, 390 | **OK** | Sem `overflowSuspected` no login, no probe nem nas páginas que terminam em login. **Não** cobre tabelas largas com dados reais. | média |

---

## Navegação global (`premium-shell.js`)

| # | Teste | Status | Observação | Gravidade |
|---|--------|--------|------------|-----------|
| 1 | Topbar: ☰, logo, busca, notificações, ajuda, utilizador | **OK\*** | ☰ agora visível também no desktop. | — |
| 2 | Desktop ☰ recolhe sidebar | **OK** | Ver S1. | — |
| 3 | Mobile gaveta + Escape | **OK** | — | — |
| 4 | Dock inferior | **OK\*** | Não exercitado clique a clique no headless; markup/CSS presentes. | baixa |
| 5 | Item ativo | **OK** | Lógica `matches` inalterada. | — |
| 6 | Lista de menu | **OK** | — | — |
| 7 | Sair + `app.js` | **OK\*** | Páginas do âmbito importam `app.js`; headless não executa logout real. | baixa |

---

## Dashboard principal (`dashboard-saas.html`)

| # | Teste | Status | Observação | Gravidade |
|---|--------|--------|------------|-----------|
| 1 | Consola sem erros (run F3) | **OK\*** | Apenas após redirect para login sem erros capturados; **com sessão** ainda recomendado. | média |
| 2 | KPIs / dados | **N/A** | Requer auth + Firestore. | — |
| 3 | ☰ desktop | **OK\*** | Paridade de código com shell; não automatizado no HTML real. | média |
| 4 | Mobile gaveta | **OK\*** | Idem. | média |
| 5 | Menu approved | **OK** | Estático. | — |
| 6 | Diálogos | **N/A** F3 | Não coberto pelo script. | baixa |

---

## Fase 2 — Migração CSS dashboard (verificação estática)

| # | Teste | Status | Observação |
|---|--------|--------|------------|
| 1–2 | Ordem CSS / classes body | **OK** | Sem mudança F3. |
| 3 | Layout 1280–480 com conteúdo real | **OK\*** | Login + probe OK; módulos com dados: manual. |
| 4 | Scroll horizontal | **OK\*** | Medição numérica OK nos runs; tabelas operacionais: manual. |
| 5 | Redirects | **OK** | — |

---

## Ambiente

| # | Passo | Status | Observação |
|---|--------|--------|------------|
| 1 | Servidor / smoke | **OK** | — |
| 2 | Cache / segundo browser | **N/A** F3 | Opcional para regressão humana. |

---

## Segurança

| # | Teste | Status | Observação | Gravidade |
|---|--------|--------|------------|-----------|
| 1 | Secrets no HTML testado | **OK** | Sem alteração F3. | — |
| 2 | Regras Firebase | **N/A** | Revisão na consola Firebase. | alta |

---

## Módulos operacionais (síntese F3)

| Módulo | Status F3 | Nota |
|--------|-----------|------|
| Login | **OK** | |
| Shell (probe) | **OK** | |
| Demais rotas com `requireAuth` | **OK\*** | Redirect auth funciona; UI cheia com dados = manual |

---

## Critérios finais (Fase 3)

1. **Pode alimentar com dados reais?** **Sim, com ressalvas:** gate de auth e login está estável no headless; falta validar **consola e tabelas** já autenticado e regras Firebase em produção.  
2. **Páginas visualmente aprovadas (neste run):** `login.html`; shell global via `dev-shell-probe.html`. Módulos operacionais: **aprovados para redirect/auth**, não para layout denso sem sessão.  
3. **Páginas que ainda precisam ajuste:** nenhuma **FALHA** automática; **revisão manual** com sessão em dashboard, estoque, compras, impressora, saas.  
4. **Sidebar recolhível:** **OK** desktop + mobile no código `premium-shell.js` após correção CSS do ☰.  
5. **Erros no console (F3):** **nenhum** relevante capturado após filtros (falhas de rede/SDK ignoradas pelo script).  
6. **Scroll horizontal:** **não detetado** nas páginas finais medidas; risco residual em tabelas largas com dados.  
7. **Crítico antes de uso real:** configurar **auth**, **regras** e um passe manual em 1–2 módulos com dados.

---

## Notas

- Comando: `npm run check:phase3` (requer `playwright` instalado — ver `package.json`).  
- Comando: `npm run check:phase4` — credenciais só por ambiente (`PHASE4_EMAIL`, `PHASE4_PASSWORD`) da **conta de auditoria atual**; pasta `reports/` ignorada pelo git — apagar artefactos locais antigos se contiverem dados de contas revogadas.  
- FASE 5 (quando existir): mesma regra de credenciais; ver `AUDITORIA.md`.  
- `dev-shell-probe.html`: `noindex`; uso previsto para CI / diagnóstico local.
