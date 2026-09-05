const net = require('net');
const { parseFrame } = require('./protocol');
const { getVehicleByImei, insertPosition, resolveOfflineAlert, createAlert, recordBlockedImei } = require('./db');
const { checkGeofences } = require('./geo');
const { notifyAlert } = require('./notify');

const MAX_BUFFER = 4096;

// Raw TCP listener for Sinotrack H02 frames. One frame per `#`, self-contained,
// no session state. Malformed/unknown frames are logged and dropped.
// last device_time seen per IMEI (in-memory; cold-starts unknown, heals on next frame)
const lastDeviceTime = new Map();

function startIngest({ port, hub, log = console.log }) {
  const server = net.createServer((socket) => {
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
    log(`[${new Date().toLocaleString()}] ingest: frame [${raw.trim()}]`); // debug: log every frame
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
    const seen = lastDeviceTime.get(frame.imei);
    const ft = frame.deviceTime.getTime();
    if (seen != null && ft < seen) {
      log(`[${new Date().toLocaleString()}] ingest: LATE frame for ${frame.imei} — device time ${frame.deviceTime.toISOString()} older than latest ${new Date(seen).toISOString()} — still stored`);
    }
    if (seen == null || ft > seen) lastDeviceTime.set(frame.imei, ft);
    const position = await insertPosition({ vehicleId: vehicle.id, ...frame });
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
    const events = await checkGeofences(vehicle.id, frame.lat, frame.lon, position.id);
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

    // vehicle reporting again resolves any offline flag
    const online = await resolveOfflineAlert(vehicle);
    if (online) {
      hub.publish(vehicle.id, { type: 'alert', alert: online });
      notifyAlert(online, null).catch(() => {});
    }
  }

  return new Promise((resolve) => {
    server.listen(port, () => {
      log(`ingest: TCP H02 listener on :${port}`);
      resolve(server);
    });
  });
}

module.exports = { startIngest };
