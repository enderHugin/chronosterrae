#!/usr/bin/env node
// check-sea.js - Pruebas de map/sea-mask.js (la tierra recortada a cada tesela, para la costa nitida) y de su coste con la mascara real.
'use strict';
const M = require('../map/sea-mask.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = JSON.stringify(r).slice(0, 300); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : '  XX  ') + name + (extra ? ' ' + extra : '')); if (!ok) fails++; };
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };

check('caja de la tesela 0/0/0: el mundo web (hasta 85,05 grados)', () => { const b = M.tileBounds(0, 0, 0); return Math.abs(b[0] + 180) < 1e-9 && Math.abs(b[2] - 180) < 1e-9 && Math.abs(b[3] - 85.0511) < 1e-3 && Math.abs(b[1] + 85.0511) < 1e-3; });
check('recorte: un cuadrado que sobresale se queda dentro del recuadro y con el area justa', () => {
    const c = M.clipRing([[-10, -10], [50, -10], [50, 50], [-10, 50]], 0, 100);
    return c.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100) && Math.abs(area(c) - 2500) < 1e-6 || c;
});
check('recorte: un anillo fuera del todo queda vacio; uno dentro, igual', () => M.clipRing([[200, 200], [300, 200], [300, 300]], 0, 100).length === 0 && M.clipRing([[10, 10], [20, 10], [20, 20]], 0, 100).length === 3);
check('tesela: una isla cuadrada en mitad de la tesela sale en su sitio (pixeles), con su hueco', () => {
    // tesela z=2, x=2, y=1: lon 0..90, lat 0..66,5. Isla de lon 40..50, lat 20..30 con un lago de 44..46, 24..26.
    const isl = [[[40, 20], [50, 20], [50, 30], [40, 30], [40, 20]], [[44, 24], [46, 24], [46, 26], [44, 26], [44, 24]]]; isl._bb = [40, 20, 50, 30];
    const r = M.tileRings([isl], 2, 2, 1, 256, 2);
    if (r.length !== 1 || r[0].length !== 2) return r;
    const xs = r[0][0].map((p) => p[0]); return Math.abs(Math.min(...xs) - 40 / 90 * 256) < 0.6 && Math.abs(Math.max(...xs) - 50 / 90 * 256) < 0.6;
});
check('tesela: lo que no la toca no se mira (rechazado, no roto)', () => { const p = [[[100, 10], [110, 10], [110, 20], [100, 10]]]; p._bb = [100, 10, 110, 20]; const q = [[[1, 1], [2, 1], [2, 2], [1, 1]]]; q._bb = [1, 1, 2, 2]; return M.tileRings([p, q], 2, 2, 1).length === 1 && M.tileRings([], 2, 2, 1).length === 0 && M.tileRings(null, 2, 2, 1).length === 0; });
// coste con la mascara real (la de la web): una tesela de costa de Europa a z5 debe quedar en unos cientos de vertices y en milisegundos
check('mascara real: teselas de costa ligeras y rapidas (Golfo de Leon z5, Noruega z4, Bering z3)', () => {
    const fc = require('../data/borders/ne-land-mask.json'); const polys = [];
    for (const f of fc.features) (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).forEach((p) => polys.push(p));
    polys.forEach((poly) => { let a = 180, c = 90, d = -180, e = -90; poly[0].forEach(([x, y]) => { a = Math.min(a, x); d = Math.max(d, x); c = Math.min(c, y); e = Math.max(e, y); }); poly._bb = [a, c, d, e]; });
    const res = {};
    for (const [k, z, x, y] of [['leon', 5, 16, 11], ['noruega', 4, 8, 4], ['bering', 3, 0, 2]]) {
        const t0 = process.hrtime.bigint(); const r = M.tileRings(polys, z, x, y, 256, 2); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        res[k] = { ms: Math.round(ms * 10) / 10, polys: r.length, verts: r.reduce((s, p) => s + p.reduce((t, q) => t + q.length, 0), 0) };
    }
    console.log('      ', JSON.stringify(res)); return Object.values(res).every((v) => v.polys > 0 && v.verts < 8000 && v.ms < 250) || res;
});
console.log(fails ? '\nHay fallos.' : '\nCosta por teselas: todo verde.');
process.exitCode = fails ? 1 : 0;
