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

// --- 2026-11-14: fila señalada a la altura de su punto, recuadro del nombre que el cable no cruza, lista desplegada ---
check('fila señalada (fijada): justo a la altura de su punto y las demas apartadas lo justo, en orden', () => {
    const y = L.placeRowsPinned([200, 205, 210, 400], 0, 800, 26, 1);
    return y[1] === 205 - 13 && y[0] === y[1] - 26 && y[2] === y[1] + 26 && y[3] === 400 - 13 || y;
});
check('fila fijada: si no cabe a su altura, lo mas cerca dejando sitio a las demas (sin salirse)', () => {
    const y = L.placeRowsPinned([780, 790, 795], 50, 800, 30, 0);    // la 0 querria 765, pero debajo deben caber otras 2
    return y[0] === 710 && y[1] === 740 && y[2] === 770 || y;
});
check('fila fijada: 300 escenas al azar: separacion >= rowH, dentro de los limites y la fijada lo mas cerca posible de su punto', () => {
    let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let s = 0; s < 300; s++) { const n = 1 + Math.floor(rnd() * 14); const d = Array.from({ length: n }, () => 60 + rnd() * 600).sort((a, b) => a - b); const k = Math.floor(rnd() * n);
        const top = 60, rowH = 26, bottom = 60 + 16 * rowH; const y = L.placeRowsPinned(d, top, bottom, rowH, k);
        for (let i = 0; i < n; i++) { if (y[i] < top - 1e-9 || y[i] > bottom - rowH + 1e-9) return 'fuera ' + s; if (i && y[i] - y[i - 1] < rowH - 1e-9) return 'solape ' + s; }
        const want = Math.max(top + k * rowH, Math.min(bottom - (n - k) * rowH, d[k] - rowH / 2)); if (Math.abs(y[k] - want) > 1e-9) return 'fijada movida ' + s; }
    return true;
});
check('fila fijada con indice fuera de rango: igual que placeRows (rechazado, no roto)', () => JSON.stringify(L.placeRowsPinned([100, 300], 0, 800, 30, 5)) === JSON.stringify(L.placeRows([100, 300], 0, 800, 30)));
// recuadro del nombre: el cable no lo cruza nunca
function boxOf(o, pl) { const cy = o.rowTop + o.rowH / 2; const R = o.colLeft - pl.right; const L0 = R - o.w;
    return pl.side === 'left' || pl.side === 'far' ? [L0, cy - o.h / 2, R, cy + o.h / 2] : pl.side === 'up' ? [L0, o.rowTop - 2 - o.h, R, o.rowTop - 2] : [L0, o.rowTop + o.rowH + 2, R, o.rowTop + o.rowH + 2 + o.h]; }
function ptInBox(x, y, b) { return x > b[0] + 1 && x < b[2] - 1 && y > b[1] + 1 && y < b[3] - 1; }
function segHitsBox(sg, b) { // muestreo fino del segmento: ¿algun punto dentro del recuadro (con 1 px de margen hacia dentro)?
    for (let t = 0; t <= 1; t += 0.002) { const x = sg[0] + (sg[2] - sg[0]) * t; const y = sg[1] + (sg[3] - sg[1]) * t; if (x > b[0] + 1 && x < b[2] - 1 && y > b[1] + 1 && y < b[3] - 1) return true; }
    return false; }
check('recuadro del nombre: punto lejos a la izquierda -> a la izquierda de la fila y el cable acaba en su borde', () => {
    const o = { px: 100, py: 548, colLeft: 786, rowTop: 575, rowH: 26, w: 200, h: 22 }; const pl = L.bubblePlace(o);
    return pl.side === 'left' && pl.ax === 786 - 6 - 200 && pl.ay === 588 || pl;
});
check('recuadro del nombre: el caso de la captura real (tableta, 1939: el cable tachaba «1793 AD») ya no se cruza', () => {
    const o = { px: 171, py: 548, colLeft: 786, rowTop: 575, rowH: 26, w: 200, h: 22 }; const pl = L.bubblePlace(o);
    return !L.wireSegments(o.px, o.py, pl.ax, pl.ay).some((sg) => segHitsBox(sg, boxOf(o, pl))) || pl;
});
check('recuadro del nombre: 2.000 escenas al azar, el cable NUNCA entra en el recuadro ni el recuadro tapa el punto', () => {
    let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let s = 0; s < 2000; s++) {
        const o = { px: rnd() * 780, py: 60 + rnd() * 900, colLeft: 786, rowTop: 60 + rnd() * 880, rowH: 26, w: 60 + rnd() * 260, h: 22, top: 60, bottom: 1000 };
        const pl = L.bubblePlace(o); const b = boxOf(o, pl);
        if (L.wireSegments(o.px, o.py, pl.ax, pl.ay).some((sg) => segHitsBox(sg, b))) return 'cruce en ' + s + ' ' + JSON.stringify([o, pl]);
        if (ptInBox(o.px, o.py, b)) return 'tapa el punto en ' + s + ' ' + JSON.stringify([o, pl]);
    }
    return true;
});
check('el detector de «cable dentro del recuadro» detecta un cruce de verdad', () => segHitsBox([0, 10, 100, 10], [20, 0, 60, 20]) && !segHitsBox([0, 30, 100, 30], [20, 0, 60, 20]));
check('lista desplegada: lleva la fila a la altura de su punto; si ya esta ahi, no se mueve; si el punto cae fuera, al centro', () => {
    const a = L.scrollFor(20, 30, 600, 3000, 0, 300);               // fila 20 (y=600..630) -> centro a 300: desplazar 315
    const b = L.scrollFor(20, 30, 600, 3000, 315, 300);              // ya esta
    const c = L.scrollFor(20, 30, 600, 3000, 0, -50);                // punto fuera: al centro (300)
    const d = L.scrollFor(1, 30, 600, 3000, 500, 300);               // arriba del todo: no menos de 0
    return a === 315 && b === null && c === 315 && d === 0 || [a, b, c, d];
});

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nLeyenda: todo verde.');
