#!/usr/bin/env node
// check-sky-art.js - Dibujos de constelaciones (sky/sky-art.js, data/sky/constellation-art.json): colocacion por tres estrellas, toque, texto.
'use strict';
const fs = require('fs'); const path = require('path');
const A = require('../sky/sky-art.js'); const S = require('../sky/sky.js'); const SP = require('../sky/sky-point.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = JSON.stringify(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? 'ok   ' : 'FALLA') + ' ' + name + (extra ? ' -> ' + extra : '')); };
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'constellation-art.json'), 'utf8'));
const cat = S.prepareCatalog(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'stars.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'constellations.json'), 'utf8')));

check('el fichero dice de donde viene y de quien son los dibujos (no estan copiados: se cargan de Stellarium en un commit fijo)', () => /Stellarium/.test(data.meta.source) && /^[0-9a-f]{40}$/.test(data.meta.commit) && /Johan Meuris/.test(data.meta.credit) && /Free Art License/.test(data.meta.license) && data.meta.images.includes(data.meta.commit) && Object.keys(data.art).length >= 80);
check('affine3: lleva los tres puntos a su sitio; alineados, null', () => {
    const M = A.affine3([[0, 0], [10, 0], [0, 10]], [[5, 5], [25, 5], [5, 35]]);
    const ap = (u, v) => [M[0] * u + M[2] * v + M[4], M[1] * u + M[3] * v + M[5]];
    const p = ap(10, 0); const q = ap(0, 10);
    return near(p[0], 25) && near(p[1], 5) && near(q[0], 5) && near(q[1], 35) && A.affine3([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 1], [2, 2]]) === null;
});
check('casi todas las estrellas de anclaje estan en nuestro catalogo (las que no, ese dibujo no se pone)', () => { const idx = A.hipIndex(cat); const miss = []; Object.entries(data.art).forEach(([k, v]) => v.anchors.forEach((a) => { if (!idx.has(a[2])) miss.push(k); })); return miss.length <= 2 ? true : miss; });
// cielo de Madrid una noche de noviembre: los dibujos colocados en la carta y al apuntar no salen volteados (se mira desde dentro de la esfera)
const sky = S.skyAt({ jd: 2461362.5 + 0.0, lat: 40.42, lon: -3.7, catalog: cat }); const st = sky.stars;
check('en la vista al apuntar (al sur, 40 grados) se colocan dibujos y ninguno sale volteado', () => {
    const fr = SP.frameFromAltAz(40, 180); const P = SP.projector(fr, 70, 400, 800);
    const pl = A.place(data, cat, (i) => { const p = P(st.alt[i], st.az[i]); return p ? [p[0], p[1]] : null; }, 400, 800);
    return pl.length >= 3 && pl.every((p) => !p.mirrored) ? true : pl.map((p) => p.iau + (p.mirrored ? '!' : ''));
});
check('en la carta del cenit (norte arriba, este a la izquierda) tampoco salen volteados', () => {
    const R = 300; const toXY = (alt, az) => { const r = (90 - alt) / 90 * R; return [320 - r * Math.sin(az * Math.PI / 180), 320 - r * Math.cos(az * Math.PI / 180)]; };
    const pl = A.place(data, cat, (i) => (st.alt[i] > -20 ? toXY(st.alt[i], st.az[i]) : null), 640, 640);
    return pl.length >= 15 && pl.every((p) => !p.mirrored) ? true : pl.filter((p) => p.mirrored).map((p) => p.iau);
});
check('hit: el toque dentro de un dibujo da su constelacion; fuera de todos, nada', () => {
    const pl = [{ iau: 'Ori', quad: [[0, 0], [100, 0], [100, 100], [0, 100]] }, { iau: 'Tau', quad: [[80, 0], [200, 0], [200, 100], [80, 100]] }];
    return A.hit(pl, 20, 50) === 'Ori' && A.hit(pl, 150, 50) === 'Tau' && A.hit(pl, 97, 50) === 'Tau' && A.hit(pl, 300, 300) === null;
});
check('pickSection: la seccion de historia o mitologia; si no la hay, la introduccion; cortada en un parrafo', () => {
    const t = 'Intro de la constelacion con bastante texto para que cuente como introduccion de verdad y no como nada.\n\n== Caracteristicas ==\nEstrellas brillantes y otras cosas que no son la historia del nombre en absoluto, de verdad.\n\n== Historia y mitologia ==\nLos griegos la llamaron asi por un cazador. ' + 'Mas texto. '.repeat(20) + '\n\n=== Subseccion ===\nOtra parte de la historia.\n\n== Enlaces ==\nnada';
    const a = A.pickSection(t, 2000); const b = A.pickSection('Solo intro, sin secciones, lo bastante larga para valer como texto.', 2000); const c = A.pickSection(t, 120);
    return a.section === 'Historia y mitologia' && /cazador/.test(a.text) && /Otra parte/.test(a.text) && !/Subseccion/.test(a.text) && !/Enlaces/.test(a.text) && b.section === null && /Solo intro/.test(b.text) && c.text.length < 140 && /…$/.test(c.text);
});
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('index.html: carga sky/sky-art.js, la capa se enciende y apaga (y se guarda), y el texto viene de Wikipedia con su enlace y licencia', () => /<script src="\.\/sky\/sky-art\.js"><\/script>/.test(html) && /\['art', 0, 'sky-t-art', 'btn-sky-art'\]/.test(html) && /out\.sa = p\.sa === 1/.test(html) && /wikipedia\.org\/w\/api\.php/.test(html) && /CC BY-SA/.test(html) && /Johan Meuris/.test(html));
if (fails) { console.log('\n' + fails + ' prueba(s) fallida(s)'); process.exit(1); }
console.log('\nDibujos de constelaciones: todo verde.');
