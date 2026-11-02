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
check('dos paises que se juntan: la franja entre ambos queda no resuelta (AMBIGUOUS), no se reparte', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.2, 0, 1)] }], bbox, { distM: 40000, resolve: 'clear' });
    return at(res, 1.1, 0.5) === G.AMBIGUOUS && at(res, 1.05, 0.5) === G.AMBIGUOUS;
});
check('dos paises lejanos: cada uno rellena solo su lado', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 0.5)] }, { key: 'B', polys: [sq(3, 0, 0.5)] }], bbox, { distM: 40000 });
    return at(res, 0.6, 0.25) === 1 && at(res, 2.9, 0.25) === 2 && at(res, 1.75, 0.25) === 0;
});
check('golfo: un pais al otro lado del mar (mucho mas lejos) NO vuelve ambigua una costa claramente de otro', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.3, 0, 1)] }], bbox, { distM: 40000, resolve: 'clear' });
    return at(res, 1.03, 0.5) === 1 /* ~3 km de A, ~30 km de B */ && at(res, 1.27, 0.5) === 2 && at(res, 1.15, 0.5) === G.AMBIGUOUS /* a mitad */;
});
check('por defecto (nearest): ninguna celda queda sin color ni rayada; entre dos paises manda el mas cercano', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }, { key: 'B', polys: [sq(1.2, 0, 1)] }], bbox, { distM: 40000 });
    let n255 = 0; for (const c of res.cls) if (c === G.AMBIGUOUS) n255++;
    return n255 === 0 && at(res, 1.05, 0.5) === 1 && at(res, 1.15, 0.5) === 2;
});
check('nearest: la franja de un solo pais llega hasta el tope de distancia, no mas', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 0.5)] }], bbox, { distM: 100000 });
    return at(res, 0.5 + 0.7, 0.25) === 1 /* ~78 km */ && at(res, 0.5 + 1.2, 0.25) === 0 /* ~133 km */;
});
check('owner: la celda dentro de un poligono dice cual lo contiene; fuera y en huecos, 0', () => {
    const donut = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]], [[0.8, 0.8], [1.2, 0.8], [1.2, 1.2], [0.8, 1.2], [0.8, 0.8]]];
    const res = G.classify([{ key: 'A', polys: [donut] }, { key: 'B', polys: [sq(2.5, 0, 0.5)] }], [-1, -1, 4, 3], { distM: 40000 });
    const o = (lng, lat) => { const g = res.grid; const c = Math.floor((G.mercX(lng) - g.x0) * g.scale); const r = Math.floor((G.mercY(lat) - g.y0) * g.scale); return res.owner[r * g.cols + c]; };
    return o(0.3, 0.3) === 1 && o(2.7, 0.2) === 2 && o(1, 1) === 0 /* hueco */ && o(3.8, 2.5) === 0 /* fuera */;
});
check('land: con mascara de tierra nada se colorea en el mar, ni dentro del poligono ni fuera; la franja de tierra si', () => {
    // poligono A = [0,1]x[0,1]; tierra = [0,1.3]x[0,1] (la costa real esta 0,3 grados mas alla que el poligono); el mar, de 1,3 en adelante
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }], bbox, { distM: 100000, land: [[[[0, 0], [1.3, 0], [1.3, 1], [0, 1], [0, 0]]]] });
    return at(res, 1.15, 0.5) === 1 /* tierra fuera del poligono: se colorea */ && at(res, 1.45, 0.5) === 0 /* mar */
        && res.owner[Math.floor((G.mercY(0.5) - res.grid.y0) * res.grid.scale) * res.grid.cols + Math.floor((G.mercX(0.5) - res.grid.x0) * res.grid.scale)] === 1;
});
check('land: un poligono que invade el mar queda recortado a la costa', () => {
    const res = G.classify([{ key: 'A', polys: [sq(0, 0, 1)] }], bbox, { distM: 40000, land: [[[[0, 0], [0.6, 0], [0.6, 1], [0, 1], [0, 0]]]] });
    const own = (lng, lat) => { const g = res.grid; return res.owner[Math.floor((G.mercY(lat) - g.y0) * g.scale) * g.cols + Math.floor((G.mercX(lng) - g.x0) * g.scale)]; };
    return own(0.3, 0.5) === 1 && own(0.8, 0.5) === 0;
});
check('ruta rapida (nearest) y ruta lenta (clear) atribuyen igual donde la lenta es inequivoca', () => {
    const groups = [{ key: 'A', polys: [sq(0, 0, 0.5)] }, { key: 'B', polys: [sq(1.5, 0.2, 0.5)] }, { key: 'C', polys: [sq(0.3, 1.0, 0.4)] }];
    const fast = G.classify(groups, bbox, { distM: 100000 }); const slow = G.classify(groups, bbox, { distM: 100000, resolve: 'clear', ratio: 2, marginM: 0 });
    let compared = 0; let diff = 0;
    for (let i = 0; i < fast.cls.length; i++) if (slow.cls[i] && slow.cls[i] !== G.AMBIGUOUS) { compared++; if (fast.cls[i] !== slow.cls[i]) diff++; }
    return compared > 1000 && diff === 0 ? true : 'comparadas ' + compared + ', distintas ' + diff;
});
check('mas de 255 paises a la vez: los indices no desbordan (Uint16)', () => {
    const groups = []; for (let k = 0; k < 300; k++) groups.push({ key: 'P' + k, polys: [sq(-1 + (k % 20) * 0.2, -1 + Math.floor(k / 20) * 0.18, 0.05)] });
    const res = G.classify(groups, [-1.2, -1.2, 3.2, 2], { distM: 20000 });
    let max = 0; for (const o of res.owner) if (o > max) max = o;
    return max === 300 ? true : 'maximo ' + max;
});
check('rendimiento: 300 paises y 640 celdas en menos de 2 s (ruta rapida)', () => {
    const groups = []; for (let k = 0; k < 300; k++) groups.push({ key: 'P' + k, polys: [sq(-1 + (k % 20) * 0.2, -1 + Math.floor(k / 20) * 0.18, 0.05)] });
    const t = Date.now(); G.classify(groups, [-1.2, -1.2, 3.2, 2], { distM: 100000 }); const ms = Date.now() - t;
    return ms < 2000 ? true : ms + ' ms';
});
// Referencia: el rasterizador anterior (todas las aristas por cada fila), para demostrar que el nuevo da LA MISMA mascara.
function rasterizeRef(polys, grid) {
    const { cols, rows, x0, y0, scale } = grid; const mask = new Uint8Array(cols * rows);
    for (const poly of polys) {
        const edges = [];
        for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
            const ax = (G.mercX(ring[i][0]) - x0) * scale; const ay = (G.mercY(ring[i][1]) - y0) * scale;
            const bx = (G.mercX(ring[i + 1][0]) - x0) * scale; const by = (G.mercY(ring[i + 1][1]) - y0) * scale;
            if (ay !== by) edges.push(ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay]);
        }
        for (let r = 0; r < rows; r++) {
            const yc = r + 0.5; const xs = [];
            for (const [ax, ay, bx, by] of edges) if (yc >= ay && yc < by) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.max(0, Math.ceil(xs[k] - 0.5)); const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] - 0.5)); for (let c = c0; c <= c1; c++) mask[r * cols + c] ^= 1; }
        }
    }
    return mask;
}
check('rasterize: la version rapida da EXACTAMENTE la misma mascara que la de referencia (poligonos con huecos, concavos, fuera de la rejilla)', () => {
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const polys = [];
    for (let k = 0; k < 25; k++) {   // anillos irregulares (estrella) con y sin hueco; algunos parcialmente fuera del bbox
        const cx = -2 + rnd() * 7, cy = -2 + rnd() * 5, n = 5 + Math.floor(rnd() * 25); const ring = [];
        for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, rr = 0.15 + rnd() * 0.6; ring.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        ring.push(ring[0]); const poly = [ring];
        if (k % 3 === 0) { const h = ring.slice(0, -1).map(([x, y]) => [cx + (x - cx) * 0.3, cy + (y - cy) * 0.3]); h.push(h[0]); poly.push(h); }
        polys.push(poly);
    }
    const grid = G.makeGrid(bbox, 40000, 640);
    const a = G.rasterize(polys, grid); const b = rasterizeRef(polys, grid);
    let diff = 0, on = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) diff++; if (a[i]) on++; }
    return diff === 0 && on > 5000 ? true : 'distintas ' + diff + ', pintadas ' + on;
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
