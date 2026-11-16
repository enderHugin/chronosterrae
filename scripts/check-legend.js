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

// --- 2026-11-15: lista entera por apartados (pais) ---
check('apartados: por pais, en el orden en que aparecen de arriba abajo; dentro, por altura; sin pais al final', () => {
    const P = { es: { key: 'Spain', name: 'España', color: '#0a0' }, fr: { key: 'France', name: 'Francia', color: '#a00' } };
    const items = [{ id: 'a', y: 300, p: 'es' }, { id: 'b', y: 100, p: 'fr' }, { id: 'c', y: 50, p: null }, { id: 'd', y: 200, p: 'es' }, { id: 'e', y: 400, p: 'fr' }];
    const g = L.groupRows(items, (it) => (it.p ? P[it.p] : null));
    const sig = g.map((x) => (x.key || '-') + ':' + x.items.map((i) => i.id).join(','));
    return JSON.stringify(sig) === JSON.stringify(['France:b,e', 'Spain:d,a', '-:c']) && g[0].name === 'Francia' && g[0].color === '#a00' && g[2].name === '' || sig;
});
check('apartados: lista vacia o sin funcion de pais valida -> sin romper (rechazado, no roto)', () => L.groupRows([], () => null).length === 0 && L.groupRows(null, () => null).length === 0 && L.groupRows([{ id: 'x', y: 1 }], () => ({})).length === 1);

// --- 2026-11-15: rueda (paises > tipos > elementos; solo se despliega la rama del centro; mas pequeño cuanto mas lejos; inercia) ---
const W = [
    { id: 'fr1', y: 120, c: 'Francia', t: 'guerra' }, { id: 'es1', y: 300, c: 'España', t: 'nacer' }, { id: 'fr2', y: 90, c: 'Francia', t: 'nacer' },
    { id: 'es2', y: 260, c: 'España', t: 'nacer' }, { id: 'es3', y: 280, c: 'España', t: 'guerra' }, { id: 'mar', y: 500, c: null, t: 'guerra' }, { id: 'fr3', y: 150, c: 'Francia', t: 'guerra' }
];
const tree = () => L.buildTree(W, (x) => (x.c ? { key: x.c, name: x.c, color: '#123' } : null), (x) => ({ key: x.t, name: x.t }));
check('rueda, arbol: paises por su punto mas alto (sin pais al final), tipos igual, elementos por altura; seq en ese orden', () => {
    const T = tree();
    const ok = T.countries.map((c) => c.key).join(',') === 'Francia,España,' && T.countries[0].types.map((t) => t.key).join(',') === 'nacer,guerra'
        && T.seq.map((x) => x.id).join(',') === 'fr2,fr1,fr3,es2,es1,es3,mar' && T.countries[0].n === 3 && T.at.get('es1').k === 4;
    return ok || T.seq.map((x) => x.id).join(',');
});
check('rueda, arbol: repetidos y alturas no validas fuera; sin elementos, arbol vacio (rechazado, no roto)', () => {
    const T = L.buildTree([{ id: 'a', y: 1 }, { id: 'a', y: 2 }, { id: 'b', y: NaN }, null], () => null, () => ({ key: 'x' }));
    const E = L.buildTree(null, () => null, () => null);
    return T.seq.length === 1 && E.seq.length === 0 && L.wheelRows(E, 0).rows.length === 0;
});
check('rueda, filas: solo se despliega la rama del centro; lo demas, una fila resumen con cuantos', () => {
    const { rows, anchor } = L.wheelRows(tree(), 4);     // es1: España > nacer
    const s = rows.map((r) => r.kind[0] + (r.open ? '+' : '') + ':' + (r.it ? r.it.id : r.n)).join(' ');
    return (s === 'c:3 c+:3 t+:2 i:es2 i:es1 t:1 c:1' && rows[anchor].it.id === 'es1') || s;
});
check('rueda, filas: con un solo pais no hay fila de pais; el indice se recorta a la secuencia', () => {
    const T = L.buildTree([{ id: 'a', y: 1, t: 'x' }, { id: 'b', y: 2, t: 'y' }], () => ({ key: 'P', name: 'P' }), (x) => ({ key: x.t }));
    const r = L.wheelRows(T, 99); return (r.rows.map((x) => x.kind).join(',') === 'type,type,item' && r.rows[r.anchor].it.id === 'b') || r;
});
check('rueda, si sobra sitio: con mucho, todo desplegado; sin sitio, solo la rama del centro', () => {
    const T = tree(); const H = { item: 26, type: 26, country: 22 };
    const all = L.wheelRows(T, 4, { above: 5000, below: 5000, h: H }); const none = L.wheelRows(T, 4, { above: 0, below: 0, h: H });
    const items = (r) => r.rows.filter((x) => x.kind === 'item').map((x) => x.it.id).join(',');
    return (items(all) === 'fr2,fr1,fr3,es2,es1,es3,mar' && items(none) === 'es2,es1' && all.rows[all.anchor].it.id === 'es1') || [items(all), items(none)];
});
check('rueda, si sobra algo: primero se abren los paises (vista amplia), luego los tipos; cada cosa solo en su lado; la rama del centro, cur', () => {
    const T = tree(); const S = (r) => r.rows.map((x) => x.kind[0] + (x.open ? '+' : '') + (x.cur ? '*' : '') + ':' + (x.it ? x.it.id : x.n)).join(' ');
    // poco sitio abajo: se abre el pais siguiente (su lista de tipos) antes que desplegar España>guerra en iconos
    const a = S(L.wheelRows(T, 4, { above: 0, below: 80 }));
    // algo mas: tambien España>guerra (el tipo del pais del centro va antes que los de otros paises)
    const b = S(L.wheelRows(T, 4, { above: 0, below: 100 }));
    // sobra arriba pero no abajo: abajo sigue plegado aunque sobre arriba
    const c = S(L.wheelRows(T, 4, { above: 500, below: 0 }));
    const ok = a === 'c:3 c+*:3 t+*:2 i:es2 i:es1 t:1 c+:1 t:1' && b === 'c:3 c+*:3 t+*:2 i:es2 i:es1 t+:1 i:es3 c+:1 t:1'
        && c === 'c+:3 t+:1 i:fr2 t+:2 i:fr1 i:fr3 c+*:3 t+*:2 i:es2 i:es1 t:1 c:1';
    return ok || [a, b, c].join(' || ');
});
check('rueda, colocacion: el ancla centrada, sin solapes, en orden, y mas pequeña y tenue cuanto mas lejos', () => {
    const hs = Array.from({ length: 11 }, () => 30); const p = L.wheelPlace(hs, 5, 0, 400);
    if (Math.abs(p[5].y + p[5].h / 2 - 400) > 1e-9 || p[5].s !== 1) return 'centro';
    for (let i = 1; i < 11; i++) if (p[i].y < p[i - 1].y + p[i - 1].h - 1e-9) return 'solape ' + i;
    return (p[0].s < p[3].s && p[3].s < p[5].s && p[10].o < p[7].o && p[0].s >= 0.62 - 1e-9 && p[0].o >= 0.38 - 1e-9) || p.map((x) => x.s);
});
check('rueda, colocacion: continua al girar (media fila de giro mueve el ancla media separacion hacia arriba)', () => {
    const hs = Array.from({ length: 7 }, () => 30); const a = L.wheelPlace(hs, 3, 0, 300); const b = L.wheelPlace(hs, 3, 0.5, 300); const c = L.wheelPlace(hs, 3, 0.02, 300);
    return (Math.abs((b[3].y + b[3].h / 2) - (300 - 15)) < 1e-9 && Math.abs(c[3].y - a[3].y) < 1 && b[4].s > b[2].s) || [a[3], b[3]];
});
check('rueda, inercia: un impulso gira, frena solo y encaja en un entero; nunca sale de [0, n-1]', () => {
    let st = { f: 2, v: 30, to: null }; let steps = 0;
    while (!st.done && steps < 2000) { st = L.spinStep(st, 1 / 60, 20); steps++; if (st.f < 0 || st.f > 19) return 'fuera ' + st.f; }
    if (!st.done || st.f !== Math.round(st.f) || st.f <= 2) return st;
    let e = { f: 18, v: 200, to: null }; for (let i = 0; i < 400 && !e.done; i++) e = L.spinStep(e, 1 / 60, 20);
    let z = { f: 1, v: -200, to: null }; for (let i = 0; i < 400 && !z.done; i++) z = L.spinStep(z, 1 / 60, 20);
    return (e.f === 19 && z.f === 0 && steps < 200) || [e, z, steps];
});
check('rueda, inercia: con destino (toque o globo) llega a el y para; un destino fuera de rango se recorta', () => {
    let st = { f: 0, v: 0, to: 7 }; for (let i = 0; i < 200 && !st.done; i++) st = L.spinStep(st, 1 / 60, 10);
    let o = { f: 3, v: 0, to: 50 }; for (let i = 0; i < 200 && !o.done; i++) o = L.spinStep(o, 1 / 60, 10);
    return (st.done && st.f === 7 && o.f === 9) || [st, o];
});

/* ---------------- rueda llena: orden de arriba abajo y de izquierda a derecha; marco de lo que se ve (2026-11-16) ---------------- */
{
    const tf = (x) => (x.c ? { key: x.c, name: x.c } : null); const ty = (x) => ({ key: x.t, name: x.t });
    check('a la misma altura, de izquierda a derecha: elementos, tipos y paises', () => {
        const T = L.buildTree([{ id: 'b', x: 90, y: 10, c: 'P', t: 'u' }, { id: 'a', x: 10, y: 10, c: 'P', t: 'u' }, { id: 'q', x: 300, y: 50, c: 'Q', t: 'u' }, { id: 'r', x: 5, y: 50, c: 'R', t: 'u' }, { id: 'v', x: 40, y: 10, c: 'P', t: 'v' }], tf, ty);
        const order = T.seq.map((x) => x.id).join(''); const cs = T.countries.map((c) => c.key).join(''); const ts = T.countries[0].types.map((t) => t.key).join('');
        return order === 'abvrq' && cs === 'PRQ' && ts === 'uv' ? true : [order, cs, ts];
    });
    check('sin x (posicion desconocida) cuenta como 0, sin romperse', () => { const T = L.buildTree([{ id: 'a', y: 1 }, { id: 'b', y: 1, x: -5 }], () => null, () => ({ key: 'x' })); return T.seq.map((x) => x.id).join('') === 'ba'; });
    const T = L.buildTree([{ id: 'a', y: 1, c: 'P', t: 'u', seen: false }, { id: 'b', y: 2, c: 'P', t: 'u', seen: true }, { id: 'c', y: 3, c: 'P', t: 'w', seen: false }, { id: 'd', y: 4, c: 'Q', t: 'u', seen: false }], tf, ty);
    check('rowSeen: un elemento por si mismo; un tipo o un pais si alguno de los suyos se ve', () => {
        const r = (kind, ci, ti, it) => ({ kind, ci, ti, it });
        return L.rowSeen(T, r('item', 0, 0, T.seq[1])) && !L.rowSeen(T, r('item', 0, 0, T.seq[0])) && L.rowSeen(T, r('type', 0, 0)) && !L.rowSeen(T, r('type', 0, 1)) && L.rowSeen(T, r('country', 0)) && !L.rowSeen(T, r('country', 1)) && !L.rowSeen(null, r('item'));
    });
    check('viewSegments: filas seguidas que se ven forman un solo recuadro; una que no se ve lo parte', () => {
        const boxes = [{ y: 0, h: 20 }, { y: 20, h: 22 }, { y: 42, h: 18 }, { y: 60, h: 20 }, { y: 80, h: 20 }];
        const seen = [false, true, true, false, true];
        const segs = L.viewSegments(boxes, (i) => seen[i]);
        return segs.length === 2 && segs[0].top === 20 && segs[0].bottom === 60 && segs[1].top === 80 && segs[1].bottom === 100 ? true : segs;
    });
    check('viewSegments: nada a la vista, ningun recuadro; filas sin colocar no cuentan', () => L.viewSegments([{ y: 0, h: 5 }], () => false).length === 0 && L.viewSegments([null, { y: 3, h: 4 }], () => true).length === 1 && L.viewSegments(null, () => true).length === 0);
}

/* ---------------- continentes como primer nivel (2026-11-16: «si no, Estados Unidos aparecería al lado de España») ---------------- */
{
    const tf = (x) => (x.c ? { key: x.c, name: x.c } : null); const ty = (x) => ({ key: x.t, name: x.t }); const of = (x) => (x.o ? { key: x.o, name: x.o, last: x.o === 'sea' } : null);
    const I = [{ id: 'ny', y: 10, x: 50, c: 'USA', o: 'NA', t: 'u' }, { id: 'mad', y: 11, x: 900, c: 'ES', o: 'EU', t: 'u' }, { id: 'bos', y: 9, x: 60, c: 'USA', o: 'NA', t: 'u' },
        { id: 'par', y: 5, x: 950, c: 'FR', o: 'EU', t: 'u' }, { id: 'atl', y: 1, x: 500, c: null, o: 'sea', t: 'u' }, { id: 'ist', y: 12, x: 1100, c: 'OT', o: 'EU', t: 'u' }, { id: 'ank', y: 13, x: 1200, c: 'OT', o: 'AS', t: 'u' }];
    const T = L.buildTree(I, tf, ty, of);
    check('continentes: lo de cada continente va junto (Nueva York no cae entre Paris y Madrid)', () => {
        const seq = T.seq.map((x) => x.id).join(','); const os = T.continents.map((o) => o.key).join(',');
        return seq === 'par,mad,ist,bos,ny,ank,atl' && os === 'EU,NA,AS,sea' ? true : [seq, os];
    });
    check('continentes: el mar al final aunque este mas arriba; un pais en dos continentes sale en los dos', () => T.continents[T.continents.length - 1].key === 'sea' && T.countries.filter((c) => c.key === 'OT').length === 2 && T.countries.every((c) => typeof c.o === 'number'));
    check('continentes: claves de fila distintas para el mismo pais en dos continentes', () => {
        const { rows } = L.wheelRows(T, T.at.get('ist').k, { above: 2000, below: 2000, h: { item: 26, type: 26, country: 22, continent: 22 } });
        const keys = rows.map((r) => r.key); return new Set(keys).size === keys.length && rows.filter((r) => r.kind === 'continent').length === 4 ? true : keys;
    });
    check('continentes: sin sitio, solo el continente del centro abierto (y marcado); los demas, una fila cada uno', () => {
        const { rows } = L.wheelRows(T, T.at.get('ny').k, { above: 0, below: 0 });
        const co = rows.filter((r) => r.kind === 'continent'); const open = co.filter((r) => r.open);
        return co.length === 4 && open.length === 1 && open[0].cur && T.continents[open[0].oi].key === 'NA' && rows.some((r) => r.kind === 'item' && r.it.id === 'ny') ? true : rows.map((r) => r.key + (r.open ? '+' : ''));
    });
    check('continentes: con sitio se abren los demas, del mas cercano al mas lejano', () => {
        const { rows } = L.wheelRows(T, T.at.get('ny').k, { above: 2000, below: 2000, h: { item: 26, type: 26, country: 22, continent: 22 } });
        return rows.filter((r) => r.kind === 'continent').every((r) => r.open) && rows.filter((r) => r.kind === 'item').length === T.seq.length;
    });
    check('continentes: sin continentOf, un solo grupo sin fila de continente (como antes)', () => { const U = L.buildTree(I, tf, ty); const { rows } = L.wheelRows(U, 0, null); return U.continents.length === 1 && !rows.some((r) => r.kind === 'continent'); });
    check('continentes: rowSeen de un continente si alguno de los suyos se ve', () => { const S = L.buildTree(I.map((x) => ({ ...x, seen: x.id === 'ank' })), tf, ty, of); const oi = S.continents.findIndex((o) => o.key === 'AS'); const oe = S.continents.findIndex((o) => o.key === 'EU'); return L.rowSeen(S, { kind: 'continent', oi }) && !L.rowSeen(S, { kind: 'continent', oi: oe }); });
}

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nLeyenda: todo verde.');
