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
// cielo de Madrid una noche de noviembre
const sky = S.skyAt({ jd: 2461362.5 + 0.0, lat: 40.42, lon: -3.7, catalog: cat }); const st = sky.stars;
const vec = (i) => SP.altAzVec(st.alt[i], st.az[i]);
check('pegado a la esfera: las tres estrellas de anclaje caen exactamente en su sitio de la imagen', () => {
    const idx = A.hipIndex(cat); const a = data.art.Ori; const ds = a.anchors.map((x) => vec(idx.get(x[2])));
    const L = A.sphereMap(a.anchors.map((x) => [x[0], x[1]]), ds);
    return a.anchors.every((x, k) => { const d = A.dirAt(L, x[0], x[1]); return Math.abs(d[0] - ds[k][0]) < 1e-9 && Math.abs(d[1] - ds[k][1]) < 1e-9 && Math.abs(d[2] - ds[k][2]) < 1e-9; });
});
check('pegado a la esfera: girar el cielo gira el dibujo igual (no cambia de forma respecto a las estrellas al mirarlo desde otro angulo)', () => {
    const idx = A.hipIndex(cat); const a = data.art.Ori; const ds = a.anchors.map((x) => vec(idx.get(x[2])));
    const th = 0.7, ph = -0.4; const R = (v) => { const x = v[0] * Math.cos(th) - v[1] * Math.sin(th); const y = v[0] * Math.sin(th) + v[1] * Math.cos(th); return [x, y * Math.cos(ph) - v[2] * Math.sin(ph), y * Math.sin(ph) + v[2] * Math.cos(ph)]; };
    const L1 = A.sphereMap(a.anchors.map((x) => [x[0], x[1]]), ds); const L2 = A.sphereMap(a.anchors.map((x) => [x[0], x[1]]), ds.map(R));
    for (const [u, v] of [[0, 0], [256, 256], [512, 100], [40, 480]]) { const p = R(A.dirAt(L1, u, v)); const q = A.dirAt(L2, u, v); if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9) return [u, v]; }
    return true;
});
check('al apuntar (al sur, 40 grados) y en perspectiva: mallas en pantalla para varios dibujos, con las estrellas de anclaje bajo sus puntos', () => {
    const fr = SP.frameFromAltAz(40, 180); const P = SP.projector(fr, 70, 400, 800);
    const pl = A.place(data, cat, vec, P.vec, 400, 800, 4); const idx = A.hipIndex(cat);
    const ori = pl.find((p) => p.iau === 'Ori'); if (pl.length < 3 || !ori) return pl.map((p) => p.iau);
    const a = data.art.Ori; const tri = A.triangles(ori);
    return tri.length >= 16 && a.anchors.every((x) => { const d = A.dirAt(ori.L, x[0], x[1]); const s = P.vec(d); const t = P.vec(vec(idx.get(x[2]))); return Math.hypot(s[0] - t[0], s[1] - t[1]) < 1e-6; });
});
check('en la carta del cenit tambien se colocan (los que tocan la carta)', () => {
    const R = 300; const toXY = (v) => { const alt = Math.asin(v[2]) * 180 / Math.PI; if (alt < -25) return null; const az = Math.atan2(v[0], v[1]); const r = (90 - alt) / 90 * R; return [320 - r * Math.sin(az), 320 - r * Math.cos(az)]; };
    const pl = A.place(data, cat, vec, toXY, 640, 640); return pl.length >= 15 ? true : pl.length;
});
check('hit: el toque dentro de un dibujo da su constelacion; fuera de todos, nada', () => {
    const mesh = (iau, x0, x1) => ({ iau, w: 10, h: 10, g: 1, pts: [[x0, 0], [x1, 0], [x0, 100], [x1, 100]] });
    const pl = [mesh('Ori', 0, 100), mesh('Tau', 80, 200)];
    return A.hit(pl, 20, 50) === 'Ori' && A.hit(pl, 150, 50) === 'Tau' && A.hit(pl, 97, 50) === 'Tau' && A.hit(pl, 300, 300) === null;
});
check('pickSection: la seccion de historia o mitologia; si no la hay, la introduccion; cortada en un parrafo', () => {
    const t = 'Intro de la constelacion con bastante texto para que cuente como introduccion de verdad y no como nada.\n\n== Caracteristicas ==\nEstrellas brillantes y otras cosas que no son la historia del nombre en absoluto, de verdad.\n\n== Historia y mitologia ==\nLos griegos la llamaron asi por un cazador. ' + 'Mas texto. '.repeat(20) + '\n\n=== Subseccion ===\nOtra parte de la historia.\n\n== Enlaces ==\nnada';
    const a = A.pickSection(t, 2000); const b = A.pickSection('Solo intro, sin secciones, lo bastante larga para valer como texto.', 2000); const c = A.pickSection(t, 120);
    return a.section === 'Historia y mitologia' && /cazador/.test(a.text) && /Otra parte/.test(a.text) && !/Subseccion/.test(a.text) && !/Enlaces/.test(a.text) && b.section === null && /Solo intro/.test(b.text) && c.text.length < 140 && /…$/.test(c.text);
});
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('index.html: carga sky/sky-art.js, la capa se enciende y apaga (y se guarda), y el texto viene de Wikipedia con su enlace y licencia', () => /<script src="\.\/sky\/sky-art\.js"><\/script>/.test(html) && /\['art', 0, 'sky-t-art', 'btn-sky-art'\]/.test(html) && /out\.sa = p\.sa === 1/.test(html) && /wikipedia\.org\/w\/api\.php/.test(html) && /CC BY-SA/.test(html) && /Johan Meuris/.test(html));
// «Que se vean menos y algo más contrastadas» (el creador, 2026-11-26)
const fig = () => {        // una figura como las de Stellarium: gris 98 sobre negro, con una sombra (56) y un trazo negro dentro
    const w = 128; const h = 128; const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0; if (x >= 16 && x < 112 && y >= 16 && y < 112) v = 98; if (x >= 80 && x < 104 && y >= 24 && y < 104) v = 56; if (x >= 60 && x <= 62 && y >= 24 && y < 104) v = 0;
        const i = 4 * (y * w + x); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    return { d, w, h, at: (x, y) => d[4 * (y * w + x)] };
};
check('tono: el negro sigue negro, el trazo sigue negro y el alfa no se toca', () => {
    const f = fig(); A.toneImage(f.d, f.w, f.h); return f.at(2, 2) === 0 && f.at(61, 64) === 0 && f.d[3] === 255 && f.d[4 * (64 * 128 + 61) + 3] === 255;
});
check('tono: junto al trazo el relleno queda mas claro que en mitad del relleno (el trazo resalta)', () => {
    const f = fig(); A.toneImage(f.d, f.w, f.h); return f.at(58, 64) > f.at(36, 64) + 15 && f.at(65, 64) > f.at(36, 64) + 15;
});
check('tono: se ven menos (en mitad del relleno y la sombra suman al cielo menos que antes, al 25 %) y la diferencia relleno/sombra crece', () => {
    const f = fig(); A.toneImage(f.d, f.w, f.h); const fill = f.at(36, 64) * A.ALPHA; const shade = f.at(92, 64) * A.ALPHA;
    return fill < 98 * 0.25 * 0.75 && shade < 56 * 0.25 * 0.6 && fill / Math.max(shade, 0.5) > 98 / 56;
});
check('tono: una sola opacidad (ALPHA; al apuntar con el movil, algo mas) y en todos los sitios solo el dibujo del centro (focus)', () => {
    const sv = fs.readFileSync(path.join(__dirname, '..', 'sky', 'sky-view.js'), 'utf8'); const sp = fs.readFileSync(path.join(__dirname, '..', 'sky', 'sky-point.js'), 'utf8');
    return /artLib\.draw\(ctx, placed, opts\.artImg, opts\.artLib\.focus\(placed, css \/ 2, css \/ 2, css\), opts\.artOff\); drawn\.art = placed;/.test(sv)
        && /artLib\.focus\(placed, w \/ 2, h \/ 2, Math\.min\(w, h\), opts\.artLib\.ALPHA \* 1\.12\), opts\.artOff\); drawn\.art = placed;/.test(sp)
        && (html.match(/ChronosSkyArt\.draw\([^;]*ChronosSkyArt\.focus\([^;]*w \/ 2, h \/ 2, Math\.min\(w, h\)\)/g) || []).length === 2 && !/ChronosSkyArt\.draw\([^;]*0\.2\d/.test(html) && /ChronosSkyArt\.toneImage\(/.test(html);
});
// «Que a medida que se aproxima al centro se vaya viendo la constelación central, y las demás desaparezcan» (2026-11-26, 3:20)
const at = (iau, x, y) => ({ iau, w: 10, h: 10, g: 1, pts: [[x - 20, y - 20], [x + 20, y - 20], [x - 20, y + 20], [x + 20, y + 20]] });
check('focus: solo el del centro de la pantalla se ve entero; el resto, apagado', () => {
    const P = [at('Ori', 410, 300), at('Tau', 250, 250), at('Gem', 600, 120), at('CMa', 380, 520)];
    const a = A.focus(P, 400, 300, 600);
    return near(a[0], A.ALPHA, 1e-12) && a.slice(1).every((x) => x === 0) && P[0].wt === 1 && P[1].wt === 0;
});
check('focus: se va viendo a medida que se acerca al centro (sin saltos), y lejos no se ve ninguno', () => {
    const ws = [400, 330, 280, 230, 180, 120, 80, 40, 0].map((dx) => A.focus([at('Ori', 400 + dx, 300)], 400, 300, 600)[0] / A.ALPHA);
    return ws[0] === 0 && ws[ws.length - 1] === 1 && ws.every((w, k) => k === 0 || w >= ws[k - 1]) && ws.some((w) => w > 0.1 && w < 0.9);
});
check('focus: al cruzarse dos casi igual de cerca, se reparten sin saltos; el apagado no responde al toque', () => {
    const P = [at('Ori', 430, 300), at('Tau', 368, 300)]; const a = A.focus(P, 400, 300, 600);
    const Q = [at('Ori', 470, 300), at('Tau', 300, 300)]; A.focus(Q, 400, 300, 600);
    return a[0] > 0 && a[1] > 0 && Q[0].wt > 0.5 && Q[1].wt < 0.25 && A.hit(Q, 300, 300) === null && A.hit(Q, 470, 300) === 'Ori';
});
if (fails) { console.log('\n' + fails + ' prueba(s) fallida(s)'); process.exit(1); }
console.log('\nDibujos de constelaciones: todo verde.');
