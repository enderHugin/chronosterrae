/* borders-gap.js - Rellena (de forma declarada y conservadora) la franja de tierra que un poligono de frontera
 * demasiado simplificado deja entre su borde y la costa real.
 *
 * Regla (opts.resolve): por defecto 'nearest': una celda fuera de TODO poligono, a menos de D metros de alguno, se
 * colorea con el pais MAS CERCANO, sin dejar tierra sin color ni rayados: el contorno de un poligono que da al mar es
 * una costa tosca, y la costa buena la pone el mapa. El reparto entre dos paises vecinos junto a la costa (mediatriz)
 * es una aproximacion grafica. 'clear' (conservador): solo si el 2.o pais esta a mas de 2 x d1 + 10 km; si no, 255.
 * Sin dependencias; funciona en el navegador y en Node (se prueba sin red).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosGap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EARTH_M = 40075016.686;
    const mercX = (lng) => (lng + 180) / 360;
    const mercY = (lat) => { const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2; };
    const unmercX = (x) => x * 360 - 180;
    const unmercY = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;

    /** Rejilla que cubre el bbox [w,s,e,n] ampliado en padM metros, con como mucho maxCells celdas en el lado mayor. */
    function makeGrid(bbox, padM, maxCells) {
        const [w, s, e, n] = bbox;
        const latc = (s + n) / 2; const mPerUnit = EARTH_M * Math.cos(latc * Math.PI / 180);
        const pad = padM / mPerUnit;
        const x0 = mercX(w) - pad; const x1 = mercX(e) + pad; const y0 = mercY(n) - pad; const y1 = mercY(s) + pad;
        const scale = maxCells / Math.max(x1 - x0, y1 - y0);
        const cols = Math.max(2, Math.ceil((x1 - x0) * scale)); const rows = Math.max(2, Math.ceil((y1 - y0) * scale));
        return { x0, y0, x1, y1, cols, rows, scale, cellM: mPerUnit / scale,
            corners: [[unmercX(x0), unmercY(y0)], [unmercX(x1), unmercY(y0)], [unmercX(x1), unmercY(y1)], [unmercX(x0), unmercY(y1)]] };
    }

    /** Pinta (regla par-impar, asi los huecos quedan huecos) los poligonos [[anillo,...],...] en una mascara. */
    function rasterize(polys, grid) {
        const { cols, rows, x0, y0, scale } = grid;
        const mask = new Uint8Array(cols * rows);
        for (const poly of polys) {
            const edges = [];
            for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
                const ax = (mercX(ring[i][0]) - x0) * scale; const ay = (mercY(ring[i][1]) - y0) * scale;
                const bx = (mercX(ring[i + 1][0]) - x0) * scale; const by = (mercY(ring[i + 1][1]) - y0) * scale;
                if (ay !== by) edges.push(ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay]);
            }
            for (let r = 0; r < rows; r++) {
                const yc = r + 0.5; const xs = [];
                for (const [ax, ay, bx, by] of edges) if (yc >= ay && yc < by) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
                xs.sort((p, q) => p - q);
                for (let k = 0; k + 1 < xs.length; k += 2) {
                    const c0 = Math.max(0, Math.ceil(xs[k] - 0.5)); const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] - 0.5));
                    for (let c = c0; c <= c1; c++) mask[r * cols + c] ^= 1;   // par-impar entre poligonos del mismo pais: se acumula por XOR
                }
            }
        }
        return mask;
    }

    /** Distancia (en celdas, chamfer 1 / 1,414) a la mascara; 0 dentro. Se corta en maxD. */
    function distance(mask, cols, rows, maxD) {
        const INF = 1e9; const d = new Float32Array(cols * rows);
        for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
        const S = Math.SQRT2;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const i = r * cols + c; let v = d[i];
            if (c > 0) v = Math.min(v, d[i - 1] + 1);
            if (r > 0) { v = Math.min(v, d[i - cols] + 1); if (c > 0) v = Math.min(v, d[i - cols - 1] + S); if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + S); }
            d[i] = v;
        }
        for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
            const i = r * cols + c; let v = d[i];
            if (c < cols - 1) v = Math.min(v, d[i + 1] + 1);
            if (r < rows - 1) { v = Math.min(v, d[i + cols] + 1); if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + S); if (c > 0) v = Math.min(v, d[i + cols - 1] + S); }
            d[i] = v > maxD ? INF : v;
        }
        return d;
    }

    /**
     * groups: [{ key, polys }] (un grupo por pais/potencia; sus poligonos comparten color).
     * Devuelve { grid, cls, owner } con cls: 0 = nada, 1..n = indice+1 del grupo al que se atribuye, 255 = no resuelta.
     */
    function classify(groups, bbox, opts) {
        const o = Object.assign({ distM: 40000, maxCells: 640, ratio: 2, marginM: 10000, resolve: 'nearest' }, opts || {});
        const grid = makeGrid(bbox, o.distM, o.maxCells);
        const maxD = o.distM / grid.cellM; const marginCells = o.marginM / grid.cellM;
        const { cols, rows } = grid;
        const masks = groups.map((g) => rasterize(g.polys, grid));
        // Los huecos de un poligono (lagos, enclaves sin dibujar) NO son franja de costa: no se rellenan.
        const inside = new Uint8Array(cols * rows);
        groups.forEach((g) => { const outer = rasterize(g.polys.map((p) => [p[0]]), grid); for (let i = 0; i < outer.length; i++) if (outer[i]) inside[i] = 1; });
        masks.forEach((m) => { for (let i = 0; i < m.length; i++) if (m[i]) inside[i] = 1; });
        const dists = masks.map((m) => distance(m, cols, rows, maxD));
        const cls = new Uint8Array(cols * rows);
        for (let i = 0; i < cls.length; i++) {
            if (inside[i]) continue;
            let d1 = Infinity; let d2 = Infinity; let who = 0;
            for (let g = 0; g < dists.length; g++) {
                const v = dists[g][i]; if (v > maxD) continue;
                if (v < d1) { d2 = d1; d1 = v; who = g + 1; } else if (v < d2) d2 = v;
            }
            cls[i] = who === 0 ? 0 : (o.resolve === 'nearest' || d2 > o.ratio * d1 + marginCells ? who : 255);
        }
        // owner: grupo (indice+1) que CONTIENE la celda (el ultimo dibujado gana; los huecos quedan en 0). Asi una sola capa
        // pinta todo el territorio, poligonos incluidos, sin costura entre el relleno y el borde del poligono.
        const owner = new Uint8Array(cols * rows);
        masks.forEach((m, g) => { for (let i = 0; i < m.length; i++) if (m[i]) owner[i] = g + 1; });
        return { grid, cls, owner, maxD };
    }

    return { classify, makeGrid, rasterize, distance, mercX, mercY };
});
