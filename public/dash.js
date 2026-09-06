/* Shared dashboard helpers — jQuery + session-cookie auth. No tokens in JS. */

// Every timestamp in the UI shows Nepal Time (UTC+5:45), independent of the
// server's or the viewer's own local timezone — matches src/web.js's fmtDT.
const NPT_TZ = 'Asia/Kathmandu';
window.fmtNPT = (d) => (d ? new Date(d).toLocaleString('en-US', { timeZone: NPT_TZ, dateStyle: 'medium', timeStyle: 'short' }) : '—');
window.fmtNPTTime = (d) => (d ? new Date(d).toLocaleTimeString('en-US', { timeZone: NPT_TZ }) : '—');

const api = (path, opts = {}) => new Promise((resolve, reject) => {
  $.ajax({
    url: path,
    method: opts.method || 'GET',
    contentType: 'application/json',
    data: opts.body,
    statusCode: { 204: () => resolve(null) },
    dataType: 'json',
  }).done(resolve).fail((xhr) => {
    if (xhr.status === 401) { location.href = '/login'; return; }
    let msg = `HTTP ${xhr.status}`;
    try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* non-json body */ }
    reject(new Error(msg));
  });
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const showErr = (container, msg) => {
  const box = $(container).find('.form-error').first();
  if (!box.length) $(container).append('<div class="form-error alert alert-danger py-2 mt-2"></div>');
  $(container).find('.form-error').first().text(msg);
};

$(document).on('click', '[data-logout]', async () => {
  await fetch('/logout', { method: 'POST' });
  location.href = '/login';
});

const toast = (msg, type = 'danger') => {
  const box = $('#toast-box').length ? $('#toast-box') : $('<div class="toast-container position-fixed bottom-0 end-0 p-3" id="toast-box"></div>').appendTo('body');
  const el = $(`<div class="toast align-items-center text-bg-${type} border-0 show" role="alert"><div class="d-flex"><div class="toast-body">${esc(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`);
  box.append(el);
  setTimeout(() => el.remove(), 5000);
};

// client-side table filter: input[data-table-filter] filters tbody rows
$(document).on('input', '[data-table-filter]', function () {
  const q = $(this).val().toLowerCase();
  const sel = $(this).data('table-filter');
  $(`${sel} tbody tr`).each(function () {
    $(this).toggle($(this).text().toLowerCase().includes(q));
  });
});

$(document).on('click', '#theme-toggle', () => {
  const cur = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.bsTheme = cur;
  try { localStorage.setItem('tracaar-theme', cur); } catch (e) {}
});

// notification bell: poll latest alerts
(async function pollBell() {
  try {
    const r = await fetch('/api/alerts?limit=20', { headers: {} });
    if (!r.ok) return;
    const rows = await r.json();
    const unread = rows.filter((a) => !a.resolved_at).length;
    const badge = $('#alert-count');
    if (badge.length) {
      badge.textContent = unread;
      badge.classList.toggle('d-none', !unread);
    }
    const bell = $('#alert-bell');
    if (bell.length && rows[0]) bell.title = rows[0].message;
  } catch (e) {}
  setTimeout(pollBell, 60000);
})();

$(document).on('click', '#alert-bell', () => { location.href = '/portal/alerts'; });

// ---- mobile nav drawer ----
function openNav() {
  $('.admin-nav').addClass('open');
  $('[data-nav-backdrop]').addClass('show');
  $('[data-nav-toggle]').attr('aria-expanded', 'true');
  document.body.classList.add('nav-open-lock');
}
function closeNav() {
  $('.admin-nav').removeClass('open');
  $('[data-nav-backdrop]').removeClass('show');
  $('[data-nav-toggle]').attr('aria-expanded', 'false');
  document.body.classList.remove('nav-open-lock');
}
$(document).on('click', '[data-nav-toggle]', () => {
  $('.admin-nav').hasClass('open') ? closeNav() : openNav();
});
$(document).on('click', '[data-nav-backdrop], [data-nav-close]', closeNav);
$(document).on('click', '.admin-nav a', () => { if (window.innerWidth < 768) closeNav(); });
$(document).on('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
// resizing past the mobile breakpoint (rotating a tablet, etc.) shouldn't
// leave the drawer "open" with the lock still applied
window.addEventListener('resize', () => { if (window.innerWidth >= 768) closeNav(); });

// ---- PWA install button ----
// Chrome only fires beforeinstallprompt when the manifest/SW criteria are met
// (and never at all if already installed), so the button stays hidden until then.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('#pwa-install-btn').removeClass('d-none');
});
$(document).on('click', '#pwa-install-btn', async () => {
  if (!deferredInstallPrompt) return;
  $('#pwa-install-btn').addClass('d-none');
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
});
window.addEventListener('appinstalled', () => { $('#pwa-install-btn').addClass('d-none'); });
