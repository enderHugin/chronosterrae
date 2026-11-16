/* continents.js - En que continente cae un punto, para agrupar la rueda de la leyenda (el creador, 2026-11-16: «tener en cuenta los
 * continentes como grupos para no saltear países… si no, Estados Unidos aparecería al lado de España»).
 *
 * PURO: recibe el contenido de data/borders/continents.json (Natural Earth, dominio publico; scripts/build-continents.js) y responde.
 * Orden de consulta:
 *   1) geo: los 7 continentes geograficos de Natural Earth (Siberia es Asia, Moscu Europa, Anatolia Asia);
 *   2) units: las unidades de Natural Earth con su continente (islas que geo no cubre: Islandia, Japon, Guayana Francesa); las de «Seven
 *      seas» son mar;
 *   3) junto a la costa de un continente geografico (a menos de GEO_NEAR_KM): ese continente;
 *   4) fuera de todo (un puerto o una batalla junto a la costa, simplificada a 15 km): el continente de la unidad mas cercana si esta a menos
 *      de NEAR_KM; si no, mar ('sea').
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosContinents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NEAR_KM = 350;
    const GEO_NEAR_KM = 40;
    const KEYS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN', 'sea'];
    const NAMES = {
        EU: { es: 'Europa', en: 'Europe', es2: 'Eur', en2: 'Eur' },
        AS: { es: 'Asia', en: 'Asia', es2: 'Asia', en2: 'Asia' },
        AF: { es: 'África', en: 'Africa', es2: 'Áfr', en2: 'Afr' },
        NA: { es: 'América del Norte', en: 'North America', es2: 'A.N.', en2: 'N.Am' },
        SA: { es: 'América del Sur', en: 'South America', es2: 'A.S.', en2: 'S.Am' },
        OC: { es: 'Oceanía', en: 'Oceania', es2: 'Oce', en2: 'Oce' },
        AN: { es: 'Antártida', en: 'Antarctica', es2: 'Ant', en2: 'Ant' },
        sea: { es: 'Mares y océanos', en: 'Seas and oceans', es2: 'Mar', en2: 'Sea' }
    };
    /** Nombre de un continente: largo (Europa) o corto (Eur) para la columna estrecha. */
    function nameOf(k, lang, short) { const n = NAMES[k]; if (!n) return ''; const l = lang === 'es' ? 'es' : 'en'; return short ? n[l + '2'] : n[l]; }

    function inRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0]; const yi = ring[i][1]; const xj = ring[j][0]; const yj = ring[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }
    const RAD = Math.PI / 180;
    function km(a, b, lng, lat) {
        const x = (lng - a) * Math.cos(((lat + b) / 2) * RAD) * 111.32; const y = (lat - b) * 110.57; return Math.hypot(x, y);
    }
    /** Poligonos con su caja: [{ k, rings, bb: [w, s, e, n] }]. */
    function index(layer) {
        const out = [];
        (layer || []).forEach((L) => (L.p || []).forEach((rings) => {
            if (!rings || !rings[0]) return; const bb = [Infinity, Infinity, -Infinity, -Infinity];
            rings[0].forEach((c) => { if (c[0] < bb[0]) bb[0] = c[0]; if (c[1] < bb[1]) bb[1] = c[1]; if (c[0] > bb[2]) bb[2] = c[0]; if (c[1] > bb[3]) bb[3] = c[1]; });
            out.push({ k: L.k, rings, bb });
        }));
        return out;
    }
    const inside = (P, lng, lat) => lng >= P.bb[0] && lng <= P.bb[2] && lat >= P.bb[1] && lat <= P.bb[3] && inRing(lng, lat, P.rings[0]) && !P.rings.slice(1).some((r) => inRing(lng, lat, r));

    /** Indice para consultar: create(datos).at(lng, lat) -> 'EU' | 'AS' | ... | 'sea'; null si los datos no valen (rechazado, no roto). */
    function create(data) {
        if (!data || !Array.isArray(data.geo) || !Array.isArray(data.units)) return null;
        const geo = index(data.geo); const units = index(data.units); const cache = new Map();
        /** Continente del vertice mas cercano (a menos de maxKm), o null. Las cajas se miran con margen (1° de latitud son 111 km). */
        function nearest(L, lng, lat, maxKm) {
            const pad = maxKm / 100; const padX = pad / Math.max(0.2, Math.cos(lat * RAD)); let best = maxKm; let k = null;
            for (const P of L) {
                if (P.k === 'sea' || lng < P.bb[0] - padX || lng > P.bb[2] + padX || lat < P.bb[1] - pad || lat > P.bb[3] + pad) continue;
                for (const r of P.rings) for (const c of r) { const d = km(c[0], c[1], lng, lat); if (d < best) { best = d; k = P.k; } }
            }
            return k;
        }
        function at(lng, lat) {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            lng = ((((lng + 180) % 360) + 360) % 360) - 180;
            const key = Math.round(lng * 100) + ',' + Math.round(lat * 100); if (cache.has(key)) return cache.get(key);
            let k = null;
            for (const P of geo) if (inside(P, lng, lat)) { k = P.k; break; }
            // junto a la costa de un continente geografico (simplificada): ese continente (Vladivostok, Estambul europeo, Cayena)
            if (!k) for (const P of units) if (inside(P, lng, lat)) { k = P.k; break; }
            if (!k) k = nearest(geo, lng, lat, GEO_NEAR_KM);
            if (!k) k = nearest(units, lng, lat, NEAR_KM) || 'sea';
            if (cache.size > 20000) cache.clear();
            cache.set(key, k); return k;
        }
        return { at };
    }

    return { NEAR_KM, KEYS, NAMES, nameOf, create };
});
