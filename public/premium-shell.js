const NAV_ITEMS = [
  { href: "dashboard-saas.html", label: "Dashboard", icon: "D", matches: ["dashboard-saas.html", "dashboard.html", "index.html"] },
  { href: "treinamento.html", label: "Treinamento", icon: "A", matches: ["treinamento.html"] },
  { href: "estoque.html", label: "Estoque", icon: "E", matches: ["estoque.html", "inventario.html"] },
  { href: "producao-etiquetas.html", label: "Produ\u00e7\u00e3o", icon: "P", matches: ["producao-etiquetas.html", "producao.html", "reposicao-producao.html"] },
  { href: "compras.html", label: "Compras", icon: "C", matches: ["compras.html", "dashboard-compras.html", "alertas-reposicao.html", "analise-compras.html"] },
  { href: "fornecedores.html", label: "Fornecedores", icon: "F", matches: ["fornecedores.html"] },
  { href: "desperdicio.html", label: "Desperd\u00edcio", icon: "!", matches: ["desperdicio.html"] },
  { href: "relatorio-diario.html", label: "Relat\u00f3rios", icon: "R", matches: ["relatorio-diario.html", "relatorio.html"] },
  { href: "impressora.html", label: "Etiquetas", icon: "T", matches: ["impressora.html", "etiquetas.html"] },
  { href: "funcionarios.html", label: "Funcion\u00e1rios", icon: "U", matches: ["funcionarios.html", "funcionarias.html"] },
  { href: "saas.html", label: "Configura\u00e7\u00f5es", icon: "S", matches: ["saas.html", "configuracoes.html"] }
];

function getCurrentPage() {
  const pathname = window.location.pathname || "";
  return pathname.split("/").pop() || "index.html";
}

function decorateBody() {
  if (document.body.classList.contains("premium-app-body") || document.body.classList.contains("page-login")) {
    return false;
  }

  const page = document.querySelector("main.page");
  if (!page) {
    return false;
  }

  document.body.classList.add("premium-global-body");
  document.body.classList.add("premium-saas-shell-body");
  page.classList.add("premium-page");
  return true;
}

function buildSidebar() {
  const current = getCurrentPage();
  const sidebar = document.createElement("aside");
  sidebar.className = "premium-global-sidebar";
  sidebar.setAttribute("aria-label", "Navega\u00e7\u00e3o SaaS");
  sidebar.innerHTML = `
    <a class="premium-global-brand" href="dashboard-saas.html" aria-label="Carioca's Opera\u00e7\u00e3o de Controle">
      <span><img src="cariocas-logo.jpeg" alt="" aria-hidden="true"></span>
      <strong>Carioca's</strong>
      <small>Opera\u00e7\u00e3o de Controle</small>
    </a>
    <nav class="premium-global-nav">
      ${NAV_ITEMS.map((item) => {
        const active = item.matches.includes(current) ? " active" : "";
        return `
          <a class="${active}" href="${item.href}">
            <span>${item.icon}</span>
            <strong>${item.label}</strong>
          </a>
        `;
      }).join("")}
    </nav>
  `;
  document.body.prepend(sidebar);
}

function buildDock() {
  const current = getCurrentPage();
  const dock = document.createElement("nav");
  dock.className = "premium-mobile-dock";
  dock.setAttribute("aria-label", "Navega\u00e7\u00e3o principal");
  const primaryItems = NAV_ITEMS.slice(0, 4);
  dock.innerHTML = primaryItems.map((item) => {
    const active = item.matches.includes(current) ? " active" : "";
    return `
      <a class="${active}" href="${item.href}">
        <span>${item.icon}</span>
        <strong>${item.label}</strong>
      </a>
    `;
  }).join("") + `
    <button class="premium-mobile-more" type="button" aria-expanded="false" aria-controls="premium-mobile-menu">
      <span>+</span>
      <strong>Mais</strong>
    </button>
  `;
  document.body.appendChild(dock);
}

function buildMobileMenu() {
  const current = getCurrentPage();
  const backdrop = document.createElement("div");
  backdrop.className = "premium-mobile-menu-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section id="premium-mobile-menu" class="premium-mobile-menu" aria-label="Menu completo" role="dialog" aria-modal="true">
      <header>
        <div>
          <strong>Menu do sistema</strong>
          <small>Todos os m\u00f3dulos</small>
        </div>
        <button class="premium-mobile-menu-close" type="button" aria-label="Fechar menu">x</button>
      </header>
      <div class="premium-mobile-menu-grid">
        ${NAV_ITEMS.map((item) => {
          const active = item.matches.includes(current) ? " active" : "";
          return `
            <a class="${active}" href="${item.href}">
              <span>${item.icon}</span>
              <strong>${item.label}</strong>
            </a>
          `;
        }).join("")}
      </div>
    </section>
  `;

  document.body.appendChild(backdrop);

  const moreButton = document.querySelector(".premium-mobile-more");
  const closeButton = backdrop.querySelector(".premium-mobile-menu-close");

  function toggleMenu(open) {
    backdrop.hidden = !open;
    document.body.classList.toggle("premium-mobile-menu-open", open);
    moreButton?.setAttribute("aria-expanded", String(open));
  }

  moreButton?.addEventListener("click", () => toggleMenu(backdrop.hidden));
  closeButton?.addEventListener("click", () => toggleMenu(false));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      toggleMenu(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) {
      toggleMenu(false);
    }
  });
}

function decorateHeader() {
  const header = document.querySelector(".premium-page > .page-header");
  if (!header) {
    return;
  }

  header.classList.add("premium-page-hero");
  const title = header.querySelector("h1");
  if (title && !header.querySelector(".premium-page-chip")) {
    const chip = document.createElement("span");
    chip.className = "premium-page-chip";
    chip.textContent = "Copiloto Food Service";
    title.insertAdjacentElement("afterend", chip);
  }
}

function decoratePanels() {
  document.querySelectorAll(".premium-page .panel").forEach((panel) => {
    panel.classList.add("premium-surface");
  });

  document.querySelectorAll(".premium-page .card").forEach((card) => {
    card.classList.add("premium-card-surface");
  });
}

function initPremiumShell() {
  if (!decorateBody()) {
    return;
  }

  decorateHeader();
  decoratePanels();
  buildSidebar();
  buildDock();
  buildMobileMenu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPremiumShell);
} else {
  initPremiumShell();
}
