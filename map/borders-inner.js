/* borders-inner.js - Separa las FRONTERAS (tramos que un pais comparte con otro) de los bordes que solo dan al mar.
 *
 * El contorno de un poligono historico que da al mar es una aproximacion tosca de la costa, y la costa buena la
 * pone el mapa de detalle: no es una frontera y no se dibuja. Un tramo es frontera si su punto medio esta a menos
 * de tolKm de un tramo de OTRO pais (otra clave); en los datos medidos (historical-basemaps 2010) los tramos
 * compartidos coinciden a menos de 1 km y el resto queda a mas de 10 km, asi que la separacion no es ambigua.
 * Sin dependencias; funciona en el navegador y en Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosInner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const KM = 111.195;
    const CELL = 0.5;   // grados; los tramos son de 10 a 30 km (~0,1 a 0,3 grados)

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

    /** fc: FeatureCollection de poligonos. keyOf(f) -> clave del pais/potencia. Devuelve FeatureCollection de LineStrings. */
    function innerBorders(fc, keyOf, tolKm) {
        tolKm = tolKm == null ? 1.5 : tolKm;
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
        const shared = (s) => {
            const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
            const l = grid.get(cellKey(Math.floor(mx / CELL), Math.floor(my / CELL))); if (!l) return false;
            for (const id of l) { const o = segs[id]; if (o.key !== s.key && distKm(mx, my, o.ax, o.ay, o.bx, o.by) <= tolKm) return true; }
            return false;
        };
        // Se unen los tramos compartidos consecutivos de cada anillo en una sola linea.
        const features = []; let kept = 0;
        let idx = 0;
        fc.features.forEach((f) => {
            const fkey = keyOf(f);   // el pais al que pertenece el anillo: sirve para resaltar solo SUS fronteras terrestres
            ringsOf(f).forEach((r) => {
                let line = null;
                for (let i = 0; i < r.length - 1; i++, idx++) {
                    if (shared(segs[idx])) { kept++; if (!line) line = [r[i]]; line.push(r[i + 1]); }
                    else if (line) { features.push({ type: 'Feature', properties: { key: fkey }, geometry: { type: 'LineString', coordinates: line } }); line = null; }
                }
                if (line) features.push({ type: 'Feature', properties: { key: fkey }, geometry: { type: 'LineString', coordinates: line } });
            });
        });
        return { type: 'FeatureCollection', features, stats: { segments: segs.length, shared: kept } };
    }
    return { innerBorders };
});
