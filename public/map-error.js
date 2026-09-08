/* Loaded instead of a mapping library when MAP_CONFIG carries a provider error.
   Page code keeps calling L.* against no-op stubs while the container shows the
   error, so a misconfigured provider never silently becomes a different map. */
(function () {
  const chain = {};
  ['addTo', 'remove', 'setLatLng', 'setIcon', 'bindPopup', 'openPopup', 'bindTooltip', 'on', 'setLatLngs'].forEach((m) => {
    chain[m] = () => chain;
  });
  chain.getElement = () => null;
  chain.getLatLng = () => null;
  chain.getLatLngs = () => [];
  chain.getBounds = () => null;

  const stub = () => chain;

  window.__mapContainers = window.__mapContainers || [];
  window.L = {
    map: (el) => {
      const node = typeof el === 'string' ? document.getElementById(el) : el;
      window.__mapContainers.push(node);
      const m = {
        getContainer: () => node,
        setView: () => m,
        panTo: () => m,
        setZoom: () => m,
        getZoom: () => 0,
        fitBounds: () => m,
        on: () => m,
      };
      return m;
    },
    marker: stub,
    polyline: stub,
    circle: stub,
    circleMarker: stub,
    divIcon: (o) => o,
    tileLayer: stub,
  };
})();
