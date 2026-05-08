const NAV_ITEMS = [
  { href: "dashboard-saas.html", label: "Vis\u00e3o Geral", icon: "D", matches: ["dashboard-saas.html", "dashboard.html", "index.html"] },
  { href: "estoque.html", label: "Central de Estoque", icon: "E", matches: ["estoque.html", "inventario.html"] },
  { href: "alertas-reposicao.html", label: "Reposi\u00e7\u00e3o Inteligente", icon: "R", matches: ["alertas-reposicao.html", "reposicao-producao.html"] },
  { href: "producao-etiquetas.html", label: "Produ\u00e7\u00e3o", icon: "P", matches: ["producao-etiquetas.html", "producao.html"] },
  { href: "compras.html", label: "Intelig\u00eancia de Compras", icon: "C", matches: ["compras.html", "dashboard-compras.html", "analise-compras.html"] },
  { href: "fornecedores.html", label: "Fornecedores", icon: "F", matches: ["fornecedores.html"] },
  { href: "desperdicio.html", label: "Desperd\u00edcio", icon: "!", matches: ["desperdicio.html"] },
  { href: "impressora.html", label: "Etiquetas", icon: "T", matches: ["impressora.html", "etiquetas.html"] },
  { href: "whatsapp-ia.html", label: "WhatsApp e IA", icon: "W", matches: ["whatsapp-ia.html"] },
  { href: "funcionarios.html", label: "Equipe", icon: "U", matches: ["funcionarios.html", "funcionarias.html"] },
  { href: "treinamento.html", label: "Treinamentos", icon: "A", matches: ["treinamento.html"] },
  { href: "saas.html", label: "Configura\u00e7\u00f5es", icon: "S", matches: ["saas.html", "configuracoes.html"] }
];

function getCurrentPage() {
  const pathname = window.location.pathname || "";
  return pathname.split("/").pop() || "index.html";
}

function isActive(item, current) {
  return item.matches.includes(current);
}

function getInitials(value) {
  return String(value || "Carioca")
    .split(/[\s|@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "C";
}

function parseUserInfo() {
  const userInfo = document.getElementById("user-info")?.textContent?.trim();
  const dashboardName = document.getElementById("dashboard-user-name")?.textContent?.trim();
  const dashboardRole = document.getElementById("dashboard-user-role")?.textContent?.trim();

  if (dashboardName && !/carregando/i.test(dashboardName)) {
    return {
      name: dashboardName,
      role: dashboardRole && !/perfil/i.test(dashboardRole) ? dashboardRole : "Admin"
    };
  }

  if (userInfo) {
    const parts = userInfo.split("|").map((part) => part.trim()).filter(Boolean);
    return {
      name: parts[0] || userInfo,
      role: parts[2] || parts[1] || "Opera\u00e7\u00e3o"
    };
  }

  return { name: "Taiana Dias", role: "Admin" };
}

function syncTopbarUser() {
  const { name, role } = parseUserInfo();
  document.querySelectorAll("[data-shell-user-name]").forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll("[data-shell-user-role]").forEach((node) => {
    node.textContent = role;
  });
  document.querySelectorAll("[data-shell-user-initials]").forEach((node) => {
    node.textContent = getInitials(name);
  });
}

function watchUserInfo() {
  syncTopbarUser();
  const targets = [
    document.getElementById("user-info"),
    document.getElementById("dashboard-user-name"),
    document.getElementById("dashboard-user-role")
  ].filter(Boolean);

  targets.forEach((target) => {
    new MutationObserver(syncTopbarUser).observe(target, {
      childList: true,
      characterData: true,
      subtree: true
    });
  });
}

function buildTopbar() {
  if (document.querySelector(".clean-topbar")) {
    return;
  }

  const topbar = document.createElement("header");
  topbar.className = "clean-topbar";
  topbar.innerHTML = `
    <button class="clean-menu-button" type="button" aria-label="Abrir menu">
      <span></span><span></span><span></span>
    </button>
    <a class="clean-brand" href="dashboard-saas.html" aria-label="Carioca's Operacao de Controle">
      <span class="clean-brand-mark">C</span>
      <span>
        <strong>Carioca's <b>PRO</b></strong>
        <small>Opera\u00e7\u00e3o de Controle</small>
      </span>
    </a>
    <label class="clean-search">
      <span>Buscar</span>
      <input type="search" placeholder="Buscar no sistema...">
      <kbd>Ctrl K</kbd>
    </label>
    <div class="clean-topbar-spacer"></div>
    <button class="clean-notification-button" type="button" aria-label="Notifica\u00e7\u00f5es">
      <span>!</span>
      <b>8</b>
    </button>
    <a class="clean-help-button" href="treinamento.html" aria-label="Treinamentos">?</a>
    <button class="clean-user-pill" type="button" aria-label="Perfil">
      <span data-shell-user-initials>TD</span>
      <strong data-shell-user-name>Taiana Dias</strong>
      <small data-shell-user-role>Admin</small>
    </button>
  `;
  document.body.prepend(topbar);
}

function buildSidebar() {
  if (document.querySelector(".premium-global-sidebar") || document.body.classList.contains("dashboard-saas-page")) {
    return;
  }

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
      ${NAV_ITEMS.map((item) => `
        <a class="${isActive(item, current) ? "active" : ""}" href="${item.href}">
          <span>${item.icon}</span>
          <strong>${item.label}</strong>
        </a>
      `).join("")}
    </nav>
    <button class="premium-global-logout" type="button" data-logout-button>
      <span>X</span>
      <strong>Sair</strong>
    </button>
  `;
  document.body.insertBefore(sidebar, document.querySelector(".clean-topbar")?.nextSibling || document.body.firstChild);
}

function buildDock() {
  if (document.querySelector(".premium-mobile-dock") || document.body.classList.contains("dashboard-saas-page")) {
    return;
  }

  const current = getCurrentPage();
  const primaryItems = NAV_ITEMS.slice(0, 4);
  const dock = document.createElement("nav");
  dock.className = "premium-mobile-dock";
  dock.setAttribute("aria-label", "Navega\u00e7\u00e3o principal");
  dock.innerHTML = primaryItems.map((item) => `
    <a class="${isActive(item, current) ? "active" : ""}" href="${item.href}">
      <span>${item.icon}</span>
      <strong>${item.label.split(" ")[0]}</strong>
    </a>
  `).join("") + `
    <button class="premium-mobile-more" type="button" aria-expanded="false" aria-controls="premium-mobile-menu">
      <span>+</span>
      <strong>Mais</strong>
    </button>
  `;
  document.body.appendChild(dock);
}

function buildMobileMenu() {
  if (document.querySelector(".premium-mobile-menu-backdrop") || document.body.classList.contains("dashboard-saas-page")) {
    return;
  }

  const current = getCurrentPage();
  const backdrop = document.createElement("div");
  backdrop.className = "premium-mobile-menu-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section id="premium-mobile-menu" class="premium-mobile-menu" aria-label="Menu completo" role="dialog" aria-modal="true">
      <header>
        <div>
          <strong>Menu do sistema</strong>
          <small>Todos os m\u00f3dulos da opera\u00e7\u00e3o</small>
        </div>
        <button class="premium-mobile-menu-close" type="button" aria-label="Fechar menu">x</button>
      </header>
      <div class="premium-mobile-menu-grid">
        ${NAV_ITEMS.map((item) => `
          <a class="${isActive(item, current) ? "active" : ""}" href="${item.href}">
            <span>${item.icon}</span>
            <strong>${item.label}</strong>
          </a>
        `).join("")}
        <button type="button" data-logout-button>
          <span>X</span>
          <strong>Sair</strong>
        </button>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);
}

function toggleMobileMenu(open) {
  const genericBackdrop = document.querySelector(".premium-mobile-menu-backdrop");
  const genericMore = document.querySelector(".premium-mobile-more");
  const dashboardMore = document.getElementById("dashboard-mobile-more");

  if (document.body.classList.contains("dashboard-saas-page") && dashboardMore) {
    dashboardMore.click();
    return;
  }

  if (!genericBackdrop) {
    return;
  }

  genericBackdrop.hidden = !open;
  document.body.classList.toggle("premium-mobile-menu-open", open);
  genericMore?.setAttribute("aria-expanded", String(open));
}

function bindShellInteractions() {
  document.querySelector(".clean-menu-button")?.addEventListener("click", () => toggleMobileMenu(true));
  document.querySelector(".premium-mobile-more")?.addEventListener("click", () => toggleMobileMenu(true));
  document.querySelector(".premium-mobile-menu-close")?.addEventListener("click", () => toggleMobileMenu(false));
  document.querySelector(".premium-mobile-menu-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      toggleMobileMenu(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleMobileMenu(false);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.querySelector(".clean-search input")?.focus();
    }
  });
}

function decorateBody() {
  if (document.body.classList.contains("page-login") || document.body.classList.contains("login-premium-body")) {
    return false;
  }

  if (document.body.classList.contains("dashboard-saas-page")) {
    document.body.classList.add("premium-clean-shell");
    return true;
  }

  const page = document.querySelector("main.page");
  if (!page) {
    return false;
  }

  document.body.classList.add("premium-global-body", "premium-saas-shell-body", "premium-clean-shell");
  page.classList.add("premium-page");
  return true;
}

function decorateContent() {
  const header = document.querySelector(".premium-page > .page-header");
  if (header) {
    header.classList.add("premium-page-hero");
  }

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

  buildTopbar();
  buildSidebar();
  buildDock();
  buildMobileMenu();
  decorateContent();
  bindShellInteractions();
  watchUserInfo();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPremiumShell);
} else {
  initPremiumShell();
}
