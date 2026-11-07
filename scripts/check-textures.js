#!/usr/bin/env node
/* check-textures.js - Integridad y procedencia de data/textures (regla 1: nada sin fuente).
 * Cada archivo del manifiesto existe, su sha256 coincide, las dimensiones son las declaradas, cada textura tiene credito, URL de origen
 * y pagina de origen https, y el perfil de los anillos es coherente (longitudes iguales, sin profundidades negativas, minimo de ocultaciones). */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.join(__dirname, '..'); const dir = path.join(root, 'data', 'textures');
let fails = 0;
function check(name, fn) { let ok = false, err = ''; try { ok = fn(); } catch (e) { err = ' (' + e.message + ')'; } console.log((ok ? '  ok  ' : '  XX  ') + name + (ok ? '' : err)); if (!ok) fails++; }
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
function jpegSize(f) {
    const b = fs.readFileSync(path.join(root, f)); let i = 2;
    while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1]; const len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + len;
    }
    throw new Error('sin SOF');
}
const all = man.items.concat([man.milkyway]);
for (const it of all) {
    const id = it.id;
    check(id + ': archivo, huella sha256 y tamano coinciden con el manifiesto', () => fs.existsSync(path.join(root, it.file)) && sha(it.file) === it.sha256 && fs.statSync(path.join(root, it.file)).size === it.bytes);
    check(id + ': dimensiones declaradas = reales', () => { const [w, h] = jpegSize(it.file); const ew = it.width || it.output.width; const eh = it.height || it.output.height; return w === ew && h === eh && w === 2 * h; });
    check(id + ': credito y fuente https declarados', () => Boolean(it.credit) && /^https:\/\//.test(it.sourceUrl) && /^https:\/\//.test(it.sourcePage));
}
check('todo cuerpo con textura declara como se tomo la longitud (diseno comun o giro)', () => man.items.every((it) => typeof it.lonLayout === 'string' && it.lonLayout.length > 10 && typeof it.note === 'string'));
check('lo que no tiene textura lo dice (Venus, Saturno, Urano, Neptuno)', () => ['Venus', 'Saturn', 'Uranus', 'Neptune'].every((k) => man.noTexture[k]));
const rg = JSON.parse(fs.readFileSync(path.join(root, man.rings.file), 'utf8'));
check('anillos: archivo y huella coinciden con el manifiesto', () => sha(man.rings.file) === man.rings.sha256);
check('anillos: longitudes de tau/count = n y paso coherente', () => rg.tau.length === rg.n && rg.count.length === rg.n && rg.stepKm > 0 && rg.r0Km > 60000);
check('anillos: ninguna profundidad negativa ni absurda; los huecos son null', () => rg.tau.every((v) => v === null || (v >= 0 && v < 20)));
check('anillos: cada valor se apoya en al menos 3 ocultaciones', () => rg.tau.every((v, i) => v === null || rg.count[i] >= 3));
check('anillos: la estructura conocida sale de los datos (Division de Cassini casi transparente, anillo B opaco)', () => {
    const at = (r) => rg.tau[Math.floor((r - rg.r0Km) / rg.stepKm)];
    return at(118500) < 0.3 && at(110000) > 1.0 && at(85000) < 0.4 && at(80000) !== null;
});
check('anillos: cita el DOI de los datos', () => /10\.17189\/1523014/.test(rg.source));
// Despliegue: lo que el cliente pide con ./data/<carpeta>/ tiene que copiarlo pages.yml (si no, funciona en local y da 404 en la web publicada: paso con las texturas)
check('despliegue: cada carpeta ./data/<x>/ que carga el cliente se copia en pages.yml y esta en sus disparadores', () => {
    const pages = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
    const files = ['index.html'].concat(['solar', 'sky', 'map'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f)));
    const used = new Set();
    for (const f of files) for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/['"`]\.\/data\/([a-z0-9_-]+)\//gi)) used.add(m[1]);
    const missing = [...used].filter((d) => !pages.includes('cp -r data/' + d + ' ') || !pages.includes("'data/" + d + "/**'"));
    if (missing.length) throw new Error('pages.yml no publica: ' + missing.join(', '));
    return used.has('textures') && used.has('sky');           // y la propia guarda ve las carpetas que debe ver
});
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nOK');
