#!/usr/bin/env node
// Pruebas de map/borders-inner.js: solo se dibujan las fronteras compartidas, no los bordes que dan al mar.
'use strict';
const fs = require('fs'); const path = require('path');
const { innerBorders } = require('../map/borders-inner.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : '  XX  ') + name + (extra ? ' ' + extra : '')); if (!ok) fails++; };
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const feat = (key, ring) => ({ type: 'Feature', properties: { SUBJECTO: key }, geometry: { type: 'Polygon', coordinates: [ring] } });
const keyOf = (f) => f.properties.SUBJECTO;
const fc = (...f) => ({ type: 'FeatureCollection', features: f });
const lineLen = (r) => r.features.reduce((n, f) => n + f.geometry.coordinates.length - 1, 0);

check('dos paises que comparten un lado: ese lado se dibuja; los otros tres de cada uno (mar) no', () => {
    const r = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1, 0, 1))), keyOf);
    return r.stats.shared === 2 /* el lado comun, una vez desde cada pais */ && r.features.length === 2
        && r.features.every((f) => f.geometry.coordinates.every(([x]) => x === 1));
});
check('un pais aislado (una isla): no hay ninguna frontera que dibujar', () => innerBorders(fc(feat('A', sq(0, 0, 1))), keyOf).features.length === 0);
check('el borde entre dos poligonos del MISMO pais no es frontera', () => innerBorders(fc(feat('A', sq(0, 0, 1)), feat('A', sq(1, 0, 1))), keyOf).features.length === 0);
check('dos paises separados por un mar (un golfo de 30 km): ninguna linea, ni en un lado ni en el otro', () => {
    const r = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1.27, 0, 1))), keyOf);
    return r.features.length === 0 && r.stats.segments === 8;   // 8 tramos medidos: distingue "rechazado" de "no evaluado"
});
check('tramos consecutivos compartidos se unen en una sola linea', () => {
    const a = [[0, 0], [1, 0], [1, 0.5], [1, 1], [0, 1], [0, 0]];
    const r = innerBorders(fc(feat('A', a), feat('B', sq(1, 0, 1))), keyOf);
    return r.features.some((f) => f.geometry.coordinates.length >= 3);
});
check('tolerancia: un vecino a 1 km (dentro de 1,5 km) cuenta; a 3 km no', () => {
    const near = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1.009, 0, 1))), keyOf);
    const far = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1.03, 0, 1))), keyOf);
    return near.stats.shared > 0 && far.stats.shared === 0;
});

// Datos reales (Natural Earth, en el repositorio)
const ne = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'borders', 'ne-10m-countries.json'), 'utf8'));
const neKey = (f) => f.properties.SUBJECTO || f.properties.NAME;
const real = innerBorders(ne, neKey);
check('Natural Earth: entre el 15 y el 40 % de los tramos son frontera compartida; el resto, costa', () => {
    const r = real.stats.shared / real.stats.segments; return r > 0.15 && r < 0.4 ? true : 'proporcion ' + r.toFixed(3);
});
check('cada linea lleva la clave del pais al que pertenece su anillo (para resaltar solo SUS fronteras terrestres)', () => {
    const out = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1, 0, 1)), feat('C', sq(5, 5, 1))), keyOf);
    const keys = out.features.map((f) => f.properties.key).sort();
    return keys.join() === 'A,B' && out.features.every((f) => typeof f.properties.key === 'string') && !keys.includes('C');
});
check('rechazo vs roto: el pais C (isla) no tiene lineas que resaltar, y A y B si', () => {
    const out = innerBorders(fc(feat('A', sq(0, 0, 1)), feat('B', sq(1, 0, 1)), feat('C', sq(5, 5, 1))), keyOf);
    return out.features.filter((f) => f.properties.key === 'C').length === 0 && out.features.filter((f) => f.properties.key === 'A').length === 1;
});
const near = (lng, lat, km) => real.features.some((f) => f.geometry.coordinates.some(([x, y]) => Math.hypot((x - lng) * Math.cos(lat * Math.PI / 180), y - lat) * 111.2 < km));
check('Natural Earth: la frontera Espana-Portugal esta; la costa de Islandia no tiene ninguna linea', () => near(-7.0, 41.9, 8) && !near(-19, 64.9, 60));
check('Natural Earth: la frontera Guatemala-El Salvador esta y sin lineas en el mar frente a ella', () => near(-89.9, 14.0, 25) && !near(-90.7, 13.2, 20));
console.log(fails ? '\nHay fallos.' : '\nBordes (solo fronteras compartidas): todo verde.');
process.exitCode = fails ? 1 : 0;
