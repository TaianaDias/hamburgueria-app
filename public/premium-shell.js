const NAV_ITEMS = [
  { href: "dashboard-saas.html", label: "Inicio", icon: "D", matches: ["dashboard-saas.html", "index.html"] },
  { href: "estoque.html", label: "Estoque", icon: "E", matches: ["estoque.html", "inventario.html"] },
  { href: "compras.html", label: "Compras", icon: "C", matches: ["compras.html", "dashboard-compras.html", "alertas-reposicao.html", "analise-compras.html"] },
  { href: "producao-etiquetas.html", label: "Producao", icon: "P", matches: ["producao-etiquetas.html", "reposicao-producao.html", "impressora.html"] },
  { href: "operacao.html", label: "Operar", icon: "+", matches: ["operacao.html", "desperdicio.html", "relatorio-diario.html", "whatsapp-ia.html"] }
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
  page.classList.add("premium-page");
  return true;
}

function buildDock() {
  const current = getCurrentPage();
  const dock = document.createElement("nav");
  dock.className = "premium-mobile-dock";
  dock.setAttribute("aria-label", "Navegacao principal");
  dock.innerHTML = NAV_ITEMS.map((item) => {
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
  buildDock();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPremiumShell);
} else {
  initPremiumShell();
}
