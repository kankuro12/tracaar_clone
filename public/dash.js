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
