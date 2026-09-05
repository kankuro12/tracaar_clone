const net = require('net');
const { parseFrame } = require('./protocol');
const { getVehicleByImei, insertPosition, resolveOfflineAlert, createAlert, recordBlockedImei } = require('./db');
const { checkGeofences } = require('./geo');
const { notifyAlert } = require('./notify');
const store = require('./store');
const { evaluateRules, recordEvents } = require('./rules');

const MAX_BUFFER = 4096;
// per-frame logging is useful while bringing devices online but is too noisy
// to leave on at fleet scale — opt in with INGEST_LOG_FRAMES=1
const LOG_FRAMES = process.env.INGEST_LOG_FRAMES === '1';
// optional IP allow-list for the TCP ingest port — off by default (devices
// authenticate only via a registered IMEI, so anyone who can reach this port
// and knows/guesses one can inject fake positions for that vehicle). Set
// INGEST_ALLOWED_IPS to a comma list to restrict connections, e.g. to the
// APN/gateway range your GPS trackers connect from.
const ALLOWED_IPS = (process.env.INGEST_ALLOWED_IPS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const normalizeIp = (ip) => (ip || '').replace(/^::ffff:/, '');

// Raw TCP listener for Sinotrack H02 frames. One frame per `#`, self-contained,
// no session state. Malformed/unknown frames are logged and dropped.
//
// Hot per-IMEI state (last device_time for late-frame detection, last position
// for geofence transitions and driver-behaviour deltas) lives in the shared
// store. With REDIS_URL set it survives a restart, so the first frame after a
// deploy still detects a geofence crossing instead of starting blind.
const KEY_TIME = 'ingest:lastDeviceTime';
const KEY_POS = 'ingest:lastPosition';

function startIngest({ port, hub, log = console.log }) {
  const server = net.createServer((socket) => {
    if (ALLOWED_IPS.length && !ALLOWED_IPS.includes(normalizeIp(socket.remoteAddress))) {
      log(`ingest: rejecting connection from disallowed IP ${socket.remoteAddress}`);
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    let buf = '';
    socket.on('error', () => {}); // device dropped us mid-stream: ignore
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (buf.length > MAX_BUFFER) {
        log(`ingest: dropping oversized buffer (${buf.length}b) from ${socket.remoteAddress}`);
        buf = '';
        return;
      }
      let idx;
      while ((idx = buf.indexOf('#')) !== -1) {
        const raw = buf.slice(0, idx + 1);
        buf = buf.slice(idx + 1);
        const ip = socket.remoteAddress;
        handleFrame(raw, ip).catch((e) => log(`ingest: ${e.message}`));
      }
    });
  });

  async function handleFrame(raw, ip) {
    if (LOG_FRAMES) log(`[${new Date().toLocaleString()}] ingest: frame [${raw.trim()}]`);
    let frame;
    try {
      frame = parseFrame(raw);
    } catch (e) {
      log(`ingest: discarding MALFORMED frame [${raw.trim()}] — ${e.message}`);
      return;
    }
    const vehicle = await getVehicleByImei(frame.imei);
    if (!vehicle) {
      log(`[${new Date().toLocaleString()}] ingest: UNKNOWN IMEI ${frame.imei} from ${ip || '?'} — frame discarded [${raw.trim()}]`);
      // forensics: deduped by PK, report IP
      recordBlockedImei({ imei: frame.imei, ip: ip || null, raw: raw.trim(), lat: frame.lat, lon: frame.lon }).catch((e) => log(`blocked-imei record failed: ${e.message}`));
      return;
    }
    const seenRaw = await store.hGet(KEY_TIME, frame.imei);
    const seen = seenRaw == null ? null : Number(seenRaw);
    const ft = frame.deviceTime.getTime();
    if (seen != null && ft < seen) {
      log(`[${new Date().toLocaleString()}] ingest: LATE frame for ${frame.imei} — device time ${frame.deviceTime.toISOString()} older than latest ${new Date(seen).toISOString()} — still stored`);
    }
    if (seen == null || ft > seen) await store.hSet(KEY_TIME, frame.imei, ft);
    const prevPosition = await store.hGetJson(KEY_POS, frame.imei);
    const position = await insertPosition({ vehicleId: vehicle.id, ...frame });
    await store.hSetJson(KEY_POS, frame.imei, {
      lat: frame.lat, lon: frame.lon, t: ft,
      speedKn: frame.speedKn, course: frame.course,
      ignition: frame.ignition, flags: frame.flags,
    });
    const payload = {
      id: position.id,
      recordedAt: position.recorded_at,
      deviceTime: position.device_time,
      valid: position.valid,
      lat: position.lat,
      lon: position.lon,
      speedKn: position.speed_kn,
      course: position.course,
    };
    hub.publish(vehicle.id, { type: 'position', vehicleId: vehicle.id, position: payload });

    // geofence transitions
    const events = await checkGeofences(vehicle.id, frame.lat, frame.lon, prevPosition);
    for (const ev of events) {
      const alert = await createAlert({
        customerId: ev.customer_id,
        vehicleId: vehicle.id,
        geofenceId: ev.id,
        type: ev.type,
        message: `${vehicle.name} ${ev.type === 'enter' ? 'entered' : 'left'} ${ev.name}`,
        lat: frame.lat,
        lon: frame.lon,
      });
      hub.publish(vehicle.id, { type: 'alert', alert });
      notifyAlert(alert, null).catch(() => {});
    }

    // device-reported status: ignition transitions and panic/power conditions
    try {
      const deviceAlerts = [];
      if (frame.ignition != null && prevPosition && prevPosition.ignition != null
          && frame.ignition !== prevPosition.ignition) {
        deviceAlerts.push({
          type: frame.ignition ? 'ignition_on' : 'ignition_off',
          message: `${vehicle.name} ignition ${frame.ignition ? 'on' : 'off'}`,
        });
      }
      if (frame.flags) {
        const was = prevPosition && prevPosition.flags ? prevPosition.flags : {};
        if (frame.flags.sos && !was.sos) deviceAlerts.push({ type: 'sos', message: `${vehicle.name} SOS button pressed` });
        if (frame.flags.powerCut && !was.powerCut) deviceAlerts.push({ type: 'power_cut', message: `${vehicle.name} main power disconnected` });
        if (frame.flags.theft && !was.theft) deviceAlerts.push({ type: 'theft', message: `${vehicle.name} tamper/theft alarm` });
      }
      for (const da of deviceAlerts) {
        const alert = await createAlert({
          customerId: vehicle.customer_id, vehicleId: vehicle.id, geofenceId: null,
          type: da.type, message: da.message, lat: frame.lat, lon: frame.lon,
        });
        hub.publish(vehicle.id, { type: 'alert', alert });
        notifyAlert(alert, null).catch(() => {});
      }
    } catch (e) {
      log(`ingest: status decode failed for ${frame.imei} — ${e.message}`);
    }

    // overspeed / idle rules + driver-behaviour events
    try {
      const { alerts: ruleAlerts, events: driveEvents } = await evaluateRules({ vehicle, frame, prev: prevPosition });
      for (const ra of ruleAlerts) {
        const alert = await createAlert({
          customerId: vehicle.customer_id,
          vehicleId: vehicle.id,
          geofenceId: null,
          type: ra.type,
          message: ra.message,
          lat: frame.lat,
          lon: frame.lon,
        });
        hub.publish(vehicle.id, { type: 'alert', alert });
        notifyAlert(alert, null).catch(() => {});
      }
      if (driveEvents.length) {
        await recordEvents(vehicle.id, vehicle.customer_id, frame, driveEvents);
      }
    } catch (e) {
      log(`ingest: rule evaluation failed for ${frame.imei} — ${e.message}`); // never drop the fix over this
    }

    // vehicle reporting again resolves any offline flag
    const online = await resolveOfflineAlert(vehicle);
    if (online) {
      hub.publish(vehicle.id, { type: 'alert', alert: online });
      notifyAlert(online, null).catch(() => {});
    }
  }

  return new Promise((resolve, reject) => {
    // Without this the listener emits an unhandled 'error' and the whole
    // process dies on a raw stack trace — most often just a stale instance
    // still holding the port.
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new Error(`ingest port ${port} is already in use — another instance is probably still running`));
      } else {
        reject(e);
      }
    });
    server.listen(port, () => {
      log(`ingest: TCP H02 listener on :${port}`);
      resolve(server);
    });
  });
}

module.exports = { startIngest };
