// Base-map provider. MAP_TYPE picks which mapping library the pages load:
//
//   MAP_TYPE=leaflet   Leaflet + OpenStreetMap tiles (default, no credentials)
//   MAP_TYPE=google    Google Maps JavaScript API (needs GOOGLE_MAPS_API_KEY)
//
// A misconfigured provider is never silently swapped for another one: mapConfig
// returns { error } and the page shows that error in place of the map. The key
// is validated in the browser instead of here - Google only reports auth
// failures at map-render time, via the gm_authFailure hook.

const OSM = {
  provider: 'osm',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

function fail(provider, message) {
  console.error(`maps: ${message}`);
  return { provider, error: message };
}

async function mapConfig() {
  const type = (process.env.MAP_TYPE || 'leaflet').toLowerCase();
  if (type === 'leaflet') return OSM;
  if (type !== 'google') return fail(type, `MAP_TYPE="${process.env.MAP_TYPE}" is not a known provider (use leaflet or google)`);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return fail('google', 'MAP_TYPE=google but GOOGLE_MAPS_API_KEY is unset');

  return {
    provider: 'google',
    key,
    mapType: process.env.GOOGLE_MAPS_MAP_TYPE || 'roadmap',
    language: process.env.GOOGLE_MAPS_LANGUAGE || 'en-US',
    region: process.env.GOOGLE_MAPS_REGION || 'NP',
    // Vector map id — required for real map rotation (setHeading). Omitted when
    // unset, in which case Google renders raster and rotation is a no-op.
    mapId: process.env.GOOGLE_MAPS_MAP_ID || undefined,
    maxZoom: 22,
  };
}

module.exports = { mapConfig };
