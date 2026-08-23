# -*- coding: utf-8 -*-
# Stylesheet and UI Scripts for ERP Documentation

CSS_STYLES = """
:root {
  --bg-primary: #0a0e17;
  --bg-secondary: #111827;
  --bg-tertiary: #1f2937;
  --bg-card: rgba(17, 24, 39, 0.9);
  --bg-code: #0b0f19;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --border-color: #374151;
  --border-light: rgba(255, 255, 255, 0.08);
  --accent-blue: #3b82f6;
  --accent-cyan: #06b6d4;
  --accent-green: #10b981;
  --accent-amber: #f59e0b;
  --accent-rose: #f43f5e;
  --accent-purple: #8b5cf6;
  --sidebar-width: 320px;
  --header-height: 64px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2);
  --shadow-glow: 0 0 25px rgba(59, 130, 246, 0.15);
}

[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f1f5f9;
  --bg-card: #ffffff;
  --bg-code: #1e293b;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --border-light: rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-glow: 0 0 25px rgba(59, 130, 246, 0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 15px; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.65;
  display: flex;
  min-height: 100vh;
  transition: background-color 0.25s ease, color 0.25s ease;
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent-blue); }

/* Sidebar */
#sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 50;
  transition: transform 0.3s ease;
}

.sidebar-header {
  padding: 20px 18px 14px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  text-decoration: none;
}

.brand-badge svg { color: var(--accent-blue); flex-shrink: 0; }

.version-pill {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent-blue);
  border: 1px solid rgba(59, 130, 246, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
  margin-top: 4px;
}

.search-box {
  position: relative;
  width: 100%;
}

.search-box input {
  width: 100%;
  padding: 8px 12px 8px 34px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-box input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.search-box svg {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 14px 10px 30px;
}

.nav-group-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  padding: 14px 12px 6px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.86rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  margin-bottom: 2px;
}

.nav-link:hover {
  color: var(--text-primary);
  background-color: var(--bg-tertiary);
}

.nav-link.active {
  color: var(--accent-blue);
  background-color: rgba(59, 130, 246, 0.12);
  font-weight: 600;
}

.nav-link .badge {
  margin-left: auto;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}

.badge-ws { background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); }
.badge-post { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }
.badge-get { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
.badge-patch { background: rgba(245, 158, 11, 0.2); color: var(--accent-amber); }
.badge-del { background: rgba(244, 63, 94, 0.2); color: var(--accent-rose); }

/* Main Content */
#main-content {
  margin-left: var(--sidebar-width);
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.top-header {
  position: sticky;
  top: 0;
  height: var(--header-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  z-index: 40;
  backdrop-filter: blur(12px);
}

.header-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.header-breadcrumbs span { color: var(--text-muted); }
.header-breadcrumbs strong { color: var(--text-primary); }

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-theme, .btn-icon {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-theme:hover, .btn-icon:hover {
  background: var(--bg-card);
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.content-body {
  max-width: 1200px;
  margin: 0 auto;
  padding: 36px 36px 120px;
  width: 100%;
}

/* Hero Section */
.hero-banner {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(6, 182, 212, 0.08) 50%, rgba(139, 92, 246, 0.06) 100%);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 38px 36px;
  margin-bottom: 44px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-glow);
}

.hero-title {
  font-size: 2.2rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.25;
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}

.hero-subtitle {
  font-size: 1.08rem;
  color: var(--text-secondary);
  max-width: 880px;
  margin-bottom: 24px;
  line-height: 1.6;
}

.hero-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-light);
}

.meta-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Sections */
.doc-section {
  margin-bottom: 60px;
  scroll-margin-top: 80px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--border-color);
}

.section-header h2 {
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.section-number {
  background: var(--bg-tertiary);
  color: var(--accent-blue);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

.card-box {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.callout {
  padding: 16px 20px;
  border-radius: var(--radius-md);
  margin: 20px 0;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  border-left: 4px solid;
  font-size: 0.92rem;
  line-height: 1.6;
}

.callout svg { flex-shrink: 0; margin-top: 3px; }
.callout-info { background: rgba(59, 130, 246, 0.08); border-color: var(--accent-blue); color: var(--text-primary); }
.callout-info svg { color: var(--accent-blue); }
.callout-success { background: rgba(16, 185, 129, 0.08); border-color: var(--accent-green); color: var(--text-primary); }
.callout-success svg { color: var(--accent-green); }
.callout-warning { background: rgba(245, 158, 11, 0.08); border-color: var(--accent-amber); color: var(--text-primary); }
.callout-warning svg { color: var(--accent-amber); }
.callout-danger { background: rgba(244, 63, 94, 0.08); border-color: var(--accent-rose); color: var(--text-primary); }
.callout-danger svg { color: var(--accent-rose); }

.table-container {
  width: 100%;
  overflow-x: auto;
  margin: 18px 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

thead tr {
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

th {
  padding: 11px 14px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.5px;
}

td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}

tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: rgba(255, 255, 255, 0.02); }

/* Code Tabs & Snippets */
.code-wrapper {
  margin: 18px 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-code);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.code-header {
  background: var(--bg-tertiary);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
}

.code-tabs { display: flex; gap: 4px; }

.code-tab-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 5px 11px;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.code-tab-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
.code-tab-btn.active { color: var(--accent-blue); background: var(--bg-code); border: 1px solid var(--border-color); }

.copy-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 9px;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.copy-btn:hover { color: var(--text-primary); border-color: var(--accent-blue); }

pre {
  padding: 16px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 0.84rem;
  line-height: 1.55;
  color: #e6edf3;
  margin: 0;
}

code { font-family: 'JetBrains Mono', Consolas, monospace; }
p code, li code, td code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.84em;
  color: var(--accent-cyan);
  border: 1px solid var(--border-light);
}

/* Endpoint Cards */
.endpoint-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  margin-bottom: 22px;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.endpoint-card:hover { border-color: var(--accent-blue); }

.endpoint-header {
  padding: 14px 18px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.method-pill {
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.5px;
}

.method-post { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
.method-get { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
.method-patch { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
.method-delete { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); }
.method-ws { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.4); }

.endpoint-path {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text-primary);
}

.auth-badge {
  margin-left: auto;
  font-size: 0.72rem;
  padding: 3px 7px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.endpoint-body { padding: 18px; }
.endpoint-desc { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px; }

/* Image Lightbox Gallery */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin: 24px 0;
}

.gallery-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.gallery-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent-blue);
  box-shadow: var(--shadow-lg);
}

.gallery-img-wrap {
  width: 100%;
  height: 190px;
  background: var(--bg-tertiary);
  overflow: hidden;
  position: relative;
}

.gallery-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.gallery-card:hover .gallery-img-wrap img { transform: scale(1.04); }
.gallery-caption { padding: 12px 14px; }
.gallery-caption h4 { font-size: 0.92rem; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
.gallery-caption p { font-size: 0.78rem; color: var(--text-muted); }

/* Lightbox Modal */
#lightbox-modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.88);
  z-index: 100;
  backdrop-filter: blur(6px);
  justify-content: center;
  align-items: center;
  padding: 24px;
}

#lightbox-modal.open { display: flex; }

.lightbox-content {
  max-width: 92vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
}

.lightbox-img-container {
  overflow: auto;
  max-height: 82vh;
  background: #000000;
  display: flex;
  justify-content: center;
}

.lightbox-img-container img { max-width: 100%; height: auto; display: block; }
.lightbox-footer {
  padding: 14px 18px;
  background: var(--bg-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lightbox-close {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.82rem;
}

@media (max-width: 900px) {
  #sidebar { transform: translateX(-100%); }
  #sidebar.open { transform: translateX(0); }
  #main-content { margin-left: 0; }
  .top-header { padding: 0 16px; }
  .content-body { padding: 20px 16px 80px; }
  .hero-title { font-size: 1.7rem; }
}
"""

JS_SCRIPTS = """
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  if (theme === 'light') {
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Dark Mode';
  } else {
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> Light Mode';
  }
}

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
window.addEventListener('DOMContentLoaded', () => {
  updateThemeIcon(savedTheme);
});

function copyCode(btn, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  });
}

function selectTab(containerId, tabName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const buttons = container.querySelectorAll('.code-tab-btn');
  const panes = container.querySelectorAll('.tab-pane');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  panes.forEach(pane => {
    if (pane.getAttribute('data-pane') === tabName) pane.style.display = 'block';
    else pane.style.display = 'none';
  });
}

function openLightbox(imgSrc, caption) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (!modal || !img) return;
  img.src = imgSrc;
  if (cap) cap.innerText = caption || 'Screenshot View';
  modal.classList.add('open');
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.classList.remove('open');
}

function filterNav() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const links = document.querySelectorAll('.sidebar-nav .nav-link');
  links.forEach(link => {
    const text = link.innerText.toLowerCase();
    if (text.includes(query)) link.style.display = 'flex';
    else link.style.display = 'none';
  });
}

window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('.doc-section');
  const scrollPos = window.scrollY + 120;
  sections.forEach(sec => {
    const top = sec.offsetTop;
    const height = sec.offsetHeight;
    const id = sec.getAttribute('id');
    if (scrollPos >= top && scrollPos < top + height) {
      document.querySelectorAll('.sidebar-nav .nav-link').forEach(l => {
        if (l.getAttribute('href') === '#' + id) l.classList.add('active');
        else l.classList.remove('active');
      });
    }
  });
});
"""
