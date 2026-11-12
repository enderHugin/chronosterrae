/* borders-inner.js - Separa las FRONTERAS (tramos que un pais comparte con otro) de los bordes que solo dan al mar.
 *
 * El contorno de un poligono historico que da al mar es una aproximacion tosca de la costa, y la costa buena la
 * pone el mapa de detalle: no es una frontera y no se dibuja. Un tramo es frontera si su punto medio esta a menos
 * de tolKm de un tramo de OTRO pais (otra clave); en los datos medidos (historical-basemaps 2010) los tramos
 * compartidos coinciden a menos de 1 km y el resto queda a mas de 10 km, asi que la separacion no es ambigua.
 *
 * Ademas, cuentan los LADOS: un tramo cuyo pais no ocupa ninguno de sus dos lados (ni a 2 km ni a 250 m) es de un poligono sin interior,
 * que va y vuelve por la misma costa, y no es frontera de nadie; tampoco sirve de vecino a otro. Hay instantaneas asi: en historical-basemaps
 * 1500, "Denmark-Norway" es casi entero una ida y vuelta por la costa de la "Kalmar Union" (589 lados), y la costa de Kalmar pasaba por
 * frontera: al resaltarla salian trazos rojos sueltos por la costa (lo vio el creador, 2026-11-12). Con la regla, Kalmar pasa de 285 tramos
 * de «frontera» a 60 (las de verdad: Sami, Moscu, Novgorod...). En 1945 y 2010 cae ademas el contorno de Francia por la orilla del lago
 * Leman (un repliegue sin interior). Se probo tambien descartar los tramos cuyo vecino pisa este lado y quitaba fronteras reales: no se usa.
 * Sin dependencias; funciona en el navegador y en Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosInner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const KM = 111.195;
    const CELL = 0.15;   // grados (los tramos son de 10 a 30 km); con 0,5 las costas densas (1815) llenaban cada celda de miles de tramos: 0,15 tarda la mitad (medido 2026-11-12). El relleno de 0,05° al indexar cubre de sobra la tolerancia

    function ringsOf(f) {
        const g = f.geometry; if (!g) return [];
        const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
        const out = []; polys.forEach((p) => p.forEach((r) => out.push(r))); return out;
    }
    function distKm(px, py, ax, ay, bx, by) {
        const c = Math.cos(py * Math.PI / 180);
        const X = (x) => x * KM * c;
        const qx = X(px), qy = py * KM, x1 = X(ax), y1 = ay * KM, x2 = X(bx), y2 = by * KM;
        const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
        const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((qx - x1) * dx + (qy - y1) * dy) / L));
        return Math.hypot(qx - (x1 + t * dx), qy - (y1 + t * dy));
    }

    // Punto dentro de un anillo (par-impar, en grados: los anillos no cruzan el antimeridiano en estos datos). Los anillos grandes (miles de
    // vertices: Rusia, la costa de Noruega) llevan un indice por franjas de latitud: solo se miran los lados que cruzan la franja del punto
    // (sin el, 1815 tardaba 3,4 s en el hilo principal; medido 2026-11-12).
    function ringIndex(r) {
        if (r._ix) return r._ix;
        let lo = Infinity, hi = -Infinity; for (const p of r) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
        const nb = Math.max(1, Math.min(512, Math.floor(r.length / 8))); const h = (hi - lo) / nb || 1; const bands = Array.from({ length: nb }, () => []);
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const a = Math.min(r[i][1], r[j][1]), b = Math.max(r[i][1], r[j][1]);
            const k0 = Math.max(0, Math.min(nb - 1, Math.floor((a - lo) / h))), k1 = Math.max(0, Math.min(nb - 1, Math.floor((b - lo) / h)));
            for (let k = k0; k <= k1; k++) bands[k].push(i);
        }
        Object.defineProperty(r, '_ix', { value: { lo, hi, h, nb, bands }, enumerable: false });
        return r._ix;
    }
    function inRing(r, x, y) {
        const ix = ringIndex(r); if (y < ix.lo || y > ix.hi) return false;
        const band = ix.bands[Math.max(0, Math.min(ix.nb - 1, Math.floor((y - ix.lo) / ix.h)))];
        let inside = false;
        for (const i of band) {
            const j = i === 0 ? r.length - 1 : i - 1; const yi = r[i][1], yj = r[j][1];
            if ((yi > y) !== (yj > y) && x < (r[j][0] - r[i][0]) * (y - yi) / (yj - yi) + r[i][0]) inside = !inside;
        }
        return inside;
    }
    /** Poligonos de cada clave con su caja, para preguntar «¿este punto es de este pais?» */
    function areas(fc, keyOf) {
        const m = new Map();
        fc.features.forEach((f) => {
            const g = f.geometry; if (!g) return;
            const key = keyOf(f); const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
            polys.forEach((p) => {
                if (!p.length) return; let a = 180, b = 90, c = -180, d = -90;
                p[0].forEach(([x, y]) => { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; });
                if (!m.has(key)) m.set(key, []); m.get(key).push({ p, bb: [a, b, c, d] });
            });
        });
        return (key, x, y) => (m.get(key) || []).some(({ p, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)));
    }

    /** fc: FeatureCollection de poligonos. keyOf(f) -> clave del pais/potencia. Devuelve FeatureCollection de LineStrings. */
    function innerBorders(fc, keyOf, tolKm, opts) {
        tolKm = tolKm == null ? 1.5 : tolKm;
        const sideKm = (opts && opts.sideKm) || 2; const checkSides = !(opts && opts.sides === false);
        const inside = checkSides ? areas(fc, keyOf) : null; let overlap = 0; let sliver = 0;
        const segs = []; const grid = new Map();
        const cellKey = (i, j) => i * 100003 + j;
        fc.features.forEach((f, fi) => {
            const key = keyOf(f);
            ringsOf(f).forEach((r, ri) => {
                for (let i = 0; i < r.length - 1; i++) {
                    const s = { key, ax: r[i][0], ay: r[i][1], bx: r[i + 1][0], by: r[i + 1][1] }; const id = segs.length; segs.push(s);
                    const i0 = Math.floor((Math.min(s.ax, s.bx) - 0.05) / CELL), i1 = Math.floor((Math.max(s.ax, s.bx) + 0.05) / CELL);
                    const j0 = Math.floor((Math.min(s.ay, s.by) - 0.05) / CELL), j1 = Math.floor((Math.max(s.ay, s.by) + 0.05) / CELL);
                    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) { const k = cellKey(a, b); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(id); }
                }
            });
        });
        // Lados de un tramo respecto a SU pais (memo): sliver = ninguno de los dos lados es suyo (ni a sideKm ni a sideKm/8): poligono sin
        // interior, que va y vuelve por la misma costa ("Denmark-Norway" 1500 es casi todo asi). Si no, same/deep: puntos de su lado a sideKm y a 8 km.
        const sideMemo = new Map();
        const sideOf = (id) => {
            let r = sideMemo.get(id); if (r) return r;
            const t = segs[id]; const mx = (t.ax + t.bx) / 2, my = (t.ay + t.by) / 2; const c = Math.cos(my * Math.PI / 180) || 1e-6;
            const dx = (t.bx - t.ax) * c, dy = t.by - t.ay; const L = Math.hypot(dx, dy);
            r = { sliver: false, same: null, deep: null };
            if (L) {
                const at = (km, sg) => { const off = km / KM; return [mx + sg * (-dy / L) * off / c, my + sg * (dx / L) * off]; };
                let found = 0;
                for (const km of [sideKm, sideKm / 8]) {
                    const a1 = inside(t.key, ...at(km, 1)), a2 = inside(t.key, ...at(km, -1));
                    if (a1 !== a2) { found = a1 ? 1 : -1; break; }
                    if (a1 && a2) { found = 2; break; }
                }
                if (!found) r.sliver = true;
                else if (found !== 2) { r.same = at(sideKm, found); r.deep = at(8, found); }
            }
            sideMemo.set(id, r); return r;
        };
        const shared = (s, sid) => {
            const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
            const l = grid.get(cellKey(Math.floor(mx / CELL), Math.floor(my / CELL))); if (!l) return false;
            const near = [];
            for (const id of l) { const o = segs[id]; if (o.key !== s.key && distKm(mx, my, o.ax, o.ay, o.bx, o.by) <= tolKm) near.push(id); }
            if (!near.length) return false;
            if (!inside) return true;
            const me = sideOf(sid); if (me.sliver) { sliver++; return false; }
            // vecinos de verdad: los tramos de otros paises que tienen interior (un poligono-costa sin interior no es vecino de nadie)
            const others = [...new Set(near.filter((id) => !sideOf(id).sliver).map((id) => segs[id].key))];
            if (!others.length) { sliver++; return false; }
            // (Se probo tambien descartar los tramos cuyo vecino «pisa» este lado: quitaba fronteras reales, porque los poligonos vecinos se
            // solapan km por lo toscos que son: Francia y Suiza en 1945, España en 1815. Medido 2026-11-12; no se usa.)
            return true;
        };
        // Se unen los tramos compartidos consecutivos de cada anillo en una sola linea.
        const features = []; let kept = 0;
        let idx = 0;
        fc.features.forEach((f) => {
            const fkey = keyOf(f);   // el pais al que pertenece el anillo: sirve para resaltar solo SUS fronteras terrestres
            ringsOf(f).forEach((r) => {
                let line = null;
                for (let i = 0; i < r.length - 1; i++, idx++) {
                    if (shared(segs[idx], idx)) { kept++; if (!line) line = [r[i]]; line.push(r[i + 1]); }
                    else if (line) { features.push({ type: 'Feature', properties: { key: fkey }, geometry: { type: 'LineString', coordinates: line } }); line = null; }
                }
                if (line) features.push({ type: 'Feature', properties: { key: fkey }, geometry: { type: 'LineString', coordinates: line } });
            });
        });
        return { type: 'FeatureCollection', features, stats: { segments: segs.length, shared: kept, overlap, sliver } };
    }
    return { innerBorders };
});
