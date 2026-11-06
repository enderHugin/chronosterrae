/* labels.js - Donde poner el nombre de cada estado en un mapa de fronteras.
 *
 * El color no dice como se llama un territorio. Cada estado (agrupado por la misma clave que da el color: SUBJECTO o, si no hay, NAME) se
 * rotula UNA vez, en su poligono mas grande, en un punto que cae DENTRO del poligono (el centroide de un poligono con forma de C o de
 * archipielago puede caer fuera: entonces se usa el centro del tramo horizontal mas ancho dentro del poligono, a la latitud del centroide).
 * Cada rotulo lleva su tamaño (km² y anchura en km) para que la pantalla decida cuales caben: los grandes se ven de lejos, los pequeños al acercar.
 * No se inventa nada: el texto es el nombre que trae el dato, tal cual.
 * Funciona en el navegador y en Node; en el navegador usa ChronosChanges.areaKm2 (map/changes.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./changes.js'));
    else root.ChronosLabels = factory(root.ChronosChanges);
})(typeof self !== 'undefined' ? self : this, function (Changes) {
    'use strict';

    const KM_PER_DEG = 111.195;
    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    function ringCentroid(ring) {
        // centroide de area (formula del polígono en plano lng/lat: basta para decidir donde poner un texto)
        let a = 0; let cx = 0; let cy = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const x0 = ring[i][0]; const y0 = ring[i][1]; const x1 = ring[i + 1][0]; const y1 = ring[i + 1][1];
            const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
        }
        if (Math.abs(a) < 1e-12) return null;
        return [cx / (3 * a), cy / (3 * a)];
    }

    /** Cruces de la horizontal y = lat con los anillos del poligono (orden creciente de x). */
    function crossings(rings, lat) {
        const xs = [];
        for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i++) {
                const y0 = ring[i][1]; const y1 = ring[i + 1][1];
                if ((y0 > lat) !== (y1 > lat)) xs.push(ring[i][0] + (lat - y0) * (ring[i + 1][0] - ring[i][0]) / (y1 - y0));
            }
        }
        return xs.sort((a, b) => a - b);
    }

    /** Punto dentro del poligono (anillo exterior + agujeros) donde poner el rotulo: [lng, lat], o null si el poligono es degenerado. */
    function labelPoint(rings) {
        if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 4) return null;
        const c = ringCentroid(rings[0]); if (!c) return null;
        const inside = (x, y) => { const xs = crossings(rings, y); for (let i = 0; i + 1 < xs.length; i += 2) if (x >= xs[i] && x <= xs[i + 1]) return true; return false; };
        if (inside(c[0], c[1])) return c;
        // el centroide cayo fuera (forma de C, agujero): se prueban latitudes alrededor y se toma el tramo interior mas ancho
        const ys = rings[0].map((p) => p[1]); const lo = Math.min(...ys); const hi = Math.max(...ys);
        let best = null; let bw = 0;
        for (let k = 0; k <= 40; k++) {
            const lat = c[1] + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * (hi - lo)) / 40;
            if (lat <= lo || lat >= hi) continue;
            const xs = crossings(rings, lat);
            for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, lat]; }
        }
        return best;
    }

    const bboxOf = (rings) => { let a = 180; let b = 90; let c = -180; let d = -90; for (const [x, y] of rings[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; };

    /**
     * fc -> rotulos [{ key, text, lng, lat, areaKm2, widthKm }], los mas grandes primero. keyFn da la clave de agrupacion (el color) y textFn el texto.
     * Un estado sin nombre (tierra sin atribuir) no se rotula.
     */
    function polityLabels(fc, keyFn, textFn) {
        if (!fc || !Array.isArray(fc.features)) throw fail('BAD_COLLECTION', 'no es una coleccion de poligonos');
        if (typeof keyFn !== 'function') throw fail('BAD_KEY', 'falta la funcion que da la clave del estado');
        const text = typeof textFn === 'function' ? textFn : keyFn;
        const best = new Map();
        for (const f of fc.features) {
            const key = keyFn(f); const name = text(f);
            if (!key || !name || !f.geometry) continue;
            const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : [];
            let total = best.has(key) ? best.get(key).total : 0; let top = best.get(key);
            for (const poly of polys) {
                const a = Changes.areaKm2({ type: 'Polygon', coordinates: poly });
                total += a;
                if (!top || a > top.area) top = { poly, area: a, name, total: 0 };
            }
            if (top) { top.total = total; best.set(key, top); }
        }
        const out = [];
        for (const [key, t] of best) {
            const p = labelPoint(t.poly); if (!p) continue;
            const bb = bboxOf(t.poly); const lat = (bb[1] + bb[3]) / 2;
            out.push({ key, text: t.name, lng: Math.round(p[0] * 1e4) / 1e4, lat: Math.round(p[1] * 1e4) / 1e4, areaKm2: Math.round(t.total), widthKm: Math.round((bb[2] - bb[0]) * KM_PER_DEG * Math.max(0.2, Math.cos(lat * Math.PI / 180))) });
        }
        return out.sort((a, b) => b.areaKm2 - a.areaKm2);
    }

    /**
     * Tipografia para los nombres, leida del estilo de OpenFreeMap (no se supone ningun nombre de fuente). La primera capa de texto de un
     * estilo suele ser de agua y en cursiva: se prefieren las de paises/lugares y, dentro de ellas, las de trazo recto. Si todas son
     * cursivas se devuelve la primera (mejor cursiva que nada); sin capas de texto utilizables, null.
     */
    function pickFont(style) {
        const syms = ((style && style.layers) || []).filter((l) => l && l.type === 'symbol' && l.layout && Array.isArray(l.layout['text-font']) && l.layout['text-font'].length && l.layout['text-font'].every((f) => typeof f === 'string'));
        const upright = (l) => !/italic|oblique/i.test(l.layout['text-font'].join(' '));
        const place = (l) => l['source-layer'] === 'place';
        const l = syms.find((x) => isCountryLabel(x) && upright(x)) || syms.find((x) => place(x) && upright(x)) || syms.find(upright) || syms[0];
        return l ? l.layout['text-font'] : null;
    }

    /** ¿Es una capa de nombres de PAIS del estilo? (los de hoy: sobre un mapa historico serian de otra epoca y duplicarian los propios). Por estructura: capa `place` con "country" en el id o en el filtro. */
    function isCountryLabel(layer) {
        if (!layer || layer.type !== 'symbol' || layer['source-layer'] !== 'place') return false;
        return /country/i.test(String(layer.id || '')) || /country/i.test(JSON.stringify(layer.filter || null));
    }

    return { labelPoint, polityLabels, pickFont, isCountryLabel };
});
