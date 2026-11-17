// Publica la web en GitHub Pages con un número de versión nuevo, para que los navegadores
// descarguen siempre el código actualizado (sin esto, GitHub Pages deja 10 min la versión vieja en caché).
// Uso: node tools/publicar.js "mensaje del cambio"
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT }).toString().trim();

run(process.execPath, [path.join(__dirname, 'build-static.js')]);

const v = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // AAAAMMDDhhmm
const idx = path.join(ROOT, 'public', 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(/(<meta name="app-version" content=")[^"]*(")/, `$1${v}$2`).replace(/\?v=[\w.]+/g, `?v=${v}`);
fs.writeFileSync(idx, html);

// nunca publicar claves: config.json está en .gitignore, y además se comprueba el contenido
run('git', ['add', '-A']);
const diff = execFileSync('git', ['diff', '--cached', '--', '.', ':!public/data', ':!data'], { cwd: ROOT, maxBuffer: 64e6 }).toString();
if (/AQ\.Ab8|sk-[0-9a-f]{20,}|AIza[0-9A-Za-z_-]{35}/.test(diff)) { console.error('Hay algo que parece una clave en los cambios: no publico.'); process.exit(1); }
const msg = (process.argv[2] || 'Actualización de la web') + `\n\nVersión ${v}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
const id = ['-c', 'user.name=cfartaesmario-a11y', '-c', 'user.email=326946324+cfartaesmario-a11y@users.noreply.github.com'];
try { run('git', [...id, 'commit', '-q', '-m', msg]); } catch { console.log('Sin cambios nuevos que guardar.'); }
for (const remote of out('git', ['remote']).split(/\s+/)) run('git', ['push', '-q', remote, 'main']);
try { run('git', ['branch', '-D', '-q', 'gh-pages']); } catch {}
execFileSync('git', ['subtree', 'split', '--prefix', 'public', '-b', 'gh-pages'], { cwd: ROOT, stdio: 'ignore' });
run('git', ['push', '-q', '-f', 'publico', 'gh-pages']);
console.log(`Publicado: versión ${v} → https://cfartaesmario-a11y.github.io/despacho-vatsim-msfs/`);
