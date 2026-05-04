const NAV_ITEMS = [
  { href: "dashboard-saas.html", label: "Dashboard", icon: "D", matches: ["dashboard-saas.html", "dashboard.html", "index.html"] },
  { href: "treinamento.html", label: "Treinamento", icon: "A", matches: ["treinamento.html"] },
  { href: "estoque.html", label: "Estoque", icon: "E", matches: ["estoque.html", "inventario.html"] },
  { href: "producao-etiquetas.html", label: "Produção", icon: "P", matches: ["producao-etiquetas.html", "producao.html", "reposicao-producao.html"] },
  { href: "compras.html", label: "Compras", icon: "C", matches: ["compras.html", "dashboard-compras.html", "alertas-reposicao.html", "analise-compras.html"] },
  { href: "fornecedores.html", label: "Fornecedores", icon: "F", matches: ["fornecedores.html"] },
  { href: "desperdicio.html", label: "Desperdício", icon: "!", matches: ["desperdicio.html"] },
  { href: "relatorio-diario.html", label: "Relatórios", icon: "R", matches: ["relatorio-diario.html", "relatorio.html"] },
  { href: "impressora.html", label: "Etiquetas", icon: "T", matches: ["impressora.html", "etiquetas.html"] },
  { href: "funcionarios.html", label: "Funcionários", icon: "U", matches: ["funcionarios.html", "funcionarias.html"] },
  { href: "saas.html", label: "Configurações", icon: "S", matches: ["saas.html", "configuracoes.html"] }
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
  sidebar.setAttribute("aria-label", "Navegação SaaS");
  sidebar.innerHTML = `
    <a class="premium-global-brand" href="dashboard-saas.html" aria-label="Carioca's Operação de Controle">
      <span><img src="cariocas-logo.jpeg" alt="" aria-hidden="true"></span>
      <strong>Carioca's</strong>
      <small>Operação de Controle</small>
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
  dock.setAttribute("aria-label", "Navegação principal");
  dock.innerHTML = NAV_ITEMS.slice(0, 5).map((item) => {
    const active = item.matches.includes(current) ? " active" : "";
    return `
      <a class="${active}" href="${item.href}">
        <span>${item.icon}</span>
        <strong>${item.label}</strong>
      </a>
    `;
  }).join("");
  document.body.appendChild(dock);
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPremiumShell);
} else {
  initPremiumShell();
}
