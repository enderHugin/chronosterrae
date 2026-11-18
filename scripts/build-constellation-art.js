#!/usr/bin/env node
// build-constellation-art.js - Anclajes de los dibujos de constelaciones (Stellarium, cultura «western»).
//
//   node scripts/build-constellation-art.js --skycultures <clon de Stellarium/stellarium-skycultures> --commit <sha> --out data/sky
//
// Cada dibujo se coloca en el cielo por tres estrellas: el pixel (en el espacio de `size`) que corresponde a cada una (HIP). Solo se guardan esos
// anclajes y el nombre del fichero; las IMAGENES no se copian: la web las carga en ejecucion desde el repositorio de Stellarium, en ese mismo
// commit, con su atribucion (ilustraciones de Johan Meuris, Free Art License; datos de Stellarium, CC BY-SA: western/description.md).
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const args = process.argv.slice(2); const one = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const dir = one('skycultures'); const commit = one('commit'); const out = one('out');
if (!dir || !commit || !out || !/^[0-9a-f]{40}$/.test(commit)) { console.error('uso: --skycultures <dir> --commit <sha de 40> --out <dir>'); process.exit(2); }
const file = path.join(dir, 'western', 'index.json'); const raw = fs.readFileSync(file);
const idx = JSON.parse(raw);
const art = {};
for (const c of idx.constellations) {
    if (!c.iau || !c.image || !Array.isArray(c.image.anchors) || c.image.anchors.length < 3) continue;
    art[c.iau] = { file: c.image.file, size: c.image.size, anchors: c.image.anchors.slice(0, 3).map((a) => [a.pos[0], a.pos[1], a.hip]), meaning: c.common_name && c.common_name.english ? c.common_name.english : null };
}
const doc = {
    meta: {
        source: 'Stellarium, cultura del cielo «western» (github.com/Stellarium/stellarium-skycultures, western/index.json)',
        commit, sha256: crypto.createHash('sha256').update(raw).digest('hex'),
        license: 'Datos (anclajes, significado del nombre): CC BY-SA (Stellarium). Ilustraciones: Johan Meuris, Free Art License; no se copian aqui, se cargan en ejecucion.',
        credit: 'Ilustraciones de constelaciones: Johan Meuris (Free Art License), vía Stellarium',
        images: 'https://raw.githubusercontent.com/Stellarium/stellarium-skycultures/' + commit + '/western/',
        transformations: ['solo constelaciones con dibujo y sus tres primeros anclajes [x, y, HIP]', 'meaning = common_name.english']
    },
    art
};
fs.writeFileSync(path.join(out, 'constellation-art.json'), JSON.stringify(doc));
console.log(Object.keys(art).length, 'dibujos ->', path.join(out, 'constellation-art.json'), fs.statSync(path.join(out, 'constellation-art.json')).size, 'bytes');
