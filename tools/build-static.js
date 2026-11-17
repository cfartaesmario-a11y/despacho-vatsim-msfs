// Empaqueta los datos de data/ en ficheros compactos para la web (public/data/):
//   core.json   aeropuertos, rutas reales, pistas, aerolíneas, flotas, tipos, FIRs y categorías de fotos
//   bounds.json límites de FIR de VATSpy (simplificados)
//   photos.json caché de fotos ya buscadas en Wikimedia Commons
// Uso: node tools/build-static.js   (lo usan tanto el servidor local como GitHub Pages)
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, '..', 'data'), OUT = path.join(__dirname, '..', 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });
const readLines = f => fs.readFileSync(path.join(DATA, f), 'utf8').split(/\r?\n/).filter(Boolean);
const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
function parseCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map(v => (v === '\\N' ? '' : v));
}
const r4 = n => Math.round(n * 1e4) / 1e4;

// ---- aeropuertos
const airports = new Map();
for (const l of readLines('airports.dat')) {
  const p = parseCSVLine(l);
  if (!p[5] || p[5].length !== 4) continue;
  airports.set(p[5], { icao: p[5], iata: p[4], name: p[1], city: p[2], country: p[3], lat: +p[6], lon: +p[7], elev: +p[8] });
}
const routeRaw = readJSON('airline_routes.json');
const iataToIcao = new Map();
for (const a of Object.values(routeRaw)) {
  if (!a.icao) continue;
  iataToIcao.set(a.iata, a.icao);
  const prev = airports.get(a.icao) || {};
  airports.set(a.icao, { ...prev, icao: a.icao, iata: a.iata, name: prev.name || a.name, city: a.city_name || prev.city || '', country: a.country || prev.country || '', continent: a.continent, lat: +a.latitude, lon: +a.longitude, elev: a.elevation ?? prev.elev ?? 0 });
}
// ---- rutas: { origen: [[destino, min, "IB UX"], ...] }
const routes = {}, carriersUsed = new Set();
for (const a of Object.values(routeRaw)) {
  if (!a.icao) continue;
  for (const r of a.routes || []) {
    const d = iataToIcao.get(r.iata); if (!d) continue;
    const cs = (r.carriers || []).map(c => c.iata).filter(Boolean);
    cs.forEach(c => carriersUsed.add(c));
    (routes[a.icao] ||= []).push([d, r.min || 0, cs.join(' ')]);
  }
}
// ---- FIRs (VATSpy) y aeropuertos extra de VATSpy
const firs = {}, firIcao = {}, uirs = {};
let section = '';
for (const l of readLines('VATSpy.dat')) {
  if (l.startsWith(';')) continue;
  if (l.startsWith('[')) { section = l; continue; }
  const p = l.split('|');
  if (section === '[Airports]') {
    if (p[6] === '1' || airports.has(p[0])) continue;
    airports.set(p[0], { icao: p[0], iata: p[4], name: p[1], city: '', country: '', lat: +p[2], lon: +p[3], elev: 0 });
  } else if (section === '[FIRs]') {
    const f = [p[0], p[1], p[3]];
    if (p[2]) firs[p[2]] = f;
    if (!firIcao[p[0]]) firIcao[p[0]] = f;
  } else if (section === '[UIRs]') uirs[p[0]] = [p[1], p[2]];
}
// ---- pistas
const runways = {};
{
  const lines = readLines('runways.csv'); lines.shift();
  for (const l of lines) {
    const p = parseCSVLine(l), icao = p[2];
    if (p[7] === '1' || !airports.has(icao) || +p[3] < 3000) continue;
    for (const [id, h] of [[p[8], +p[12]], [p[14], +p[18]]]) {
      if (!id || !/^\d{2}[LRC]?$/.test(id)) continue;
      (runways[icao] ||= []).push([id, Math.round(isNaN(h) || !h ? (+id.slice(0, 2)) * 10 : h), +p[3]]);
    }
  }
}
// ---- aerolíneas OpenFlights que aparecen en rutas pero no están en la base curada
const fleets = readJSON('fleets.json');
const curatedIata = new Set(fleets.map(f => f.iata));
const ofAirlines = {};
for (const l of readLines('airlines.dat')) {
  const p = parseCSVLine(l);
  if (p[7] !== 'Y' || !p[3] || !p[4] || p[4].length !== 3 || !carriersUsed.has(p[3]) || curatedIata.has(p[3]) || ofAirlines[p[3]]) continue;
  ofAirlines[p[3]] = [p[4], p[1], p[5], p[6]];
}
// ---- salida
const ap = [...airports.values()].filter(a => a.icao && !isNaN(a.lat))
  .map(a => [a.icao, a.iata || '', a.name || '', a.city || '', a.country || '', a.continent || '', r4(a.lat), r4(a.lon), Math.round(+a.elev || 0)]);
let photoCats = {}; try { photoCats = readJSON('photo-cats.json'); } catch {}
const core = { v: 1, built: new Date().toISOString(), airports: ap, routes, runways, fleets, ofAirlines, aircraft: readJSON('aircraft.json'), firs, firIcao, uirs, photoCats };
fs.writeFileSync(path.join(OUT, 'core.json'), JSON.stringify(core));

// límites de FIR con coordenadas redondeadas (≈1 km): mucho más ligeros
const b = readJSON('Boundaries.geojson');
const round = c => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100];
for (const f of b.features) { f.geometry.coordinates = round(f.geometry.coordinates); f.properties = { id: f.properties.id, oceanic: f.properties.oceanic }; }
fs.writeFileSync(path.join(OUT, 'bounds.json'), JSON.stringify(b));

let photos = {}; try { photos = readJSON('photo-cache.json'); } catch {}
fs.writeFileSync(path.join(OUT, 'photos.json'), JSON.stringify(Object.fromEntries(Object.entries(photos).filter(([k, v]) => k.startsWith('v3|') && v.length))));

for (const f of ['core.json', 'bounds.json', 'photos.json']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2), 'MB');
console.log(`${ap.length} aeropuertos · ${Object.keys(routes).length} con rutas · ${Object.keys(runways).length} con pistas · ${fleets.length} aerolíneas`);
