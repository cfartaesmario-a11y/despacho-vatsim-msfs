// =====================================================================
// Modo web (GitHub Pages): no hay servidor, así que las llamadas /api/… las responde
// el mismo motor (core.js) dentro del navegador. Ajustes e historial se guardan en este
// navegador (localStorage) o en tu Firebase si lo configuras. Nada se sube a GitHub.
// =====================================================================
window.APP_V = document.querySelector('meta[name=app-version]')?.content || 'dev';
(function () {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  window.WEB_MODE = !local || new URLSearchParams(location.search).has('web');
  if (!window.WEB_MODE) return;

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const DEFAULTS = { pilotName: '', simbriefUser: '', aiProvider: 'gemini', geminiKey: '', geminiModel: 'gemini-3.5-flash', deepseekKey: '', deepseekModel: 'deepseek-chat', firebaseProjectId: '', firebaseApiKey: '', prepMin: 40 };
  let config = { ...DEFAULTS, ...LS.get('despacho.config', {}) };
  let photos = {};
  const photoLocal = LS.get('despacho.photos', {});

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${new URL(url).host} -> HTTP ${r.status}`);
    return r.json();
  }
  let ready;
  function init() {
    return ready ||= (async () => {
      const [core, bounds, pre] = await Promise.all([
        fetch('data/core.json?v=' + window.APP_V).then(r => r.json()),
        fetch('data/bounds.json?v=' + window.APP_V).then(r => r.json()),
        fetch('data/photos.json?v=' + window.APP_V).then(r => r.json()).catch(() => ({})),
      ]);
      photos = { ...pre, ...photoLocal };
      Core.init(core, bounds, {
        getJSON,
        getText: async url => (await fetch(url)).text(),
        config: () => config,
        photoStore: {
          get: k => photos[k],
          set: (k, v) => { photos[k] = v; photoLocal[k] = v; LS.set('despacho.photos', photoLocal); },
        },
      });
    })();
  }
  window.webReady = init;

  const mask = v => v ? '••••' : '';
  const publicConfig = () => ({ ...config, geminiKey: mask(config.geminiKey), deepseekKey: mask(config.deepseekKey), firebaseApiKey: mask(config.firebaseApiKey), storage: Core.firebaseOn() ? 'firebase' : 'navegador', mode: 'web' });

  window.webApi = async function (url, body) {
    await init();
    const u = new URL(url, location.href), p = u.pathname.replace(/^.*\/api\//, '/api/'), q = k => u.searchParams.get(k) || '';
    if (p === '/api/vatsim') return Core.getVatsim();
    if (p === '/api/events') return Core.getEvents();
    if (p === '/api/metar') return Core.getMetar(q('ids').split(','));
    if (p === '/api/airports') return Core.searchAirports(q('q'));
    if (p === '/api/commercial') return Core.commercialAirports();
    if (p.startsWith('/api/airportinfo/')) return Core.airportInfo(p.split('/').pop());
    if (p.startsWith('/api/airport/')) { const a = Core.airport(p.split('/').pop()); if (!a) throw new Error('Aeropuerto desconocido'); return { ...a, charts: [] }; }
    if (p.startsWith('/api/runways/')) return Core.runwayInfo(p.split('/').pop());
    if (p === '/api/search') return Core.findCandidates(body || {});
    if (p === '/api/ai') return Core.aiSuggest(body || {});
    if (p === '/api/wizard/aircraft') return Core.wizardAircraft(q('o').toUpperCase(), q('d').toUpperCase());
    if (p === '/api/wizard/airlines') return Core.wizardAirlines(q('o').toUpperCase(), q('d').toUpperCase(), q('type').toUpperCase());
    if (p === '/api/dispatch') return Core.dispatchProposal(body || {});
    if (p === '/api/photos') return Core.searchPhotos(q('q'), q('must'));
    if (p === '/api/photo/type') return Core.typePhotos(q('type').toUpperCase());
    if (p === '/api/photo/airline') return Core.airlinePhotos(q('al').toUpperCase(), q('type').toUpperCase());
    if (p === '/api/simbrief') {
      const user = q('user') || config.simbriefUser;
      if (!user) throw new Error('Añade tu usuario de SimBrief en Ajustes');
      return Core.getSimbrief(user);
    }
    if (p === '/api/flights') {
      if (body) {
        const flight = { ...body, created: new Date().toISOString() };
        if (Core.firebaseOn()) { await Core.firebaseSave(flight); return { ...flight, storage: 'firebase' }; }
        const all = LS.get('despacho.flights', []); all.unshift(flight); LS.set('despacho.flights', all.slice(0, 500));
        return { ...flight, storage: 'navegador' };
      }
      return Core.firebaseOn() ? Core.firebaseList() : LS.get('despacho.flights', []);
    }
    if (p === '/api/launch') throw new Error('Abrir programas (.bat, Volanta) solo funciona en la versión de tu PC: abre abrir_despacho.bat');
    if (p === '/api/config') {
      if (body) {
        for (const k of Object.keys(DEFAULTS)) {
          if (body[k] === undefined || body[k] === '••••') continue;
          config[k] = k === 'prepMin' ? +body[k] : String(body[k]).trim();
        }
        LS.set('despacho.config', config);
      }
      return publicConfig();
    }
    throw new Error('Función no disponible en la web: ' + p);
  };
})();
