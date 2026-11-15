// sea-mask.js - La tierra (Natural Earth) recortada a una tesela web (EPSG:3857), en pixeles de la tesela. Logica pura, sin DOM.
//
// Para la capa 'natural-sea' de index.html: el mar de NASA dibujado ENCIMA del color politico con la tierra recortada, que da la costa
// nitida en todos los aparatos (el creador, 2026-11-15: «hay que encontrar la manera de que las costas sean algo serio»). Dibujar los
// poligonos enteros en cada tesela era lento (Eurasia tiene ~38.000 vertices: 5 a 10 s por tesela, medido en local); aqui cada anillo se
// recorta al recuadro de la tesela (con un margen) y se aligera (fuera los vertices a menos de medio pixel del anterior). Asi una tesela
// de costa queda en unos cientos de vertices.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSeaMask = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Caja lon/lat de la tesela z/x/y: [oeste, sur, este, norte]. */
    function tileBounds(z, x, y) {
        const n = 2 ** z; const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
        return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)];
    }

    /** Recorte de Sutherland-Hodgman de un anillo (pixeles) contra el recuadro [a, a] - [b, b]. Devuelve el anillo recortado (puede quedar vacio). */
    function clipRing(pts, a, b) {
        let out = pts;
        const edges = [[(p) => p[0] >= a, (p, q) => { const t = (a - p[0]) / (q[0] - p[0]); return [a, p[1] + t * (q[1] - p[1])]; }],
            [(p) => p[0] <= b, (p, q) => { const t = (b - p[0]) / (q[0] - p[0]); return [b, p[1] + t * (q[1] - p[1])]; }],
            [(p) => p[1] >= a, (p, q) => { const t = (a - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), a]; }],
            [(p) => p[1] <= b, (p, q) => { const t = (b - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), b]; }]];
        for (const [inside, cut] of edges) {
            const src = out; out = []; if (!src.length) break;
            for (let i = 0; i < src.length; i++) {
                const p = src[i]; const q = src[(i + src.length - 1) % src.length];
                const pin = inside(p); const qin = inside(q);
                if (pin) { if (!qin) out.push(cut(q, p)); out.push(p); } else if (qin) out.push(cut(q, p));
            }
        }
        return out;
    }

    /** Coordenadas Mercator (0..1) de un anillo, calculadas una vez y guardadas en el propio anillo (el seno y el logaritmo son lo caro). */
    function merc(ring) {
        if (ring._m) return ring._m;
        const m = new Float64Array(ring.length * 2);
        for (let i = 0; i < ring.length; i++) {
            const s = Math.min(0.9999999, Math.max(-0.9999999, Math.sin(ring[i][1] * Math.PI / 180)));
            m[2 * i] = (ring[i][0] + 180) / 360; m[2 * i + 1] = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
        }
        Object.defineProperty(ring, '_m', { value: m, enumerable: false }); return m;
    }

    /**
     * Anillos de tierra de la tesela z/x/y en pixeles (0..size), recortados con un margen y aligerados. polys: poligonos GeoJSON (anillos de
     * [lon, lat]) con su caja en _bb ([oeste, sur, este, norte]); los que no tocan la tesela no se miran. Devuelve una lista de poligonos,
     * cada uno una lista de anillos (rellenar con la regla par-impar: los huecos, lagos, quedan fuera).
     */
    function tileRings(polys, z, x, y, size, margin) {
        const S = size || 256; const m = margin == null ? 2 : margin; const n = 2 ** z;
        const bb = tileBounds(z, x, y); const padDeg = (bb[2] - bb[0]) * (m + 1) / S;
        const out = [];
        for (const poly of polys || []) {
            const b = poly._bb; if (!b) continue;
            if (b[2] < bb[0] - padDeg || b[0] > bb[2] + padDeg || b[3] < bb[1] - padDeg || b[1] > bb[3] + padDeg) continue;
            const rings = [];
            for (const ring of poly) {
                const mc = merc(ring); const px = []; let lx = NaN; let ly = NaN;
                for (let i = 0; i < mc.length; i += 2) { const qx = (mc[i] * n - x) * S; const qy = (mc[i + 1] * n - y) * S; if (Math.abs(qx - lx) < 0.5 && Math.abs(qy - ly) < 0.5) continue; px.push([qx, qy]); lx = qx; ly = qy; }
                const c = clipRing(px, -m, S + m);
                if (c.length >= 3) rings.push(c);
            }
            if (rings.length) out.push(rings);
        }
        return out;
    }

    return { tileBounds, clipRing, tileRings };
}));
