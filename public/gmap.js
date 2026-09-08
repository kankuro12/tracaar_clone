/* Google Maps JavaScript API behind the Leaflet call signatures the fleet pages
   already use, so page code is identical under either MAP_TYPE. Loaded instead
   of leaflet.js when MAP_TYPE=google - no Leaflet on the page at all.

   Implements only the surface those pages touch: map setView/panTo/fitBounds,
   divIcon markers, polyline, circle (metres), circleMarker (pixels), popups and
   tooltips. See MAP-PROVIDER-TESTS.md section 3. */
(function () {
  const cfg = window.MAP_CONFIG || {};
  const gm = () => window.google.maps;

  const ll = (p) => (Array.isArray(p) ? { lat: +p[0], lng: +p[1] } : { lat: +p.lat, lng: +(p.lng != null ? p.lng : p.lon) });

  // Google draws vectors to canvas, so Leaflet CSS classes cannot style them.
  // These mirror .trail / .geofence in style.css.
  const CLASS_STYLE = {
    // No dash here on purpose. google.maps.Polyline has no stroke-dasharray
    // equivalent - dashes have to be faked with repeated symbols, and Google
    // spaces those unevenly along a long route, which makes the trail look
    // broken into chunks. Leaflet gets real dashes from CSS (.trail in
    // style.css); on Google a solid line is the only one that draws cleanly.
    trail: { strokeColor: '#10b981', strokeWeight: 3, strokeOpacity: 0.9 },
    geofence: { strokeColor: '#f59e0b', strokeWeight: 1.5, strokeOpacity: 0.9, fillColor: '#f59e0b', fillOpacity: 0.12 },
  };

  // Per-call options apply first, then the className's style overrides them -
  // under Leaflet the CSS rule beat the inline stroke attributes, so a trail was
  // teal and dashed regardless of the color/weight the caller passed.
  function vectorStyle(o) {
    o = o || {};
    const s = { strokeColor: '#3b82f6', strokeWeight: 3, strokeOpacity: 0.9, fillOpacity: 0 };
    if (o.color) s.strokeColor = o.color;
    if (o.weight != null) s.strokeWeight = o.weight;
    if (o.opacity != null) s.strokeOpacity = o.opacity;
    if (o.fillColor) s.fillColor = o.fillColor;
    if (o.fillOpacity != null) s.fillOpacity = o.fillOpacity;
    Object.assign(s, CLASS_STYLE[o.className]);
    s.clickable = o.interactive !== false;
    return s;
  }

  /* ---------- markers: an OverlayView so divIcon HTML renders verbatim ---------- */
  function HtmlOverlay(pos, icon, interactive) {
    const o = new (gm().OverlayView)();
    o._pos = ll(pos);
    o._def = icon || {};
    o._clicks = [];
    o.applyIcon = function (def) {
      this._def = def || {};
      const size = this._def.iconSize || [16, 16];
      const anchor = this._def.iconAnchor || [size[0] / 2, size[1] / 2];
      this._ax = anchor[0];
      this._ay = anchor[1];
      if (!this._icon) return;
      this._icon.className = this._def.className || '';
      this._icon.style.width = size[0] + 'px';
      this._icon.style.height = size[1] + 'px';
      this._icon.innerHTML = this._def.html || '';
      this.draw();
    };
    o.onAdd = function () {
      const d = document.createElement('div');
      d.style.position = 'absolute';
      if (interactive === false) d.style.pointerEvents = 'none';
      else d.style.cursor = 'pointer';
      this._icon = d;
      this.applyIcon(this._def);
      this.getPanes().overlayMouseTarget.appendChild(d);
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        this._clicks.forEach((f) => f());
      });
    };
    o.draw = function () {
      if (!this._icon) return;
      const proj = this.getProjection();
      if (!proj) return;
      const p = proj.fromLatLngToDivPixel(new (gm().LatLng)(this._pos));
      if (!p) return;
      this._icon.style.left = p.x - this._ax + 'px';
      this._icon.style.top = p.y - this._ay + 'px';
    };
    o.onRemove = function () {
      if (this._icon && this._icon.parentNode) this._icon.parentNode.removeChild(this._icon);
      this._icon = null;
    };
    o.applyIcon(o._def);
    return o;
  }

  let sharedInfo = null;
  const info = () => sharedInfo || (sharedInfo = new (gm().InfoWindow)());

  function Marker(pos, opts) {
    opts = opts || {};
    const self = { _map: null };
    const ov = HtmlOverlay(pos, opts.icon, opts.interactive);
    Object.defineProperty(self, '_icon', { get: () => ov._icon }); // app.js reads marker._icon
    self.addTo = (m) => { self._map = m; ov.setMap(m._gmap); return self; };
    self.remove = () => { ov.setMap(null); return self; };
    self.setLatLng = (p) => { ov._pos = ll(p); ov.draw(); return self; };
    self.getLatLng = () => ov._pos;
    self.setIcon = (icon) => { ov.applyIcon(icon); return self; };
    self.getElement = () => ov._icon;
    self.bindPopup = (html) => { self._popup = html; return self; };
    self.setPopupContent = (html) => {
      self._popup = html;
      // keep an already-open popup live rather than waiting for the next click
      if (sharedInfo && sharedInfo.getMap() && sharedInfo.get('owner') === self) sharedInfo.setContent(html);
      return self;
    };
    self.openPopup = () => {
      if (!self._popup || !self._map) return self;
      info().setContent(self._popup);
      info().setPosition(ov._pos);
      info().set('owner', self);
      info().open(self._map._gmap);
      return self;
    };
    self.on = (ev, fn) => { if (ev === 'click') ov._clicks.push(fn); return self; };
    ov._clicks.push(() => self.openPopup());
    return self;
  }

  /* ---------- vectors ---------- */
  function wrap(shape) {
    const self = { _map: null, _shape: shape };
    self.addTo = (m) => { self._map = m; shape.setMap(m._gmap); return self; };
    self.remove = () => { shape.setMap(null); return self; };
    self.bindPopup = (html) => {
      shape.addListener('click', (e) => {
        info().setContent(html);
        info().setPosition(e.latLng);
        info().open(self._map && self._map._gmap);
      });
      return self;
    };
    self.bindTooltip = (text) => {
      shape.addListener('mouseover', (e) => {
        info().setContent(text);
        info().setPosition(e.latLng);
        info().open(self._map && self._map._gmap);
      });
      shape.addListener('mouseout', () => info().close());
      return self;
    };
    return self;
  }

  function Polyline(pts, opts) {
    opts = opts || {};
    const path = (pts || []).map(ll);
    const shape = new (gm().Polyline)(Object.assign({ path }, vectorStyle(opts)));
    const self = wrap(shape);
    self.getLatLngs = () => path;
    self.setLatLngs = (next) => {
      path.length = 0;
      (next || []).map(ll).forEach((p) => path.push(p));
      shape.setPath(path);
      return self;
    };
    self.addLatLng = (p) => {
      path.push(ll(p));
      shape.setPath(path);
      return self;
    };
    self.getBounds = () => {
      const b = new (gm().LatLngBounds)();
      path.forEach((p) => b.extend(p));
      return b;
    };
    return self;
  }

  function Circle(pos, opts) {
    opts = opts || {};
    return wrap(new (gm().Circle)(Object.assign({ center: ll(pos), radius: opts.radius }, vectorStyle(opts))));
  }

  // Leaflet circleMarker radius is pixels, so this is a scaled symbol, not a Circle.
  function CircleMarker(pos, opts) {
    opts = opts || {};
    const s = vectorStyle(opts);
    return wrap(new (gm().Marker)({
      position: ll(pos),
      icon: {
        path: gm().SymbolPath.CIRCLE,
        scale: opts.radius || 6,
        strokeColor: s.strokeColor,
        strokeWeight: s.strokeWeight,
        fillColor: s.fillColor || s.strokeColor,
        fillOpacity: s.fillOpacity,
      },
    }));
  }

  /* ---------- map ---------- */
  const MAP_TYPE_ID = { roadmap: 'roadmap', satellite: 'satellite', terrain: 'terrain', hybrid: 'hybrid' };

  function LMap(el) {
    const self = {};
    self._el = typeof el === 'string' ? document.getElementById(el) : el;
    const mapOpts = {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: MAP_TYPE_ID[cfg.mapType] || 'roadmap',
      maxZoom: cfg.maxZoom || 22,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
    };
    // Vector maps (which support setHeading / real map rotation) need a mapId.
    if (cfg.mapId) mapOpts.mapId = cfg.mapId;
    self._gmap = new (gm().Map)(self._el, mapOpts);
    self.getContainer = () => self._el;
    self.setView = (pos, zoom) => {
      self._gmap.setCenter(ll(pos));
      if (zoom != null) self._gmap.setZoom(zoom);
      return self;
    };
    self.panTo = (pos, opts) => {
      // Follow mode passes { animate:false } so the vehicle stays locked under
      // the rotated map; animated panTo otherwise makes heading mode drift/jitter.
      if (opts && opts.animate === false) self._gmap.setCenter(ll(pos));
      else self._gmap.panTo(ll(pos));
      return self;
    };
    self.setZoom = (z) => { self._gmap.setZoom(z); return self; };
    self.getZoom = () => self._gmap.getZoom();
    self.fitBounds = (bounds, opts) => {
      opts = opts || {};
      let b = bounds;
      if (Array.isArray(bounds)) {
        b = new (gm().LatLngBounds)();
        bounds.map(ll).forEach((p) => b.extend(p));
      }
      const pad = Array.isArray(opts.padding)
        ? { top: opts.padding[0], bottom: opts.padding[0], left: opts.padding[1], right: opts.padding[1] }
        : opts.padding;
      self._gmap.fitBounds(b, pad);
      // Leaflet maxZoom has no Google equivalent - clamp once the map settles.
      if (opts.maxZoom != null) {
        gm().event.addListenerOnce(self._gmap, 'idle', () => {
          if (self._gmap.getZoom() > opts.maxZoom) self._gmap.setZoom(opts.maxZoom);
        });
      }
      return self;
    };
    // Leaflet API surface used by the map pages' rotate-heading control.
    // Google's map is draggable by default; disable() freezes it while the
    // container is CSS-rotated (drag math would otherwise fight the rotation).
    self.dragging = {
      enable: () => self._gmap.setOptions({ draggable: true }),
      disable: () => self._gmap.setOptions({ draggable: false }),
    };
    // Real map rotation (vector map only): heading = compass direction the top
    // of the map faces. No-op on raster maps (no mapId).
    self.setBearing = (deg) => {
      if (self._gmap.setHeading) self._gmap.setHeading(((deg % 360) + 360) % 360);
    };
    self.on = () => self;
    window.__mapContainers.push(self._el);
    return self;
  }

  window.__mapContainers = window.__mapContainers || [];
  window.L = {
    map: LMap,
    marker: Marker,
    polyline: Polyline,
    circle: Circle,
    circleMarker: CircleMarker,
    divIcon: (o) => o,
    tileLayer: () => ({ addTo: (m) => m }), // Google supplies its own tiles
  };
})();
