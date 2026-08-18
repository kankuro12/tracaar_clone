const net = require('net');
const { parseFrame } = require('./protocol');
const { getVehicleByImei, insertPosition, resolveOfflineAlert, createAlert } = require('./db');
const { checkGeofences } = require('./geo');
const { notifyAlert } = require('./notify');

const MAX_BUFFER = 4096;

// Raw TCP listener for Sinotrack H02 frames. One frame per `#`, self-contained,
// no session state. Malformed/unknown frames are logged and dropped.
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
        handleFrame(raw).catch((e) => log(`ingest: ${e.message}`));
      }
    });
  });

  async function handleFrame(raw) {
    let frame;
    try {
      frame = parseFrame(raw);
    } catch (e) {
      log(`ingest: discarding malformed frame: ${e.message}`);
      return;
    }
    const vehicle = await getVehicleByImei(frame.imei);
    log(`[${new Date().toLocaleString()}] ingest: unknown IMEI ${frame.imei} — frame discarded`);
    if (!vehicle) {
      return;
    }
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
