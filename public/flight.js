// =====================================================================
// Vuelos activos y vuelo en curso: etapas, checklists por voz, frecuencias, ATIS y cartas.
// El progreso de cada vuelo (etapa y casillas) se guarda en este navegador.
// =====================================================================
(function () {
  const PH = window.FLIGHT_PHASES;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const fid = f => f.id || f.created;
  const allState = () => LS.get('despacho.flightState', {});
  const getState = id => allState()[id] || { phase: 0, checks: {}, done: false };
  const setState = (id, s) => { const a = allState(); a[id] = s; LS.set('despacho.flightState', a); };
  const activeFlights = () => (state.flights || []).filter(f => !getState(fid(f)).done);

  // ------------------------------------------------------------------ lista de vuelos activos
  window.updateActiveBadge = () => { const n = activeFlights().length; const b = $('#activeBadge'); if (b) b.textContent = n || ''; };
  window.renderActive = function () {
    const list = activeFlights();
    updateActiveBadge();
    $('#activeList').innerHTML = list.length ? list.map(f => {
      const s = getState(fid(f)), ph = PH[Math.min(s.phase, PH.length - 1)];
      const pct = Math.round(s.phase / (PH.length - 1) * 100);
      return `<div class="act-card" data-id="${esc(fid(f))}">
        <div class="ph" data-al="${esc(f.airline || '')}" data-type="${esc(f.type || '')}"></div>
        <div class="bd">
          <div class="top"><span class="lgo">${f.iata ? logoImg({ iata: f.iata, name: f.airlineName, icao: f.airline }) : ''}</span><span class="cs">${esc(f.callsign)}</span></div>
          <div class="rt"><b>${esc(f.origin)}</b><span class="line"><i data-icon="plane"></i></span><b>${esc(f.dest)}</b></div>
          <div class="muted small">${esc(f.originCity || '')} → ${esc(f.destCity || '')} · ${esc(f.typeName || f.type || '')} · salida ${zt(f.dep)}Z</div>
          <div class="prog"><div style="width:${pct}%"></div></div>
          <div class="ph-now">Etapa: <b>${esc(ph.name)}</b></div>
        </div></div>`;
    }).join('') : `<div class="empty-card card"><i data-icon="flight"></i><b>No tienes vuelos activos</b><span>Configura un vuelo en «Nuevo vuelo»: al guardarlo aparece aquí.</span><button class="btn primary" data-goto="wizard">Nuevo vuelo</button></div>`;
    applyIcons($('#activeList'));
    $$('#activeList [data-goto]').forEach(a => a.onclick = () => showView(a.dataset.goto));
    $$('#activeList .act-card').forEach(el => {
      const f = state.flights.find(x => fid(x) === el.dataset.id);
      el.onclick = () => openFlight(fid(f));
      el.oncontextmenu = e => { e.preventDefault(); showCtx(e.clientX, e.clientY, f); };
      const ph = el.querySelector('.ph');
      if (f.airline && f.type) lazyPhoto(ph, [{ al: f.airline, type: f.type }, { type: f.type }]); else lazyPhoto(ph, { type: f.type || 'A20N' });
    });
  };

  // ------------------------------------------------------------------ menú de clic derecho
  const ctx = $('#ctxMenu');
  function showCtx(x, y, f) {
    ctx.innerHTML = `<div class="h">${esc(f.callsign)} · ${esc(f.origin)} → ${esc(f.dest)}</div>
      <button data-a="open"><i data-icon="play"></i>Abrir vuelo</button>
      <button data-a="done"><i data-icon="check"></i>Marcar como completado</button>
      <button data-a="del" class="danger"><i data-icon="trash"></i>Eliminar vuelo</button>`;
    applyIcons(ctx);
    ctx.style.left = Math.min(x, innerWidth - 230) + 'px'; ctx.style.top = Math.min(y, innerHeight - 160) + 'px';
    ctx.classList.add('on');
    ctx.querySelector('[data-a=open]').onclick = () => { hideCtx(); openFlight(fid(f)); };
    ctx.querySelector('[data-a=done]').onclick = () => { hideCtx(); const s = getState(fid(f)); s.done = true; setState(fid(f), s); renderActive(); toast(`${f.callsign} completado: queda en el historial`); };
    ctx.querySelector('[data-a=del]').onclick = async () => {
      hideCtx();
      if (!confirm(`¿Eliminar el vuelo ${f.callsign} (${f.origin} → ${f.dest})? No se puede deshacer.`)) return;
      try {
        await api('/api/flights/delete', { id: fid(f) });
        const a = allState(); delete a[fid(f)]; LS.set('despacho.flightState', a);
        await loadFlights(); renderActive(); toast(`Vuelo ${f.callsign} eliminado`);
      } catch (e) { toast(e.message, true); }
    };
  }
  const hideCtx = () => ctx.classList.remove('on');
  addEventListener('click', hideCtx); addEventListener('scroll', hideCtx, true); addEventListener('keydown', e => e.key === 'Escape' && hideCtx());

  // ------------------------------------------------------------------ vuelo en curso
  let cur = null, side = 'dep', wx = {};
  const qnh = raw => { const m = (raw || '').match(/\sQ(\d{4})\b/); if (m) return 'QNH ' + +m[1]; const a = (raw || '').match(/\sA(\d{4})\b/); return a ? `${a[1].slice(0, 2)}.${a[1].slice(2)}` : 'QNH'; };
  function fill(t) {
    const f = cur.f;
    return String(t).replace(/\{(\w+)\}/g, (_, k) => ({
      fuel: f.fuel || 'CHECKED', qnhDep: qnh(wx.dep), qnhArr: qnh(wx.arr), rwy: f.origRwy || 'RWY', destRwy: f.destRwy || 'RWY',
      sid: f.sid || 'SID', star: f.star || 'STAR', fl: f.fl || '---', altn: f.altn || '',
    }[k] ?? ''));
  }
  window.openFlight = async function (id) {
    const f = state.flights.find(x => fid(x) === id); if (!f) return toast('Vuelo no encontrado', true);
    stopVoice();
    cur = { f, id, s: getState(id) };
    showView('flight');
    const hero = $('#flHero');
    hero.innerHTML = `<div class="hero-photo" id="flHeroImg"></div><div class="in">
      <a class="back" id="flBack"><i data-icon="back"></i>Vuelos activos</a>
      <div class="row"><span class="lgo">${f.iata ? logoImg({ iata: f.iata, name: f.airlineName, icao: f.airline }) : ''}</span><div><b class="cs">${esc(f.callsign)}</b><span class="muted">${esc(f.rtf || '')} · ${esc(f.typeName || f.type)}</span></div></div>
      <div class="route-big"><div><b>${esc(f.origin)}</b><span>${esc(f.originCity || '')} · RWY ${esc(f.origRwy || '—')}</span></div><div class="arrow"><i data-icon="plane"></i></div><div><b>${esc(f.dest)}</b><span>${esc(f.destCity || '')} · RWY ${esc(f.destRwy || '—')}</span></div></div>
      <div class="meta">Salida ${zt(f.dep)}Z · FL${esc(f.fl || '—')} · ALTN ${esc(f.altn || '—')}${f.fuel ? ' · Combustible ' + esc(f.fuel) : ''}${f.route ? ' · OFP SimBrief ✓' : ''}</div></div>`;
    applyIcons(hero);
    $('#flBack').onclick = () => { stopVoice(); showView('active'); };
    setPhoto($('#flHeroImg'), [{ al: f.airline, type: f.type }, { type: f.type }]);
    try { const m = await api(`/api/metar?ids=${f.origin},${f.dest}`); wx = { dep: m.find(x => x.icaoId === f.origin)?.rawOb, arr: m.find(x => x.icaoId === f.dest)?.rawOb }; } catch { wx = {}; }
    renderPhase();
  };
  function renderPhase() {
    const { s } = cur, i = Math.min(s.phase, PH.length - 1), ph = PH[i];
    $('#flPhases').innerHTML = PH.map((p, k) => {
      const done = (s.checks[p.id] || []).filter(Boolean).length === p.items.length;
      return `<li class="${k === i ? 'cur' : ''} ${done ? 'done' : ''}" data-k="${k}"><span>${done ? '✓' : k + 1}</span>${esc(p.name)}</li>`;
    }).join('');
    $$('#flPhases li').forEach(li => li.onclick = () => { stopVoice(); cur.s.phase = +li.dataset.k; save(); renderPhase(); });
    $('#flPhaseName').textContent = `${i + 1}. ${ph.name}`;
    $('#flTip').textContent = fill(ph.tip);
    $('#clTitle').textContent = ph.title + ' CHECKLIST';
    const checks = s.checks[ph.id] ||= [];
    $('#clItems').innerHTML = ph.items.map(([c, r], k) => `<li class="${checks[k] ? 'ok' : ''}" data-k="${k}"><span class="c">${esc(fill(c))}</span><span class="dots"></span><span class="r">${esc(fill(r))}</span><span class="tick">${checks[k] ? '✓' : ''}</span></li>`).join('');
    $$('#clItems li').forEach(li => li.onclick = () => { toggle(+li.dataset.k); });
    const last = i === PH.length - 1;
    $('#btnNextPhase').innerHTML = last ? `${icon('check')} Finalizar vuelo` : `Siguiente etapa ${icon('arrow')}`;
    if (side !== ph.side) { side = ph.side; }
    renderSide();
  }
  const save = () => setState(cur.id, cur.s);
  function toggle(k, val) {
    const ph = PH[cur.s.phase], c = cur.s.checks[ph.id] ||= [];
    c[k] = val ?? !c[k]; save();
    const li = $(`#clItems li[data-k="${k}"]`);
    if (li) { li.classList.toggle('ok', !!c[k]); li.querySelector('.tick').textContent = c[k] ? '✓' : ''; }
    const allDone = ph.items.every((_, j) => c[j]);
    $$('#flPhases li')[cur.s.phase]?.classList.toggle('done', allDone);
    return allDone;
  }
  function nextPhase() {
    if (cur.s.phase >= PH.length - 1) {
      cur.s.done = true; save(); stopVoice();
      toast(`Vuelo ${cur.f.callsign} completado. ¡Buen vuelo!`);
      showView('active'); return;
    }
    cur.s.phase++; save(); renderPhase();
  }
  $('#btnNextPhase').onclick = () => { stopVoice(); nextPhase(); };
  $('#btnAllChecked').onclick = () => { PH[cur.s.phase].items.forEach((_, k) => toggle(k, true)); };

  // ------------------------------------------------------------------ voz: lee el checklist y escucha "check"
  const synth = window.speechSynthesis;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VOICE_PREF = [/Google UK English Male/i, /Microsoft (Ryan|Guy|Thomas|George|Brian|Andrew).*(Natural|Online)/i, /Daniel/i, /Microsoft George/i, /Microsoft David/i, /en-GB/i, /en-US/i, /^en/i];
  function voices() { return synth ? synth.getVoices().filter(v => /^en/i.test(v.lang)) : []; }
  function fillVoices() {
    const vs = voices(), saved = LS.get('despacho.voice', '');
    const best = vs.find(v => v.name === saved) || VOICE_PREF.map(re => vs.find(v => re.test(v.name) || re.test(v.lang))).find(Boolean);
    $('#voiceSel').innerHTML = vs.map(v => `<option ${v === best ? 'selected' : ''}>${esc(v.name)}</option>`).join('') || '<option>Voz del sistema</option>';
  }
  if (synth) { fillVoices(); synth.onvoiceschanged = fillVoices; }
  $('#voiceSel').onchange = e => LS.set('despacho.voice', e.target.value);
  // pronunciación de cabina: siglas letra a letra, niveles y números dígito a dígito
  const SAY = { ADIRS: 'A-dirs', MCDU: 'M C D U', ECAM: 'ee-cam', TCAS: 'tee-cas', APU: 'A P U', ATC: 'A T C', ATIS: 'ay-tis', 'BARO REF': 'baro reference', 'V SPEEDS': 'V speeds', QNH: 'Q N H', FLEX: 'flex' };
  const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
  function speakable(t) {
    let s = ' ' + t + ' ';
    for (const [k, v] of Object.entries(SAY)) s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), v);
    s = s.replace(/FL(\d{3})/g, (_, n) => 'flight level ' + [...n].map(d => DIG[d]).join(' '));
    s = s.replace(/\b(\d{2})([LRC])\b/g, (_, n, l) => [...n].map(d => DIG[d]).join(' ') + ' ' + { L: 'left', R: 'right', C: 'center' }[l]);
    s = s.replace(/\b\d{3,4}\b/g, n => [...n].map(d => DIG[d]).join(' '));
    return s.toLowerCase().trim();
  }
  function say(text) {
    return new Promise(res => {
      if (!synth) return res();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      const v = voices().find(x => x.name === $('#voiceSel').value); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = 1.0; u.pitch = 0.85; u.volume = 1;
      u.onend = u.onerror = () => res();
      synth.speak(u);
      setTimeout(res, 9000);
    });
  }
  const beep = () => { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .09); } catch {} };
  // escucha una respuesta; true si se oye "check" (o la respuesta del ítem)
  function listen(expected, ms = 12000) {
    return new Promise(res => {
      if (!SR) return res(null);
      const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = true;
      const first = (expected || '').toLowerCase().split(/\s+/)[0];
      const ok = new RegExp(`\\b(check|checked|chek|checks|czech|cheque|set|on|off|completed?|confirmed?|advised|removed|closed|armed|disarmed|up|down|zero|full|received|programmed|okay|ok|yes|listo|hecho${first && first.length > 2 ? '|' + first.replace(/[^a-z]/g, '') : ''})\\b`, 'i');
      let doneFlag = false;
      const finish = v => { if (doneFlag) return; doneFlag = true; clearTimeout(t); try { r.stop(); } catch {} res(v); };
      r.onresult = e => { for (const x of e.results) for (const alt of x) if (ok.test(alt.transcript)) return finish(true); };
      r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Permite el micrófono para responder «check» por voz', true); finish(null); } };
      r.onend = () => { if (!doneFlag) { try { r.start(); } catch { finish(false); } } };
      const t = setTimeout(() => finish(false), ms);
      voiceRun.stopListen = () => finish(false);
      try { r.start(); } catch { finish(null); }
    });
  }
  const voiceRun = { on: false, stopListen: null };
  function setVoiceUi(state) {
    $('#voiceState').innerHTML = state === 'listen' ? '<span class="mic on"></span>Escuchando… di «check»' : state === 'speak' ? '<span class="mic"></span>Leyendo' : '';
    $('#btnVoice').innerHTML = voiceRun.on ? `${icon('stop')} Detener` : `${icon('mic')} Leer checklist por voz`;
  }
  function stopVoice() { voiceRun.on = false; try { synth?.cancel(); } catch {} voiceRun.stopListen?.(); setVoiceUi(''); $$('#clItems li').forEach(li => li.classList.remove('reading')); }
  async function runChecklist() {
    voiceRun.on = true; setVoiceUi('speak');
    const startPhase = cur.s.phase, ph = PH[startPhase];
    await say(`${ph.title} checklist`);
    for (let k = 0; k < ph.items.length && voiceRun.on; k++) {
      if ((cur.s.checks[ph.id] || [])[k]) continue;
      const [c, r] = ph.items[k];
      $$('#clItems li').forEach(li => li.classList.toggle('reading', +li.dataset.k === k));
      $(`#clItems li[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      let heard = false;
      for (let tries = 0; tries < 2 && voiceRun.on && !heard; tries++) {
        setVoiceUi('speak'); await say(fill(c));
        if (!voiceRun.on) break;
        if (!SR) { setVoiceUi('listen'); heard = await waitClick(k); break; }
        setVoiceUi('listen'); heard = await listen(fill(r));
        if (heard === null) { heard = await waitClick(k); break; }
      }
      if (!voiceRun.on) break;
      if (heard) { beep(); toggle(k, true); }
    }
    $$('#clItems li').forEach(li => li.classList.remove('reading'));
    if (voiceRun.on && cur.s.phase === startPhase && ph.items.every((_, j) => (cur.s.checks[ph.id] || [])[j])) {
      setVoiceUi('speak'); await say(`${ph.title} checklist completed`);
      voiceRun.on = false; setVoiceUi('');
      if ($('#autoNext').checked && cur.s.phase < PH.length - 1) { nextPhase(); toast(`Siguiente etapa: ${PH[cur.s.phase].name}`); }
    } else { voiceRun.on = false; setVoiceUi(''); }
  }
  // sin micrófono: confirma con clic en el ítem o con la barra espaciadora
  function waitClick(k) {
    return new Promise(res => {
      const done = v => { removeEventListener('keydown', kd); li?.removeEventListener('click', ck, true); voiceRun.stopListen = null; res(v); };
      const kd = e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); done(true); } };
      const li = $(`#clItems li[data-k="${k}"]`), ck = e => { e.stopPropagation(); done(true); };
      addEventListener('keydown', kd); li?.addEventListener('click', ck, true);
      voiceRun.stopListen = () => done(false);
    });
  }
  $('#btnVoice').onclick = () => { if (voiceRun.on) return stopVoice(); runChecklist(); };

  // ------------------------------------------------------------------ panel lateral: frecuencias, ATIS, METAR, cartas
  $$('#sideTabs button').forEach(b => b.onclick = () => { side = b.dataset.side; renderSide(); });
  async function renderSide() {
    const f = cur.f, icao = side === 'dep' ? f.origin : f.dest;
    $$('#sideTabs button').forEach(b => b.classList.toggle('on', b.dataset.side === side));
    $('#sideFreq').innerHTML = '<span class="spin"></span>';
    let atc = { positions: [], atis: [] };
    try { atc = await api('/api/atc/' + icao); } catch {}
    if (icao !== (side === 'dep' ? f.origin : f.dest)) return;
    $('#sideFreq').innerHTML = `<div class="fq-ap">${esc(icao)} <span class="muted">${esc(side === 'dep' ? f.originCity || '' : f.destCity || '')}</span></div>` + (atc.positions.length
      ? atc.positions.map(p => `<div class="fq"><b class="b ${p.facility}">${p.facility[0]}</b><span class="cs">${esc(p.callsign)}</span><span class="f">${esc(p.freq)}</span></div>`).join('')
      : '<div class="muted small">Sin ATC en línea · UNICOM 122.800</div>')
      + (atc.atis.length ? atc.atis.map(a => `<div class="fq"><b class="b ATIS">${esc(a.code || 'I')}</b><span class="cs">ATIS</span><span class="f">${esc(a.freq)}</span></div>`).join('') : '');
    const raw = side === 'dep' ? wx.dep : wx.arr;
    $('#sideAtis').innerHTML = (atc.atis.length
      ? atc.atis.map(a => `<div class="atis-h">ATIS ${a.code ? `información <b>${esc(a.code)}</b>` : ''} · ${esc(a.freq)}</div><div class="atis-t">${esc(a.text)}</div>`).join('')
      : '<div class="muted small">No hay ATIS en VATSIM ahora mismo.</div>')
      + `<div class="atis-h">METAR</div><div class="metar">${esc(raw || 'No disponible')}</div>`;
    let local = [];
    try { local = (await api('/api/airport/' + icao)).charts || []; } catch {}
    $('#sideCharts').innerHTML = (local.length ? local.map(c => `<a class="chart" target="_blank" rel="noopener" href="/charts/${c.split('/').map(encodeURIComponent).join('/')}"><i data-icon="doc"></i>${esc(c.split('/').pop())}</a>`).join('') : '')
      + `<a class="chart" target="_blank" rel="noopener" href="https://chartfox.org/${encodeURIComponent(icao)}"><i data-icon="doc"></i>Cartas de ${esc(icao)} en ChartFox</a>`
      + `<a class="chart" target="_blank" rel="noopener" href="https://skyvector.com/airport/${encodeURIComponent(icao)}"><i data-icon="pin"></i>${esc(icao)} en SkyVector</a>`;
    applyIcons($('#sideCharts'));
  }
})();
