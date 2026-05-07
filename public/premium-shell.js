const NAV_ITEMS = [
  { href: "dashboard-saas.html", label: "Vis\u00e3o Geral", icon: "home", matches: ["dashboard-saas.html", "dashboard.html", "index.html"] },
  { href: "estoque.html", label: "Central de Estoque", icon: "boxes", matches: ["estoque.html", "inventario.html"] },
  { href: "producao-etiquetas.html", label: "Produ\u00e7\u00e3o", icon: "chef", matches: ["producao-etiquetas.html", "producao.html", "reposicao-producao.html"] },
  { href: "compras.html", label: "Compras", icon: "cart", matches: ["compras.html", "dashboard-compras.html", "alertas-reposicao.html", "analise-compras.html"] },
  { href: "treinamento.html", label: "Treinamento", icon: "graduation", matches: ["treinamento.html"] },
  { href: "fornecedores.html", label: "Fornecedores", icon: "truck", matches: ["fornecedores.html"] },
  { href: "desperdicio.html", label: "Desperd\u00edcio", icon: "alert", matches: ["desperdicio.html"] },
  { href: "relatorio-diario.html", label: "Relat\u00f3rios", icon: "chart", matches: ["relatorio-diario.html", "relatorio.html"] },
  { href: "impressora.html", label: "Etiquetas", icon: "tag", matches: ["impressora.html", "etiquetas.html"] },
  { href: "whatsapp-ia.html", label: "WhatsApp e IA", icon: "bot", matches: ["whatsapp-ia.html"] },
  { href: "funcionarios.html", label: "Equipe", icon: "users", matches: ["funcionarios.html", "funcionarias.html"] },
  { href: "saas.html", label: "Configura\u00e7\u00f5es", icon: "settings", matches: ["saas.html", "configuracoes.html"] }
];

function svgIcon(name) {
  const icons = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h5v-5h4v5h5v-9.5"/></svg>',
    boxes: '<svg viewBox="0 0 24 24"><path d="M7 8h10v10H7z"/><path d="M3 6h8v8H3z"/><path d="M13 6h8v8h-8z"/></svg>',
    chef: '<svg viewBox="0 0 24 24"><path d="M6 18h12"/><path d="M7 18v-6"/><path d="M17 18v-6"/><path d="M8 12c-2 0-4-1.5-4-3.5S5.5 5 7.5 5c.8-1.8 2.4-3 4.5-3s3.7 1.2 4.5 3c2 0 3.5 1.5 3.5 3.5S18 12 16 12"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h3l3 12h10l3-8H7"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><path d="M3 7h11v10H3z"/><path d="M14 11h4l3 3v3h-7"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4"/><path d="M8.5 13h.01"/><path d="M15.5 13h.01"/><path d="M9 18v2"/><path d="M15 18v2"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    graduation: '<svg viewBox="0 0 24 24"><path d="m22 10-10-5-10 5 10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.6v.3H9.2V22a1.7 1.7 0 0 0-.8-1.6 1.7 1.7 0 0 0-2-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.7V10H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.1A1.7 1.7 0 0 0 9.2 2v-.3h5.6V2a1.7 1.7 0 0 0 .8 1.6 1.7 1.7 0 0 0 2 .1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.3v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 3v18"/></svg>'
  };
  return icons[name] || icons.home;
}

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
            <span class="premium-svg-icon" aria-hidden="true">${svgIcon(item.icon)}</span>
            <strong>${item.label}</strong>
          </a>
        `;
      }).join("")}
    </nav>
    <button class="premium-global-logout" type="button" data-logout-button>
      <span class="premium-svg-icon" aria-hidden="true">${svgIcon("logout")}</span>
      <strong>Sair</strong>
    </button>
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
        <span class="premium-svg-icon" aria-hidden="true">${svgIcon(item.icon)}</span>
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
              <span class="premium-svg-icon" aria-hidden="true">${svgIcon(item.icon)}</span>
              <strong>${item.label}</strong>
            </a>
          `;
        }).join("")}
        <button type="button" data-logout-button>
          <span class="premium-svg-icon" aria-hidden="true">${svgIcon("logout")}</span>
          <strong>Sair</strong>
        </button>
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
