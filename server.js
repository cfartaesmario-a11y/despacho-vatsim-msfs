// Despacho VATSIM — servidor local (Node 22+, sin dependencias)
// Arranque: node --use-system-ca server.js  ->  http://localhost:5757
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = +process.env.PORT || 5757;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const UA = 'vatsim-dispatch-personal/2.0';

// ================================================================ config
const DEFAULT_CONFIG = {
  pilotName: '',
  simbriefUser: '',
  aiProvider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-3.5-flash',
  deepseekKey: '',
  deepseekModel: 'deepseek-chat',
  firebaseProjectId: '',
  firebaseApiKey: '',
  batPath: 'C:\\Users\\Cfart\\Desktop\\iniciar_vuelo.bat',
  volantaPath: 'C:\\Users\\Cfart\\Desktop\\Volanta.lnk',
  chartsDir: path.join(ROOT, 'charts'),
  prepMin: 40,
};
function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
const saveConfig = c => fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
let config = loadConfig();
if (!fs.existsSync(CONFIG_PATH)) saveConfig(config);

// ================================================================ datos
function parseCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(v => (v === '\\N' ? '' : v));
}
const readLines = f => fs.readFileSync(path.join(DATA, f), 'utf8').split(/\r?\n/).filter(Boolean);
const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// ---- aeropuertos (OpenFlights + VATSpy + airline-route-data)
const airports = new Map();
for (const l of readLines('airports.dat')) {
  const p = parseCSVLine(l);
  if (!p[5] || p[5].length !== 4) continue;
  airports.set(p[5], { icao: p[5], iata: p[4], name: p[1], city: p[2], country: p[3], lat: +p[6], lon: +p[7], elev: +p[8] });
}

// ---- rutas actuales (Jonty/airline-route-data)
const routeRaw = readJSON('airline_routes.json');
const iataToIcao = new Map();
for (const a of Object.values(routeRaw)) {
  if (!a.icao) continue;
  iataToIcao.set(a.iata, a.icao);
  const prev = airports.get(a.icao) || {};
  airports.set(a.icao, { ...prev, icao: a.icao, iata: a.iata, name: prev.name || a.name, city: a.city_name || prev.city || '', country: a.country || prev.country || '', continent: a.continent, lat: +a.latitude, lon: +a.longitude, elev: a.elevation ?? prev.elev ?? 0 });
}
const routesFrom = new Map(); // ICAO -> Map(ICAO -> { carriers:[iata], min, km })
const routesTo = new Map();
for (const a of Object.values(routeRaw)) {
  if (!a.icao) continue;
  for (const r of a.routes || []) {
    const d = iataToIcao.get(r.iata);
    if (!d) continue;
    const info = { carriers: (r.carriers || []).map(c => c.iata).filter(Boolean), min: r.min, km: r.km };
    if (!routesFrom.has(a.icao)) routesFrom.set(a.icao, new Map());
    routesFrom.get(a.icao).set(d, info);
    if (!routesTo.has(d)) routesTo.set(d, new Map());
    routesTo.get(d).set(a.icao, info);
  }
}

// ---- aerolíneas: base curada (flotas) + OpenFlights como respaldo
const fleets = readJSON('fleets.json');
const fleetByIcao = new Map(fleets.map(f => [f.icao, f]));
const fleetByIata = new Map();
for (const f of fleets) { if (!fleetByIata.has(f.iata)) fleetByIata.set(f.iata, []); fleetByIata.get(f.iata).push(f); }
const ofAirlineByIata = new Map();
for (const l of readLines('airlines.dat')) {
  const p = parseCSVLine(l);
  if (p[7] !== 'Y' || !p[3] || !p[4] || p[4].length !== 3) continue;
  if (!ofAirlineByIata.has(p[3])) ofAirlineByIata.set(p[3], { icao: p[4], iata: p[3], name: p[1], callsign: p[5], country: p[6] });
}
const aircraftList = readJSON('aircraft.json');
const AIRCRAFT = Object.fromEntries(aircraftList.map(a => [a.code, a]));

// ---- pistas (OurAirports)
const runways = new Map(); // ICAO -> [{ id, hdg, len }]
{
  const lines = readLines('runways.csv'); lines.shift();
  for (const l of lines) {
    const p = parseCSVLine(l);
    const icao = p[2];
    if (p[7] === '1' || !airports.has(icao) || +p[3] < 3000) continue;
    const len = +p[3];
    const ends = [[p[8], +p[12]], [p[14], +p[18]]];
    for (const [id, h] of ends) {
      if (!id || !/^\d{2}[LRC]?$/.test(id)) continue;
      const hdg = isNaN(h) || !h ? (+id.slice(0, 2)) * 10 : h;
      if (!runways.has(icao)) runways.set(icao, []);
      runways.get(icao).push({ id, hdg, len });
    }
  }
}

// ---- VATSpy: FIRs
const firByPrefix = new Map(), firByIcao = new Map(), uirs = new Map();
{
  let section = '';
  for (const l of readLines('VATSpy.dat')) {
    if (l.startsWith(';')) continue;
    if (l.startsWith('[')) { section = l; continue; }
    const p = l.split('|');
    if (section === '[Airports]') {
      if (p[6] === '1' || airports.has(p[0])) continue;
      airports.set(p[0], { icao: p[0], iata: p[4], name: p[1], city: '', country: '', lat: +p[2], lon: +p[3], elev: 0 });
    } else if (section === '[FIRs]') {
      const f = { icao: p[0], name: p[1], boundary: p[3] };
      if (p[2]) firByPrefix.set(p[2], f);
      if (!firByIcao.has(p[0])) firByIcao.set(p[0], f);
    } else if (section === '[UIRs]') uirs.set(p[0], { name: p[1], firs: p[2].split(',') });
  }
}
const boundariesRaw = fs.readFileSync(path.join(DATA, 'Boundaries.geojson'), 'utf8');
const boundaries = new Map();
for (const f of JSON.parse(boundariesRaw).features) boundaries.set(f.properties.id, f);

console.log(`Datos: ${airports.size} aeropuertos · ${routesFrom.size} con rutas · ${fleets.length} aerolíneas con flota · ${aircraftList.length} tipos · ${runways.size} con pistas`);

// ================================================================ utilidades
const toRad = d => d * Math.PI / 180;
function distNm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(h));
}
const lerp = (a, b, f) => ({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt.lat) !== (yj > pt.lat) && pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInBoundary(pt, id) {
  const g = boundaries.get(id)?.geometry; if (!g) return false;
  return (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).some(poly => pointInRing(pt, poly[0]));
}
const cache = new Map();
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn(); cache.set(key, { t: Date.now(), v }); return v;
}
async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${new URL(url).host} -> HTTP ${r.status}`);
  return r.json();
}
const blockMinutes = (nm, kt) => Math.round(nm / kt * 60 + 25);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pub = a => a && ({ icao: a.icao, iata: a.iata, name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, elev: a.elev });

// ================================================================ VATSIM
const FACILITY = { 1: 'FSS', 2: 'DEL', 3: 'GND', 4: 'TWR', 5: 'APP', 6: 'CTR' };
function airportForCallsign(cs) {
  const pre = cs.split('_')[0];
  return airports.get(pre) || (pre.length === 3 ? airports.get('K' + pre) : null) || null;
}
function boundariesForCallsign(cs) {
  const parts = cs.split('_'); parts.pop();
  for (let n = parts.length; n >= 1; n--) { const pre = parts.slice(0, n).join('_'); if (firByPrefix.has(pre)) return [firByPrefix.get(pre)]; }
  if (firByIcao.has(parts[0])) return [firByIcao.get(parts[0])];
  if (uirs.has(parts[0])) return uirs.get(parts[0]).firs.map(i => firByIcao.get(i)).filter(Boolean);
  return [];
}
function estimateClose(ctrl, bookings) {
  const now = Date.now();
  const b = bookings.find(b => b.callsign === ctrl.callsign && Date.parse(b.start + 'Z') <= now + 15 * 60e3 && Date.parse(b.end + 'Z') > now);
  if (b) return { at: new Date(b.end + 'Z').toISOString(), source: 'reserva' };
  const m = (ctrl.text_atis || []).join(' ').match(/(?:until|till|til|hasta|bis|to|-)\s*(\d{2}):?(\d{2})\s*(?:z|utc)/i);
  if (m) {
    const d = new Date(); d.setUTCHours(+m[1], +m[2], 0, 0);
    if (d.getTime() < now - 3600e3) d.setUTCDate(d.getUTCDate() + 1);
    return { at: d.toISOString(), source: 'texto ATC' };
  }
  let t = Date.parse(ctrl.logon_time) + 150 * 60e3;
  if (t < now + 30 * 60e3) t = now + 30 * 60e3;
  return { at: new Date(t).toISOString(), source: 'estimado' };
}
const getBookings = () => cached('bookings', 5 * 60e3, () => getJSON('https://atc-bookings.vatsim.net/api/booking').catch(() => []));
const getEvents = () => cached('events', 15 * 60e3, async () => {
  try {
    const j = await getJSON('https://my.vatsim.net/api/v2/events/latest'), now = Date.now();
    return (j.data || []).filter(e => Date.parse(e.end_time) > now && Date.parse(e.start_time) < now + 36 * 3600e3)
      .map(e => ({ name: e.name, start: e.start_time, end: e.end_time, link: e.link, banner: e.banner, airports: (e.airports || []).map(a => a.icao) }));
  } catch { return []; }
});
const getVatsim = () => cached('vatsim', 15e3, async () => {
  const [raw, bookings] = await Promise.all([getJSON('https://data.vatsim.net/v3/vatsim-data.json'), getBookings()]);
  const controllers = [], staffed = new Map(), onlineFirs = new Map();
  const st = ap => { if (!staffed.has(ap.icao)) staffed.set(ap.icao, { icao: ap.icao, name: ap.name, lat: ap.lat, lon: ap.lon, positions: {}, atis: [] }); return staffed.get(ap.icao); };
  for (const c of raw.controllers) {
    const fac = FACILITY[c.facility];
    if (!fac || c.frequency === '199.998') continue;
    const ctrl = { callsign: c.callsign, name: c.name, freq: c.frequency, facility: fac, logon: c.logon_time, close: estimateClose(c, bookings), text: (c.text_atis || []).join('\n') };
    if (fac === 'CTR' || fac === 'FSS') {
      const firs = boundariesForCallsign(c.callsign);
      ctrl.boundaries = firs.map(f => f.boundary); ctrl.firName = firs[0]?.name || '';
      for (const f of firs) if (!onlineFirs.has(f.boundary)) onlineFirs.set(f.boundary, ctrl);
    } else {
      const ap = airportForCallsign(c.callsign);
      if (ap) { ctrl.airport = ap.icao; ctrl.lat = ap.lat; ctrl.lon = ap.lon; st(ap).positions[fac] = ctrl; }
    }
    controllers.push(ctrl);
  }
  for (const a of raw.atis) {
    const ap = airportForCallsign(a.callsign);
    if (ap) st(ap).atis.push({ callsign: a.callsign, freq: a.frequency, code: a.atis_code, text: (a.text_atis || []).join(' ') });
  }
  return {
    updated: raw.general.update_timestamp,
    counts: { pilots: raw.pilots.length, controllers: controllers.length, atis: raw.atis.length },
    controllers, staffed: [...staffed.values()], onlineFirs: Object.fromEntries(onlineFirs),
    pilots: raw.pilots.map(p => ({ cs: p.callsign, lat: p.latitude, lon: p.longitude, hdg: p.heading, alt: p.altitude, gs: p.groundspeed, dep: p.flight_plan?.departure || '', arr: p.flight_plan?.arrival || '', ac: p.flight_plan?.aircraft_short || '' })),
  };
});

// ================================================================ rutas candidatas
function coverageAt(ap, vat) {
  const s = vat.staffed.find(x => x.icao === ap.icao);
  const pos = s ? { ...s.positions } : {};
  const ctr = Object.entries(vat.onlineFirs).find(([id]) => pointInBoundary(ap, id));
  if (ctr) pos.CTR = ctr[1];
  return { pos, atis: s?.atis || [] };
}
function routeCarriers(o, d) {
  const info = routesFrom.get(o)?.get(d);
  if (!info) return [];
  const out = [];
  for (const iata of info.carriers) {
    const cur = fleetByIata.get(iata);
    if (cur) out.push(...cur.map(f => ({ ...f, curated: true })));
    else if (ofAirlineByIata.has(iata)) out.push({ ...ofAirlineByIata.get(iata), fleet: [], curated: false });
  }
  return out;
}
function scorePair(oIcao, dIcao, vat, events, opts) {
  const o = airports.get(oIcao), d = airports.get(dIcao);
  if (!o || !d || oIcao === dIcao) return null;
  const nm = Math.round(distNm(o, d));
  const sched = routesFrom.get(oIcao)?.get(dIcao)?.min;
  const block = sched || blockMinutes(nm, 450);
  const prep = opts.prepMin ?? config.prepMin;
  const eta = Date.now() + (prep + block) * 60e3;
  const dep = coverageAt(o, vat), arr = coverageAt(d, vat);
  let score = 0; const warnings = [];
  const W_DEP = { DEL: 1, GND: 2, TWR: 3, APP: 3, CTR: 2 }, W_ARR = { GND: 1, TWR: 3, APP: 4, CTR: 3 };
  const depPos = {};
  for (const [f, c] of Object.entries(dep.pos)) {
    depPos[f] = { callsign: c.callsign, freq: c.freq, close: c.close };
    if (Date.parse(c.close.at) < Date.now() + prep * 60e3) warnings.push(`${c.callsign} podría cerrar antes de tu salida`);
    else score += W_DEP[f] || 0;
  }
  const arrPos = {};
  for (const [f, c] of Object.entries(arr.pos)) {
    const marginMin = Math.round((Date.parse(c.close.at) - eta) / 60e3);
    arrPos[f] = { callsign: c.callsign, freq: c.freq, close: c.close, marginMin };
    if (marginMin >= 0) score += W_ARR[f] || 0;
    else warnings.push(`${c.callsign} cierra ~${-marginMin} min antes de tu llegada`);
  }
  let covered = 0; const N = 12, firIds = Object.keys(vat.onlineFirs);
  for (let i = 1; i <= N; i++) if (firIds.some(id => pointInBoundary(lerp(o, d, i / (N + 1)), id))) covered++;
  score += covered / N * 3;
  const ev = events.filter(e => e.airports.includes(oIcao) || e.airports.includes(dIcao));
  if (ev.length) score += 3;
  const carriers = routeCarriers(oIcao, dIcao);
  if (carriers.length) score += 0.5;
  if (o.continent === 'EU' || d.continent === 'EU') score += 0.5;
  return {
    origin: pub(o), dest: pub(d), nm, block, eta: new Date(eta).toISOString(),
    dep: { pos: depPos, atis: dep.atis }, arr: { pos: arrPos, atis: arr.atis },
    enroute: Math.round(covered / N * 100), events: ev.map(e => e.name), warnings,
    airlines: carriers.slice(0, 20).map(a => ({ icao: a.icao, iata: a.iata, name: a.name })),
    score: Math.round(score * 10) / 10,
  };
}
async function findCandidates(opts) {
  const [vat, events] = await Promise.all([getVatsim(), getEvents()]);
  const origin = (opts.origin || '').toUpperCase().trim(), dest = (opts.dest || '').toUpperCase().trim();
  const regions = (opts.region || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
  const inRegion = i => !regions.length || regions.some(p => i.startsWith(p));
  const minB = +opts.minMin || 0, maxB = +opts.maxMin || 9999, realOnly = opts.realOnly !== false;
  const pairs = new Set(), add = (a, b) => a !== b && pairs.add(a + '-' + b);
  const hubs = new Set(vat.staffed.filter(s => Object.keys(s.positions).length).map(s => s.icao));
  for (const e of events) for (const a of e.airports) hubs.add(a);
  if (origin && dest) add(origin, dest);
  else if (origin) { for (const d of routesFrom.get(origin)?.keys() || []) add(origin, d); if (!realOnly) for (const h of hubs) add(origin, h); }
  else if (dest) { for (const o of routesTo.get(dest)?.keys() || []) add(o, dest); if (!realOnly) for (const h of hubs) add(h, dest); }
  else for (const h of hubs) {
    for (const d of routesFrom.get(h)?.keys() || []) add(h, d);
    for (const o of routesTo.get(h)?.keys() || []) add(o, h);
    if (!realOnly) for (const h2 of hubs) add(h, h2);
  }
  const out = [];
  for (const p of pairs) {
    const [a, b] = p.split('-');
    const A = airports.get(a), B = airports.get(b);
    if (!A || !B) continue;
    if (!(origin && dest)) {
      if (!inRegion(a) || !inRegion(b)) continue;
      const blk = routesFrom.get(a)?.get(b)?.min || blockMinutes(distNm(A, B), 450);
      if (blk < minB || blk > maxB) continue;
    }
    const s = scorePair(a, b, vat, events, opts);
    if (!s) continue;
    if (opts.onlyAtc && !(origin && dest) && !Object.keys(s.dep.pos).length && !Object.keys(s.arr.pos).length) continue;
    out.push(s);
  }
  out.sort((x, y) => y.score - x.score || x.nm - y.nm);
  return out.slice(0, +opts.limit || 40);
}

// ================================================================ METAR y pistas
async function getMetar(ids) {
  const list = [...new Set(ids.map(s => String(s).toUpperCase()).filter(s => /^[A-Z0-9]{4}$/.test(s)))].slice(0, 40);
  if (!list.length) return [];
  return cached('metar:' + list.join(','), 60e3, () => getJSON(`https://aviationweather.gov/api/data/metar?ids=${list.join(',')}&format=json&taf=true`).catch(() => []));
}
function parseAtisRunways(text, valid) {
  const T = ' ' + text.toUpperCase().replace(/[.,;]/g, ' ') + ' ';
  const dep = new Set(), arr = new Set(), any = new Set();
  const re = /(DEPARTURE|DEPARTURES|DEP|TAKE-?OFF|TKOF|ARRIVAL|ARRIVALS|ARR|LANDING|LDG|APPROACH|APCH|EXPECT)?[A-Z\s/]{0,22}?(?:RWY|RWYS|RUNWAYS?)\s*(?:IN USE\s*)?((?:\d{2}[LRC]?(?:\s*(?:AND|\/|,|&)\s*)?)+)/g;
  let m;
  while ((m = re.exec(T))) {
    const ids = (m[2].match(/\d{2}[LRC]?/g) || []).filter(id => valid.has(id));
    const kind = m[1] || '';
    const bucket = /DEP|TAKE|TKOF/.test(kind) ? dep : /ARR|LAND|LDG|APP|APCH|EXPECT/.test(kind) ? arr : any;
    ids.forEach(id => bucket.add(id));
  }
  if (!dep.size && !arr.size) any.forEach(id => { dep.add(id); arr.add(id); });
  return { dep: [...dep], arr: [...arr] };
}
function windRunway(rwys, wdir, wspd) {
  if (!rwys.length) return null;
  if (typeof wdir !== 'number' || !wspd || wspd < 3) return [...rwys].sort((a, b) => b.len - a.len)[0];
  return [...rwys].sort((a, b) => {
    const hw = r => Math.cos(toRad(wdir - r.hdg)) * wspd;
    return hw(b) - hw(a) || b.len - a.len;
  })[0];
}
async function runwayInfo(icao) {
  icao = icao.toUpperCase();
  const rwys = runways.get(icao) || [];
  const valid = new Set(rwys.map(r => r.id));
  const [vat, [metar]] = await Promise.all([getVatsim(), getMetar([icao])]);
  const atis = vat.staffed.find(s => s.icao === icao)?.atis || [];
  const fromAtis = parseAtisRunways(atis.map(a => a.text).join(' '), valid);
  const wdir = typeof metar?.wdir === 'number' ? metar.wdir : null, wspd = metar?.wspd ?? 0;
  const best = windRunway(rwys, wdir, wspd);
  return {
    icao, runways: rwys, metar: metar || null, atis,
    dep: fromAtis.dep[0] ? { id: fromAtis.dep[0], all: fromAtis.dep, source: 'ATIS VATSIM' } : best ? { id: best.id, all: [best.id], source: wdir === null ? 'pista más larga' : `viento ${String(wdir).padStart(3, '0')}/${wspd}` } : null,
    arr: fromAtis.arr[0] ? { id: fromAtis.arr[0], all: fromAtis.arr, source: 'ATIS VATSIM' } : best ? { id: best.id, all: [best.id], source: wdir === null ? 'pista más larga' : `viento ${String(wdir).padStart(3, '0')}/${wspd}` } : null,
  };
}

// ================================================================ asistente: aviones y aerolíneas
function wizardAircraft(o, d) {
  const A = airports.get(o), B = airports.get(d);
  const nm = A && B ? distNm(A, B) : 0;
  const carriers = A && B ? routeCarriers(o, d) : [];
  const famRank = f => f === 'A320 Family' ? 0 : f === 'A350 Family' ? 1 : 2;
  return aircraftList.map(a => {
    const onRoute = carriers.filter(c => c.fleet?.includes(a.code));
    const operators = fleets.filter(f => f.fleet.includes(a.code));
    const feasible = !nm || nm * 1.15 + 200 <= a.range;
    const oversized = nm && nm < 600 && a.range > 6000;
    return { ...a, block: nm ? blockMinutes(nm, a.kt) : null, feasible, oversized, onRoute: onRoute.map(c => c.icao), operators: operators.length };
  }).sort((x, y) => (y.feasible - x.feasible) || (y.onRoute.length > 0) - (x.onRoute.length > 0) || famRank(x.family) - famRank(y.family) || y.operators - x.operators);
}
function wizardAirlines(o, d, type) {
  const carriers = routeCarriers(o, d);
  const onRouteIcao = new Set(carriers.map(c => c.icao));
  const list = [];
  for (const f of fleets) {
    const hasType = f.fleet.includes(type);
    const onRoute = onRouteIcao.has(f.icao);
    const base = f.hubs.includes(o) || f.hubs.includes(d);
    if (!hasType && !onRoute) continue;
    let tier = hasType && onRoute ? 0 : hasType && base ? 1 : onRoute ? 2 : 3;
    list.push({ ...f, hasType, onRoute, base, tier });
  }
  for (const c of carriers) if (!c.curated && !list.find(x => x.icao === c.icao)) list.push({ ...c, hubs: [], fleet: [], hasType: false, onRoute: true, base: false, tier: 2, color: '#5b5bd6' });
  const eu = c => /España|Portugal|Reino Unido|Irlanda|Francia|Alemania|Suiza|Austria|Bélgica|Países Bajos|Escandinavia|Noruega|Finlandia|Islandia|Italia|Hungría|Polonia|Chequia|Serbia|Croacia|Grecia|Letonia|Luxemburgo|Rumanía|Turquía/.test(c.country || '');
  return list.sort((a, b) => a.tier - b.tier || (eu(b) - eu(a)) || a.name.localeCompare(b.name)).slice(0, 40);
}

// ================================================================ fotos (Wikimedia Commons, con autor y licencia)
const PHOTO_CACHE_PATH = path.join(DATA, 'photo-cache.json');
let photoCache = {};
try { photoCache = JSON.parse(fs.readFileSync(PHOTO_CACHE_PATH, 'utf8')); } catch {}
const BAD = /cockpit|cabin|interior|seat|engine|wing|tail|galley|lavator|toilet|model|mockup|mock-up|toy|logo|meal|crew|gate|nose|drawing|diagram|scale|lego|paper|museum|wreck|crash|accident|fire|map|chart|panel|screen|landing gear|undercarriage|winglet|sharklet|fan|turbine|nacelle|apu|uniform|lounge|ticket|boarding|terminal|interior|night|sign/i;
const GOOD = /landing|take ?off|takeoff|departing|departure|approach|final|in flight|in-flight|climb|airborne|rotat|arriving|short final|flying/i;
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let photoCats = {};
try { photoCats = readJSON('photo-cats.json'); } catch {}
// Commons limita la frecuencia: todas las consultas pasan por una cola (una a la vez, con pausa).
// Las peticiones de la web van delante de la precarga en segundo plano; si Commons pide frenar,
// toda la cola espera (enfriamiento) en vez de insistir.
const commonsQueue = []; let commonsBusy = false, commonsCoolUntil = 0, lastUserPhoto = 0;
const wait = ms => new Promise(ok => setTimeout(ok, ms));
function commons(url, background = false) {
  if (!background) lastUserPhoto = Date.now();
  return new Promise((resolve, reject) => {
    const job = { url, resolve, reject, bg: background };
    const firstBg = commonsQueue.findIndex(j => j.bg);
    if (background || firstBg < 0) commonsQueue.push(job); else commonsQueue.splice(firstBg, 0, job);
    pumpCommons();
  });
}
async function pumpCommons() {
  if (commonsBusy) return; commonsBusy = true;
  while (commonsQueue.length) {
    const job = commonsQueue.shift();
    let ok = false;
    for (let t = 0; t < 3 && !ok; t++) {
      if (Date.now() < commonsCoolUntil) await wait(commonsCoolUntil - Date.now());
      try {
        const r = await fetch(job.url, { headers: { 'User-Agent': 'DespachoVATSIM/2.0 (uso personal; herramienta local)' } });
        const text = await r.text();
        if (r.ok && text.startsWith('{')) { job.resolve(JSON.parse(text)); ok = true; }
        else commonsCoolUntil = Date.now() + 20000 * (t + 1);
      } catch { await wait(2000); }
      await wait(700);
    }
    if (!ok) job.reject(new Error('Wikimedia Commons está limitando las peticiones, reintenta en un minuto'));
  }
  commonsBusy = false;
}
// q: texto o, con deepcat, una categoría de Commons (todas las fotos de dentro son del avión correcto)
async function searchPhotos(q, must = '', { deepcat = false, bg = false } = {}) {
  const key = 'v3|' + (deepcat ? 'cat:' : '') + q + (must ? '|' + must : '');
  if (photoCache[key]) return photoCache[key];
  const search = deepcat ? `deepcat:"${q}"` : q + ' filetype:bitmap';
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50'
    + '&gsrsearch=' + encodeURIComponent(search)
    + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1920&iiextmetadatafilter=Artist|LicenseShortName';
  const j = await commons(url, bg);
  const words = deepcat ? [] : q.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !/landing|airbus|boeing/.test(w));
  const list = Object.values(j.query?.pages || {}).map(p => {
    const i = p.imageinfo?.[0]; if (!i || !/jpeg|png|webp/.test(i.mime || '')) return null;
    const t = p.title.replace(/^File:/, '');
    const ratio = i.width / i.height;
    if (BAD.test(t) || i.width < 1600 || ratio < 1.3 || ratio > 2.1) return null;
    if (must && !fold(t).includes(fold(must))) return null;
    const s = (GOOD.test(t) ? 3 : 0) + words.filter(w => t.toLowerCase().includes(w)).length
      + Math.min(i.width / 2400, 2) + (ratio > 1.4 && ratio < 1.8 ? 0.5 : 0);
    const artist = (i.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return { s, title: t, url: i.thumburl, w: Math.min(i.width, 2048), page: i.descriptionurl, artist, license: i.extmetadata?.LicenseShortName?.value || '' };
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 8).map(({ s, ...r }) => r);
  photoCache[key] = list;
  fs.writeFile(PHOTO_CACHE_PATH, JSON.stringify(photoCache), () => {});
  return list;
}
// Foto de un tipo en librea del fabricante (o la mejor genérica) y de un tipo con la librea de una aerolínea concreta.
async function typePhotos(code, bg = false) {
  const a = AIRCRAFT[code]; if (!a) return [];
  const out = [];
  for (const cat of a.house || []) { out.push(...await searchPhotos(cat, '', { deepcat: true, bg })); if (out.length >= 4) break; }
  if (out.length < 2) out.push(...await searchPhotos(a.photo, '', { bg }));
  return dedupe(out);
}
async function airlinePhotos(icao, code, bg = false) {
  const al = fleetByIcao.get(icao), a = AIRCRAFT[code];
  if (!al) return [];
  const cat = photoCats[icao + '|' + code];
  let out = cat ? await searchPhotos(cat, '', { deepcat: true, bg }) : [];
  if (!out.length && a) out = await searchPhotos(`${al.name} ${a.maker} ${a.name}`, airlineWord(al.name), { bg });
  if (!out.length) { // cualquier avión de esa aerolínea, de la misma familia
    const sib = Object.keys(photoCats).find(k => k.startsWith(icao + '|') && AIRCRAFT[k.split('|')[1]]?.family === a?.family)
      || Object.keys(photoCats).find(k => k.startsWith(icao + '|'));
    if (sib) out = await searchPhotos(photoCats[sib], '', { deepcat: true, bg });
  }
  return out; // vacío = la web muestra una tarjeta con el logo, nunca otra aerolínea
}
// Logos PNG transparentes en alta resolución, servidos desde aquí (mismo origen: la web puede recortarlos con canvas)
const LOGO_DIR = path.join(DATA, 'logos');
async function logo(res, iata) {
  const f = path.join(LOGO_DIR, iata + '.png');
  if (!fs.existsSync(f)) {
    const r = iata.length === 2 ? await fetch(`https://pics.avs.io/800/320/${iata}.png`, { headers: { 'User-Agent': UA } }) : null;
    const buf = r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
    if (!buf || buf.length < 1500 || buf.readUInt32BE(0) !== 0x89504e47) { res.writeHead(404); return res.end(); }
    fs.mkdirSync(LOGO_DIR, { recursive: true }); fs.writeFileSync(f, buf);
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=604800' });
  fs.createReadStream(f).pipe(res);
}
const dedupe = l => l.filter((x, i) => l.findIndex(y => y.url === x.url) === i);
// Las fotos se sirven a 1920 px (tamaño estándar de Commons): nítidas en pantalla y la mitad de pesadas que 3840.
function sized(list) {
  return list.map(p => {
    let url = p.url.split('?')[0];
    if (url.includes('/thumb/')) url = url.replace(/\/\d+px-([^/]+)$/, '/1920px-$1').replace('//upload.wikimedia.org', '//thumb.wikimedia.org');
    else if (p.w >= 1920) { const m = url.match(/^(.*\/commons)\/(\w\/\w\w)\/([^/]+)$/); if (m) url = `${m[1]}/thumb/${m[2]}/${m[3]}/1920px-${m[3]}`.replace("//upload.wikimedia.org", "//thumb.wikimedia.org"); }
    return { ...p, url };
  });
}
const airlineWord = n => n.split(/\s+/).filter(w => !/^(air|airlines|airways|lines|international|de|del)$/i.test(w)).sort((a, b) => b.length - a.length)[0] || n;

// ================================================================ IA de despacho (Gemini principal, DeepSeek de reserva)
// Si el modelo está saturado (503/429/500) prueba otros modelos Flash antes de rendirse.
const GEMINI_FALLBACK = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
async function gemini(system, user) {
  const models = [...new Set([config.geminiModel || 'gemini-3.5-flash', ...GEMINI_FALLBACK])];
  let last;
  for (const m of models) {
    try { return await geminiOnce(m, system, user); }
    catch (e) { last = e; if (e.name === 'TimeoutError') { e.message = 'Gemini tardó demasiado'; e.retry = true; } if (!e.retry) throw e; console.error(`Gemini ${m}:`, e.message); }
  }
  throw last;
}
async function geminiOnce(modelName, system, user) {
  const model = encodeURIComponent(modelName);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
    }),
  });
  if (!r.ok) {
    const msg = { 401: 'clave de Gemini no válida', 403: 'la clave de Gemini no tiene permiso', 404: 'modelo de Gemini no disponible', 429: 'límite de uso de Gemini alcanzado', 503: 'Gemini saturado' }[r.status];
    const err = new Error(msg || `Gemini ${r.status}`);
    err.retry = [404, 429, 500, 503].includes(r.status);
    throw err;
  }
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
let lastAi = '';
async function askAI(system, user) {
  const order = config.aiProvider === 'deepseek' ? ['deepseek', 'gemini'] : ['gemini', 'deepseek'];
  const errors = [];
  for (const p of order) {
    if (!(p === 'gemini' ? config.geminiKey : config.deepseekKey)) continue;
    try {
      const out = await (p === 'gemini' ? gemini(system, user) : deepseek(system, user));
      lastAi = p === 'gemini' ? 'Gemini' : 'DeepSeek';
      return out;
    } catch (e) { errors.push(e.message); console.error(`IA ${p}:`, e.message); }
  }
  if (errors.length) throw new Error(errors.join(' · '));
  return null;
}
async function deepseek(system, user) {
  if (!config.deepseekKey) return null;
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseekKey}` },
    body: JSON.stringify({ model: config.deepseekModel || 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, temperature: 0.5 }),
  });
  if (!r.ok) {
    const msg = { 401: 'clave de DeepSeek no válida', 402: 'la cuenta de DeepSeek no tiene saldo (recarga en platform.deepseek.com)', 429: 'demasiadas peticiones a DeepSeek, espera un momento' }[r.status];
    throw new Error(msg || `DeepSeek ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

async function aiSuggest(opts) {
  const cands = await findCandidates({ ...opts, limit: 25 });
  if (!cands.length) return { picks: [], summary: 'No hay rutas con esos filtros. Amplía la duración o cambia la región.', candidates: [] };
  const metars = await getMetar(cands.flatMap(c => [c.origin.icao, c.dest.icao]));
  const wx = Object.fromEntries(metars.map(m => [m.icaoId, `${m.fltCat || ''} ${m.rawOb}`]));
  const compact = cands.map((c, i) => ({
    id: i, ruta: `${c.origin.icao}-${c.dest.icao}`, origen: c.origin.city, destino: c.dest.city, min: c.block, nm: c.nm,
    aerolineas: c.airlines.slice(0, 6).map(a => a.icao), atc_salida: Object.keys(c.dep.pos),
    atc_llegada: Object.fromEntries(Object.entries(c.arr.pos).map(([f, p]) => [f, `margen ${p.marginMin} min`])),
    cobertura_ruta: c.enroute + '%', eventos: c.events, metar_salida: wx[c.origin.icao] || 'n/d', metar_llegada: wx[c.dest.icao] || 'n/d',
  }));
  const sys = `Eres despachador de vuelos de una aerolínea europea y experto en VATSIM. Hora ${new Date().toISOString().slice(11, 16)}Z.
Elige las 3 mejores rutas para volar ahora en MSFS 2024 con ATC real. Prioriza ATC en llegada abierto a la llegada (margen positivo), ATC en salida, cobertura en ruta, eventos, meteorología interesante pero volable y las preferencias del piloto.
Responde SOLO JSON: {"resumen":"2 frases en español, tono profesional","elecciones":[{"id":n,"motivo":"1-2 frases concretas en español"}]}`;
  try {
    const p = await askAI(sys, `Preferencias: ${opts.preference || 'ninguna'}\nCandidatas: ${JSON.stringify(compact)}`);
    if (p) {
      const picks = (p.elecciones || []).map(e => cands[e.id] && { ...cands[e.id], reason: e.motivo }).filter(Boolean);
      return { picks, summary: p.resumen || '', candidates: cands, ai: true, aiName: lastAi };
    }
  } catch (e) { console.error('IA:', e.message); var aiError = e.message; }
  return { picks: cands.slice(0, 3).map(c => ({ ...c, reason: 'Mejor puntuación de cobertura ATC.' })), summary: aiError ? `IA no disponible (${aiError}). Clasificación automática por cobertura ATC.` : 'Clasificación automática por cobertura ATC (añade tu clave de Gemini en Ajustes).', candidates: cands, ai: false };
}

function alternatesFor(d, origin) {
  const D = airports.get(d); if (!D) return [];
  const out = [];
  for (const [icao, m] of routesTo) {
    if (icao === d || icao === origin || m.size < 15) continue;
    const a = airports.get(icao); if (!a) continue;
    const nm = distNm(D, a);
    if (nm >= 40 && nm <= 220) out.push({ icao, name: a.name, city: a.city, nm: Math.round(nm), routes: m.size });
  }
  return out.sort((a, b) => a.nm - b.nm).slice(0, 8);
}

async function dispatchProposal({ origin, dest, type, airline }) {
  const o = airports.get(origin), d = airports.get(dest), ac = AIRCRAFT[type], al = fleetByIcao.get(airline) || { icao: airline, name: airline, callsign: '', fn: [100, 9999] };
  if (!o || !d || !ac) throw new Error('Faltan datos del vuelo');
  const nm = Math.round(distNm(o, d));
  const long = nm > 2500;
  const range = (long && al.fnLong) || al.fn || [100, 9999];
  const vat = await getVatsim();
  const used = new Set(vat.pilots.map(p => p.cs));
  let fltnum = randInt(...range); for (let i = 0; i < 30 && used.has(al.icao + fltnum); i++) fltnum = randInt(...range);
  const [rwO, rwD] = await Promise.all([runwayInfo(origin), runwayInfo(dest)]);
  const alts = alternatesFor(dest, origin);
  const dir = (Math.atan2(d.lon - o.lon, d.lat - o.lat) * 180 / Math.PI + 360) % 360;
  const east = dir < 180;
  const maxFl = ac.kt < 350 ? 250 : nm < 150 ? 240 : nm < 300 ? 320 : 380;
  const fl = Math.min(maxFl, nm < 150 ? 220 : nm < 300 ? 300 : 360);
  // regla semicircular: rumbo este (000-179) -> FL impar (350, 370…); oeste -> par (340, 360…)
  const flRule = v => { let n = Math.round(v / 10); if ((n % 2 === 1) !== east) n -= 1; return n * 10; };
  const dep = new Date(Date.now() + config.prepMin * 60e3);
  dep.setUTCMinutes(Math.ceil(dep.getUTCMinutes() / 5) * 5, 0, 0);
  const base = {
    airline: al.icao, airlineName: al.name, rtf: al.callsign, fltnum: String(fltnum), callsign: al.icao + fltnum,
    depTime: dep.toISOString(), cruiseFl: flRule(fl), ci: long ? 80 : 30, pax: Math.round(ac.seats * (0.78 + Math.random() * 0.18)),
    origRwy: rwO.dep?.id || '', destRwy: rwD.arr?.id || '', altn: alts[0]?.icao || '',
    remarks: 'TCAS SIMBRIEF /V/', briefing: '',
  };
  const sys = `Eres despachador de ${al.name}. Prepara el despacho realista de un vuelo en VATSIM.
Respeta el número de vuelo dentro del rango ${range[0]}-${range[1]} de la aerolínea (estilo real de esa compañía), la regla semicircular (rumbo ${Math.round(dir)}°: ${east ? 'impar' : 'par'}), techo del avión, y elige el alternativo de la lista.
Responde SOLO JSON: {"fltnum":"número","cruiseFl":número (ej 360),"ci":número,"altn":"OACI de la lista","pax":número,"briefing":"briefing de despacho en español, 3-4 frases: meteo, pistas, ATC y algo a vigilar"}`;
  const user = JSON.stringify({
    vuelo: `${origin}-${dest}`, distancia_nm: nm, avion: `${ac.maker} ${ac.name}`, plazas: ac.seats, techo_sugerido: maxFl,
    metar_salida: rwO.metar?.rawOb, metar_llegada: rwD.metar?.rawOb, taf_llegada: rwD.metar?.rawTaf,
    pista_salida: rwO.dep, pista_llegada: rwD.arr, atis_salida: rwO.atis.map(a => a.text).join(' ').slice(0, 600), atis_llegada: rwD.atis.map(a => a.text).join(' ').slice(0, 600),
    alternativos: alts.map(a => `${a.icao} ${a.city} ${a.nm}nm`), propuesta_base: base,
  });
  let ai = false;
  try {
    const p = await askAI(sys, user);
    if (p) {
      ai = true;
      const n = parseInt(p.fltnum, 10);
      if (n >= range[0] && n <= range[1] && !used.has(al.icao + n)) { base.fltnum = String(n); base.callsign = al.icao + n; }
      if (+p.cruiseFl >= 100 && +p.cruiseFl <= maxFl + 20) base.cruiseFl = flRule(+p.cruiseFl);
      if (+p.ci >= 0 && +p.ci <= 999) base.ci = +p.ci;
      if (alts.find(a => a.icao === p.altn)) base.altn = p.altn;
      if (+p.pax > 0 && +p.pax <= ac.seats) base.pax = +p.pax;
      base.briefing = p.briefing || '';
    }
  } catch (e) { base.briefing = 'IA no disponible: ' + e.message; }
  return { ...base, ai, aiName: ai ? lastAi : '', nm, aircraft: ac, origin: pub(o), dest: pub(d), runwaysOrigin: rwO, runwaysDest: rwD, alternates: alts };
}

// ================================================================ SimBrief
async function getSimbrief(user) {
  const j = await getJSON(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(user)}&json=1`);
  if (j.fetch?.status !== 'Success') throw new Error('SimBrief: ' + (j.fetch?.status || 'sin respuesta'));
  const fixes = j.navlog?.fix ? [].concat(j.navlog.fix) : [];
  return {
    generated: j.params?.time_generated ? new Date(+j.params.time_generated * 1000).toISOString() : null,
    origin: j.origin?.icao_code, dest: j.destination?.icao_code, altn: j.alternate?.icao_code,
    originRwy: j.origin?.plan_rwy, destRwy: j.destination?.plan_rwy, sid: j.general?.sid_ident, star: j.general?.star_ident,
    airline: j.general?.icao_airline, fltnum: j.general?.flight_number, callsign: j.atc?.callsign,
    aircraft: j.aircraft?.icaocode, aircraftName: j.aircraft?.name, reg: j.aircraft?.reg,
    route: j.general?.route, cruise: j.general?.initial_altitude, ci: j.general?.costindex,
    blockMin: Math.round((+j.times?.est_block || 0) / 60), airMin: Math.round((+j.times?.est_time_enroute || 0) / 60),
    fuelRamp: j.fuel?.plan_ramp, units: j.params?.units, pax: j.weights?.pax_count, zfw: j.weights?.est_zfw, tow: j.weights?.est_tow,
    coords: [[+j.origin?.pos_lat, +j.origin?.pos_long], ...fixes.map(f => [+f.pos_lat, +f.pos_long]), [+j.destination?.pos_lat, +j.destination?.pos_long]].filter(c => !isNaN(c[0])),
    pdf: j.files?.directory && j.files?.pdf?.link ? j.files.directory + j.files.pdf.link : null,
    prefileVatsim: j.prefile?.vatsim?.link || null,
  };
}

// ================================================================ historial (Firebase Firestore o local)
const LOCAL_FLIGHTS = path.join(DATA, 'flights.json');
const fbOn = () => config.firebaseProjectId && config.firebaseApiKey;
const fbUrl = (p = '') => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebaseProjectId)}/databases/(default)/documents/flights${p}?key=${encodeURIComponent(config.firebaseApiKey)}`;
const toFs = o => ({ fields: Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) }])) });
const fromFs = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, v.stringValue ?? v.doubleValue ?? v.integerValue ?? v.booleanValue]));
async function listFlights() {
  if (fbOn()) {
    const j = await getJSON(fbUrl('') + '&pageSize=200');
    return (j.documents || []).map(fromFs).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }
  try { return JSON.parse(fs.readFileSync(LOCAL_FLIGHTS, 'utf8')); } catch { return []; }
}
async function saveFlight(f) {
  const flight = { ...f, created: new Date().toISOString() };
  if (fbOn()) {
    const r = await fetch(fbUrl(''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFs(flight)) });
    if (!r.ok) throw new Error('Firebase: ' + (await r.text()).slice(0, 200));
    return { ...flight, storage: 'firebase' };
  }
  const all = await listFlights(); all.unshift(flight);
  fs.writeFileSync(LOCAL_FLIGHTS, JSON.stringify(all.slice(0, 500), null, 2));
  return { ...flight, storage: 'local' };
}

// ================================================================ cartas y lanzador
const CHART_EXT = /\.(pdf|png|jpe?g|webp)$/i;
function listCharts(icao) {
  const base = path.resolve(config.chartsDir), out = [];
  const walk = (dir, rel) => {
    let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (rel || e.name.toUpperCase().startsWith(icao)) walk(path.join(dir, e.name), r); }
      else if (CHART_EXT.test(e.name) && (rel || e.name.toUpperCase().includes(icao))) out.push(r);
    }
  };
  walk(base, ''); return out.sort();
}
function launch(target) {
  const p = target === 'volanta' ? config.volantaPath : config.batPath;
  if (!p || !fs.existsSync(p) || !/\.(bat|cmd|lnk|exe)$/i.test(p)) throw new Error(`No encuentro el archivo: ${p}`);
  exec(`start "" "${p}"`, { cwd: path.dirname(p) });
  return p;
}

// ================================================================ HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
function serveFile(res, base, rel) {
  const f = path.resolve(base, '.' + path.sep + decodeURIComponent(rel));
  if (!f.startsWith(path.resolve(base))) return send(res, 403, { error: 'prohibido' });
  fs.readFile(f, (err, buf) => {
    if (err) return send(res, 404, { error: 'no encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(buf);
  });
}
const publicConfig = () => ({ ...config, geminiKey: config.geminiKey ? '••••' : '', deepseekKey: config.deepseekKey ? '••••' : '', firebaseApiKey: config.firebaseApiKey ? '••••' : '', storage: fbOn() ? 'firebase' : 'local' });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`), p = url.pathname, q = k => url.searchParams.get(k) || '';
  try {
    if (p === '/api/vatsim') return send(res, 200, await getVatsim());
    if (p === '/api/boundaries') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(boundariesRaw); }
    if (p === '/api/events') return send(res, 200, await getEvents());
    if (p === '/api/metar') return send(res, 200, await getMetar(q('ids').split(',')));
    if (p === '/api/airports') {
      const s = q('q').trim().toUpperCase(); if (s.length < 2) return send(res, 200, []);
      const hits = [];
      for (const a of airports.values()) {
        const r = a.icao === s ? 0 : a.iata === s ? 1 : a.icao.startsWith(s) ? 2 : ((a.city || '').toUpperCase().startsWith(s) || (a.name || '').toUpperCase().includes(s)) ? 3 : -1;
        if (r >= 0) hits.push([r - (routesFrom.has(a.icao) ? 0.5 : 0) - (a.continent === 'EU' ? 0.2 : 0), a]);
      }
      return send(res, 200, hits.sort((x, y) => x[0] - y[0]).slice(0, 10).map(h => pub(h[1])));
    }
    if (p.startsWith('/api/airport/')) {
      const icao = p.split('/').pop().toUpperCase(), a = airports.get(icao);
      if (!a) return send(res, 404, { error: 'Aeropuerto desconocido' });
      return send(res, 200, { ...pub(a), charts: listCharts(icao), routes: routesFrom.get(icao)?.size || 0 });
    }
    if (p.startsWith('/api/runways/')) return send(res, 200, await runwayInfo(p.split('/').pop()));
    if (p === '/api/search' && req.method === 'POST') return send(res, 200, await findCandidates(await readBody(req)));
    if (p === '/api/ai' && req.method === 'POST') return send(res, 200, await aiSuggest(await readBody(req)));
    if (p === '/api/wizard/aircraft') return send(res, 200, wizardAircraft(q('o').toUpperCase(), q('d').toUpperCase()));
    if (p === '/api/wizard/airlines') return send(res, 200, wizardAirlines(q('o').toUpperCase(), q('d').toUpperCase(), q('type').toUpperCase()));
    if (p === '/api/dispatch' && req.method === 'POST') return send(res, 200, await dispatchProposal(await readBody(req)));
    if (p === '/api/photos') return send(res, 200, sized(await searchPhotos(q('q'), q('must'))));
    if (p === '/api/photo/type') return send(res, 200, sized(await typePhotos(q('type').toUpperCase())));
    if (p === '/api/photo/airline') return send(res, 200, sized(await airlinePhotos(q('al').toUpperCase(), q('type').toUpperCase())));
    if (p.startsWith('/api/logo/')) return logo(res, p.split('/').pop().toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (p === '/api/simbrief') {
      const user = q('user') || config.simbriefUser;
      if (!user) return send(res, 400, { error: 'Añade tu usuario de SimBrief en Ajustes' });
      return send(res, 200, await getSimbrief(user));
    }
    if (p === '/api/flights') return send(res, 200, req.method === 'POST' ? await saveFlight(await readBody(req)) : await listFlights());
    if (p === '/api/launch' && req.method === 'POST') return send(res, 200, { ok: true, launched: launch((await readBody(req)).target) });
    if (p === '/api/config') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        for (const k of Object.keys(DEFAULT_CONFIG)) {
          if (b[k] === undefined || b[k] === '••••') continue;
          config[k] = k === 'prepMin' ? +b[k] : String(b[k]).trim();
        }
        saveConfig(config);
      }
      return send(res, 200, publicConfig());
    }
    if (p.startsWith('/charts/')) return serveFile(res, config.chartsDir, p.slice(8));
    return serveFile(res, path.join(ROOT, 'public'), p === '/' ? 'index.html' : p.slice(1));
  } catch (e) {
    const cause = e.cause ? ` (${e.cause.code || e.cause.message})` : '';
    console.error(p, e.message + cause);
    return send(res, 500, { error: e.message + cause });
  }
}).listen(PORT, '127.0.0.1', () => { console.log(`Despacho listo en http://localhost:${PORT}`); setTimeout(warmPhotos, 4000); });

// Precarga en segundo plano las fotos (tipos en librea del fabricante y familias A320/A350 de cada aerolínea)
// para que el asistente cargue al instante. Todo pasa por la cola de Commons, sin saturarla.
async function warmPhotos() {
  const focus = ['A20N', 'A21N', 'A320', 'A321', 'A319', 'A359', 'A35K'];
  let n = 0;
  const idle = async () => { while (Date.now() - lastUserPhoto < 15000) await wait(3000); await wait(1500); };
  for (const a of aircraftList) { await idle(); try { await typePhotos(a.code, true); n++; } catch {} }
  for (const f of fleets) for (const code of f.fleet.filter(c => focus.includes(c))) { await idle(); try { await airlinePhotos(f.icao, code, true); n++; } catch {} }
  console.log(`Fotos listas: ${n}`);
}
