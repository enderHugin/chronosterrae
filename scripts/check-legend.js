#!/usr/bin/env node
// check-legend.js - Leyenda viva (map/legend.js): que filas caben, su orden y que los cables no se cruzan. Sin red ni DOM.
'use strict';
const L = require('../map/legend.js');
let fails = 0; const passes = [];
function check(name, fn) { let ok = false, err = ''; try { const r = fn(); ok = r === true; if (!ok) err = ' -> ' + JSON.stringify(r).slice(0, 300); } catch (e) { err = ' (' + e.message + ')'; } if (ok) passes.push(name); else { fails++; console.log('  XX  ' + name + err); } }

const it = (id, x, y, imp) => ({ id, x, y, importance: imp });
check('si caben todos, van todos ordenados por su altura en pantalla', () => { const r = L.pickRows([it('a', 10, 300, 0.5), it('b', 50, 100, 0.9), it('c', 20, 200, 0.1)], { max: 5 }); return r.rows.map((x) => x.id).join('') === 'bca' && r.extra === 0; });
check('si no caben, se quedan los mas notorios (y luego por altura); extra dice cuantos faltan', () => { const r = L.pickRows([it('a', 0, 10, 0.2), it('b', 0, 20, 0.9), it('c', 0, 30, 0.8), it('d', 0, 40, 0.1)], { max: 2 }); return r.rows.map((x) => x.id).join('') === 'bc' && r.extra === 2; });
check('repetidos y posiciones no validas se descartan (rechazado, no roto)', () => { const r = L.pickRows([it('a', 0, 10, 1), it('a', 5, 15, 1), it('b', NaN, 3, 1), null], { max: 9 }); return r.rows.length === 1 && r.extra === 0; });
check('sin sitio (max 0): ninguna fila, y extra los cuenta todos', () => { const r = L.pickRows([it('a', 0, 1, 1), it('b', 0, 2, 1)], { max: 0 }); return r.rows.length === 0 && r.extra === 2; });
check('altura de las filas: sin conflictos, cada una centrada en su punto', () => JSON.stringify(L.placeRows([100, 300, 500], 0, 800, 30)) === JSON.stringify([85, 285, 485]));
check('altura de las filas: puntos juntos se separan lo justo (rowH), en orden', () => { const y = L.placeRows([200, 205, 210], 0, 800, 30); return y[1] - y[0] === 30 && y[2] - y[1] === 30 && y[0] <= 185; });
check('altura de las filas: nunca por encima de top ni por debajo de bottom - rowH (empuja hacia arriba)', () => { const y = L.placeRows([780, 790, 795], 50, 800, 30); return y[2] === 770 && y[1] === 740 && y[0] === 710 && y.every((v) => v >= 50); });
check('altura de las filas: 300 escenas al azar: separacion >= rowH y dentro de los limites', () => {
    let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let s = 0; s < 300; s++) { const n = 1 + Math.floor(rnd() * 14); const d = Array.from({ length: n }, () => 60 + rnd() * 600).sort((a, b) => a - b); const y = L.placeRows(d, 60, 60 + 14 * 34, 34);
        for (let i = 0; i < n; i++) { if (y[i] < 60 - 1e-9 || y[i] > 60 + 14 * 34 - 34 + 1e-9) return 'fuera ' + s; if (i && y[i] - y[i - 1] < 34 - 1e-9) return 'solape ' + s; } }
    return true;
});
check('cable: horizontal hasta el carril y tramo corto a la fila', () => L.wirePath(100, 50, 400, 80) === 'M100 50H384L400 80');
check('cable: si el punto ya esta junto a la columna, recto', () => L.wirePath(390, 50, 400, 80) === 'M390 50L400 80');
check('ningun par de cables se cruza (300 escenas al azar, 14 filas, columna a la derecha)', () => {
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let s = 0; s < 300; s++) {
        const W = 1000, top = 60, rowH = 34; const ax = W - 50;
        const pts = Array.from({ length: 30 }, (_, i) => it('p' + i, rnd() * (ax - 40), top + rnd() * 600, rnd()));
        const { rows } = L.pickRows(pts, { max: 14 });
        const ys = L.placeRows(rows.map((p) => p.y), top, top + 14 * rowH, rowH);
        const segs = rows.map((p, i) => L.wireSegments(p.x, p.y, ax, ys[i] + rowH / 2));
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) for (const a of segs[i]) for (const b of segs[j]) if (L.segmentsCross(a, b)) return 'cruce en la escena ' + s;
    }
    return true;
});
check('el detector de cruces detecta un cruce de verdad (la prueba anterior no pasa por estar rota)', () => L.segmentsCross([0, 0, 10, 10], [0, 10, 10, 0]) && !L.segmentsCross([0, 0, 10, 0], [0, 5, 10, 5]));

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nLeyenda: todo verde.');
