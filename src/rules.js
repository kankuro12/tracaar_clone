// Alert-rule evaluation, run against every incoming fix.
//
// Until now alert_rules rows were editable in the dashboard but nothing ever
// read them: only geofence and offline alerts actually fired. This enforces
// the overspeed and idle rules, and derives driver-behaviour events (harsh
// braking / acceleration / cornering) from consecutive fixes — the H02
// protocol carries no accelerometer, so these come from deltas in speed and
// course over time.

const { pool } = require('./db');
const store = require('./store');

const KN_TO_KMH = 1.852;
const IDLE_SPEED_KMH = +process.env.IDLE_SPEED_KMH || 3;      // at or below this counts as stopped
const HARSH_ACCEL_MS2 = +process.env.HARSH_ACCEL_MS2 || 2.5;  // m/s^2, both directions
const HARSH_TURN_DEG = +process.env.HARSH_TURN_DEG || 45;     // course change in one step
const HARSH_TURN_MIN_KMH = +process.env.HARSH_TURN_MIN_KMH || 25;
const MAX_DELTA_S = 30; // deltas over a longer gap are too smeared to judge

// alert_rules change rarely but are read on every frame — cache per customer.
const rulesCache = new Map(); // customerId -> { rules, expiresAt }
const RULES_TTL_MS = 60_000;

async function getRules(customerId) {
  const hit = rulesCache.get(String(customerId));
  if (hit && hit.expiresAt > Date.now()) return hit.rules;
  const r = await pool.query(
    'SELECT type, threshold, enabled FROM alert_rules WHERE customer_id = $1',
    [customerId]
  );
  const rules = {};
  for (const row of r.rows) rules[row.type] = { threshold: +row.threshold, enabled: row.enabled };
  rulesCache.set(String(customerId), { rules, expiresAt: Date.now() + RULES_TTL_MS });
  return rules;
}

function invalidateRules(customerId) {
  if (customerId == null) rulesCache.clear();
  else rulesCache.delete(String(customerId));
}

// Smallest angle between two compass courses, in degrees (0..180).
// 350° -> 10° is a 20° turn, not 340°.
function courseDelta(a, b) {
  return Math.abs(((b - a + 540) % 360) - 180);
}

/**
 * Evaluate one fix. `prev` is the vehicle's previous fix as stored by ingest
 * ({ lat, lon, t, speedKn, course }) or null on a cold start.
 * Returns { alerts, events } — alerts are user-visible, events feed scoring.
 */
async function evaluateRules({ vehicle, frame, prev }) {
  const alerts = [];
  const events = [];
  if (!frame.valid) return { alerts, events }; // don't judge an invalid fix

  const rules = await getRules(vehicle.customer_id);
  const speedKmh = frame.speedKn * KN_TO_KMH;
  const prevSpeedKmh = prev && prev.speedKn != null ? prev.speedKn * KN_TO_KMH : null;
  const now = frame.deviceTime.getTime();
  const dtS = prev && prev.t ? (now - prev.t) / 1000 : null;

  // ---- overspeed: fire on the crossing, not on every frame while speeding --
  const over = rules.overspeed;
  if (over && over.enabled && over.threshold > 0) {
    const wasOver = prevSpeedKmh != null && prevSpeedKmh > over.threshold;
    if (speedKmh > over.threshold && !wasOver) {
      alerts.push({
        type: 'overspeed',
        message: `${vehicle.name} exceeded ${Math.round(over.threshold)} km/h (${Math.round(speedKmh)} km/h)`,
      });
    }
  }

  // ---- idle: stopped but still reporting for longer than the threshold -----
  const idle = rules.idle;
  if (idle && idle.enabled && idle.threshold > 0) {
    const idleKey = `ingest:idleSince:${vehicle.id}`;
    if (speedKmh <= IDLE_SPEED_KMH) {
      const sinceRaw = await store.get(idleKey);
      if (!sinceRaw) {
        // first stopped fix — start the clock, TTL well past the threshold
        await store.set(idleKey, JSON.stringify({ since: now, fired: false }), 24 * 3600);
      } else {
        let state;
        try { state = JSON.parse(sinceRaw); } catch { state = null; }
        if (state && !state.fired) {
          const idleMin = (now - state.since) / 60000;
          if (idleMin >= idle.threshold) {
            alerts.push({
              type: 'idle',
              message: `${vehicle.name} idling for ${Math.round(idleMin)} min`,
            });
            await store.set(idleKey, JSON.stringify({ since: state.since, fired: true }), 24 * 3600);
          }
        }
      }
    } else {
      await store.del(idleKey); // moving again — reset
    }
  }

  // ---- driver behaviour, derived from deltas -------------------------------
  if (prev && dtS != null && dtS > 0 && dtS <= MAX_DELTA_S && prevSpeedKmh != null) {
    const accelMs2 = ((speedKmh - prevSpeedKmh) / 3.6) / dtS;
    if (accelMs2 <= -HARSH_ACCEL_MS2) {
      events.push({ type: 'harsh_brake', value: Math.abs(+accelMs2.toFixed(2)) });
    } else if (accelMs2 >= HARSH_ACCEL_MS2) {
      events.push({ type: 'harsh_accel', value: +accelMs2.toFixed(2) });
    }
    if (prev.course != null && speedKmh >= HARSH_TURN_MIN_KMH) {
      const turn = courseDelta(prev.course, frame.course);
      if (turn >= HARSH_TURN_DEG) events.push({ type: 'harsh_turn', value: +turn.toFixed(1) });
    }
  }

  return { alerts, events };
}

async function recordEvents(vehicleId, customerId, frame, events) {
  for (const ev of events) {
    await pool.query(
      `INSERT INTO driving_events (customer_id, vehicle_id, type, value, speed_kmh, lat, lon, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [customerId, vehicleId, ev.type, ev.value, frame.speedKn * KN_TO_KMH, frame.lat, frame.lon, frame.deviceTime]
    );
  }
}

module.exports = { evaluateRules, recordEvents, invalidateRules, getRules, courseDelta };
