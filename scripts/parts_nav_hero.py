# -*- coding: utf-8 -*-

NAV_AND_HERO = """
  <!-- Sidebar Navigation -->
  <aside id="sidebar">
    <div class="sidebar-header">
      <a href="#" class="brand-badge">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
        <span>FleetTelematics</span>
      </a>
      <span class="version-pill">v1.0.0 ERP Integration</span>
      <div class="search-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="search-input" placeholder="Search API & Guides..." oninput="filterNav()">
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-group-title">Getting Started</div>
      <a href="#section-overview" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg> Overview & Arch</a>
      <a href="#section-quickstart" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> 5-Min Quickstart</a>
      <a href="#section-mint-keys" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><key><path d="M21 2l-2 2m-1.5 1.5L14 9l-3 3-4-4-5 5 9 9 5-5-4-4 3-3 3.5-3.5L21 2z"></path></key></svg> Minting API Keys <span class="badge badge-post">GUIDE</span></a>
      <a href="#section-live-map-ui" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg> Live Map on Your UI <span class="badge badge-ws">MAP UI</span></a>
      <a href="#section-auth" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Auth & Security</a>

      <div class="nav-group-title">REST API Reference</div>
      <a href="#api-register" class="nav-link"><span>POST /register</span><span class="badge badge-post">POST</span></a>
      <a href="#api-session" class="nav-link"><span>POST /session</span><span class="badge badge-post">POST</span></a>
      <a href="#api-int-vehicles" class="nav-link"><span>GET /integration/vehicles</span><span class="badge badge-get">GET</span></a>
      <a href="#api-int-keys" class="nav-link"><span>Keys Management</span><span class="badge badge-get">CRUD</span></a>
      <a href="#api-vehicles-telemetry" class="nav-link"><span>Fleet & Latest GPS</span><span class="badge badge-get">GET</span></a>
      <a href="#api-history" class="nav-link"><span>GPS Trail History</span><span class="badge badge-get">GET</span></a>
      <a href="#api-destination" class="nav-link"><span>Vehicle ETA Destination</span><span class="badge badge-patch">PATCH</span></a>
      <a href="#api-geofences" class="nav-link"><span>Geofencing Zones</span><span class="badge badge-post">GEO</span></a>
      <a href="#api-routes-opt" class="nav-link"><span>Route Optimization</span><span class="badge badge-post">TSP</span></a>
      <a href="#api-alerts" class="nav-link"><span>Alert Log & Events</span><span class="badge badge-get">GET</span></a>
      <a href="#api-users" class="nav-link"><span>Tenant Users & Access</span><span class="badge badge-post">RBAC</span></a>
      <a href="#api-invoices" class="nav-link"><span>Billing & Invoices</span><span class="badge badge-get">BILL</span></a>

      <div class="nav-group-title">Realtime & Telematics</div>
      <a href="#section-websocket" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><line x1="2" y1="20" x2="2.01" y2="20"></line></svg> WebSocket Protocol<span class="badge badge-ws">LIVE</span></a>
      <a href="#section-webhooks" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> Webhooks & Alerts</a>
      <a href="#section-hardware" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Sinotrack H02 Protocol</a>

      <div class="nav-group-title">Code SDKs & Schemas</div>
      <a href="#section-sdks" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> Multi-Lang SDKs</a>
      <a href="#section-schema" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> Database & PostGIS</a>
      <a href="#section-gallery" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> UI Screenshots</a>
      <a href="#section-troubleshooting" class="nav-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Troubleshooting & FAQ</a>
    </nav>
  </aside>

  <!-- Main Content Wrapper -->
  <main id="main-content">
    <header class="top-header">
      <div class="header-breadcrumbs">
        <span>Docs</span> / <strong>ERP Integration Guide</strong>
      </div>
      <div class="header-actions">
        <button class="btn-theme" id="theme-toggle-btn" onclick="toggleTheme()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          Light Mode
        </button>
      </div>
    </header>

    <div class="content-body">
      <!-- Hero Banner -->
      <section class="hero-banner">
        <h1 class="hero-title">Live GPS Fleet Tracking — ERP Integration Manual</h1>
        <p class="hero-subtitle">
          Comprehensive technical integration manual and API reference for Enterprise Resource Planning (ERP), 
          Warehouse Management (WMS), Transportation Management (TMS), and Dispatch Systems. Integrate high-frequency 
          live vehicle telematics, historical route playback, circular geofencing alerts, and embed live tracking maps directly into your own ERP UI.
        </p>
        <div class="hero-meta-grid">
          <div class="meta-card">
            <span class="meta-label">Protocol Ingestion</span>
            <span class="meta-value">Sinotrack H02 (TCP :9000)</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Realtime Streaming</span>
            <span class="meta-value">RFC 6455 WebSockets (/ws)</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Spatial Engine</span>
            <span class="meta-value">PostgreSQL 15+ & PostGIS</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Authentication</span>
            <span class="meta-value">API Key (SHA-256) + JWT</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">UI Embeddable</span>
            <span class="meta-value">Leaflet / OpenStreetMap / Mapbox</span>
          </div>
        </div>
      </section>
"""

LIGHTBOX_HTML = """
  <!-- Lightbox Modal -->
  <div id="lightbox-modal" onclick="if(event.target === this) closeLightbox()">
    <div class="lightbox-content">
      <div class="lightbox-img-container">
        <img id="lightbox-img" src="" alt="Screenshot">
      </div>
      <div class="lightbox-footer">
        <span id="lightbox-caption" style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">Screenshot</span>
        <button class="lightbox-close" onclick="closeLightbox()">Close (ESC)</button>
      </div>
    </div>
  </div>
"""
