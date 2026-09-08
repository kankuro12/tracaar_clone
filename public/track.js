/* Shared map helpers: trail smoothing and vehicle-type glyphs.
   Loaded on every page (partials/scripts.ejs) and used by app.js, vehicle-live
   and the trips playback page so all three draw trails the same way. */

/* ---------- trail smoothing ----------
   Raw fixes joined point-to-point look like a folded straight line. This fits a
   centripetal Catmull-Rom spline through them: it passes through every real fix
   (so the trail never invents a position the vehicle did not report) while
   rounding the corners between them. Centripetal (alpha 0.5) rather than uniform
   because uniform overshoots badly on the sharp direction changes GPS noise
   produces when a vehicle is parked. */
(function () {
  const ALPHA = 0.5;

  // Fixes repeat while a vehicle sits still; duplicates make the spline wobble.
  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 1e-7 || Math.abs(q[1] - p[1]) > 1e-7) out.push(p);
    }
    return out;
  }

  function knot(t, a, b) {
    return t + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), ALPHA);
  }

  // Barry-Goldman evaluation of one Catmull-Rom span, p1 -> p2.
  function span(p0, p1, p2, p3, samples, out) {
    const t0 = 0, t1 = knot(t0, p0, p1), t2 = knot(t1, p1, p2), t3 = knot(t2, p2, p3);
    if (!(t1 > t0 && t2 > t1 && t3 > t2)) { out.push(p2); return; }
    const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    for (let i = 1; i <= samples; i++) {
      const t = t1 + (t2 - t1) * (i / samples);
      const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
      const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
      const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
      const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
      const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
      out.push(mix(b1, b2, (t - t1) / (t2 - t1)));
    }
  }

  window.smoothTrack = function (points) {
    const pts = dedupe(points || []);
    if (pts.length < 3) return pts;
    // Keep the drawn path bounded - long histories get fewer samples per span.
    const samples = pts.length > 800 ? 2 : pts.length > 300 ? 4 : 8;
    // Reflect the endpoints rather than duplicating them: a duplicate makes the
    // knot spacing zero, which would leave the first and last legs unsmoothed.
    const reflect = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
    const head = reflect(pts[0], pts[1]);
    const tail = reflect(pts[pts.length - 1], pts[pts.length - 2]);
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      span(i === 0 ? head : pts[i - 1], pts[i], pts[i + 1], i + 2 < pts.length ? pts[i + 2] : tail, samples, out);
    }
    return out;
  };
})();

/* ---------- vehicle types ---------- */
window.VEHICLE_TYPES = [
  ['bike', 'Bike'],
  ['car', 'Car'],
  ['bus', 'Bus'],
  ['truck', 'Truck'],
  ['three_wheeler', 'Three wheeler'],
];

// Simple filled silhouettes - they render at 14px inside the marker dot, so
// detail is wasted; the outline shape is what has to read at a glance.
const VEHICLE_GLYPHS = {
  bike: '<circle cx="5.5" cy="17" r="3.4"/><circle cx="18.5" cy="17" r="3.4"/><path d="M14.5 5h3.2l.9 2.4h-2.3l1.9 5.1-1.5 1.3-2.6-4.5-3.4 2.9 2.1 3.6H10L7.4 11l4.6-3.8-1.2-1.9z"/>',
  car: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11h.5a1.5 1.5 0 0 1 1.5 1.5V17h-2.2a2.3 2.3 0 0 0-4.6 0h-4.4a2.3 2.3 0 0 0-4.6 0H3v-4.5A1.5 1.5 0 0 1 4.5 11zm2.2-.6h9.6l-1.2-3.1H8.4z"/><circle cx="7" cy="17.4" r="1.7"/><circle cx="17" cy="17.4" r="1.7"/>',
  bus: '<path d="M5.5 3h13a2 2 0 0 1 2 2v11a2 2 0 0 1-1.2 1.8V19a1 1 0 0 1-2 0v-1H6.7v1a1 1 0 0 1-2 0v-1.2A2 2 0 0 1 3.5 16V5a2 2 0 0 1 2-2zm0 3v4.5h13V6zm1 7.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm11 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>',
  truck: '<path d="M2 6.5A1.5 1.5 0 0 1 3.5 5H13a1.5 1.5 0 0 1 1.5 1.5V9h2.9a2 2 0 0 1 1.7 1l1.7 2.9a2 2 0 0 1 .2.9V16h-1.7a2.3 2.3 0 0 0-4.6 0h-2.1a2.3 2.3 0 0 0-4.6 0H2zm12.5 4.2v2.1h4.8l-1.2-2.1z"/><circle cx="7.4" cy="16.4" r="1.8"/><circle cx="16.7" cy="16.4" r="1.8"/>',
  three_wheeler: '<path d="M12.2 4a5.6 5.6 0 0 1 5.6 5.2l.5 5.3h1.4a1 1 0 0 1 0 2h-1.7a2.3 2.3 0 0 1-4.5 0h-3a2.3 2.3 0 0 1-4.5 0H4.3a1 1 0 0 1 0-2h1.3l.5-5.3A5.6 5.6 0 0 1 11.7 4zm-3.6 4.6-.3 2.6h7.4l-.3-2.6z"/><circle cx="7.8" cy="16.6" r="1.7"/><circle cx="16.2" cy="16.6" r="1.7"/>',
};

window.vehicleGlyph = function (type) {
  const g = VEHICLE_GLYPHS[type] || VEHICLE_GLYPHS.car;
  return `<span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true">${g}</svg></span>`;
};

window.vehicleTypeLabel = function (type) {
  const found = window.VEHICLE_TYPES.find((t) => t[0] === type);
  return found ? found[1] : 'Car';
};
