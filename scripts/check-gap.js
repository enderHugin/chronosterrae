#!/usr/bin/env node
// Pruebas de map/borders-gap.js sin red ni navegador.
'use strict';
const G = require('../map/borders-gap.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : '  XX  ') + name + (extra ? ' ' + extra : '')); if (!ok) fails++; };

// Cuadrado de lado s grados con esquina inferior izquierda (x,y)
const sq = (x, y, s) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const bbox = [-1, -1, 4, 2];   // ~ 550 km de ancho en el ecuador
const at = (res, lng, lat) => { const g = res.grid; const c = Math.floor((G.mercX(lng) - g.x0) * g.scale); const r = Math.floor((G.mercY(lat) - g.y0) * g.scale); return res.cls[r * g.cols + c]; };

check('un pais solo: la franja de tierra cercana se le atribuye; lo lejano, no', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }], bbox, { distM: 40000 });
    return at(res, 0.5, 0.5) === 0 /* dentro: no es hueco */ && at(res, 1.15, 0.5) === 1 /* a ~17 km */ && at(res, 2.5, 0.5) === 0 /* a >150 km */;
});
check('dos paises que se juntan: la franja entre ambos queda no resuelta (255), no se reparte', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.2, 0, 1)] }], bbox, { distM: 40000, resolve: 'clear' });
    return at(res, 1.1, 0.5) === 255 && at(res, 1.05, 0.5) === 255;
});
check('dos paises lejanos: cada uno rellena solo su lado', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 0.5)] }, { key: 'B', polys: [sq(3, 0, 0.5)] }], bbox, { distM: 40000 });
    return at(res, 0.6, 0.25) === 1 && at(res, 2.9, 0.25) === 2 && at(res, 1.75, 0.25) === 0;
});
check('golfo: un pais al otro lado del mar (mucho mas lejos) NO vuelve ambigua una costa claramente de otro', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.3, 0, 1)] }], bbox, { distM: 40000, resolve: 'clear' });
    return at(res, 1.03, 0.5) === 1 /* ~3 km de A, ~30 km de B */ && at(res, 1.27, 0.5) === 2 && at(res, 1.15, 0.5) === 255 /* a mitad */;
});
check('por defecto (nearest): ninguna celda queda sin color ni rayada; entre dos paises manda el mas cercano', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.2, 0, 1)] }], bbox, { distM: 40000 });
    let n255 = 0; for (const c of res.cls) if (c === 255) n255++;
    return n255 === 0 && at(res, 1.05, 0.5) === 1 && at(res, 1.15, 0.5) === 2;
});
check('nearest: la franja de un solo pais llega hasta el tope de distancia, no mas', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 0.5)] }], bbox, { distM: 100000 });
    return at(res, 0.5 + 0.7, 0.25) === 1 /* ~78 km */ && at(res, 0.5 + 1.2, 0.25) === 0 /* ~133 km */;
});
check('un hueco (lago o enclave sin dibujar) dentro de un poligono no se rellena: no es franja de costa', () => {
    const donut = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]], [[0.8, 0.8], [1.2, 0.8], [1.2, 1.2], [0.8, 1.2], [0.8, 0.8]]];
    const res = G.classify([{ key: 'A', polys: [donut] }], [-1, -1, 3, 3], { distM: 40000 });
    return at(res, 1, 1) === 0 && at(res, 0.3, 0.3) === 0 && at(res, 2.1, 1) === 1;
});
check('mismo pais en dos poligonos (colonias): no hay ambiguedad entre ellos', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1), sq(1.2, 0, 1)] }], bbox, { distM: 40000 });
    return at(res, 1.1, 0.5) === 1;
});
check('las celdas dentro de cualquier poligono quedan intactas', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.2, 0, 1)] }], bbox, { distM: 40000 });
    return at(res, 0.5, 0.5) === 0 && at(res, 1.7, 0.5) === 0;
});
check('la rejilla cubre el bbox mas el margen y respeta el tope de celdas', () => {
    const g = G.makeGrid(bbox, 40000, 640);
    return Math.max(g.cols, g.rows) <= 641 && g.corners[0][0] < bbox[0] && g.corners[1][0] > bbox[2] && g.corners[0][1] > bbox[3] && g.corners[3][1] < bbox[1];
});
check('geometria: la distancia chamfer a un punto es cercana a la euclidea (error < 8 %)', () => {
    const cols = 41; const rows = 41; const m = new Uint8Array(cols * rows); m[20 * cols + 20] = 1;
    const d = G.distance(m, cols, rows, 100);
    const e = Math.hypot(15, 10); return Math.abs(d[30 * cols + 35] - e) / e < 0.08;
});
console.log(fails ? '\nHay fallos.' : '\nBordes (relleno de franjas): todo verde.');
process.exitCode = fails ? 1 : 0;
