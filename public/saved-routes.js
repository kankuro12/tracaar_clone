/* Private saved routes: one small API + map overlay helper for portal and live maps.
   Uses the dashboard session cookie; map calls stay provider-agnostic (Leaflet/gmap shim). */
window.SavedRoutes = (() => {
  async function req(path, opts = {}) {
    const r = await fetch(path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body,
    });
    if (r.status === 401) { location.href = '/login'; throw new Error('signed out'); }
    if (r.status === 204) return null;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data;
  }

  const list = () => req('/api/user/routes');
  const get = (id) => req(`/api/user/routes/${encodeURIComponent(id)}`);
  const create = (name, points) => req('/api/user/routes', { method: 'POST', body: JSON.stringify({ name, points }) });
  const save = (id, points) => req(`/api/user/routes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ points }) });
  const remove = (id) => req(`/api/user/routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const appendFix = (id, vehicleId) => req(`/api/user/routes/${encodeURIComponent(id)}/points`, { method: 'POST', body: JSON.stringify({ vehicleId }) });

  function parseText(text) {
    return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [a, b, ...label] = line.split(',');
      return { lat: Number(a), lon: Number(b), label: label.join(',').trim() };
    });
  }

  function clearLayer(layer) {
    if (!layer) return { line: null, stops: [] };
    try { if (layer.line) layer.line.remove(); } catch (e) { /* already gone */ }
    (layer.stops || []).forEach((s) => { try { s.remove(); } catch (e) { /* already gone */ } });
    return { line: null, stops: [] };
  }

  function draw(map, points, { fit = false } = {}) {
    const clean = (points || [])
      .map((p) => ({ lat: Number(p.lat), lon: Number(p.lon), label: p.label || '' }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const line = clean.length > 1 ? L.polyline(clean.map((p) => [p.lat, p.lon]), { color: '#8b5cf6', weight: 4, opacity: 0.9 }).addTo(map) : null;
    const stops = clean.map((p, i) => L.circleMarker([p.lat, p.lon], {
      radius: 7, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.9,
    }).addTo(map).bindTooltip(`Stop ${i + 1}${p.label ? `: ${p.label}` : ''}`));
    if (fit && clean.length) map.fitBounds(clean.map((p) => [p.lat, p.lon]), { padding: [30, 30] });
    return { line, stops };
  }

  return { list, get, create, save, remove, appendFix, parseText, clearLayer, draw };
})();
