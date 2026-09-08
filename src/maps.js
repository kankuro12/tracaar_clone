// Base-map provider. MAP_TYPE picks the tile source; every page keeps using
// Leaflet, so only the L.tileLayer URL/attribution changes between providers.
//
//   MAP_TYPE=leaflet   OpenStreetMap tiles (default, no credentials)
//   MAP_TYPE=google    Google Map Tiles API (needs GOOGLE_MAPS_API_KEY)
//
// A misconfigured provider is never silently swapped for another one: mapConfig
// returns { error } and the page shows that error in place of the map.

const RETRY_MS = 30_000; // don't hammer createSession while the key is broken

const OSM = {
  provider: 'osm',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

let session = null;   // { token, expiresAt } — Google sessions last ~2 weeks
let lastError = null; // { message, until } — cached so every request doesn't retry

function fail(provider, message) {
  console.error(`maps: ${message}`);
  return { provider, error: message };
}

async function googleSession(key) {
  if (session && session.expiresAt > Date.now() + 60_000) return session.token;
  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mapType: process.env.GOOGLE_MAPS_MAP_TYPE || 'roadmap',
      language: process.env.GOOGLE_MAPS_LANGUAGE || 'en-US',
      region: process.env.GOOGLE_MAPS_REGION || 'NP',
    }),
  });
  if (!res.ok) throw new Error(`Google createSession failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!body.session) throw new Error('Google createSession returned no session token');
  session = { token: body.session, expiresAt: +body.expiry * 1000 };
  return session.token;
}

// Resolved per request (cheap: the session token is cached until it expires).
async function mapConfig() {
  const type = (process.env.MAP_TYPE || 'leaflet').toLowerCase();
  if (type === 'leaflet') return OSM;
  if (type !== 'google') return fail(type, `MAP_TYPE="${process.env.MAP_TYPE}" is not a known provider (use leaflet or google)`);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return fail('google', 'MAP_TYPE=google but GOOGLE_MAPS_API_KEY is unset');
  if (lastError && lastError.until > Date.now()) return { provider: 'google', error: lastError.message };

  try {
    const token = await googleSession(key);
    lastError = null;
    return {
      provider: 'google',
      url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${token}&key=${encodeURIComponent(key)}`,
      maxZoom: 22,
      attribution: '&copy; <a href="https://www.google.com/intl/en_us/help/terms_maps/">Google</a>',
    };
  } catch (err) {
    session = null;
    lastError = { message: err.message, until: Date.now() + RETRY_MS };
    return fail('google', err.message);
  }
}

module.exports = { mapConfig };
