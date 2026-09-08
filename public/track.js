/* Shared map helpers: trail smoothing and vehicle-type markers.
   Loaded on every page (partials/scripts.ejs) and used by app.js, vehicle-live
   and the trips playback page so all three draw trails and markers the same. */

/* ---------- trail smoothing ----------
   Raw GPS fixes give you both failure modes at once: a parked or slow vehicle
   wobbles a few metres between fixes, which reads as zigzag, while a long run
   of near-collinear fixes reads as one dead-straight line. So the path is built
   in two steps rather than splined directly:

     1. simplify (Ramer-Douglas-Peucker, metric tolerance) - drops the jitter
        and the redundant collinear points, keeping the fixes that define the
        actual shape of the route;
     2. spline (centripetal Catmull-Rom) through what survives, sampled by
        segment LENGTH rather than point count, so a long sweeping curve gets as
        many samples as it needs and a short hop does not get over-sampled.

   Centripetal (alpha 0.5) rather than uniform because uniform overshoots on
   sharp turns. Endpoints use reflected control points so the first and last
   legs are smoothed too. */
(function () {
  const ALPHA = 0.5;
  const M_PER_DEG = 111320;          // latitude degrees -> metres
  // These two do different jobs and were measured separately: tolerance decides
  // how much wobble is discarded (zigzag), spacing decides how finely the curve
  // is drawn (smoothness). 8m/6m killed the jitter outright while still drawing
  // ~75 points through a 90-degree curve.
  const TOLERANCE_M = 8;             // jitter below this is not a real turn
  const SPACING_M = 6;               // one spline sample per this much distance

  const lonScale = (lat) => Math.cos((lat * Math.PI) / 180);

  // Local flat-earth projection in metres; fine over a single vehicle's track.
  function projector(pts) {
    const k = lonScale(pts[0][0]);
    return (p) => [p[1] * k * M_PER_DEG, p[0] * M_PER_DEG];
  }

  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 1e-7 || Math.abs(q[1] - p[1]) > 1e-7) out.push(p);
    }
    return out;
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // Iterative RDP - a recursive one blows the stack on long histories.
  function simplify(pts, tolerance) {
    if (pts.length < 3) return pts;
    const xy = projector(pts);
    const m = pts.map(xy);
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [lo, hi] = stack.pop();
      let far = -1, best = tolerance;
      for (let i = lo + 1; i < hi; i++) {
        const d = segDist(m[i], m[lo], m[hi]);
        if (d > best) { best = d; far = i; }
      }
      if (far === -1) continue;
      keep[far] = 1;
      stack.push([lo, far], [far, hi]);
    }
    return pts.filter((_, i) => keep[i]);
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

  window.smoothTrack = function (points, opts) {
    opts = opts || {};
    const raw = dedupe(points || []);
    if (raw.length < 3) return raw;

    const pts = simplify(raw, opts.tolerance != null ? opts.tolerance : TOLERANCE_M);
    if (pts.length < 3) return pts;

    const xy = projector(pts);
    const spacing = opts.spacing || SPACING_M;
    // Long tracks get a coarser sample budget so the drawn path stays bounded.
    const budget = pts.length > 600 ? 10 : pts.length > 200 ? 18 : 28;

    const reflect = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
    const head = reflect(pts[0], pts[1]);
    const tail = reflect(pts[pts.length - 1], pts[pts.length - 2]);

    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = xy(pts[i]), b = xy(pts[i + 1]);
      const samples = Math.max(2, Math.min(budget, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing)));
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

/* Markers are a pointed rectangle drawn nose-up and rotated to the heading, so
   which way a vehicle faces is readable at a glance. The silhouette inside is
   the vehicle seen from ABOVE - a side view would look wrong once rotated.
   Body fill is currentColor so the status classes tint it; cut-outs use
   currentColor too, which reads as a window against the white silhouette. */
const BODY = 'M13 0 L24 9 v25 a4 4 0 0 1 -4 4 H6 a4 4 0 0 1 -4 -4 V9 Z';

const VEHICLE_GLYPHS = {
  // white silhouette, then currentColor detail on top
  car: '<rect x="6.5" y="13" width="13" height="21" rx="3.6" fill="#fff"/>'
     + '<path d="M8.6 18.2h8.8l-.9-2.6a1 1 0 0 0-.9-.6h-5.2a1 1 0 0 0-.9.6z" fill="currentColor"/>'
     + '<rect x="8.6" y="26" width="8.8" height="4.6" rx="1" fill="currentColor"/>',
  bus: '<rect x="6" y="11" width="14" height="25" rx="3" fill="#fff"/>'
     + '<rect x="8.2" y="13.6" width="9.6" height="3.4" rx="1" fill="currentColor"/>'
     + '<rect x="8.2" y="19.6" width="9.6" height="2.4" rx="1" fill="currentColor"/>'
     + '<rect x="8.2" y="24.4" width="9.6" height="2.4" rx="1" fill="currentColor"/>',
  truck: '<rect x="6.6" y="11.5" width="12.8" height="8.4" rx="2.4" fill="#fff"/>'
       + '<rect x="8.6" y="13.6" width="8.8" height="3.2" rx="1" fill="currentColor"/>'
       + '<rect x="5.8" y="21.4" width="14.4" height="14.4" rx="1.8" fill="#fff"/>',
  // narrow body, handlebars near the nose, wider seat behind - reads as a bike
  // from above rather than the plus-sign a centred crossbar produces
  bike: '<rect x="11.1" y="12.6" width="3.8" height="21" rx="1.9" fill="#fff"/>'
      + '<rect x="8.2" y="16.2" width="9.6" height="2.6" rx="1.3" fill="#fff"/>'
      + '<rect x="9.8" y="24.6" width="6.4" height="5.2" rx="2" fill="#fff"/>',
  // narrow at the front, wide at the back - the auto-rickshaw silhouette
  three_wheeler: '<path d="M13 12.1c2.2 0 3.4 1.5 3.8 3.6l1.9 13.1a2.1 2.1 0 0 1-2.1 2.5H9.4a2.1 2.1 0 0 1-2.1-2.5l1.9-13.1c.4-2.1 1.6-3.6 3.8-3.6z" fill="#fff"/>'
               + '<path d="M10.7 19.2h4.6l-.5-2.4a1 1 0 0 0-1-.8h-1.6a1 1 0 0 0-1 .8z" fill="currentColor"/>'
               + '<rect x="8.9" y="25.4" width="8.2" height="3.4" rx="1.2" fill="currentColor"/>',
};

// One marker = body + silhouette, as a single SVG so both rotate together.
window.vehicleMarkerSvg = function (type) {
  const glyph = VEHICLE_GLYPHS[type] || VEHICLE_GLYPHS.car;
  return `<svg viewBox="0 0 26 40" aria-hidden="true"><path d="${BODY}" fill="currentColor"/>${glyph}</svg>`;
};

// html for a marker: `cls` carries the status (online / offline / selected).
window.vehicleMarkerHtml = function (type, cls, heading, extra) {
  return `<div class="veh ${cls || ''}">`
       + `<span class="veh-body" style="transform: rotate(${heading || 0}deg)">${window.vehicleMarkerSvg(type)}</span>`
       + `${extra || ''}</div>`;
};

window.VEHICLE_MARKER_SIZE = [17, 26];
window.VEHICLE_MARKER_ANCHOR = [9, 16];    // the position sits at the body centre

window.vehicleTypeLabel = function (type) {
  const found = window.VEHICLE_TYPES.find((t) => t[0] === type);
  return found ? found[1] : 'Car';
};
