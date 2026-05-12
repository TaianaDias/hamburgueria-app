/**
 * Navegação aprovada — fonte única (Etapa 3: base visual / menu SaaS).
 * Grupos alinhados à lógica operacional + comercial; rotas preservadas.
 */
const APPROVED_NAV_BLOCKS = [
  {
    items: [
      {
        href: "dashboard-saas.html",
        label: "Vis\u00e3o Geral",
        tone: "red",
        matches: ["dashboard-saas.html", "dashboard.html", "index.html"]
      }
    ]
  },
  { divider: true },
  {
    section: "Opera\u00e7\u00e3o",
    items: [
      { href: "estoque.html", label: "Estoque", tone: "orange", matches: ["estoque.html", "inventario.html"] },
      { href: "compras.html", label: "Compras", tone: "purple", matches: ["compras.html", "dashboard-compras.html", "analise-compras.html"] },
      { href: "alertas-reposicao.html", label: "Alertas de reposi\u00e7\u00e3o", tone: "teal", matches: ["alertas-reposicao.html", "reposicao-producao.html"] },
      { href: "desperdicio.html", label: "Desperd\u00edcio", tone: "yellow", matches: ["desperdicio.html"] },
      { href: "etiquetas.html", label: "Etiquetas", tone: "gray", matches: ["etiquetas.html", "impressora.html"] },
      { href: "producao-etiquetas.html", label: "Produ\u00e7\u00e3o de etiquetas", tone: "blue", matches: ["producao-etiquetas.html", "producao.html"] }
    ]
  },
  { divider: true },
  {
    section: "Relacionamentos",
    items: [
      { href: "fornecedores.html", label: "Fornecedores", tone: "green", matches: ["fornecedores.html"] },
      { href: "funcionarios.html", label: "Funcion\u00e1rios", tone: "gray", matches: ["funcionarios.html", "funcionarias.html"] },
      { href: "treinamento.html", label: "Treinamento", tone: "gray", matches: ["treinamento.html"] }
    ]
  },
  { divider: true },
  {
    section: "Automa\u00e7\u00e3o",
    items: [{ href: "whatsapp-ia.html", label: "WhatsApp IA", tone: "gray", matches: ["whatsapp-ia.html"] }]
  },
  { divider: true },
  {
    section: "Sistema",
    items: [{ href: "configuracoes.html", label: "Configura\u00e7\u00f5es", tone: "gray", matches: ["configuracoes.html", "saas.html"] }]
  }
];

/** Dock mobile: primeiros módulos da opera\u00e7\u00e3o (atalhos). */
const APPROVED_DOCK_HREFS = ["dashboard-saas.html", "estoque.html", "compras.html", "alertas-reposicao.html"];

function flattenApprovedNavItems() {
  return APPROVED_NAV_BLOCKS.flatMap((block) => block.items || []);
}

const NAV_ITEMS = flattenApprovedNavItems().map((item) => ({
  href: item.href,
  label: item.label,
  icon: String(item.label).trim().charAt(0).toUpperCase(),
  matches: item.matches
}));

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildApprovedSidebarNavInnerHtml() {
  const parts = [];
  for (const block of APPROVED_NAV_BLOCKS) {
    if (block.divider) {
      parts.push('<div class="nav-divider" aria-hidden="true"></div>');
      continue;
    }
    if (!block.items?.length) {
      continue;
    }
    parts.push('<div class="nav-group">');
    if (block.section) {
      parts.push(`<div class="nav-group-label">${escapeAttr(block.section)}</div>`);
    }
    for (const item of block.items) {
      parts.push(
        `<a class="nav-link" href="${escapeAttr(item.href)}"><span class="nav-ic ${escapeAttr(item.tone)}">${escapeAttr(String(item.label).charAt(0))}</span>${escapeAttr(item.label)}</a>`
      );
    }
    parts.push("</div>");
  }
  parts.push(
    '<div class="nav-group">',
    '<button class="nav-link approved-logout" type="button" data-logout-button><span class="nav-ic red">X</span>Sair</button>',
    "</div>"
  );
  return parts.join("");
}

function buildApprovedMobileDrawerGridHtml() {
  const links = flattenApprovedNavItems();
  const parts = links.map(
    (item) =>
      `<a href="${escapeAttr(item.href)}"><span>${escapeAttr(String(item.label).charAt(0))}</span><strong>${escapeAttr(item.label)}</strong></a>`
  );
  parts.push('<button type="button" data-logout-button><span>X</span><strong>Sair</strong></button>');
  return parts.join("");
}

function buildApprovedMobileDockHtml(current) {
  const dockItems = APPROVED_DOCK_HREFS.map((href) => flattenApprovedNavItems().find((i) => i.href === href)).filter(Boolean);
  return dockItems
    .map((item) => {
      const active = item.matches.includes(current) ? " class=\"active\"" : "";
      const short = String(item.label).split(/\s+/)[0];
      return `<a${active} href="${escapeAttr(item.href)}"><span>${escapeAttr(String(item.label).charAt(0))}</span><strong>${escapeAttr(short)}</strong></a>`;
    })
    .join("");
}

function hydrateApprovedShellNav() {
  const nav = document.querySelector("aside.approved-sidebar nav.premium-nav, aside.sidebar.approved-sidebar nav.premium-nav");
  if (!nav || nav.dataset.shellNavHydrated === "1") {
    return;
  }
  const current = getCurrentPage();
  nav.dataset.shellNavHydrated = "1";
  nav.setAttribute("aria-label", "Menu principal");
  nav.innerHTML = buildApprovedSidebarNavInnerHtml();

  const drawerGrid = document.querySelector("#dashboard-mobile-drawer .dashboard-mobile-drawer-grid");
  if (drawerGrid) {
    drawerGrid.innerHTML = buildApprovedMobileDrawerGridHtml();
  }

  const dock = document.querySelector("nav.dashboard-mobile-bottom-nav.approved-mobile-bottom-nav, nav.approved-mobile-bottom-nav.dashboard-mobile-bottom-nav");
  if (dock) {
    const moreBtn = dock.querySelector("#dashboard-mobile-more");
    const moreHtml = moreBtn ? moreBtn.outerHTML : "";
    dock.innerHTML = buildApprovedMobileDockHtml(current) + moreHtml;
  }
}

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

  if (dashboardName && !/carregando/i.test(dashboardName) && dashboardName !== "--") {
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

  return { name: "--", role: "Perfil" };
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
  const dashName = document.getElementById("dashboard-user-name");
  const dashRole = document.getElementById("dashboard-user-role");
  const dashInitials = document.getElementById("dashboard-user-initials");
  if (dashName) {
    dashName.textContent = name;
  }
  if (dashRole) {
    dashRole.textContent = role;
  }
  if (dashInitials) {
    dashInitials.textContent = getInitials(name);
  }
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
  if (document.querySelector(".clean-topbar") || document.querySelector(".topbar")) {
    return;
  }

  const topbar = document.createElement("header");
  topbar.className = "topbar clean-topbar";
  topbar.innerHTML = `
    <button class="top-menu clean-menu-button" type="button" aria-label="Menu" aria-pressed="false">
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <a class="top-logo clean-brand" href="dashboard-saas.html" aria-label="Carioca's Operacao de Controle">
      <span class="logo-avatar clean-brand-mark">C</span>
      <span class="logo-info">
        <strong class="logo-name">Carioca's <b class="logo-badge">PRO</b></strong>
        <small class="logo-sub">Opera\u00e7\u00e3o de Controle</small>
      </span>
    </a>
    <label class="top-search clean-search">
      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M9 9l3.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      <input type="search" placeholder="Buscar no sistema...">
      <kbd>Ctrl K</kbd>
    </label>
    <div class="top-spacer clean-topbar-spacer"></div>
    <div class="top-actions">
      <button class="notif-btn clean-notification-button" type="button" aria-label="Notifica\u00e7\u00f5es" title="Notifica\u00e7\u00f5es integradas em breve. Use Reposi\u00e7\u00e3o e Estoque para alertas operacionais.">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5a5.5 5.5 0 0 1 5.5 5.5v2.5l1 2H1.5l1-2V7A5.5 5.5 0 0 1 8 1.5ZM6 13.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        <b class="notif-count">8</b>
      </button>
      <a class="help-btn clean-help-button" href="treinamento.html" aria-label="Ajuda e treinamentos">?</a>
      <button class="user-pill clean-user-pill" type="button" aria-label="Perfil">
        <span class="user-av" data-shell-user-initials>TD</span>
        <span>
          <strong class="user-name-top" data-shell-user-name>Taiana Dias</strong>
          <small class="user-role-top" data-shell-user-role>Admin</small>
        </span>
      </button>
    </div>
  `;
  document.body.prepend(topbar);
}

function buildSidebar() {
  if (document.querySelector(".premium-global-sidebar") || document.body.classList.contains("dashboard-saas-page")) {
    return;
  }

  const current = getCurrentPage();
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar premium-global-sidebar approved-sidebar";
  sidebar.setAttribute("aria-label", "Navega\u00e7\u00e3o SaaS");
  sidebar.innerHTML = `
    <nav class="premium-nav premium-global-nav">
      <div class="nav-group">
      ${NAV_ITEMS.map((item, index) => {
        const tones = ["red", "orange", "teal", "blue", "purple", "green", "yellow", "gray", "gray", "gray", "gray"];
        return `
        <a class="nav-link ${isActive(item, current) ? "active" : ""}" href="${item.href}">
          <span class="nav-ic ${tones[index] || "gray"}">${item.icon}</span>
          <strong>${item.label}</strong>
        </a>
      `}).join("")}
      </div>
      <div class="nav-divider" aria-hidden="true"></div>
    </nav>
    <button class="nav-link approved-logout premium-global-logout" type="button" data-logout-button>
      <span class="nav-ic red">X</span>
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
  dock.className = "dashboard-mobile-bottom-nav premium-mobile-dock";
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
  backdrop.className = "dashboard-mobile-drawer-backdrop premium-mobile-menu-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section id="premium-mobile-menu" class="dashboard-mobile-drawer premium-mobile-menu" aria-label="Menu completo" role="dialog" aria-modal="true">
      <header>
        <div>
          <strong>Menu do sistema</strong>
          <small>Todos os m\u00f3dulos da opera\u00e7\u00e3o</small>
        </div>
        <button class="premium-mobile-menu-close" type="button" aria-label="Fechar menu">x</button>
      </header>
      <div class="dashboard-mobile-drawer-grid premium-mobile-menu-grid">
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

function syncDesktopMenuTogglePressed() {
  const menuBtn = document.querySelector(".clean-menu-button");
  if (!menuBtn) {
    return;
  }
  menuBtn.setAttribute("aria-pressed", document.body.classList.contains("sidebar-desktop-collapsed") ? "true" : "false");
}

function applySavedSidebarState() {
  if (!document.body.classList.contains("premium-saas-shell-body") || !document.querySelector(".premium-global-sidebar")) {
    return;
  }
  try {
    if (localStorage.getItem("premium-shell-sidebar-collapsed") === "1") {
      document.body.classList.add("sidebar-desktop-collapsed");
    }
  } catch (_) {
    /* ignore */
  }
  syncDesktopMenuTogglePressed();
}

const APPROVED_NAV_ICONS = {
  "dashboard-saas.html": '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h5v-5h4v5h5v-9.5"/></svg>',
  "estoque.html": '<svg viewBox="0 0 24 24"><path d="M7 8h10v10H7z"/><path d="M3 6h8v8H3z"/><path d="M13 6h8v8h-8z"/></svg>',
  "producao-etiquetas.html": '<svg viewBox="0 0 24 24"><path d="M6 18h12"/><path d="M7 18v-6"/><path d="M17 18v-6"/><path d="M8 12c-2 0-4-1.5-4-3.5S5.5 5 7.5 5c.8-1.8 2.4-3 4.5-3s3.7 1.2 4.5 3c2 0 3.5 1.5 3.5 3.5S18 12 16 12"/></svg>',
  "compras.html": '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h3l3 12h10l3-8H7"/></svg>',
  "fornecedores.html": '<svg viewBox="0 0 24 24"><path d="M3 7h11v10H3z"/><path d="M14 11h4l3 3v3h-7"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>',
  "desperdicio.html": '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  "alertas-reposicao.html": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  "etiquetas.html": '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
  "configuracoes.html": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.6v.3H9.2V22a1.7 1.7 0 0 0-.8-1.6 1.7 1.7 0 0 0-2-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.7V10H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.1A1.7 1.7 0 0 0 9.2 2v-.3h5.6V2a1.7 1.7 0 0 0 .8 1.6 1.7 1.7 0 0 0 2 .1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.3v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  "relatorio-diario.html": '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/></svg>',
  "impressora.html": '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
  "whatsapp-ia.html": '<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4"/><path d="M8.5 13h.01"/><path d="M15.5 13h.01"/><path d="M9 18v2"/><path d="M15 18v2"/></svg>',
  "funcionarios.html": '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  "treinamento.html": '<svg viewBox="0 0 24 24"><path d="m22 10-10-5-10 5 10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
  "saas.html": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.6v.3H9.2V22a1.7 1.7 0 0 0-.8-1.6 1.7 1.7 0 0 0-2-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.7V10H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.1A1.7 1.7 0 0 0 9.2 2v-.3h5.6V2a1.7 1.7 0 0 0 .8 1.6 1.7 1.7 0 0 0 2 .1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.3v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>'
};

function renderApprovedNavIcons() {
  document.querySelectorAll(".premium-nav a, .dashboard-mobile-bottom-nav a, .approved-mobile-bottom-nav a, .dashboard-mobile-drawer-grid a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const key = Object.keys(APPROVED_NAV_ICONS).find((candidate) => href.includes(candidate));
    const iconSlot = link.querySelector("span");
    if (key && iconSlot) {
      iconSlot.classList.add("premium-svg-icon");
      iconSlot.setAttribute("aria-hidden", "true");
      iconSlot.innerHTML = APPROVED_NAV_ICONS[key];
    }
  });
}

function navHrefMatchesCurrent(current, hrefAttr) {
  const file = (hrefAttr || "").replace(/^\.\//, "").split("#")[0];
  if (!file) {
    return false;
  }
  const item = NAV_ITEMS.find((i) => i.href === file);
  if (item) {
    return item.matches.includes(current);
  }
  return file === current;
}

function setApprovedNavActive() {
  const current = getCurrentPage();
  document.querySelectorAll(".approved-sidebar a.nav-link[href]").forEach((el) => {
    el.classList.toggle("active", navHrefMatchesCurrent(current, el.getAttribute("href")));
  });
  document.querySelectorAll(".approved-mobile-bottom-nav a[href]").forEach((el) => {
    el.classList.toggle("active", navHrefMatchesCurrent(current, el.getAttribute("href")));
  });
  document.querySelectorAll("#dashboard-mobile-drawer .dashboard-mobile-drawer-grid a[href]").forEach((el) => {
    el.classList.toggle("active", navHrefMatchesCurrent(current, el.getAttribute("href")));
  });
}

function bindApprovedChrome() {
  const mobileMoreButton = document.getElementById("dashboard-mobile-more");
  const mobileMenuButton = document.getElementById("dashboard-mobile-menu");
  const mobileDrawerBackdrop = document.getElementById("dashboard-mobile-drawer-backdrop");
  const mobileDrawerClose = document.getElementById("dashboard-mobile-drawer-close");
  const dashboardAlertButton = document.getElementById("dashboard-alert-button");
  const dashboardAlertDrawerBackdrop = document.getElementById("dashboard-alert-drawer-backdrop");
  const dashboardAlertDrawerClose = document.getElementById("dashboard-alert-drawer-close");
  const dashboardActionDialog = document.getElementById("dashboard-action-dialog");
  const dashboardSearchDialog = document.getElementById("dashboard-search-dialog");

  function toggleMobileDrawer(open) {
    if (!mobileDrawerBackdrop || !mobileMoreButton) {
      return;
    }
    mobileDrawerBackdrop.hidden = !open;
    document.body.classList.toggle("dashboard-mobile-drawer-open", open);
    mobileMoreButton.setAttribute("aria-expanded", String(open));
  }

  function toggleAlertDrawer(open) {
    if (!dashboardAlertDrawerBackdrop || !dashboardAlertButton) {
      return;
    }
    dashboardAlertDrawerBackdrop.hidden = !open;
    document.body.classList.toggle("premium-alert-drawer-open", open);
    dashboardAlertButton.setAttribute("aria-expanded", String(open));
  }

  try {
    if (window.matchMedia("(min-width: 1025px)").matches && localStorage.getItem("dashboard-sidebar-collapsed") === "1") {
      document.body.classList.add("dashboard-sidebar-collapsed");
    }
  } catch (_) {
    /* ignore */
  }

  mobileMoreButton?.addEventListener("click", () => {
    toggleMobileDrawer(mobileDrawerBackdrop?.hidden !== false);
  });
  mobileMenuButton?.addEventListener("click", () => {
    if (window.matchMedia("(min-width: 1025px)").matches) {
      document.body.classList.toggle("dashboard-sidebar-collapsed");
      try {
        localStorage.setItem(
          "dashboard-sidebar-collapsed",
          document.body.classList.contains("dashboard-sidebar-collapsed") ? "1" : "0"
        );
      } catch (_) {
        /* ignore */
      }
      return;
    }
    toggleMobileDrawer(mobileDrawerBackdrop?.hidden !== false);
  });
  mobileDrawerClose?.addEventListener("click", () => toggleMobileDrawer(false));
  mobileDrawerBackdrop?.addEventListener("click", (event) => {
    if (event.target === mobileDrawerBackdrop) {
      toggleMobileDrawer(false);
    }
  });
  document.querySelectorAll("#dashboard-mobile-drawer .dashboard-mobile-drawer-grid a[href]").forEach((link) => {
    link.addEventListener("click", () => toggleMobileDrawer(false));
  });

  dashboardAlertButton?.addEventListener("click", () => {
    toggleAlertDrawer(dashboardAlertDrawerBackdrop?.hidden !== false);
  });
  dashboardAlertDrawerClose?.addEventListener("click", () => toggleAlertDrawer(false));
  dashboardAlertDrawerBackdrop?.addEventListener("click", (event) => {
    if (event.target === dashboardAlertDrawerBackdrop) {
      toggleAlertDrawer(false);
    }
  });

  document.getElementById("dashboard-quick-action-button")?.addEventListener("click", () => {
    if (typeof dashboardActionDialog?.showModal === "function") {
      dashboardActionDialog.showModal();
    } else {
      dashboardActionDialog?.setAttribute("open", "");
    }
  });
  document.getElementById("dashboard-search-button")?.addEventListener("click", () => {
    if (typeof dashboardSearchDialog?.showModal === "function") {
      dashboardSearchDialog.showModal();
    } else {
      dashboardSearchDialog?.setAttribute("open", "");
    }
    setTimeout(() => document.getElementById("dashboard-global-search")?.focus(), 80);
  });

  document.querySelector(".help-btn")?.addEventListener("click", () => {
    window.location.href = "treinamento.html";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (mobileDrawerBackdrop?.hidden === false) {
        toggleMobileDrawer(false);
      }
      if (dashboardAlertDrawerBackdrop?.hidden === false) {
        toggleAlertDrawer(false);
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (typeof dashboardSearchDialog?.showModal === "function") {
        dashboardSearchDialog.showModal();
      } else {
        dashboardSearchDialog?.setAttribute("open", "");
      }
      setTimeout(() => document.getElementById("dashboard-global-search")?.focus(), 80);
    }
  });
}

function bindShellInteractions() {
  const menuBtn = document.querySelector(".clean-menu-button");
  menuBtn?.addEventListener("click", () => {
    if (window.matchMedia("(min-width: 1025px)").matches) {
      document.body.classList.toggle("sidebar-desktop-collapsed");
      try {
        localStorage.setItem(
          "premium-shell-sidebar-collapsed",
          document.body.classList.contains("sidebar-desktop-collapsed") ? "1" : "0"
        );
      } catch (_) {
        /* ignore */
      }
      syncDesktopMenuTogglePressed();
      return;
    }
    toggleMobileMenu(true);
  });
  document.querySelector(".premium-mobile-more")?.addEventListener("click", () => toggleMobileMenu(true));
  document.querySelector(".premium-mobile-menu-close")?.addEventListener("click", () => toggleMobileMenu(false));
  document.querySelector(".premium-mobile-menu-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      toggleMobileMenu(false);
    }
  });
  document.querySelectorAll(".premium-mobile-menu-grid a[href]").forEach((link) => {
    link.addEventListener("click", () => toggleMobileMenu(false));
  });
  document.querySelector(".premium-mobile-menu-grid button[data-logout-button]")?.addEventListener("click", () => {
    toggleMobileMenu(false);
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

  /* Layout aprovado: não empilhar premium-clean-shell / premium-page (conflita com dashboard-approved-real.css). */
  if (document.body.classList.contains("dashboard-approved-real")) {
    return true;
  }

  if (document.body.classList.contains("dashboard-saas-page")) {
    document.body.classList.add("premium-clean-shell", "app-shell");
    return true;
  }

  const page = document.querySelector("main.page");
  if (!page) {
    return false;
  }

  document.body.classList.add("premium-global-body", "premium-saas-shell-body", "premium-clean-shell", "app-shell");
  page.classList.add("premium-page");
  return true;
}

function decorateContent() {
  if (document.body.classList.contains("dashboard-approved-real")) {
    return;
  }

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

  if (document.body.classList.contains("dashboard-approved-real")) {
    hydrateApprovedShellNav();
    setApprovedNavActive();
    renderApprovedNavIcons();
    bindApprovedChrome();
    watchUserInfo();
    return;
  }

  if (document.body.classList.contains("dashboard-saas-page")) {
    return;
  }

  buildTopbar();
  buildSidebar();
  buildDock();
  buildMobileMenu();
  decorateContent();
  bindShellInteractions();
  applySavedSidebarState();
  watchUserInfo();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPremiumShell);
} else {
  initPremiumShell();
}
