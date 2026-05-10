# Auditoria técnica e visual — Hamburgueria / Operação Carioca's

**Data:** 9 de maio de 2026  
**Escopo:** `public/` (HTML/CSS/JS estáticos), `public/premium-shell.js`, `server.js` (referência), `src/` (rotas WhatsApp).  
**Objetivo declarado:** dashboard SaaS escuro, limpo, premium, com sidebar recolhível e menos ruído visual.

---

## 1. Arquivos principais mapeados

| Tipo | Arquivos |
|------|------------|
| **CSS** | `public/style.css` (~10k linhas, design system principal), `public/dashboard-saas-page.css` (tema/layout dashboard SaaS) |
| **JS front** | `public/app.js` (módulo Firebase, auth, APIs), `public/premium-shell.js` (topbar/sidebar/dock injetados), `public/firebase.js`, `public/operational-core.js`, `public/barcode-cache.js`, `public/sw.js` |
| **HTML operacionais** | `dashboard-saas.html`, `estoque.html`, `compras.html`, `producao.html`, `producao-etiquetas.html`, `fornecedores.html`, `desperdicio.html`, `etiquetas.html`, `impressora.html`, `funcionarios.html`, `funcionarias.html`, `whatsapp-ia.html`, `configuracoes.html`, `saas.html`, `login.html`, `alertas-reposicao.html`, `reposicao-producao.html`, `inventario.html`, `analise-compras.html`, `dashboard-compras.html`, `treinamento.html`, etc. |
| **HTML protótipo / mock** | `mockup*.html`, `mackup-clean-premium.html`, `saas-dashboard-prototype.html`, `demo*.html`, `layout-aprovacao.html` |
| **Entrada** | `index.html` → redireciona para `dashboard-saas.html` |

---

## 2. Páginas com layout “antigo” ou híbrido

| Gravidade | Observação |
|------------|------------|
| **Médio** | Várias páginas usam `<main class="page">` + `premium-shell.js`, que injeta topbar/sidebar — **bom caminho**, mas o markup não segue ainda o esqueleto semântico pedido (`.app-shell` > `.sidebar` > `.main-area` > `.topbar` > `.page-container`). |
| **Médio** | `dashboard-saas.html` tem **dois modos** no mesmo ficheiro: layout “approved” (`.approved-*`) e bloco legado **comentado** em HTML; risco de confusão em manutenção. |
| **Baixo** | Páginas `mockup*.html` / `demo*.html` são **protótipos**, não fluxo produtivo — tratadas como baixa prioridade para padronização. |

---

## 3. Topbar / header inconsistente

| Gravidade | Observação |
|------------|------------|
| **Médio** | `premium-shell.js` gera `.clean-topbar` apenas quando **não** existe `.clean-topbar` nem `.topbar` e o body é decorado; `dashboard-saas-page` **não** recebe essa topbar injetada (usa topbar própria / mobile). |
| **Médio** | `estoque.html` e similares usam `stock-page-header` / `page-header` — alinhado ao shell “clean”, mas não idêntico ao modelo único descrito no briefing (busca + notificações + avatar em todas as páginas). |

---

## 4. Sidebar / menu inconsistente

| Gravidade | Observação |
|------------|------------|
| **Alto** | Itens e rótulos do menu **diferiam** entre `premium-shell.js` (ex.: “Equipe”, “Treinamentos”, `saas.html` para configurações) e o pedido de produto (lista fixa com `configuracoes.html`, “Funcionários”, sem treino na lateral). **Corrigido nesta entrega** em `premium-shell.js` e nos blocos vivos de navegação do `dashboard-saas.html` (layout approved + gaveta mobile). |
| **Médio** | Sidebar **recolhível no desktop** não existia de forma global; **implementado** via classe `sidebar-desktop-collapsed` + persistência em `localStorage` em `premium-shell.js`, e equivalente em `dashboard-saas.html` para o botão `#dashboard-mobile-menu` em viewport larga. |
| **Baixo** | `dashboard-saas.html`: bloco HTML **legacy** permanece **comentado** (não entra no DOM); manutenção: remover comentário longo numa fase de limpeza. |

---

## 5. CSS duplicado

| Gravidade | Observação |
|------------|------------|
| **Médio** | Regras `body.dashboard-saas-page` espalhadas entre `style.css` (fim do ficheiro, shell “clean” + KPI), `dashboard-saas-page.css` e `dashboard-approved-real.css` (ex-inline). Consolidação futura possível. |
| **Médio** | `style.css` contém múltiplas camadas históricas (`.premium-*`, `body .panel`, resets duplicados). Consolidar exige fases e testes regressivos. |

---

## 6. Estilos inline excessivos

| Gravidade | Observação |
|------------|------------|
| **Baixo** | `dashboard-saas.html`: bloco inline massivo **foi migrado** para `dashboard-approved-real.css` (Fase 2 implementação). |
| **Baixo** | `login.html` e outras: `style` pontuais ou `style=""` em elementos isolados — aceitável a curto prazo. |

---

## 7. Cards desalinhados / grids

| Gravidade | Observação |
|------------|------------|
| **Médio** | KPIs e grids usam várias convenções (`.stock-kpi-grid`, `.premium-kpi-grid`, `.stats-grid`, `.summary-grid` inexistente até esta entrega). Foi adicionada **classe utilitária** `.summary-grid` no CSS global para novos blocos e referência. |
| **Baixo** | Alguns painéis usam `minmax(320px, …)` em lower grids — em viewports estreitas pode forçar scroll horizontal se não houver `min-width: 0` em toda a cadeia (já mitigado em vários seletores `body .premium-*`). |

---

## 8. Botões sem função (risco)

| Gravidade | Observação |
|------------|------------|
| **Médio** | Topbar injetada: notificações e contador **estáticos** (UI placeholder) — não integrados a `stock-alerts` / backend até onde a auditoria estática alcançou. |
| **Baixo** | `premium-shell.js` delega `[data-logout-button]` para `app.js` quando a página importa `./app.js` — páginas **sem** `app.js` podem ter logout sem handler (verificar página a página). |

---

## 9. Links quebrados / rotas

| Gravidade | Observação |
|------------|------------|
| **Baixo** | Verificar `href` relativos quando a app for servida de subpasta (hoje assume raiz em `/public`). Nenhum 404 óbvio nos `href` principais do menu após alinhar `configuracoes.html` e `etiquetas.html`. |

---

## 10. Scripts com erro (estático)

| Gravidade | Observação |
|------------|------------|
| **—** | Não foi executada suíte automatizada de browser nesta auditoria. Recomenda-se `npm test` / smoke manual conforme `CHECKLIST_TESTES.md`. |

---

## 11. Responsividade

| Gravidade | Observação |
|------------|------------|
| **Médio** | Breakpoints mistos no passado (`760` vs `768`, etc.); parte já foi harmonizada em trabalhos anteriores; shell SaaS no fim de `style.css` usa **1200 / 1024 / 768**. |
| **Baixo** | `html, body { overflow-x: hidden }` mascara overflow real — convém testar formulários largos e tabelas. |

---

## 12. Ortografia visível

| Gravidade | Observação |
|------------|------------|
| **Baixo** | “Desperdício” é o termo usual em PT-BR para perda de alimento; o projeto já usa essa grafia no menu. |
| **Baixo** | `weekdayLabels` em JS usa `"Sab"` em vez de `"Sáb"` — cosmético. |

---

## 13. Componentes fora do padrão

| Gravidade | Observação |
|------------|------------|
| **Médio** | Gradientes radiais fortes em `body` / `.premium-global-body` — pedido de visual **mais sóbrio**; nesta entrega a intensidade foi **ligeiramente reduzida** em `:root` / `body` (sem remover identidade). |
| **Médio** | Ícones do menu misturam letras (`D`, `E`) e SVGs no dashboard — aceitável, mas convém unificar (SVG outline ou icon font único). |

---

## 14. Dados sensíveis no front-end

| Gravidade | Observação |
|------------|------------|
| **Informativo** | `public/firebase.js` expõe `apiKey` e `projectId` — **padrão do SDK web Firebase** (não é secret de servidor); segurança depende de **regras Firestore/Storage** e domínios autorizados. |
| **Alto** | Qualquer página que imprima tokens ou chaves de Evolution/API no DOM/JS seria crítico — `whatsapp-ia.html` menciona explicitamente não expor tokens; `app.js` comenta que token Evolution fica no servidor. **Revisar** qualquer novo código antes de commit. |
| **Médio** | `parseUserInfo()` em `premium-shell.js` tem **fallback** com nome exemplo se não houver DOM — apenas UX demo; em produção garantir que dados vêm sempre de auth/profile. |

---

## O que foi corrigido nesta entrega

1. **Variáveis globais** alinhadas ao briefing (`--container-max`, `--bg-sidebar`, `--bg-topbar`, cores de texto, raios, sombra suave) em `public/style.css` (`:root`), mantendo compatibilidade com variáveis existentes (`--brand`, `--text`, etc.).
2. **`.premium-page`** passa a usar `max-width: var(--container-max)` (1240px).
3. **Classe utilitária `.summary-grid`** com breakpoints 1024 / 640.
4. **Topbar clean**: borda inferior vermelha discreta (`.clean-topbar`).
5. **`premium-shell.js`**: menu lateral padronizado à lista pedida; remoção de “Treinamentos” da navegação lateral (ajuda continua acessível pela topbar); `configuracoes.html` para Configurações; `etiquetas.html` para Etiquetas; rótulo “Funcionários”; classe `app-shell` no body; **sidebar recolhível no desktop** com `localStorage`; fechamento da gaveta mobile ao clicar em links; persistência do estado recolhido.
6. **`dashboard-saas.html`**: mesmos ajustes de menu na sidebar approved e na gaveta “Mais opções”; botão menu em desktop alterna **recolher sidebar** (`dashboard-sidebar-collapsed`); fechar gaveta ao seguir link; ícones SVG para `etiquetas.html` e `configuracoes.html` onde aplicável.
7. **CSS** para estado recolhido do dashboard no fim de `style.css`.
8. **Documentação:** `AUDITORIA.md` e `CHECKLIST_TESTES.md` na raiz do repositório.

---

## Fase 2 — Estabilização e padronização (entrega)

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `public/dashboard-saas.html` | Removido `<style id="dashboard-approved-real-style">` (~1069 linhas). `<head>`: ordem `style.css` → `dashboard-saas-page.css` → `dashboard-approved-real.css` → `premium-shell.js`. `body` com classe **`dashboard-approved-real`** para ativar a folha migrada. |
| `public/dashboard-approved-real.css` | **Novo.** Conteúdo migrado do inline; comentário de uso. Três regras `:hover` sem `!important` (border-color). Demais `!important` mantidos onde o cascade global (`style.css`) ainda força overrides. |
| `public/dashboard-saas-page.css` | Comentário de cabeçalho atualizado (ordem de carregamento). |
| `public/style.css` | `.page`: `max-width: var(--container-max)` e padding horizontal responsivo (`clamp`). |
| `AUDITORIA.md` | Esta secção e pendências atualizadas. |
| `CHECKLIST_TESTES.md` | Secção Fase 2, ordem CSS do dashboard, teste visual. |

### CSS removido ou migrado

- **Removido do HTML:** bloco inline `dashboard-approved-real-style` integral.
- **Passou a:** `public/dashboard-approved-real.css` (apenas páginas que incluam a folha e usem `body.dashboard-approved-real`; hoje o dashboard SaaS).

### Páginas consideradas padronizadas (shell + conteúdo)

| Página | Notas |
|--------|--------|
| `dashboard-saas.html` | Três folhas CSS; topbar própria + classes approved; menu ☰ desktop/mobile já tratado no script da página. |
| `estoque.html`, `compras.html`, `fornecedores.html`, `desperdicio.html`, `funcionarios.html`, `whatsapp-ia.html` | `style.css` + `premium-shell.js`; `main.page` recebe `.premium-page`; topbar injetada; sidebar recolhível (desktop) e gaveta (mobile). |
| `producao.html`, `etiquetas.html`, `configuracoes.html` | **Redirecionam** para `producao-etiquetas.html`, `impressora.html`, `saas.html` — padronização efetiva nas **páginas destino** (todas com `premium-shell.js`). |
| `saas.html` | Configurações efetivas; mesmo padrão de shell. |
| `impressora.html`, `producao-etiquetas.html` | Destinos de etiquetas/produção; shell global. |

### O que ainda precisa de teste manual

- **Dashboard** com `dashboard-approved-real` ativo: regressão visual (topbar fixa 58px, tipografia Plus Jakarta Sans, grids `stats-grid` / `grid-main`) em **1280 / 1024 / 768 / 640 / 480** px.
- **Scroll horizontal:** formulários largos e tabelas em `estoque.html` / `compras.html` (overflow-x global pode mascarar problemas).
- **Menu ☰:** em páginas com shell injetado, botão `.clean-menu-button`; no dashboard, `#dashboard-mobile-menu` — comportamentos distintos mas cobertos.
- **IDs duplicados** em `dashboard-saas.html` (ex.: dois `dashboard-alert-drawer-backdrop` no fonte) — **pré-existente**; validar qual nó o `getElementById` resolve em runtime.

### Redução de `!important`

- No ficheiro `dashboard-approved-real.css`: **3 ocorrências** removidas (hover `border-color` em cards). Restantes **~36** mantidas para vencer regras globais com `!important` em `style.css`; remoção adicional exige refator por módulo (risco de regressão).

## Pendências recomendadas (próximas fases)

1. ~~Migrar `dashboard-approved-real-style` para ficheiro CSS externo~~ **Feito.**
2. Unificar topbar real (busca funcional, notificações reais, avatar de auth) em **todas** as páginas com `premium-shell.js`.
3. Introduzir markup semântico `.app-shell` / `.main-area` / `.page-container` sem quebrar CSS existente (wrapper progressivo).
4. Auditoria dinâmica: Lighthouse, testes E2E, validação de links com crawler.
5. Revisar páginas que **não** carregam `app.js` e garantir `data-logout-button` funcional.
6. ~~Eliminar **IDs duplicados**~~ — **Esclarecimento (validação Fase 2):** segundo `dashboard-alert-drawer-backdrop` no ficheiro está **dentro de comentário HTML** (`<!-- Legacy...` … `-->`); o DOM ativo tem um único id. Remover o comentário grande reduz ruído no repositório.

---

## FASE 2 — Validação prática e correções

**Data:** 9 de maio de 2026  
**Escopo:** Execução de checklist e testes automáticos existentes no repositório; sem nova auditoria completa do zero.

### Método

- `npm run check:smoke` — servidor em `127.0.0.1:3100`, 17 rotas HTTP (inclui `dashboard-saas.html`, `estoque.html`, `compras.html`, `funcionarios.html`, `alertas-reposicao.html`, `producao-etiquetas.html`, etc.).
- `npm run check:html` — 35 ficheiros HTML com módulos validados.
- HTTP GET manual adicional às 12 rotas do pedido Fase 2 (todas **200**).
- **Não realizado:** inspeção visual em browser, consola F12, testes tácteis em dispositivos reais.

### Páginas testadas (servidor / HTML)

| Página | HTTP | Notas |
|--------|------|--------|
| `dashboard-saas.html` | 200 | Head e folhas CSS conferidas; shell “approved” ativo com classe no `body`. |
| `estoque.html`, `compras.html`, `fornecedores.html`, `desperdicio.html`, `funcionarios.html`, `whatsapp-ia.html`, `alertas-reposicao.html`, `producao-etiquetas.html` | 200 | Shell via `premium-shell.js`. |
| `etiquetas.html`, `configuracoes.html` | 200 | Páginas de redirect. |
| `login.html` | 200 | Sem shell global (esperado). |

### Problemas encontrados

| Gravidade | Descrição |
|-----------|------------|
| — | Nenhuma **FALHA** de rota ou de `check:html` / `check:smoke`. |
| média | Interação ☰, sidebar recolhível, overflow em tabelas largas e erros de **consola** em runtime **não** validados automaticamente. |
| baixa | Topbar do **dashboard** continua nativa; demais páginas usam topbar injetada — assimetria já conhecida, não alterada (fora de “refazer layout”). |
| informativo | Duplicação de `id` no **código-fonte** do dashboard: o segundo bloco está **comentado**; não afeta o DOM. |

### Problemas corrigidos (seguro)

| Alteração | Ficheiro |
|-----------|----------|
| `main.premium-page` com `min-width: 0` no contexto do shell para reduzir risco de overflow horizontal em layouts flex. | `public/style.css` |

### Problemas pendentes (revisão manual recomendada)

- Consola do browser (erros JS/rede) com utilizador autenticado.
- Breakpoints 1280 / 1024 / 768 / 640 / 480 em páginas com tabelas e formulários longos.
- Botão de notificações da topbar injetada (placeholder).
- Logout onde `app.js` não está carregado.

### Arquivos alterados nesta Fase 2 (validação)

- `public/style.css` — regra `min-width: 0` para `main.premium-page` no shell.
- `CHECKLIST_TESTES.md` — preenchimento com status, observações, gravidade e coluna de correção.
- `AUDITORIA.md` — esta secção; retificações nas secções 4–6 sobre CSS inline e IDs.

### Próximos passos

1. Percorrer `CHECKLIST_TESTES.md` no browser e marcar **OK** nas linhas **REVISÃO MANUAL** após validação humana.  
2. Opcional: apagar o comentário HTML gigante “Legacy dashboard” em `dashboard-saas.html` num PR de limpeza (sem mudar DOM).  
3. Integrar notificações reais ou mensagem “Em breve” discreta no botão da topbar.

### Síntese para uso real

- **Páginas OK (servidor):** todas as listadas na tabela acima.  
- **Falhas automáticas:** nenhuma.  
- **Crítico antes de uso real:** depende de **auth Firebase**, **regras** e teste manual de fluxos; não foi detetado bloqueio técnico pelos testes corridos.

---

## FASE 3 — Validação visual no navegador

**Data:** 9 de maio de 2026  
**Escopo:** Fechar pendências “REVISÃO MANUAL” da Fase 2 com **Playwright (Chromium)** nos viewports pedidos; correções **seguras** de CSS/UX; sem nova auditoria geral, sem mudança de regra de negócio.

### Método

- `npm run check:phase3` → `scripts/phase3-visual-check.mjs` (sobe `server.js`, 7 larguras: 1440, 1280, 1024, 768, 640, 480, 390).
- **Consola:** erros `console` / `pageerror` recolhidos; filtros para ruído de rede/SDK e mensagem esperada “Usuário não autenticado”.
- **Overflow:** `max(scrollWidth documentElement, body) − innerWidth` por viewport.
- **Shell sem Firebase:** `public/dev-shell-probe.html` (`noindex`) — apenas `<main class="page">` + `premium-shell.js`, para toggles ☰ e gaveta sem `requireAuth`.
- **Páginas reais com `requireAuth`:** sem sessão Firebase, o URL final foi **`login.html`** em todos os viewports (gate de auth confirmado). O layout denso (tabelas, KPIs com dados) **não** foi observado neste ambiente.

### Páginas testadas (URLs iniciais)

`dashboard-saas.html`, `estoque.html`, `compras.html`, `fornecedores.html`, `desperdicio.html`, `etiquetas.html`, `funcionarios.html`, `whatsapp-ia.html`, `configuracoes.html`, `login.html`, `alertas-reposicao.html`, `producao-etiquetas.html`, mais `dev-shell-probe.html`.

### Viewports testados

1440, 1280, 1024, 768, 640, 480, 390 (px).

### Problemas visuais / UX encontrados

| Gravidade | Descrição |
|-----------|------------|
| **Alta** (corrigida) | Em páginas com shell injetado, o botão ☰ (`.top-menu`) estava **`display: none` no desktop** — sidebar recolhível inacessível. |
| **Baixa** | Gaveta mobile: em viewports estreitos o painel pode ocupar **100%** da largura; fechar com “clique no escuro” pode não aplicar — **Escape** e botão × continuam válidos. |
| **Informativo** | Topbar do dashboard continua distinta da topbar injetada (já conhecido; aceitável). |

### Problemas corrigidos

| Alteração | Ficheiro |
|-----------|----------|
| ☰ visível no desktop no shell global (`display: flex` em `.top-menu`). | `public/style.css` |
| Tooltip/`title` no botão de notificações (placeholder). | `public/premium-shell.js` |
| Suíte headless reprodutível + probe HTML. | `scripts/phase3-visual-check.mjs`, `public/dev-shell-probe.html`, `package.json` (`check:phase3`, dependência `playwright`) |

### Problemas pendentes

- Validar **com sessão Firebase:** consola, KPIs, tabelas largas, “clique fora” da gaveta quando houver margem visível do backdrop.
- **Regras Firebase** e ambiente de produção (fora do âmbito do front estático).

### Arquivos alterados (Fase 3)

- `public/style.css`
- `public/premium-shell.js`
- `public/dev-shell-probe.html` (novo)
- `scripts/phase3-visual-check.mjs` (novo)
- `package.json` (`playwright` devDependency, script `check:phase3`)
- `CHECKLIST_TESTES.md`
- `AUDITORIA.md` (esta secção)

### Conclusão — prontidão para alimentar dados reais

**Sim, com ressalvas:** o fluxo de **login** e o **shell** estão coerentes e testados no headless; o **bloqueio por auth** comporta-se como esperado. Antes de uso intensivo em produção, recomenda-se um **passe manual autenticado** (especialmente `estoque.html`, `dashboard-saas.html`, `impressora.html`, `saas.html`) e confirmação das **regras** do Firestore.

---

## FASE 4 — Auditoria autenticada com Firebase

**Data (última revisão documental):** 9 de maio de 2026  
**Conta:** apenas a conta de auditoria **atual**, configurada em tempo de execução com `PHASE4_EMAIL` e `PHASE4_PASSWORD` (nunca no repositório).

**Histórico — conta descontinuada:** uma conta de auditoria anterior foi **removida do Firebase** (credenciais perdidas). **Não** a utilizar, não a documentar nem manter JSON/capturas em `reports/` que a identifiquem. Qualquer run antigo deixa de ter valor operacional.

**Escopo:** Playwright (`check:phase4`) com credenciais de ambiente; módulos listados abaixo em 7 viewports; overflow; `permission-denied` / alertas; shell e logout. O output JSON do script **omite** o endereço de e-mail (não versionar identificadores).

### Método

- `npm run check:phase4` → `scripts/phase4-authenticated-audit.mjs` (`PHASE4_EMAIL`, `PHASE4_PASSWORD`).
- `npm run audit:firestore-user` → `PHASE4_EMAIL` (resolve UID) ou `PHASE4_UID` explícito para leitura Admin de `usuarios/{uid}`.

### Páginas testadas (com sessão)

`dashboard-saas.html`, `estoque.html`, `compras.html`, `fornecedores.html`, `desperdicio.html`, `funcionarios.html`, `whatsapp-ia.html`, `configuracoes.html` (destino `saas.html`), `alertas-reposicao.html`, `producao-etiquetas.html`, `relatorio-diario.html`.

### Viewports

1440, 1280, 1024, 768, 640, 480, 390 (px) — aplicados em cada módulo e de novo em `dashboard-saas` + `estoque` na secção responsiva.

### Problemas encontrados

| Gravidade | Descrição |
|-----------|------------|
| **Alta** | `desperdicio.html` comparava `profile.tipo` com `["admin","estoque"]` **sem** normalizar — utilizadores `proprietario` eram tratados como não autorizados (`throw new Error("Acesso restrito.")`, redirect). |
| **Média** | Em alguns runs, o Admin SDK não encontrou `usuarios/{uid}` apesar do `project_id` alinhado com `firebase.js` — rever UID Auth vs documento Firestore para a **conta atual** (`audit:firestore-user` com `PHASE4_EMAIL` atual). |
| **Baixa** | CRUD completo e impressão física **não** cobertos pelo script automatizado; dados manuais devem usar os nomes canónicos abaixo. |

### Dados de teste canónicos (FASE 4)

| Identificador | Uso |
|---------------|-----|
| `TESTE_AUDITORIA_INSUMO` | Insumo em estoque. |
| `TESTE_AUDITORIA_FORNECEDOR` | Fornecedor. |
| `TESTE_AUDITORIA_ENTRADA` | Rastreio de entrada de estoque (observação/referência). |
| `TESTE_AUDITORIA_SAIDA` | Rastreio de saída de estoque (observação/referência). |

### Problemas corrigidos

| Alteração | Ficheiro |
|-----------|----------|
| Exportar `normalizePermissionRole` e usar no gate de acesso ao desperdício (`perfilPrincipal` / `tipo` → `proprietario` ≡ `admin`). | `public/app.js`, `public/desperdicio.html` |

### Problemas pendentes

- Confirmar na consola Firebase que existe documento `usuarios/{uid}` com o **mesmo UID** que Authentication para a **conta de auditoria atual**; `npm run audit:firestore-user` com `PHASE4_EMAIL` atual.
- Validar manualmente: criação com `TESTE_AUDITORIA_INSUMO` / `TESTE_AUDITORIA_FORNECEDOR`, movimentos com referência `TESTE_AUDITORIA_ENTRADA` / `TESTE_AUDITORIA_SAIDA`, e etiqueta real se necessário.

### Arquivos alterados / adicionados (Fase 4)

- `public/app.js` — export `normalizePermissionRole`.
- `public/desperdicio.html` — gate de papel com papel normalizado.
- `scripts/phase4-authenticated-audit.mjs` (novo), `scripts/phase4-firestore-usuario.mjs` (novo).
- `package.json` — script `check:phase4`.
- `.gitignore` — pasta `reports/`.
- `CHECKLIST_TESTES.md`, `AUDITORIA.md` (esta secção).

### Relatório final (perguntas do pedido)

1. **Produtos reais:** sim, após confirmação de regras/backup; módulo **Estoque** acessível.  
2. **Fornecedores reais:** sim ao nível de permissão e carregamento da página; gravar ainda validado manualmente.  
3. **Estoque funcional:** sim (UI + auth); movimentações não exercitadas pelo headless.  
4. **Reposição funcional:** sim (página **alertas** OK); depende de dados e jobs.  
5. **Etiquetas:** **produção** OK no browser; impressora física e `impressora.html` fora do script.  
6. **Erro crítico:** bloqueio **Desperdício** para proprietário — **corrigido**.  
7. **Segurança:** sem exposição de senha em artefactos; chave pública Firebase é esperada; revisar **regras Firestore** em consola.  
8. **Não levar a produção sem revisão:** **WhatsApp/IA** (integrações), relatórios com dados financeiros, e qualquer fluxo ainda não validado com gravação real.

---

## FASE 5 — (reservado)

**Regra:** qualquer automação ou documentação futura nesta fase deve usar **somente** credenciais da conta de auditoria **atual** via variáveis de ambiente (`PHASE4_EMAIL` / `PHASE4_PASSWORD` ou nomes documentados no `package.json` quando existirem). **Proibido:** UIDs ou e-mails de contas revogadas no código ou em relatórios versionados.

---

## Recomendações futuras

- Design tokens únicos (JSON ou `:root` único) gerados a partir de uma fonte.
- Storybook ou página `/ui-kit.html` com botões, inputs, tabelas e cards.
- Feature flag para “modo approved” vs “modo premium-shell” no dashboard até unificação completa.
