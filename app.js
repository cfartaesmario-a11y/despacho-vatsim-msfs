// =====================================================================
// Despacho VATSIM · frontend
// =====================================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(url, body) {
  if (window.WEB_MODE) return webApi(url, body); // web publicada: responde el motor dentro del navegador
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 4500);
}
const zt = iso => iso ? new Date(iso).toISOString().slice(11, 16) : '--:--';
const hm = min => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
const fmtDate = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const logoUrl = iata => window.WEB_MODE ? `https://pics.avs.io/800/320/${encodeURIComponent(iata)}.png` : `/api/logo/${encodeURIComponent(iata)}`;
const logoImg = (a, cls = '') => a?.iata ? `<img class="al-logo ${cls}" crossorigin="anonymous" onload="prepLogo(this)" src="${logoUrl(a.iata)}" alt="${esc(a.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fb',textContent:'${esc(a.icao || a.iata)}'}))">` : `<span class="fb">${esc(a?.icao || '')}</span>`;

// Logos PNG transparentes: recorta el margen vacío y, si el logo es oscuro (azul marino, negro…),
// lo pasa a blanco para que se lea sobre el fondo oscuro. Resultado cacheado por aerolínea.
const logoMem = new Map();
window.prepLogo = img => {
  if (img.dataset.done) return; img.dataset.done = 1;
  const key = img.getAttribute('src');
  const apply = r => { if (!r) return; img.src = r.src; img.classList.toggle('mono', r.dark); img.classList.add('ready'); };
  if (logoMem.has(key)) return apply(logoMem.get(key));
  try {
    const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');
    c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, lum = 0, n = 0;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const k = (y * w + i) * 4, al = d[k + 3]; if (al < 24) continue;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y;
      lum += (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) * al / 255; n += al / 255;
    }
    if (x1 < 0) return img.classList.add('ready');
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    const r = { src: o.toDataURL('image/png'), dark: n > 0 && lum / n < 105 };
    logoMem.set(key, r); apply(r);
  } catch { img.classList.add('ready'); }
};

// ---------------------------------------------------------------- iconos
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  hangar: '<path d="M3 21V9l9-6 9 6v12M7 21v-7h10v7M7 17h10"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }
function applyIcons(root = document) { root.querySelectorAll('i[data-icon]').forEach(i => { if (!i.firstChild) i.innerHTML = icon(i.dataset.icon); }); }
applyIcons();

// ---------------------------------------------------------------- fotos (Wikimedia Commons)
const photoMem = new Map();
// q: texto · {q, must} · {type} (librea del fabricante) · {al, type} (avión de esa aerolínea, nunca de otra)
async function photosFor(q) {
  const o = typeof q === 'string' ? { q } : q;
  const url = o.al ? `/api/photo/airline?al=${encodeURIComponent(o.al)}&type=${encodeURIComponent(o.type)}`
    : o.type ? `/api/photo/type?type=${encodeURIComponent(o.type)}`
    : `/api/photos?q=${encodeURIComponent(o.q)}&must=${encodeURIComponent(o.must || '')}`;
  if (!photoMem.has(url)) photoMem.set(url, api(url).catch(() => []));
  return photoMem.get(url);
}
// palabra distintiva del nombre de la aerolínea (para exigirla en el título de la foto)
const keyWord = name => (name.split(/\s+/).filter(w => !/^(air|airlines|airways|lines|international|de|del)$/i.test(w)).sort((a, b) => b.length - a.length)[0] || name);
const airlinePhotoQueries = (al, a) => [{ al: al.icao, type: a.code }];
async function setPhoto(el, queries, idx = 0) {
  for (const q of [].concat(queries)) {
    const list = await photosFor(q);
    const p = list[idx % Math.max(list.length, 1)];
    if (p) {
      await new Promise(ok => { const im = new Image(); im.onload = im.onerror = ok; im.src = p.url; });
      el.style.backgroundImage = `url("${p.url}")`; el.classList.add('loaded'); el.classList.remove('nophoto');
      const cr = el.querySelector(':scope > .credit') || el.parentElement?.querySelector(':scope > .credit');
      const credit = `<a href="${esc(p.page)}" target="_blank">Foto: ${esc(p.artist || 'Wikimedia Commons')} · ${esc(p.license)}</a>`;
      if (cr) cr.innerHTML = credit;
      else el.insertAdjacentHTML('beforeend', `<div class="credit">${credit}</div>`);
      return p;
    }
  }
  el.classList.add('loaded', 'nophoto');
  return null;
}
// carga perezosa con concurrencia limitada
const lazyQueue = []; let lazyRunning = 0;
function pumpLazy() { while (lazyRunning < 4 && lazyQueue.length) { const job = lazyQueue.shift(); lazyRunning++; job().finally(() => { lazyRunning--; pumpLazy(); }); } }
const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); const f = e.target._load; if (f) { lazyQueue.push(f); pumpLazy(); } }
}, { rootMargin: '200px' });
function lazyPhoto(el, queries) { el._load = () => setPhoto(el, queries); io.observe(el); }

// ---------------------------------------------------------------- navegación
const state = { vatsim: null, boundaries: null, config: {}, flights: [], aircraft: [] };
function showView(v) {
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'atc') setTimeout(() => maps.atc.map.invalidateSize(), 50);
  if (v === 'home') { setTimeout(() => maps.home.map.invalidateSize(), 50); renderHome(); }
  if (v === 'wizard') setTimeout(() => maps.wiz.map.invalidateSize(), 50);
  if (v === 'history') renderHistory();
}
$$('#nav a').forEach(a => a.onclick = () => showView(a.dataset.view));
$$('[data-goto]').forEach(a => a.onclick = () => showView(a.dataset.goto));
setInterval(() => $('#clock').textContent = new Date().toISOString().slice(11, 16), 1000);
$('#clock').textContent = new Date().toISOString().slice(11, 16);

// ---------------------------------------------------------------- mapas
function makeMap(id, opts = {}) {
  const map = L.map(id, { worldCopyJump: true, zoomControl: opts.zoom !== false, attributionControl: opts.attr !== false, preferCanvas: true }).setView(opts.center || [47, 6], opts.zoomLevel || 5);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri · VATSIM', maxZoom: 12 }).addTo(map);
  if (opts.labels !== false) L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, opacity: 0.3 }).addTo(map);
  const layers = { firs: L.layerGroup().addTo(map), airports: L.layerGroup().addTo(map), pilots: L.layerGroup(), routes: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map) };
  return { map, layers, opts };
}
const maps = {
  wiz: makeMap('mapWizard', { center: [46, 2] }),
  home: makeMap('mapHome', { zoom: false, attr: false, labels: false, zoomLevel: 4, center: [48, 8] }),
  atc: makeMap('mapAtc'),
};
const ORDER = ['DEL', 'GND', 'TWR', 'APP', 'CTR', 'FSS'];
const LETTER = { DEL: 'D', GND: 'G', TWR: 'T', APP: 'A', CTR: 'C', FSS: 'F' };
const badges = (pos, late) => ORDER.filter(f => pos[f]).map(f => `<b class="b ${f}${late && pos[f].marginMin < 0 ? ' late' : ''}" title="${esc(pos[f].callsign)} ${esc(pos[f].freq)} · cierre ~${zt(pos[f].close?.at)}Z">${LETTER[f]}</b>`).join('');

function greatCircle(a, b, n = 64) {
  const r = Math.PI / 180, p1 = [a.lat * r, a.lon * r], p2 = [b.lat * r, b.lon * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2[0] - p1[0]) / 2) ** 2 + Math.cos(p1[0]) * Math.cos(p2[0]) * Math.sin((p2[1] - p1[1]) / 2) ** 2));
  if (!d) return [[a.lat, a.lon]];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1[0]) * Math.cos(p1[1]) + B * Math.cos(p2[0]) * Math.cos(p2[1]);
    const y = A * Math.cos(p1[0]) * Math.sin(p1[1]) + B * Math.cos(p2[0]) * Math.sin(p2[1]);
    const z = A * Math.sin(p1[0]) + B * Math.sin(p2[0]);
    pts.push([Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r]);
  }
  return pts;
}

function drawVatsim(m) {
  const v = state.vatsim; if (!v) return;
  const { layers } = m;
  layers.firs.clearLayers(); layers.airports.clearLayers(); layers.pilots.clearLayers();
  if (state.boundaries) {
    L.geoJSON({ type: 'FeatureCollection', features: state.boundaries.features.filter(f => v.onlineFirs[f.properties.id]) }, {
      style: { color: '#2dd4bf', weight: 1, fillColor: '#2dd4bf', fillOpacity: 0.07 },
      onEachFeature: (f, l) => { const c = v.onlineFirs[f.properties.id]; l.bindTooltip(`<b>${esc(c.callsign)}</b> · ${esc(c.freq)}<br>${esc(c.firName)}<br><span style="color:#8a8fae">Cierre ~${zt(c.close.at)}Z (${esc(c.close.source)})</span>`, { sticky: true }); },
    }).addTo(layers.firs);
  }
  for (const s of v.staffed) {
    const pos = s.positions;
    let html = ORDER.filter(f => pos[f]).map(f => `<b class="b ${f}">${LETTER[f]}</b>`).join('');
    if (s.atis.length) html += `<b class="b ATIS">${esc(s.atis[0].code || 'I')}</b>`;
    if (m !== maps.home) html += `<span class="lbl">${esc(s.icao)}</span>`;
    const icon = L.divIcon({ className: '', html: `<div class="apicon">${html}</div>`, iconSize: [0, 0] });
    const lines = ORDER.filter(f => pos[f]).map(f => `<div class="pos"><span><b class="b ${f}">${LETTER[f]}</b> ${esc(pos[f].callsign)}</span><span class="f">${esc(pos[f].freq)}</span><span class="t">→ ${zt(pos[f].close.at)}Z</span></div>`).join('')
      + s.atis.map(a => `<div class="pos"><span><b class="b ATIS">${esc(a.code || 'I')}</b> ATIS</span><span class="f">${esc(a.freq)}</span><span></span></div>`).join('');
    const mk = L.marker([s.lat, s.lon], { icon }).addTo(layers.airports);
    if (m === maps.wiz) hoverCard(mk, s.icao);
    else if (m === maps.atc) mk.bindPopup(`<div class="ph">${esc(s.icao)}</div><div class="pn">${esc(s.name)}</div>${lines}`);
  }
  if (m === maps.atc) for (const p of v.pilots) L.circleMarker([p.lat, p.lon], { radius: 2.2, color: '#fbbf24', weight: 0, fillOpacity: .8 }).bindTooltip(`<b>${esc(p.cs)}</b> ${esc(p.ac)} · ${esc(p.dep)}→${esc(p.arr)} · FL${Math.round(p.alt / 100)}`).addTo(layers.pilots);
}
// ---------------------------------------------------------------- aeropuertos comerciales + ficha al pasar el ratón
// Todos los aeropuertos con vuelos regulares (≈2.000, 565 en Europa). Tamaño según nº de destinos.
const infoMem = new Map();
const airportInfo = icao => { if (!infoMem.has(icao)) infoMem.set(icao, api('/api/airportinfo/' + icao).catch(() => null)); return infoMem.get(icao); };
let cardTimer, cardIcao = null;
function cardHtml(a) {
  const longest = a.runways[0];
  return `<div class="apcard">
    <div class="h"><div><b>${esc(a.icao)}</b>${a.iata ? `<span>${esc(a.iata)}</span>` : ''}</div><small>${esc(a.city || '')}${a.country ? ' · ' + esc(a.country) : ''}</small></div>
    <div class="nm">${esc(a.name)}</div>
    <div class="st"><div><b>${a.routes}</b>destinos</div><div><b>${a.runways.length || '—'}</b>pistas</div><div><b>${longest ? longest.m.toLocaleString('es-ES') + ' m' : '—'}</b>pista mayor</div><div><b>${(+a.elev || 0).toLocaleString('es-ES')} ft</b>elevación</div></div>
    ${a.runways.length ? `<div class="sec">Pistas</div><div class="chips">${a.runways.slice(0, 4).map(r => `<span>${esc(r.name)} <i>${r.m.toLocaleString('es-ES')} m</i></span>`).join('')}</div>` : ''}
    ${a.topAirlines.length ? `<div class="sec">Aerolíneas principales</div><div class="als">${a.topAirlines.slice(0, 5).map(x => `<span title="${esc(x.name)} · ${x.routes} destinos"><img src="${logoUrl(x.iata)}" crossorigin="anonymous" onload="prepLogo(this)" onerror="this.replaceWith(document.createTextNode('${esc(x.iata)}'))" alt="${esc(x.name)}"></span>`).join('')}</div>` : ''}
    ${a.topDest.length ? `<div class="sec">Destinos más servidos</div><div class="chips">${a.topDest.slice(0, 5).map(d => `<span>${esc(d.city)} <i>${esc(d.icao)}</i></span>`).join('')}</div>` : ''}
    <div class="btns"><button class="btn primary" onclick="setField('origin','${a.icao}')">Origen</button><button class="btn" onclick="setField('dest','${a.icao}')">Destino</button></div>
  </div>`;
}
// La ficha es una tarjeta flotante encima del mapa (no un popup de Leaflet) para que nunca quede tapada por el panel.
const cardEl = Object.assign(document.createElement('div'), { className: 'apcard-float glass' });
document.querySelector('#mapWizard').parentElement.appendChild(cardEl);
cardEl.addEventListener('mouseenter', () => clearTimeout(cardTimer));
cardEl.addEventListener('mouseleave', () => closeCardSoon());
let cardLatLng = null;
function placeCard() {
  if (!cardLatLng || !cardEl.classList.contains('on')) return;
  const stage = cardEl.parentElement, pt = maps.wiz.map.latLngToContainerPoint(cardLatLng);
  const W = cardEl.offsetWidth, H = cardEl.offsetHeight, SW = stage.clientWidth, SH = stage.clientHeight;
  const panel = stage.querySelector('.panel-left'), minX = panel && innerWidth > 860 ? panel.offsetLeft + panel.offsetWidth + 10 : 10;
  let x = pt.x + 16; if (x + W > SW - 10) x = pt.x - W - 16; x = Math.max(minX, Math.min(x, SW - W - 10));
  let y = pt.y - H / 2; y = Math.max(10, Math.min(y, SH - H - 10));
  cardEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
maps.wiz.map.on('move zoom', placeCard);
function openCard(latlng, icao) {
  clearTimeout(cardTimer); cardIcao = icao; cardLatLng = latlng;
  cardEl.innerHTML = `<div class="apcard"><div class="h"><div><b>${esc(icao)}</b></div></div><div class="muted small"><span class="spin"></span>Cargando…</div></div>`;
  cardEl.classList.add('on'); placeCard();
  airportInfo(icao).then(a => { if (a && cardIcao === icao) { cardEl.innerHTML = cardHtml(a); placeCard(); } });
}
function closeCardSoon() { clearTimeout(cardTimer); cardTimer = setTimeout(() => { cardEl.classList.remove('on'); cardIcao = null; }, 350); }
maps.wiz.map.on('click', () => { cardEl.classList.remove('on'); cardIcao = null; });
function hoverCard(layer, icao) {
  layer.on('mouseover', e => { clearTimeout(cardTimer); cardTimer = setTimeout(() => openCard(layer.getLatLng ? layer.getLatLng() : e.latlng, icao), 120); });
  layer.on('mouseout', closeCardSoon);
  layer.on('click', () => openCard(layer.getLatLng(), icao)); // en móvil/táctil, con un toque
}
async function drawCommercial() {
  const m = maps.wiz, list = await api('/api/commercial');
  const dots = L.layerGroup(), labels = L.layerGroup();
  for (const [icao, iata, name, city, country, lat, lon, n] of list) {
    const big = n >= 120, mid = n >= 40;
    const c = L.circleMarker([lat, lon], { radius: big ? 5 : mid ? 3.6 : 2.4, color: '#c9cbff', weight: big ? 1.4 : 1, opacity: .9, fillColor: big ? '#8487ff' : '#5b5ff0', fillOpacity: big ? .9 : .65 }).addTo(dots);
    hoverCard(c, icao);
    if (n >= 25) L.marker([lat, lon], { icon: L.divIcon({ className: '', html: `<div class="aplbl ${big ? 'big' : ''}" data-n="${n}">${esc(iata || icao)}</div>`, iconSize: [0, 0] }), interactive: false }).addTo(labels);
  }
  dots.addTo(m.map); m.layers.airports.bringToFront?.();
  // etiquetas: solo los grandes al alejar, todos al acercar
  const upd = () => { const z = m.map.getZoom(); m.map.getContainer().dataset.z = z >= 7 ? 'all' : z >= 5 ? 'mid' : z >= 4 ? 'big' : 'none'; };
  labels.addTo(m.map); m.map.on('zoomend', upd); upd();
}
drawCommercial().catch(() => {});
window.setField = (id, icao) => { $('#' + id).value = icao; maps.wiz.map.closePopup(); cardEl.classList.remove('on'); toast(`${icao} como ${id === 'origin' ? 'origen' : 'destino'}`); };
$('#showPilots').onchange = e => e.target.checked ? maps.atc.layers.pilots.addTo(maps.atc.map) : maps.atc.map.removeLayer(maps.atc.layers.pilots);

fetch('data/bounds.json?v=' + window.APP_V).then(r => r.json()).then(g => { state.boundaries = g; Object.values(maps).forEach(drawVatsim); });
async function loadVatsim() {
  try {
    state.vatsim = await api('/api/vatsim');
    const c = state.vatsim.counts;
    $('#netDot').className = 'dot on'; $('#netTxt').textContent = `VATSIM en línea · ${c.pilots} pilotos`;
    $('#kAtc').textContent = c.controllers; $('#liveCount').textContent = `${c.controllers} ATC · ${c.pilots} pilotos`;
    Object.values(maps).forEach(drawVatsim); renderAtcList();
  } catch (e) { $('#netDot').className = 'dot off'; $('#netTxt').textContent = 'VATSIM sin conexión'; }
}
loadVatsim(); setInterval(loadVatsim, 30000);

// ---------------------------------------------------------------- autocompletado
function setupAutocomplete(id, onPick) {
  const inp = $('#' + id), box = $('#sug-' + id);
  let items = [], idx = -1, timer;
  const render = () => {
    box.innerHTML = items.map((a, i) => `<div class="${i === idx ? 'sel' : ''}" data-i="${i}"><b>${esc(a.icao)}</b>${esc(a.name)} · ${esc(a.city)}</div>`).join('');
    box.style.display = items.length ? 'block' : 'none';
    box.querySelectorAll('div').forEach(d => d.onmousedown = () => pick(+d.dataset.i));
  };
  const pick = i => { const a = items[i]; inp.value = a.icao; items = []; render(); onPick?.(a); };
  inp.oninput = () => {
    clearTimeout(timer); const q = inp.value.trim();
    if (q.length < 2) { items = []; return render(); }
    timer = setTimeout(async () => { items = await api('/api/airports?q=' + encodeURIComponent(q)); idx = -1; render(); }, 140);
  };
  inp.onkeydown = e => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter') { pick(Math.max(idx, 0)); e.preventDefault(); }
  };
  inp.onblur = () => setTimeout(() => { items = []; render(); }, 150);
}
setupAutocomplete('origin'); setupAutocomplete('dest');
setupAutocomplete('globalSearch', a => { $('#globalSearch').value = ''; $('#origin').value = a.icao; showView('wizard'); goStep(1); toast(`Origen: ${a.icao} ${a.city}`); });
$('#swap').onclick = () => { const o = $('#origin').value; $('#origin').value = $('#dest').value; $('#dest').value = o; };
$$('#durChips button').forEach(b => b.onclick = () => { $$('#durChips button').forEach(x => x.classList.toggle('on', x === b)); $('#minMin').value = b.dataset.min; $('#maxMin').value = b.dataset.max; });

// =====================================================================
// ASISTENTE
// =====================================================================
const wiz = { step: 1, route: null, aircraft: null, airline: null, disp: null, ofp: null, results: [], sentAt: 0, saved: false };

function goStep(n) {
  wiz.step = n;
  $$('#stepper li').forEach(li => { const s = +li.dataset.step; li.className = s === n ? 'cur' : s < n ? 'done' : ''; });
  $$('.step').forEach(s => s.classList.toggle('active', s.id === 'step-' + n));
  $('#btnBack').style.visibility = n === 1 ? 'hidden' : 'visible';
  $('#btnNext').textContent = n === 5 ? 'Finalizar' : n === 4 ? 'Ir a envío →' : 'Siguiente →';
  if (n === 1) setTimeout(() => maps.wiz.map.invalidateSize(), 30);
  if (n === 2) renderAircraftStep();
  if (n === 3) renderAirlineStep();
  if (n === 4) renderDispatchStep();
  if (n === 5) renderSendStep();
  updateWizFoot();
}
$$('#stepper li').forEach(li => li.onclick = () => { if (li.classList.contains('done')) goStep(+li.dataset.step); });
$('#btnBack').onclick = () => wiz.step > 1 && goStep(wiz.step - 1);
$('#btnNext').onclick = () => {
  if (wiz.step === 5) { stopPolling(); showView('home'); return; }
  goStep(wiz.step + 1);
};
function updateWizFoot() {
  const ok = { 1: !!wiz.route, 2: !!wiz.aircraft, 3: !!wiz.airline, 4: !!wiz.disp, 5: true }[wiz.step];
  $('#btnNext').disabled = !ok;
  const parts = [];
  if (wiz.route) parts.push(`<span><b>${esc(wiz.route.origin.icao)} → ${esc(wiz.route.dest.icao)}</b> · ${wiz.route.nm} NM</span>`);
  if (wiz.aircraft) parts.push(`<span><b>${esc(wiz.aircraft.maker)} ${esc(wiz.aircraft.name)}</b></span>`);
  if (wiz.airline) parts.push(`<span>${wiz.airline.iata ? `<img src="${logoUrl(wiz.airline.iata)}" alt="">` : ''} <b>${esc(wiz.airline.name)}</b></span>`);
  if (wiz.disp) parts.push(`<span>Indicativo <b>${esc(wiz.disp.callsign)}</b></span>`);
  $('#wizSum').innerHTML = parts.join('') || '<span>Elige origen y destino en el mapa, o deja que la IA proponga una ruta.</span>';
}

// ---------------------------------------------------------------- paso 1: ruta
function filters() {
  return { origin: $('#origin').value.trim(), dest: $('#dest').value.trim(), region: $('#region').value, minMin: +$('#minMin').value, maxMin: +$('#maxMin').value, onlyAtc: $('#onlyAtc').checked, realOnly: true, preference: $('#preference').value.trim() };
}
async function runSearch(useAi) {
  const btn = useAi ? $('#btnAi') : $('#btnSearch');
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${useAi ? 'Analizando' : 'Buscando'}`;
  $('#aiBox').classList.add('hidden');
  try {
    if (useAi) {
      const r = await api('/api/ai', filters());
      $('#aiBox').innerHTML = `<b>${icon('spark').replace('<svg', '<svg width="14" height="14"')} ${r.ai ? 'Despachador IA · ' + esc(r.aiName || '') : 'Clasificación automática'}</b>${esc(r.summary)}`;
      $('#aiBox').classList.remove('hidden');
      const keys = new Set(r.picks.map(p => p.origin.icao + p.dest.icao));
      wiz.results = [...r.picks.map(p => ({ ...p, pick: true })), ...r.candidates.filter(c => !keys.has(c.origin.icao + c.dest.icao))];
    } else wiz.results = await api('/api/search', filters());
    renderResults();
    if (wiz.results.length === 1) selectRoute(wiz.results[0]);
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.innerHTML = html;
}
$('#btnAi').onclick = () => runSearch(true);
$('#btnSearch').onclick = () => runSearch(false);

function renderResults() {
  const rs = wiz.results, L_ = maps.wiz.layers;
  L_.routes.clearLayers();
  if (!rs.length) { $('#results').innerHTML = '<div class="muted small" style="padding:10px">Sin resultados. Amplía la duración o desactiva «Con ATC en línea».</div>'; return; }
  $('#results').innerHTML = rs.map((c, i) => `
    <div class="rcard ${wiz.route === c ? 'sel' : ''}" data-i="${i}">
      <div class="t"><span class="rt">${esc(c.origin.icao)}<i>→</i>${esc(c.dest.icao)}</span><span class="bl">${hm(c.block)}</span></div>
      <div class="nm">${esc(c.origin.city || c.origin.name)} – ${esc(c.dest.city || c.dest.name)} · ${c.nm} NM ${c.pick ? '<span class="tag">IA</span>' : ''}${c.events.length ? '<span class="tag ev">Evento</span>' : ''}</div>
      <div class="mt"><span><span class="l">SAL</span>${badges(c.dep.pos) || '—'}</span><span><span class="l">LLE</span>${badges(c.arr.pos, true) || '—'}</span><span><span class="l">RUTA</span>${c.enroute}%</span><span><span class="l">OPS</span>${c.airlines.slice(0, 3).map(a => esc(a.icao)).join(' ') || '—'}</span></div>
      ${c.reason ? `<div class="why">${esc(c.reason)}</div>` : ''}
      ${c.warnings.length ? `<div class="warn">${c.warnings.map(esc).join(' · ')}</div>` : ''}
    </div>`).join('');
  $$('#results .rcard').forEach(el => el.onclick = () => selectRoute(rs[+el.dataset.i]));
  rs.slice(0, 40).forEach(c => L.polyline(greatCircle(c.origin, c.dest, 32), { color: c.pick ? '#8487ff' : '#9aa0c8', weight: c.pick ? 2.5 : 1, opacity: c.pick ? .95 : .3 }).on('click', () => selectRoute(c)).addTo(L_.routes));
}
function selectRoute(c) {
  if (wiz.route?.origin.icao !== c.origin.icao || wiz.route?.dest.icao !== c.dest.icao) { wiz.aircraft = null; wiz.airline = null; wiz.disp = null; wiz.ofp = null; wiz.saved = false; }
  wiz.route = c;
  $$('#results .rcard').forEach(el => el.classList.toggle('sel', wiz.results[+el.dataset.i] === c));
  const L_ = maps.wiz.layers; L_.sel.clearLayers();
  const line = L.polyline(greatCircle(c.origin, c.dest), { color: '#8487ff', weight: 3.5 }).addTo(L_.sel);
  for (const a of [c.origin, c.dest]) L.circleMarker([a.lat, a.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#5b5ff0', fillOpacity: 1 }).addTo(L_.sel);
  maps.wiz.map.flyToBounds(line.getBounds(), { paddingTopLeft: [420, 60], paddingBottomRight: [60, 60], maxZoom: 7 });
  updateWizFoot();
}

// ---------------------------------------------------------------- paso 2: avión
async function renderAircraftStep() {
  const r = wiz.route;
  $('#s2sub').textContent = `${r.origin.city} → ${r.dest.city} · ${r.nm} NM. Primero los que operan esta ruta en la vida real.`;
  const list = await api(`/api/wizard/aircraft?o=${r.origin.icao}&d=${r.dest.icao}`);
  const fams = [];
  for (const a of list) { let f = fams.find(x => x.name === a.family); if (!f) fams.push(f = { name: a.family, items: [] }); f.items.push(a); }
  const prio = n => n === 'A320 Family' ? 0 : n === 'A350 Family' ? 1 : 2;
  fams.sort((a, b) => prio(a.name) - prio(b.name));
  $('#aircraftGrid').innerHTML = fams.map(f => `<div class="fam-h">${esc(f.name)}</div><div class="ac-grid">${f.items.map(a => `
    <div class="ac-card ${a.feasible ? '' : 'off'} ${wiz.aircraft?.code === a.code ? 'sel' : ''}" data-code="${a.code}">
      <div class="chkmark">${icon('check')}</div>
      <div class="ph" data-type="${esc(a.code)}"></div>
      <div class="bd">
        <div class="mk">${esc(a.maker)} · ${esc(a.engines)}</div>
        <div class="nm">${esc(a.name)}<small>${esc(a.code)}</small></div>
        <div class="sp"><div><b>${a.block ? hm(a.block) : '—'}</b>bloque</div><div><b>${a.range.toLocaleString('es-ES')} NM</b>alcance</div><div><b>${a.seats}</b>plazas</div></div>
        <div class="ops">${!a.feasible ? '<span class="tag dim">Fuera de alcance</span>' : a.onRoute.length ? `<span class="tag ok">Opera esta ruta</span>${a.onRoute.slice(0, 4).map(i => `<span class="tag dim">${esc(i)}</span>`).join('')}` : `<span class="tag dim">${a.operators} aerolíneas</span>`}${a.oversized && a.feasible ? '<span class="tag dim">Largo radio</span>' : ''}</div>
      </div>
    </div>`).join('')}</div>`).join('');
  $$('#aircraftGrid .ph').forEach(el => lazyPhoto(el, { type: el.dataset.type }));
  $$('#aircraftGrid .ac-card').forEach(el => el.onclick = () => {
    if (el.classList.contains('off')) return toast('Ese avión no tiene alcance para esta ruta', true);
    const a = list.find(x => x.code === el.dataset.code);
    if (wiz.aircraft?.code !== a.code) { wiz.airline = null; wiz.disp = null; }
    wiz.aircraft = a;
    $$('#aircraftGrid .ac-card').forEach(c => c.classList.toggle('sel', c === el));
    updateWizFoot();
  });
}

// ---------------------------------------------------------------- paso 3: aerolínea
async function renderAirlineStep() {
  const r = wiz.route, a = wiz.aircraft;
  $('#s3sub').textContent = `Compañías que operan el ${a.maker} ${a.name} o la ruta ${r.origin.icao}–${r.dest.icao}.`;
  const list = await api(`/api/wizard/airlines?o=${r.origin.icao}&d=${r.dest.icao}&type=${a.code}`);
  if (!list.length) { $('#airlineGrid').innerHTML = '<div class="muted">No hay aerolíneas con este avión en la base de datos.</div>'; return; }
  $('#airlineGrid').innerHTML = list.map((al, i) => `
    <div class="al-card ${wiz.airline?.icao === al.icao ? 'sel' : ''}" data-i="${i}" style="--brand:${esc(al.color || '#5b5ff0')}">
      <div class="chkmark">${icon('check')}</div>
      <div class="badges">${al.onRoute && al.hasType ? '<span class="tag ok">Ruta real con este avión</span>' : al.onRoute ? '<span class="tag">Opera la ruta</span>' : ''}${al.base ? '<span class="tag">Base</span>' : ''}${!al.hasType ? '<span class="tag">Sin este tipo en flota</span>' : ''}</div>
      <div class="gl">
        <div class="logo-pill">${logoImg(al)}</div>
        <div class="tx"><b>${esc(al.name)}</b><span>${esc(al.callsign || al.icao)} · ${esc(al.country || '')}</span></div>
      </div>
    </div>`).join('');
  $$('#airlineGrid .al-card').forEach(el => {
    const al = list[+el.dataset.i];
    lazyPhoto(el, airlinePhotoQueries(al, a));
    el.onclick = () => {
      if (wiz.airline?.icao !== al.icao) wiz.disp = null;
      wiz.airline = al;
      $$('#airlineGrid .al-card').forEach(c => c.classList.toggle('sel', c === el));
      updateWizFoot();
    };
  });
}

// ---------------------------------------------------------------- paso 4: despacho
async function renderDispatchStep(forceAi) {
  const r = wiz.route, a = wiz.aircraft, al = wiz.airline;
  const hero = $('#dispHero');
  if (!wiz.disp || forceAi) {
    $('#dispForm').innerHTML = `<div class="muted" style="grid-column:1/-1;padding:10px 0 20px"><span class="spin"></span>Preparando despacho: METAR, pistas en uso, ATC y alternativos…</div>`;
    $('#briefing').innerHTML = '';
    try { wiz.disp = await api('/api/dispatch', { origin: r.origin.icao, dest: r.dest.icao, type: a.code, airline: al.icao }); }
    catch (e) { toast(e.message, true); return; }
  }
  const d = wiz.disp;
  hero.innerHTML = `<div class="in"><div><div class="cs" id="hCs">${esc(d.callsign)}</div><div class="rtf" id="hRtf">${esc(al.callsign || '')} ${esc(d.fltnum)}</div>
    <div class="rt"><b>${esc(r.origin.icao)} → ${esc(r.dest.icao)}</b> · ${esc(a.maker)} ${esc(a.name)} · ${r.nm} NM</div></div>
    <div class="lg">${logoImg(al)}</div></div>`;
  setPhoto(hero, airlinePhotoQueries(al, a));
  const ro = d.runwaysOrigin.runways.map(x => x.id), rd = d.runwaysDest.runways.map(x => x.id);
  const opt = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const dep = new Date(d.depTime);
  $('#dispForm').innerHTML = `
    <div class="field"><label>Aerolínea</label><input value="${esc(d.airline)}" disabled></div>
    <div class="field"><label>Nº de vuelo</label><input id="fFlt" value="${esc(d.fltnum)}" maxlength="5"></div>
    <div class="field"><label>Salida (UTC)</label><input id="fDep" type="time" value="${dep.toISOString().slice(11, 16)}"></div>
    <div class="field"><label>Pista salida</label><select id="fORwy">${opt(ro, d.origRwy)}</select></div>
    <div class="field"><label>Pista llegada</label><select id="fDRwy">${opt(rd, d.destRwy)}</select></div>
    <div class="field"><label>Alternativo</label><select id="fAltn">${d.alternates.map(x => `<option value="${esc(x.icao)}" ${x.icao === d.altn ? 'selected' : ''}>${esc(x.icao)} · ${esc(x.city || x.name)} (${x.nm} NM)</option>`).join('')}</select></div>
    <div class="field"><label>Nivel de crucero</label><input id="fFl" type="number" step="10" value="${d.cruiseFl}"></div>
    <div class="field"><label>Cost index</label><input id="fCi" type="number" value="${d.ci}"></div>
    <div class="field"><label>Pasajeros</label><input id="fPax" type="number" value="${d.pax}" max="${a.seats}"></div>`;
  $('#briefing').innerHTML = d.briefing ? `<b>${icon('spark').replace('<svg', '<svg width="14" height="14"')} ${d.ai ? 'Briefing del despachador IA · ' + esc(d.aiName || '') : 'Aviso'}</b>${esc(d.briefing)}` : '';
  const sync = () => {
    d.fltnum = $('#fFlt').value.replace(/\D/g, ''); d.callsign = d.airline + d.fltnum;
    const [h, m] = $('#fDep').value.split(':'); const t = new Date(d.depTime); t.setUTCHours(+h, +m, 0, 0); if (t < Date.now() - 3600e3) t.setUTCDate(t.getUTCDate() + 1); d.depTime = t.toISOString();
    d.origRwy = $('#fORwy').value; d.destRwy = $('#fDRwy').value; d.altn = $('#fAltn').value;
    d.cruiseFl = +$('#fFl').value; d.ci = +$('#fCi').value; d.pax = +$('#fPax').value;
    $('#hCs').textContent = d.callsign; $('#hRtf').textContent = `${al.callsign || ''} ${d.fltnum}`; updateWizFoot();
  };
  $$('#dispForm input, #dispForm select').forEach(el => el.onchange = el.oninput = sync);
  wxCard('#wxDep', 'Salida', r.origin, d.runwaysOrigin, r.dep, 'dep');
  wxCard('#wxArr', 'Llegada', r.dest, d.runwaysDest, r.arr, 'arr');
  updateWizFoot();
}
$('#btnAiFill').onclick = async () => { const b = $('#btnAiFill'); b.disabled = true; await renderDispatchStep(true); b.disabled = false; };

function posList(pos, atis) {
  const rows = ORDER.filter(f => pos[f]).map(f => {
    const p = pos[f];
    const m = p.marginMin !== undefined ? (p.marginMin >= 0 ? ` <span class="ok">+${p.marginMin}m</span>` : ` <span class="bad">${p.marginMin}m</span>`) : '';
    return `<div class="pos"><span><b class="b ${f}">${LETTER[f]}</b> ${esc(p.callsign)}</span><span class="f">${esc(p.freq)}</span><span class="t">${zt(p.close?.at)}Z${m}</span></div>`;
  });
  for (const a of atis || []) rows.push(`<div class="pos"><span><b class="b ATIS">${esc(a.code || 'I')}</b> ATIS</span><span class="f">${esc(a.freq)}</span><span></span></div>`);
  return rows.join('') || '<div class="muted small">Sin ATC en línea · UNICOM 122.800</div>';
}
async function wxCard(sel, title, ap, rw, side, kind) {
  const m = rw.metar, use = kind === 'dep' ? rw.dep : rw.arr;
  $(sel).className = 'card wx';
  $(sel).innerHTML = `<div class="card-h"><span>${icon('pin').replace('<svg', '<svg width="18" height="18"')} ${title} · ${esc(ap.icao)} <span class="muted small" style="font-weight:400">${esc(ap.name)}</span></span>${m?.fltCat ? `<span class="cat ${esc(m.fltCat)}">${esc(m.fltCat)}</span>` : ''}</div>
    <div class="bd">
      <div class="metar">${esc(m?.rawOb || 'METAR no disponible')}</div>${m?.rawTaf ? `<div class="taf">${esc(m.rawTaf)}</div>` : ''}
      <h5>Pista en uso</h5>${use ? use.all.map(id => `<span class="rwy-chip">${esc(id)} <small>${esc(use.source)}</small></span>`).join('') : '<span class="muted small">Sin datos de pistas</span>'}
      <h5>ATC</h5>${posList(side.pos, side.atis)}
      <h5>Cartas</h5><div class="charts" id="ch-${kind}"><span class="muted small">…</span></div>
    </div>`;
  try {
    const a = await api('/api/airport/' + ap.icao);
    $('#ch-' + kind).innerHTML = a.charts.length ? a.charts.map(c => `<a href="/charts/${c.split('/').map(encodeURIComponent).join('/')}" target="_blank">${esc(c.split('/').pop())}</a>`).join('') : `<span class="muted small">Pon los PDF en charts/${esc(ap.icao)}/</span>`;
  } catch {}
}

// ---------------------------------------------------------------- paso 5: envío
function simbriefUrl() {
  const r = wiz.route, d = wiz.disp, dep = new Date(d.depTime);
  const p = new URLSearchParams({
    orig: r.origin.icao, dest: r.dest.icao, type: wiz.aircraft.code, airline: d.airline, fltnum: d.fltnum, callsign: d.callsign,
    deph: String(dep.getUTCHours()), depm: String(dep.getUTCMinutes()), origrwy: d.origRwy, destrwy: d.destRwy, altn: d.altn,
    fl: String(d.cruiseFl * 100), civalue: String(d.ci), pax: String(d.pax),
  });
  return 'https://www.simbrief.com/system/dispatch.php?' + p;
}
let pollTimer = null;
function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }
function renderSendStep() {
  const r = wiz.route, a = wiz.aircraft, al = wiz.airline, d = wiz.disp;
  const hero = $('#sendHero');
  hero.innerHTML = `<div class="in"><div style="display:flex;gap:14px;align-items:center"><div class="logo-pill">${logoImg(al)}</div><div><b style="font-size:22px">${esc(d.callsign)}</b><div class="muted">${esc(al.callsign || '')} ${esc(d.fltnum)} · ${esc(a.maker)} ${esc(a.name)}</div></div></div>
    <div class="route-big"><div><b>${esc(r.origin.icao)}</b><span>${esc(r.origin.city)} · RWY ${esc(d.origRwy)}</span></div><div class="arrow">${icon('plane')}</div><div><b>${esc(r.dest.icao)}</b><span>${esc(r.dest.city)} · RWY ${esc(d.destRwy)}</span></div></div>
    <div class="muted" style="margin-top:10px">Salida ${zt(d.depTime)}Z · FL${d.cruiseFl} · CI ${d.ci} · ALTN ${esc(d.altn)} · ${d.pax} pax</div></div>`;
  hero.querySelector('.route-big .arrow').innerHTML = `<i data-icon="plane"></i>`; applyIcons(hero);
  setPhoto(hero, airlinePhotoQueries(al, a), 1);
  renderTimeline();
}
function renderTimeline() {
  const hasUser = !!state.config.simbriefUser, o = wiz.ofp;
  const st = i => (o && i <= 2) || (wiz.saved && i === 4) ? 'done' : (!o && i === 1 && !wiz.sentAt) || (!o && i === 2 && wiz.sentAt) || (o && i === 3) ? 'now' : '';
  const play = icon('play').replace('<svg', '<svg width="14" height="14"');
  $('#timeline').innerHTML = `
    <li class="${st(1)}"><div class="n">1</div><div class="c"><b>Enviar a SimBrief</b><span>Se abre SimBrief en otra pestaña con todo relleno. Inicia sesión con tu cuenta de Navigraph si te lo pide y pulsa «Generate Flight».</span>
      <div class="sb-user"><label>Tu usuario de SimBrief</label><div class="row2"><input id="sbUser" placeholder="usuario o nº de piloto" value="${esc(state.config.simbriefUser || '')}"><button class="btn sm" id="sbUserSave">Guardar</button></div>
      <small class="muted">Lo ves en simbrief.com → Account Settings (Username o Pilot ID). Sin él no puedo detectar tu plan.</small></div>
      <button class="btn primary" id="btnSB" ${hasUser ? '' : 'disabled'}>${play} Abrir SimBrief</button></div></li>
    <li class="${st(2)}"><div class="n">2</div><div class="c"><b>Generar el OFP</b><span id="sbStatus">${o ? `OFP recibido · ${esc(o.callsign)} generado a las ${zt(o.generated)}Z` : wiz.sentAt ? '<span class="spin"></span>Esperando a que pulses «Generate Flight». Al detectarlo cierro SimBrief y vuelves aquí.' : 'Pendiente'}</span>
      ${!o && wiz.sentAt ? '<br><button class="btn sm" id="sbCheck">Ya lo he generado · comprobar</button>' : ''}</div></li>
    <li class="${st(3)}"><div class="n">3</div><div class="c"><b>Presentar el plan en VATSIM</b><span>Inicia sesión con tu cuenta de VATSIM (tu CID) y pulsa «File Flight Plan». Los controladores lo verán al conectarte con vPilot con el mismo indicativo.</span>
      ${o?.prefileVatsim ? `<br><a class="btn primary" target="_blank" href="${esc(o.prefileVatsim)}">Presentar en VATSIM</a>` : ''}</div></li>
    <li class="${st(4)}"><div class="n">4</div><div class="c"><b>Guardado en el historial</b><span>${wiz.saved ? `Guardado en ${esc(wiz.saved)}` : o ? 'Guardando…' : 'Se guarda al recibir el OFP'}</span>${!o && !wiz.saved ? '<br><button class="btn sm" id="btnSaveNoOfp">Guardar sin OFP</button>' : ''}</div></li>
    <li class="local-only"><div class="n">5</div><div class="c"><b>Iniciar sesión de vuelo</b><span>Abre MSFS 2024, vPilot, Volanta y el resto de programas con tu .bat.</span><br><button class="btn" id="btnLaunch2">${play} Ejecutar iniciar_vuelo.bat</button></div></li>`;
  $('#sbUserSave').onclick = async () => {
    const v = $('#sbUser').value.trim(); if (!v) return toast('Escribe tu usuario de SimBrief', true);
    applyConfig(await api('/api/config', { simbriefUser: v }));
    toast('Usuario de SimBrief guardado'); renderTimeline(); if (wiz.sentAt && !wiz.ofp) startPolling(true);
  };
  $('#sbUser').onkeydown = e => { if (e.key === 'Enter') $('#sbUserSave').click(); };
  $('#btnSB').onclick = () => {
    // la pestaña la abre la web: así puede cerrarla sola cuando llegue el OFP
    sbWin = window.open(simbriefUrl(), 'simbrief');
    if (!sbWin) return toast('El navegador bloqueó la ventana emergente: permítela para esta web', true);
    wiz.sentAt = Date.now(); renderTimeline(); startPolling();
  };
  const ck = $('#sbCheck'); if (ck) ck.onclick = () => startPolling(true);
  $('#btnLaunch2').onclick = () => launch('bat');
  const sv = $('#btnSaveNoOfp'); if (sv) sv.onclick = () => saveFlight();
  renderOfp();
}
let sbWin = null;
// Busca el último OFP de tu cuenta cada 5 s y en cuanto vuelves a esta pestaña.
// Vale cualquier OFP de esta misma ruta generado desde 30 min antes de abrir SimBrief.
async function checkOfp(manual) {
  if (!wiz.route || wiz.ofp) return true;
  try {
    const o = await api('/api/simbrief');
    const t = o.generated ? Date.parse(o.generated) : 0;
    const sameRoute = o.origin === wiz.route.origin.icao && o.dest === wiz.route.dest.icao;
    // vale: misma ruta generada hasta 30 min antes, o cualquier plan generado después de abrir SimBrief
    // (si cambiaste la ruta dentro de SimBrief, manda lo que generaste)
    if (t && ((sameRoute && t >= wiz.sentAt - 30 * 60e3) || t >= wiz.sentAt - 60e3)) {
      wiz.ofp = o; stopPolling();
      try { if (sbWin && !sbWin.closed) sbWin.close(); } catch {}
      window.focus(); showView('wizard'); if (wiz.step !== 5) goStep(5);
      toast(`OFP ${o.callsign || ''} ${o.origin}→${o.dest} recibido de SimBrief${sameRoute ? '' : ' (ruta distinta a la del asistente)'}`, !sameRoute);
      renderTimeline(); saveFlight(); return true;
    }
    if (manual) toast(o.generated ? `Tu último plan en SimBrief es ${o.origin}→${o.dest} (${zt(o.generated)}Z), no ${wiz.route.origin.icao}→${wiz.route.dest.icao}. Pulsa «Generate Flight».` : 'SimBrief aún no tiene ningún plan generado.', true);
  } catch (e) { if (manual) toast(e.message, true); }
  return false;
}
function startPolling(manualNow) {
  stopPolling();
  if (!state.config.simbriefUser) { if (manualNow) toast('Primero guarda tu usuario de SimBrief', true); return; }
  if (!wiz.sentAt) wiz.sentAt = Date.now();
  const tick = async () => {
    if (await checkOfp(false)) return;
    if (Date.now() - wiz.sentAt < 30 * 60e3) pollTimer = setTimeout(tick, 5000);
  };
  if (manualNow) checkOfp(true).then(done => { if (!done) pollTimer = setTimeout(tick, 5000); });
  else pollTimer = setTimeout(tick, 4000);
}
// al volver a esta pestaña desde SimBrief, comprobar al momento
document.addEventListener('visibilitychange', () => { if (!document.hidden && wiz.sentAt && !wiz.ofp && state.config.simbriefUser) checkOfp(false); });
window.addEventListener('focus', () => { if (wiz.sentAt && !wiz.ofp && state.config.simbriefUser) checkOfp(false); });
function renderOfp() {
  const o = wiz.ofp, el = $('#ofpCard');
  if (!o) { el.innerHTML = `<div class="card-h"><span>${icon('doc').replace('<svg', '<svg width="18" height="18"')} OFP SimBrief</span></div><div class="muted pad">Esperando a que generes el plan en SimBrief…</div>`; return; }
  el.innerHTML = `<div class="card-h"><span>${icon('doc').replace('<svg', '<svg width="18" height="18"')} OFP ${esc(o.callsign)}</span>${o.pdf ? `<a class="btn sm" target="_blank" href="${esc(o.pdf)}">PDF</a>` : ''}</div>
    <div class="kv"><span>Ruta</span><span>${esc(o.origin)}/${esc(o.originRwy || '')} → ${esc(o.dest)}/${esc(o.destRwy || '')} · ALTN ${esc(o.altn || '—')}</span>
      <span>SID / STAR</span><span>${esc(o.sid || '—')} / ${esc(o.star || '—')}</span>
      <span>Crucero</span><span>FL${Math.round((+o.cruise || 0) / 100)} · CI ${esc(o.ci)}</span>
      <span>Bloque</span><span>${hm(o.blockMin)} (vuelo ${hm(o.airMin)})</span>
      <span>Combustible</span><span>${esc(o.fuelRamp)} ${esc(o.units)}</span>
      <span>Pax / ZFW / TOW</span><span>${esc(o.pax)} / ${esc(o.zfw)} / ${esc(o.tow)}</span>
      <span>Matrícula</span><span>${esc(o.reg || '—')}</span></div>
    <div class="route-str">${esc(o.route)}</div>`;
  if (o.coords?.length > 1) { maps.wiz.layers.sel.clearLayers(); L.polyline(o.coords, { color: '#8487ff', weight: 3 }).addTo(maps.wiz.layers.sel); }
}
async function saveFlight() {
  if (wiz.saved) return;
  const r = wiz.route, a = wiz.aircraft, al = wiz.airline, d = wiz.disp, o = wiz.ofp;
  try {
    const f = await api('/api/flights', {
      callsign: d.callsign, airline: al.icao, iata: al.iata || '', airlineName: al.name, rtf: al.callsign || '',
      origin: r.origin.icao, dest: r.dest.icao, originCity: r.origin.city, destCity: r.dest.city,
      type: a.code, typeName: `${a.maker} ${a.name}`, dep: d.depTime, block: o?.blockMin || r.block, fl: d.cruiseFl,
      origRwy: d.origRwy, destRwy: d.destRwy, altn: d.altn, route: o?.route || '', reg: o?.reg || '', status: 'planificado',
    });
    wiz.saved = f.storage === 'firebase' ? 'Firebase' : f.storage === 'navegador' ? 'este navegador' : 'local (data/flights.json)';
    await loadFlights(); renderTimeline();
  } catch (e) { toast('No se pudo guardar: ' + e.message, true); }
}

// =====================================================================
// INICIO, HISTORIAL, ATC
// =====================================================================
async function loadFlights() { try { state.flights = await api('/api/flights'); } catch { state.flights = []; } }
function weekCounts(n = 8) {
  const now = Date.now(), w = Array(n).fill(0), h = Array(n).fill(0);
  for (const f of state.flights) { const i = n - 1 - Math.floor((now - Date.parse(f.created)) / (7 * 864e5)); if (i >= 0 && i < n) { w[i]++; h[i] += (+f.block || 0) / 60; } }
  return { w, h };
}
function spark(svg, data) {
  const max = Math.max(...data, 1), pts = data.map((v, i) => `${(i / (data.length - 1)) * 78 + 1},${30 - (v / max) * 26}`).join(' ');
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="#8487ff" stroke-width="1.6" stroke-linejoin="round"/>`;
}
function recentRows(list) {
  if (!list.length) return '<tr><td class="empty-row" colspan="5">Aún no hay vuelos. Planifica el primero.</td></tr>';
  return `<tr><th>Vuelo</th><th>Ruta</th><th>Salida</th><th>Avión</th><th>Estado</th></tr>` + list.map(f => `<tr>
    <td><div class="fl"><span class="lg">${f.iata ? `<img src="${logoUrl(f.iata)}" alt="">` : ''}</span>${esc(f.callsign)}</div></td>
    <td>${esc(f.origin)} → ${esc(f.dest)}</td><td>${zt(f.dep)}Z</td><td>${esc(f.type)}</td><td><span class="status plan">${esc(f.status || 'planificado')}</span></td></tr>`).join('');
}
function renderHome() {
  const fl = state.flights, name = state.config.pilotName;
  $('#welcomeName').textContent = name ? ', ' + name.split(' ')[0] : '';
  const hrs = fl.reduce((s, f) => s + (+f.block || 0), 0) / 60;
  $('#kFlights').textContent = fl.length; $('#kHours').textContent = hrs.toFixed(1) + ' h';
  const { w, h } = weekCounts();
  spark($('#spark1'), w); spark($('#spark2'), h);
  spark($('#spark3'), [3, 5, 4, 6, 5, 7, 6, state.vatsim?.counts.controllers || 6]);
  $('#recentTbl').innerHTML = recentRows(fl.slice(0, 5));
  const max = Math.max(...w, 1);
  $('#bars').innerHTML = w.map((v, i) => `<div style="height:${Math.max(4, v / max * 100)}%" title="${v} vuelos"><span>S${i + 1}</span></div>`).join('');
  const routes = new Set(fl.map(f => f.origin + f.dest)).size;
  $('#actStats').innerHTML = `<div><b>${fl.length}</b><span>Vuelos</span></div><div><b>${hrs.toFixed(1)} h</b><span>Horas de bloque</span></div><div><b>${routes}</b><span>Rutas distintas</span></div>`;
  // próximo vuelo
  const nf = fl[0];
  const nextBg = $('#nextBg');
  if (nf) {
    $('#nextRoute').innerHTML = `<div><b>${esc(nf.origin)}</b><span>${esc(nf.originCity || '')}</span></div><div class="arrow"><i data-icon="plane"></i></div><div><b>${esc(nf.dest)}</b><span>${esc(nf.destCity || '')}</span></div>`;
    $('#nextMeta').innerHTML = `<div><i data-icon="cal"></i><div><b>${fmtDate(nf.dep)}</b>${zt(nf.dep)}Z</div></div><div><i data-icon="plane"></i><div><b>${esc(nf.type)}</b>${esc(nf.callsign)}</div></div>`;
    const mins = Math.round((Date.parse(nf.dep) - Date.now()) / 60e3);
    $('#nextWhen').textContent = mins > 0 ? `En ${hm(mins)}` : 'Ya salió';
    setPhoto(nextBg, [{ al: nf.airline, type: nf.type }, { type: nf.type }]);
  } else setPhoto(nextBg, { type: 'A359' });
  applyIcons($('#nextCard'));
  // avión favorito
  const counts = {}; fl.forEach(f => counts[f.type] = (counts[f.type] || 0) + 1);
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'A20N';
  const ac = state.aircraft.find(a => a.code === fav);
  if (ac) {
    $('#fleetName').textContent = `${ac.maker} ${ac.name}`;
    setPhoto($('#fleetImg'), { type: ac.code });
    const fh = fl.filter(f => f.type === fav).reduce((s, f) => s + (+f.block || 0), 0) / 60;
    $('#fleetStats').innerHTML = `<div><b>${counts[fav] || 0}</b><span>Vuelos</span></div><div><b>${ac.operators}</b><span>Aerolíneas</span></div><div><b>${fh.toFixed(1)} h</b><span>Horas</span></div>`;
  }
  setTimeout(() => maps.home.map.invalidateSize(), 50);
}
$('#btnNew').onclick = () => { showView('wizard'); goStep(1); };

function renderHistory() {
  $('#histSub').textContent = `${state.flights.length} vuelos · guardados en ${state.config.storage === 'firebase' ? 'Firebase' : state.config.mode === 'web' ? 'este navegador' : 'este PC (data/flights.json)'}`;
  $('#histTbl').innerHTML = !state.flights.length ? '<tr><td class="empty-row">Sin vuelos todavía.</td></tr>' :
    `<tr><th>Vuelo</th><th>Ruta</th><th>Fecha</th><th>Avión</th><th>Bloque</th><th>Pistas</th><th>Nivel</th></tr>` + state.flights.map(f => `<tr>
      <td><div class="fl"><span class="lg">${f.iata ? `<img src="${logoUrl(f.iata)}" alt="">` : ''}</span>${esc(f.callsign)}</div></td>
      <td>${esc(f.origin)} → ${esc(f.dest)} <span class="muted small">${esc(f.originCity || '')} – ${esc(f.destCity || '')}</span></td>
      <td>${fmtDate(f.dep)} ${zt(f.dep)}Z</td><td>${esc(f.typeName || f.type)}</td><td>${f.block ? hm(+f.block) : '—'}</td><td>${esc(f.origRwy || '')} / ${esc(f.destRwy || '')}</td><td>FL${esc(f.fl)}</td></tr>`).join('');
}

function renderAtcList() {
  const v = state.vatsim; if (!v) return;
  const q = $('#atcFilter').value.trim().toUpperCase();
  const rows = v.controllers.filter(c => !q || c.callsign.includes(q) || c.facility === q || (c.firName || '').toUpperCase().includes(q));
  const groups = { CTR: 'Centros', APP: 'Aproximación', TWR: 'Torre', GND: 'Ground', DEL: 'Delivery', FSS: 'FSS' };
  $('#atcList').innerHTML = Object.entries(groups).map(([f, t]) => {
    const g = rows.filter(c => c.facility === f).sort((a, b) => a.callsign.localeCompare(b.callsign));
    return g.length ? `<div class="atcgrp"><h5>${t} · ${g.length}</h5>${g.map(c => `<div class="atcrow" data-cs="${esc(c.callsign)}" title="${esc(c.text)}"><b class="b ${f}">${LETTER[f]}</b><span class="c">${esc(c.callsign)}</span><span class="fq">${esc(c.freq)}</span><span class="cl">cierre ~${zt(c.close.at)}Z</span></div>`).join('')}</div>` : '';
  }).join('') || '<div class="muted">Nada coincide.</div>';
  $$('.atcrow').forEach(r => r.onclick = () => {
    const c = v.controllers.find(x => x.callsign === r.dataset.cs);
    if (c?.lat) maps.atc.map.flyTo([c.lat, c.lon], 8);
    else if (c?.boundaries?.length && state.boundaries) { const f = state.boundaries.features.find(f => f.properties.id === c.boundaries[0]); if (f) maps.atc.map.flyToBounds(L.geoJSON(f).getBounds(), { padding: [30, 30] }); }
  });
}
$('#atcFilter').oninput = renderAtcList;
api('/api/events').then(evs => {
  $('#events').innerHTML = evs.slice(0, 5).map(e => `<div class="event"><b>${esc(e.name)}</b><span>${new Date(e.start).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })} · ${zt(e.start)}–${zt(e.end)}Z · ${e.airports.map(esc).join(' ')}</span></div>`).join('');
}).catch(() => {});

// =====================================================================
// AJUSTES Y LANZADOR
// =====================================================================
async function launch(target) {
  try { const r = await api('/api/launch', { target }); toast('Ejecutando ' + r.launched.split('\\').pop()); } catch (e) { toast(e.message, true); }
}
$('#btnLaunch').onclick = () => launch('bat');
$('#btnVolanta').onclick = () => launch('volanta');
const CFG = ['pilotName', 'simbriefUser', 'aiProvider', 'geminiKey', 'geminiModel', 'deepseekKey', 'deepseekModel', 'firebaseProjectId', 'firebaseApiKey', 'batPath', 'volantaPath', 'chartsDir', 'prepMin'];
function applyConfig(c) {
  state.config = c;
  CFG.forEach(k => { const el = $('#cfg-' + k); if (el) el.value = c[k] ?? ''; });
  const n = c.pilotName || 'Piloto';
  $('#userName').textContent = n; $('#avatar').textContent = n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('#storageTxt').textContent = c.storage === 'firebase' ? 'Firebase' : c.mode === 'web' ? 'navegador' : 'local';
  if (c.mode === 'web') {
    document.body.classList.add('web-mode');
    $('#cfgWhere').textContent = 'Versión web: tus ajustes y claves se guardan solo en este navegador (nunca en GitHub). Para abrir el .bat y Volanta usa la versión de tu PC.';
  }
}
$('#btnSaveCfg').onclick = async () => {
  applyConfig(await api('/api/config', Object.fromEntries(CFG.map(k => [k, $('#cfg-' + k).value]))));
  $('#cfgSaved').textContent = 'Guardado'; await loadFlights(); renderHome();
};

// =====================================================================
// arranque
// =====================================================================
(async () => {
  const [c, ac] = await Promise.all([api('/api/config'), api('/api/wizard/aircraft'), loadFlights()]);
  state.aircraft = ac; applyConfig(c);
  showView('wizard'); goStep(1);
})();
