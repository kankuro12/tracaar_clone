// Base-map provider. MAP_TYPE picks the tile source; every page keeps using
// Leaflet, so only the L.tileLayer URL/attribution changes between providers.
//
//   MAP_TYPE=leaflet   OpenStreetMap tiles (default, no credentials)
//   MAP_TYPE=google    Google Map Tiles API (needs GOOGLE_MAPS_API_KEY)

const OSM = {
  provider: 'osm',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

let session = null; // { token, expiresAt } — Google sessions last ~2 weeks
let warned = false;

function warnOnce(msg) {
  if (!warned) console.warn(`maps: ${msg} — falling back to OpenStreetMap`);
  warned = true;
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
  if (!res.ok) throw new Error(`createSession ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  session = { token: body.session, expiresAt: +body.expiry * 1000 };
  return session.token;
}

// Resolved per request (cheap: the session token is cached until it expires).
async function mapConfig() {
  if ((process.env.MAP_TYPE || 'leaflet').toLowerCase() !== 'google') return OSM;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return warnOnce('MAP_TYPE=google but GOOGLE_MAPS_API_KEY is unset'), OSM;
  try {
    const token = await googleSession(key);
    return {
      provider: 'google',
      url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${token}&key=${encodeURIComponent(key)}`,
      maxZoom: 22,
      attribution: '&copy; <a href="https://www.google.com/intl/en_us/help/terms_maps/">Google</a>',
    };
  } catch (err) {
    session = null;
    return warnOnce(err.message), OSM;
  }
}

module.exports = { mapConfig };
