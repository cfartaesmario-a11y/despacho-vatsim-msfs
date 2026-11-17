// Despacho VATSIM — servidor local (Node 22+, sin dependencias)
// Arranque: node --use-system-ca server.js  ->  http://localhost:5757
// La lógica vive en public/core.js (la misma que usa la web publicada en GitHub Pages).
// Este servidor añade lo que solo puede hacer tu PC: ejecutar el .bat y Volanta, servir tus cartas,
// guardar las claves en config.json, TAF/reservas de ATC (sin CORS) y caché de logos y fotos en disco.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execFileSync } = require('child_process');
const Core = require('./public/core.js');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const STATIC = path.join(ROOT, 'public', 'data');
const PORT = +process.env.PORT || 5757;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const UA = 'DespachoVATSIM/2.0 (uso personal; herramienta local)';

// ================================================================ config
const DEFAULT_CONFIG = {
  pilotName: '', simbriefUser: '',
  aiProvider: 'gemini', geminiKey: '', geminiModel: 'gemini-3.5-flash', deepseekKey: '', deepseekModel: 'deepseek-chat',
  firebaseProjectId: '', firebaseApiKey: '',
  batPath: 'C:\\Users\\Cfart\\Desktop\\iniciar_vuelo.bat', volantaPath: 'C:\\Users\\Cfart\\Desktop\\Volanta.lnk',
  chartsDir: path.join(ROOT, 'charts'), prepMin: 40,
};
let config;
try { config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch { config = { ...DEFAULT_CONFIG }; }
const saveConfig = () => fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
if (!fs.existsSync(CONFIG_PATH)) saveConfig();

// ================================================================ datos (compactos, generados por tools/build-static.js)
if (!fs.existsSync(path.join(STATIC, 'core.json'))) execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-static.js')], { stdio: 'inherit' });
const PHOTO_CACHE_PATH = path.join(DATA, 'photo-cache.json');
let photoCache = {};
try { photoCache = JSON.parse(fs.readFileSync(PHOTO_CACHE_PATH, 'utf8')); } catch {}
let saveTimer;
async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const t = await r.text();
  if (!r.ok || !/^\s*[[{]/.test(t)) throw new Error(`${new URL(url).host} -> HTTP ${r.status}`);
  return JSON.parse(t);
}
const stats = Core.init(JSON.parse(fs.readFileSync(path.join(STATIC, 'core.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(STATIC, 'bounds.json'), 'utf8')), {
  getJSON,
  getText: async url => (await fetch(url, { headers: { 'User-Agent': UA } })).text(),
  config: () => config,
  photoStore: {
    get: k => photoCache[k],
    set: (k, v) => { photoCache[k] = v; clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(PHOTO_CACHE_PATH, JSON.stringify(photoCache), () => {}), 2000); },
  },
  // En el PC sí se puede usar aviationweather.gov (incluye TAF) y las reservas de ATC
  metar: list => getJSON(`https://aviationweather.gov/api/data/metar?ids=${list.join(',')}&format=json&taf=true`),
  bookings: () => getJSON('https://atc-bookings.vatsim.net/api/booking'),
});
console.log(`Datos: ${stats.airports} aeropuertos · ${stats.routes} con rutas · ${stats.fleets} aerolíneas con flota · ${stats.aircraft} tipos · ${stats.runways} con pistas`);

// ================================================================ historial (Firebase o local)
const LOCAL_FLIGHTS = path.join(DATA, 'flights.json');
async function listFlights() {
  if (Core.firebaseOn()) return Core.firebaseList();
  try { return JSON.parse(fs.readFileSync(LOCAL_FLIGHTS, 'utf8')); } catch { return []; }
}
async function saveFlight(f) {
  const flight = { ...f, created: new Date().toISOString() };
  if (Core.firebaseOn()) { await Core.firebaseSave(flight); return { ...flight, storage: 'firebase' }; }
  const all = await listFlights(); all.unshift(flight);
  fs.writeFileSync(LOCAL_FLIGHTS, JSON.stringify(all.slice(0, 500), null, 2));
  return { ...flight, storage: 'local' };
}

// ================================================================ cartas, logos y lanzador
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
const mask = v => v ? '••••' : '';
const publicConfig = () => ({ ...config, geminiKey: mask(config.geminiKey), deepseekKey: mask(config.deepseekKey), firebaseApiKey: mask(config.firebaseApiKey), storage: Core.firebaseOn() ? 'firebase' : 'local', mode: 'local' });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`), p = url.pathname, q = k => url.searchParams.get(k) || '';
  try {
    if (p === '/api/vatsim') return send(res, 200, await Core.getVatsim());
    if (p === '/api/events') return send(res, 200, await Core.getEvents());
    if (p === '/api/metar') return send(res, 200, await Core.getMetar(q('ids').split(',')));
    if (p === '/api/airports') return send(res, 200, Core.searchAirports(q('q')));
    if (p === '/api/commercial') return send(res, 200, Core.commercialAirports());
    if (p.startsWith('/api/airportinfo/')) return send(res, 200, Core.airportInfo(p.split('/').pop()));
    if (p.startsWith('/api/airport/')) {
      const a = Core.airport(p.split('/').pop());
      return a ? send(res, 200, { ...a, charts: listCharts(a.icao) }) : send(res, 404, { error: 'Aeropuerto desconocido' });
    }
    if (p.startsWith('/api/runways/')) return send(res, 200, await Core.runwayInfo(p.split('/').pop()));
    if (p === '/api/search' && req.method === 'POST') return send(res, 200, await Core.findCandidates(await readBody(req)));
    if (p === '/api/ai' && req.method === 'POST') return send(res, 200, await Core.aiSuggest(await readBody(req)));
    if (p === '/api/wizard/aircraft') return send(res, 200, Core.wizardAircraft(q('o').toUpperCase(), q('d').toUpperCase()));
    if (p === '/api/wizard/airlines') return send(res, 200, Core.wizardAirlines(q('o').toUpperCase(), q('d').toUpperCase(), q('type').toUpperCase()));
    if (p === '/api/dispatch' && req.method === 'POST') return send(res, 200, await Core.dispatchProposal(await readBody(req)));
    if (p === '/api/photos') return send(res, 200, await Core.searchPhotos(q('q'), q('must')));
    if (p === '/api/photo/type') return send(res, 200, await Core.typePhotos(q('type').toUpperCase()));
    if (p === '/api/photo/airline') return send(res, 200, await Core.airlinePhotos(q('al').toUpperCase(), q('type').toUpperCase()));
    if (p.startsWith('/api/logo/')) return logo(res, p.split('/').pop().toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (p === '/api/simbrief') {
      const user = q('user') || config.simbriefUser;
      if (!user) return send(res, 400, { error: 'Añade tu usuario de SimBrief en Ajustes' });
      return send(res, 200, await Core.getSimbrief(user));
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
        saveConfig();
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
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Despacho listo en http://localhost:${PORT}`);
  setTimeout(async () => console.log(`Fotos listas: ${await Core.warmPhotos()}`), 4000);
});
