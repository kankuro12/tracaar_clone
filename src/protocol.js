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
  return {
    imei,
    valid: f[4] === 'A',
    lat,
    lon,
    speedKn: parseFloat(f[9]) || 0,
    course: parseFloat(f[10]) || 0,
    deviceTime: combineDate(f[11], f[3]),
    raw,
  };
}

module.exports = { parseFrame };
