/* borders-resolution.js - Hasta que zoom un mapa de poligonos tiene mas detalle que pedir.
 *
 * Un poligono historico es una polilinea con un vertice cada cierta distancia. Mientras ese tramo mida pocos pixeles en
 * pantalla, la linea parece una frontera; cuando mide muchos, se ven las facetas y el desajuste con la costa real (que el mapa base
 * da con mucho mas detalle). Acercar el zoom no anade informacion al poligono, asi que a partir de ese zoom lo honesto es no dibujarlo
 * como si la tuviera. La resolucion se MIDE en los propios poligonos de cada fecha (mediana de la longitud de sus tramos): no es el
 * error de posicion (los datos no lo traen), es el detalle maximo que pueden representar.
 * Sin dependencias; funciona en el navegador y en Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosBordersRes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const KM_PER_DEG = 111.195;
    const WORLD_KM = 40075.017;          // circunferencia ecuatorial
    const TILE = 512;                    // px del mundo a zoom 0 (MapLibre)
    const MAX_SAMPLES = 40000;
    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    /** Kilometros que mide un pixel a ese zoom y latitud (en el centro de la vista). */
    function kmPerPx(zoom, latDeg) {
        if (!Number.isFinite(zoom) || !Number.isFinite(latDeg)) throw fail('BAD_VIEW', 'zoom o latitud no numericos');
        return WORLD_KM * Math.max(0.2, Math.cos(latDeg * Math.PI / 180)) / (TILE * Math.pow(2, zoom));
    }

    function ringsOf(f) {
        const g = f && f.geometry; if (!g) return [];
        const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
        const out = []; polys.forEach((p) => p.forEach((r) => out.push(r))); return out;
    }

    /** Mediana (km) de la longitud de los tramos de todos los anillos; null si no hay tramos. Con muchos tramos se toma una muestra repartida. */
    function medianSegmentKm(fc) {
        if (!fc || !Array.isArray(fc.features)) return null;
        const rings = []; let total = 0;
        for (const f of fc.features) for (const r of ringsOf(f)) { if (Array.isArray(r) && r.length > 1) { rings.push(r); total += r.length - 1; } }
        if (!total) return null;
        const stride = Math.max(1, Math.ceil(total / MAX_SAMPLES)); const len = []; let k = 0;
        for (const r of rings) {
            for (let i = 1; i < r.length; i++) {
                if (k++ % stride) continue;
                const a = r[i - 1]; const b = r[i];
                const dx = (b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); const dy = b[1] - a[1];
                const d = Math.hypot(dx, dy) * KM_PER_DEG;
                if (d > 0) len.push(d);
            }
        }
        if (!len.length) return null;
        len.sort((x, y) => x - y);
        return len[len.length >> 1];
    }

    /** Zoom a partir del cual un tramo medio de resKm km mide mas de segPx pixeles en pantalla. */
    function zoomLimit(resKm, latDeg, segPx = 4) {
        if (!(resKm > 0) || !Number.isFinite(resKm)) throw fail('BAD_RES', 'resolucion no valida');
        if (!(segPx > 0)) throw fail('BAD_PX', 'tolerancia en pixeles no valida');
        // resKm / kmPerPx(z) = segPx  ->  2^z = WORLD_KM * cos(lat) * segPx / (TILE * resKm)
        return Math.log2(WORLD_KM * Math.max(0.2, Math.cos(latDeg * Math.PI / 180)) * segPx / (TILE * resKm));
    }

    /** true si a ese zoom el poligono ya no da el detalle que la pantalla pide. */
    function tooFine(resKm, zoom, latDeg, segPx = 4) { return zoom > zoomLimit(resKm, latDeg, segPx); }

    return { kmPerPx, medianSegmentKm, zoomLimit, tooFine, KM_PER_DEG, WORLD_KM, TILE };
});
