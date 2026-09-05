// Sinotrack H02 frame parser.
// Frame: *HQ,IMEI,V1,HHMMSS,A,ddmm.mmmm,N,dddmm.mmmm,E,sss.ss,ddd,DDMMYY,...#

function nmeaToDec(value, hemisphere) {
  const v = parseFloat(value);
  const deg = Math.floor(v / 100);
  const dec = deg + (v - deg * 100) / 60;
  if (Number.isNaN(dec)) throw new Error('bad coordinate');
  return hemisphere === 'S' || hemisphere === 'W' ? -dec : dec;
}

function combineDate(ddmmyy, hhmmss) {
  if (!/^\d{6}$/.test(ddmmyy) || !/^\d{6}$/.test(hhmmss)) throw new Error('bad timestamp');
  const dd = +ddmmyy.slice(0, 2);
  const mm = +ddmmyy.slice(2, 4);
  const yy = +ddmmyy.slice(4, 6);
  const hh = +hhmmss.slice(0, 2);
  const mi = +hhmmss.slice(2, 4);
  const ss = +hhmmss.slice(4, 6);
  return new Date(Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss));
}

// ---- vehicle status word (field 12) ------------------------------------
// Four bytes of flags. The protocol uses NEGATIVE logic: a bit reads 0 when
// the condition is active. Bit 10 is documented as "ACC off", so ignition is
// on when bit 10 is 0. (Traccar reads this bit the other way round, which is
// why its H02 ignition reports are a long-running complaint — if your devices
// disagree, flip H02_IGNITION_INVERT.)
//
// The raw word is kept alongside the decoded flags so a wrong mapping can be
// re-derived later without having lost anything.
const IGNITION_INVERT = process.env.H02_IGNITION_INVERT === '1';

const BIT = {
  theft: 0,          // illegal door open / thief
  robbery: 1,        // SOS / rob
  overspeed: 2,      // device-side speed alarm
  illegalIgnition: 3,
  gpsAntennaCut: 4,
  doorOpen: 8,
  armed: 9,
  accOff: 10,        // negative logic: 0 => ignition ON
  batteryRemoved: 20,
  mainPowerOff: 28,
};

// active when the bit is 0 (negative logic)
const active = (status, bit) => ((status >>> bit) & 1) === 0;

function decodeStatus(hex) {
  if (!hex || !/^[0-9a-fA-F]{1,8}$/.test(hex)) return null;
  const status = parseInt(hex, 16) >>> 0;
  const accOn = active(status, BIT.accOff);
  return {
    status,
    statusHex: hex.toUpperCase(),
    ignition: IGNITION_INVERT ? !accOn : accOn,
    sos: active(status, BIT.robbery),
    theft: active(status, BIT.theft),
    deviceOverspeed: active(status, BIT.overspeed),
    doorOpen: active(status, BIT.doorOpen),
    armed: active(status, BIT.armed),
    powerCut: active(status, BIT.mainPowerOff) || active(status, BIT.batteryRemoved),
  };
}

/**
 * Parse one raw H02 frame into a position record.
 * Throws on malformed input — caller logs and discards.
 */
function parseFrame(raw) {
  const s = raw.replace(/^\*/, '').replace(/#$/, '').trim();
  const f = s.split(',');
  if (f[0] !== 'HQ') throw new Error(`not an HQ frame: ${f[0]}`);
  if (f.length < 13) throw new Error('frame too short');
  const imei = f[1];
  if (!/^\d{8,15}$/.test(imei)) throw new Error('bad imei');
  const lat = nmeaToDec(f[5], f[6]);
  const lon = nmeaToDec(f[7], f[8]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('coordinate out of range');
  // f[12] is the status word on standard frames; absent on some trimmed variants
  const st = decodeStatus(f[12]);
  return {
    imei,
    valid: f[4] === 'A',
    lat,
    lon,
    speedKn: parseFloat(f[9]) || 0,
    course: parseFloat(f[10]) || 0,
    deviceTime: combineDate(f[11], f[3]),
    status: st ? st.status : null,
    statusHex: st ? st.statusHex : null,
    ignition: st ? st.ignition : null,
    flags: st,
    raw,
  };
}

module.exports = { parseFrame, decodeStatus, BIT };
