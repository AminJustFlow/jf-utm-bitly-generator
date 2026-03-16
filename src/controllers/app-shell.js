const NAV_ITEMS = [
  { key: "library", href: "/utms", label: "Saved Links" },
  { key: "builder", href: "/new", label: "Create Link" },
  { key: "imports", href: "/imports", label: "Import History" }
];

export function renderAppShellStyles() {
  return `
    .app-header{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;padding:.95rem 1.05rem;margin-bottom:1rem;background:rgba(255,250,242,.86);border:1px solid rgba(23,48,42,.1);border-radius:1.2rem;box-shadow:0 16px 42px rgba(20,32,31,.07);backdrop-filter:blur(10px)}
    .app-brand{display:grid;gap:.24rem}
    .app-brand a{color:var(--ink);text-decoration:none;font-family:"Aptos Display","Trebuchet MS",sans-serif;font-size:1.18rem;letter-spacing:-.04em}
    .app-brand span{color:var(--muted);font-size:.88rem;line-height:1.45}
    .app-nav{display:flex;gap:.55rem;flex-wrap:wrap;align-items:center}
    .app-nav-link{display:inline-flex;align-items:center;justify-content:center;min-height:2.4rem;padding:.6rem .9rem;border-radius:999px;border:1px solid rgba(23,48,42,.1);background:rgba(255,255,255,.72);color:var(--ink);text-decoration:none;font-size:.88rem}
    .app-nav-link.active{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 10px 20px rgba(13,108,94,.16)}
    @media (max-width:640px){.app-header{padding:.9rem}.app-nav{width:100%}.app-nav-link{flex:1 1 9rem}}
  `;
}

export function renderAppHeader(activeKey) {
  return `<header class="app-header">
    <div class="app-brand">
      <a href="/utms">JF Link Manager</a>
      <span>Create, import, and manage tracked links from one place.</span>
    </div>
    <nav class="app-nav" aria-label="Primary">
      ${NAV_ITEMS.map((item) => renderNavItem(item, activeKey)).join("")}
    </nav>
  </header>`;
}

function renderNavItem(item, activeKey) {
  const isActive = item.key === activeKey;
  return `<a class="app-nav-link${isActive ? " active" : ""}" href="${item.href}"${isActive ? ' aria-current="page"' : ""}>${item.label}</a>`;
}
