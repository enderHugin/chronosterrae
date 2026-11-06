#!/usr/bin/env node
// Pruebas de map/labels.js: donde se pone el nombre de cada estado. Sin red.
'use strict';
const L = require('../map/labels.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const inside = (p, rings) => { const xs = []; for (const r of rings) for (let i = 0; i < r.length - 1; i++) { const y0 = r[i][1]; const y1 = r[i + 1][1]; if ((y0 > p[1]) !== (y1 > p[1])) xs.push(r[i][0] + (p[1] - y0) * (r[i + 1][0] - r[i][0]) / (y1 - y0)); } xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) if (p[0] >= xs[i] && p[0] <= xs[i + 1]) return true; return false; };
// «C»: cuadrado de 10 con una muesca que entra desde la derecha y deja el centroide en el hueco
const C = [[[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10], [0, 0]]];
const donut = [sq(0, 0, 10), sq(3, 3, 4).reverse()];
const poly = (name, rings, extra = {}) => ({ type: 'Feature', properties: { NAME: name, ...extra }, geometry: { type: 'Polygon', coordinates: rings } });

check('cuadrado: el punto es el centro', () => { const p = L.labelPoint([sq(0, 0, 10)]); return Math.abs(p[0] - 5) < 1e-9 && Math.abs(p[1] - 5) < 1e-9 ? true : p; });
check('forma de C: el centroide cae en el hueco, el punto del rotulo cae DENTRO del poligono', () => {
    const cx = (() => { let a = 0, x = 0, y = 0; const r = C[0]; for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; x += (r[i][0] + r[i + 1][0]) * f; y += (r[i][1] + r[i + 1][1]) * f; } return [x / (3 * a), y / (3 * a)]; })();
    const p = L.labelPoint(C); return !inside(cx, C) && inside(p, C) ? true : JSON.stringify({ cx, p });
});
check('anillo con agujero (donut): el punto no cae en el agujero', () => { const p = L.labelPoint(donut); return inside(p, donut) ? true : p; });
check('poligono degenerado, vacio o sin anillo -> null (no se inventa un punto)', () => L.labelPoint([[[0, 0], [1, 1], [0, 0]]]) === null && L.labelPoint([]) === null && L.labelPoint(null) === null && L.labelPoint([[[0, 0], [1, 0], [2, 0], [0, 0]]]) === null);

const fc = { type: 'FeatureCollection', features: [
    poly('Grande', [sq(0, 0, 10)], { SUBJECTO: 'Imperio' }), poly('Colonia', [sq(40, 0, 2)], { SUBJECTO: 'Imperio' }), poly('Pequeño', [sq(20, 0, 1)]), poly('En C', C.map((r) => r.map(([x, y]) => [x + 60, y]))),
    { type: 'Feature', properties: { NAME: null }, geometry: { type: 'Polygon', coordinates: [sq(80, 0, 10)] } }, { type: 'Feature', properties: { NAME: 'Sin geometria' }, geometry: null }
] };
const key = (f) => f.properties.SUBJECTO || f.properties.NAME;
const out = L.polityLabels(fc, key);
check('rotulos: uno por estado (la colonia y la metropoli del mismo SUBJECTO comparten rotulo), ordenados del mayor al menor', () => out.map((o) => o.key).join() === 'Imperio,En C,Pequeño' ? true : out.map((o) => o.key).join());
check('el rotulo del estado con varias partes va en su parte MAYOR, no en la colonia', () => { const o = out.find((x) => x.key === 'Imperio'); return o.lng > 0 && o.lng < 10 ? true : JSON.stringify(o); });
check('el rotulo de la C cae dentro del poligono desplazado', () => { const o = out.find((x) => x.key === 'En C'); return inside([o.lng, o.lat], C.map((r) => r.map(([x, y]) => [x + 60, y]))) ? true : JSON.stringify(o); });
check('la tierra sin nombre y la geometria nula no se rotulan', () => !out.some((o) => o.key === 'Sin geometria' || o.key === null));
check('superficie y anchura: 10x10 grados en el ecuador ≈ 1,24 millones de km² y ≈ 1112 km de ancho; la suma incluye la colonia', () => { const o = out.find((x) => x.key === 'Imperio'); return o.areaKm2 > 1.2e6 && o.widthKm > 1100 && o.widthKm < 1125 && o.areaKm2 > 1.2364e6 + 40000 ? true : JSON.stringify(o); });
check('el texto puede venir de otra funcion (p. ej. el nombre en el idioma de la interfaz)', () => L.polityLabels(fc, key, (f) => 'X-' + f.properties.NAME).find((o) => o.key === 'En C').text === 'X-En C');
check('RECHAZOS: coleccion no valida -> BAD_COLLECTION; sin funcion de clave -> BAD_KEY', () => rejects(() => L.polityLabels(null, key), 'BAD_COLLECTION') === true && rejects(() => L.polityLabels({}, key), 'BAD_COLLECTION') === true && rejects(() => L.polityLabels(fc), 'BAD_KEY') === true);
console.log(fails ? '\n' + fails + ' fallo(s)' : '\ntodo bien');
process.exit(fails ? 1 : 0);
