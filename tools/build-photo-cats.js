// Genera data/photo-cats.json: para cada aerolínea × tipo de avión, la categoría de Wikimedia Commons
// que contiene fotos de ESE avión con ESA librea (p. ej. "Airbus A320neo of Iberia").
// Uso: node --use-system-ca tools/build-photo-cats.js
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, '..', 'data');
const fleets = JSON.parse(fs.readFileSync(path.join(DATA, 'fleets.json'), 'utf8'));
const aircraft = JSON.parse(fs.readFileSync(path.join(DATA, 'aircraft.json'), 'utf8'));
const UA = 'DespachoVATSIM/2.0 (uso personal; herramienta local)';

// Nombres que Commons usa para cada aerolínea cuando difieren de los nuestros
const ALIAS = {
  'SWISS': ['Swiss International Air Lines', 'Swiss'], 'SAS Scandinavian': ['Scandinavian Airlines', 'SAS'],
  'Norwegian': ['Norwegian Air Shuttle', 'Norwegian Air Sweden', 'Norwegian Air International'],
  'easyJet': ['EasyJet', 'EasyJet UK', 'easyJet'], 'easyJet Europe': ['EasyJet Europe'], 'easyJet Switzerland': ['EasyJet Switzerland'],
  'Jet2': ['Jet2.com', 'Jet2'], 'KLM': ['KLM', 'KLM Royal Dutch Airlines'], 'Pegasus': ['Pegasus Airlines'],
  'Binter': ['Binter Canarias', 'Binter'], 'TAP Air Portugal': ['TAP Air Portugal', 'TAP Portugal'], 'Edelweiss': ['Edelweiss Air'],
  'airBaltic': ['AirBaltic', 'Air Baltic'], 'STARLUX': ['Starlux Airlines', 'STARLUX Airlines'], 'French bee': ['French Bee', 'French bee'],
  'Corsair': ['Corsair International', 'Corsair'], 'Condor': ['Condor (airline)', 'Condor Flugdienst', 'Condor'],
  'Transavia': ['Transavia', 'Transavia Airlines'], 'Transavia France': ['Transavia France'], 'Wizz Air UK': ['Wizz Air UK', 'Wizz Air'],
  'LOT Polish Airlines': ['LOT Polish Airlines', 'LOT'], 'TUI fly Deutschland': ['TUI fly Deutschland', 'TUIfly'],
  'Discover Airlines': ['Discover Airlines', 'Eurowings Discover'], 'Air Europa': ['Air Europa'], 'Saudia': ['Saudia', 'Saudi Arabian Airlines'],
  'EgyptAir': ['EgyptAir', 'Egyptair'], 'El Al': ['El Al', 'El Al Israel Airlines'], 'Aeroméxico': ['Aeroméxico', 'Aeromexico'],
  'LATAM Airlines': ['LATAM Airlines Brasil', 'LATAM Airlines Chile', 'LATAM Airlines', 'LATAM Airlines Peru'], 'Avianca': ['Avianca'],
  'Czech Airlines': ['Czech Airlines', 'ČSA Czech Airlines'], 'Royal Air Maroc': ['Royal Air Maroc'], 'Air Algérie': ['Air Algérie'],
  'Virgin Atlantic': ['Virgin Atlantic', 'Virgin Atlantic Airways'], 'Smartwings': ['Smartwings', 'SmartWings'],
  'Vueling': ['Vueling', 'Vueling Airlines'], 'JetBlue': ['JetBlue', 'JetBlue Airways'], 'Thai Airways': ['Thai Airways', 'Thai Airways International'],
  'Air Canada': ['Air Canada'], 'Air Transat': ['Air Transat'], 'Iberia Express': ['Iberia Express'], 'Air Nostrum': ['Air Nostrum', 'Iberia Regional Air Nostrum'],
  'Olympic Air': ['Olympic Air'], 'Luxair': ['Luxair'], 'TAROM': ['TAROM', 'Tarom'], 'Air France': ['Air France'], 'SAS Scandinavian': ['Scandinavian Airlines', 'SAS', 'SAS Scandinavian Airlines', 'SAS Connect', 'SAS Link'],
};
// Nombres de tipo que Commons usa en "<tipo> of <aerolínea>"
const TYPE = {
  A20N: ['Airbus A320neo'], A21N: ['Airbus A321neo', 'Airbus A321LR', 'Airbus A321XLR'], A320: ['Airbus A320', 'Airbus A320-200'],
  A321: ['Airbus A321', 'Airbus A321-200'], A319: ['Airbus A319', 'Airbus A319-100'], A359: ['Airbus A350-900', 'Airbus A350'],
  A35K: ['Airbus A350-1000'], A339: ['Airbus A330-900', 'Airbus A330neo'], A333: ['Airbus A330-300'], A332: ['Airbus A330-200'],
  A388: ['Airbus A380', 'Airbus A380-800'], BCS3: ['Airbus A220-300', 'Airbus A220', 'Bombardier CS300'], B738: ['Boeing 737-800'],
  B38M: ['Boeing 737 MAX 8', 'Boeing 737 MAX'], B789: ['Boeing 787-9'], B78X: ['Boeing 787-10'], B77W: ['Boeing 777-300ER'],
  E190: ['Embraer 190', 'Embraer E190'], E195: ['Embraer 195', 'Embraer E195'], AT76: ['ATR 72-600', 'ATR 72'],
  DH8D: ['De Havilland Canada Dash 8-400', 'Bombardier Dash 8 Q400', 'Bombardier Q400'], CRJ9: ['Bombardier CRJ900', 'Bombardier CRJ-900'],
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sizes(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const body = new URLSearchParams({ action: 'query', format: 'json', prop: 'categoryinfo', titles: chunk.join('|') });
    for (let tries = 0; tries < 5; tries++) {
      const r = await fetch('https://commons.wikimedia.org/w/api.php', { method: 'POST', body, headers: { 'User-Agent': UA } });
      const t = await r.text();
      if (t.startsWith('{')) { for (const p of Object.values(JSON.parse(t).query.pages)) out[p.title] = p.categoryinfo?.size || 0; break; }
      console.error('reintento', tries); await sleep(5000 * (tries + 1));
    }
    await sleep(2500);
  }
  return out;
}
(async () => {
  const want = [];
  for (const f of fleets) for (const code of f.fleet) {
    if (!TYPE[code]) continue;
    for (const n of ALIAS[f.name] || [f.name]) for (const t of TYPE[code]) want.push({ key: f.icao + '|' + code, cat: `Category:${t} of ${n}` });
  }
  const s = await sizes([...new Set(want.map(w => w.cat))]);
  const map = {};
  for (const w of want) if (!map[w.key] && s[w.cat] > 0) map[w.key] = w.cat.slice(9);
  fs.writeFileSync(path.join(DATA, 'photo-cats.json'), JSON.stringify(map, null, 1));
  const total = new Set(want.map(w => w.key)).size;
  console.log(`Categorías encontradas: ${Object.keys(map).length}/${total}`);
  console.log('Sin categoría:', [...new Set(want.map(w => w.key))].filter(k => !map[k]).join(' '));
})();
