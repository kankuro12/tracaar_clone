/* Shared dashboard helpers — jQuery + session-cookie auth. No tokens in JS. */

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
