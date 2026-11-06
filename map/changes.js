/* changes.js - Que cambia entre dos instantaneas de fronteras y que sucesos caen en ese intervalo.
 *
 * Las fronteras historicas no son una pelicula, son fotografias sueltas (historical-basemaps: 1715, 1783, 1800, 1815...). Lo que el mapa
 * muestra al pasar de una a otra no ocurrio un dia: es la distancia entre dos fotografias, y entre ellas pasaron años. Este modulo
 *   1. dice en que fechas se muestra cada instantanea (hasta donde llega a ser «la mas cercana»),
 *   2. mide QUE cambio entre dos instantaneas (estados nuevos, desaparecidos, con distinta superficie),
 *   3. lista los sucesos registrados dentro del intervalo y declara COMO se relacionan con el cambio:
 *        documented  el dato trae un vinculo con fuente (campo `links`: causa, efecto, parte de...);
 *        place       el suceso tiene coordenadas y cae dentro de un territorio que cambio;
 *        name        el nombre del suceso contiene el de un estado que cambio;
 *        time        solo coincide en el tiempo.
 *      Ninguna de las tres ultimas es una causa demostrada: se rotulan como coincidencia. No se inventa causalidad.
 * Sin dependencias; funciona en el navegador y en Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosChanges = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PRESENT = 1950;
    const R_KM = 6371.0088;
    const TIERS = ['documented', 'place', 'name', 'time'];
    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    /* ---- 1. cuando se muestra cada instantanea ---- */

    /** Años de las instantaneas, ordenados y sin repetir. Rechaza lo que no sea una lista de numeros finitos. */
    function sortedYears(years) {
        if (!Array.isArray(years) || !years.length || !years.every(Number.isFinite)) throw fail('BAD_YEARS', 'la lista de instantaneas debe ser una lista no vacia de años');
        return [...new Set(years)].sort((a, b) => a - b);
    }

    /** Instantanea mas cercana a `year` (empate: la posterior, como la regla del mapa). */
    function nearest(years, year) {
        const ys = sortedYears(years);
        let best = ys[0];
        for (const y of ys) if (Math.abs(y - year) < Math.abs(best - year) || (Math.abs(y - year) === Math.abs(best - year) && y > best)) best = y;
        return best;
    }

    /**
     * Intervalo de fechas en que la instantanea `used` es la que se muestra: del punto medio con la anterior al punto medio con la siguiente.
     * prev/next son las vecinas (null en los extremos, donde el intervalo queda abierto).
     */
    function displayWindow(years, used) {
        const ys = sortedYears(years);
        const i = ys.indexOf(used);
        if (i < 0) throw fail('NOT_A_SNAPSHOT', 'el año ' + used + ' no es una instantanea');
        const prev = i > 0 ? ys[i - 1] : null; const next = i < ys.length - 1 ? ys[i + 1] : null;
        return { used, prev, next, from: prev === null ? null : (prev + used) / 2, to: next === null ? null : (used + next) / 2 };
    }

    /* ---- 2. diferencia entre dos instantaneas ---- */

    /** Superficie aproximada (km²) de una geometria Polygon/MultiPolygon: formula esferica por anillo, agujeros restados. */
    function ringAreaKm2(ring) {
        let s = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            let dl = (ring[i + 1][0] - ring[i][0]) * Math.PI / 180;
            if (dl > Math.PI) dl -= 2 * Math.PI; else if (dl < -Math.PI) dl += 2 * Math.PI;
            s += dl * (2 + Math.sin(ring[i][1] * Math.PI / 180) + Math.sin(ring[i + 1][1] * Math.PI / 180));
        }
        return Math.abs(s) * R_KM * R_KM / 2;
    }
    function polygonAreaKm2(rings) {
        if (!Array.isArray(rings) || !rings.length) return 0;
        return Math.max(0, ringAreaKm2(rings[0]) - rings.slice(1).reduce((a, r) => a + ringAreaKm2(r), 0));
    }
    function areaKm2(geom) {
        if (!geom) return 0;
        if (geom.type === 'Polygon') return polygonAreaKm2(geom.coordinates);
        if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((a, p) => a + polygonAreaKm2(p), 0);
        return 0;
    }

    function inRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0]; const yi = ring[i][1]; const xj = ring[j][0]; const yj = ring[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }
    function inPolygon(x, y, rings) { return inRing(x, y, rings[0]) && !rings.slice(1).some((r) => inRing(x, y, r)); }
    function pointInGeometry(lng, lat, geom) {
        if (!geom) return false;
        if (geom.type === 'Polygon') return inPolygon(lng, lat, geom.coordinates);
        if (geom.type === 'MultiPolygon') return geom.coordinates.some((p) => inPolygon(lng, lat, p));
        return false;
    }

    const nameOf = (f) => { const p = (f && f.properties) || {}; return p.NAME || p.SUBJECTO || null; };

    /** Superficie y geometrias por estado (clave = NAME; sin nombre = tierra sin atribuir, no cuenta). */
    function byPolity(fc) {
        if (!fc || !Array.isArray(fc.features)) throw fail('BAD_COLLECTION', 'no es una coleccion de poligonos');
        const m = new Map();
        for (const f of fc.features) {
            const n = nameOf(f); if (!n || !f.geometry) continue;
            let r = m.get(n); if (!r) { r = { name: n, areaKm2: 0, geoms: [], subject: (f.properties && f.properties.SUBJECTO) || null, partOf: (f.properties && f.properties.PARTOF) || null }; m.set(n, r); }
            r.areaKm2 += areaKm2(f.geometry); r.geoms.push(f.geometry);
        }
        return m;
    }

    /**
     * Cambio entre la instantanea A (anterior) y B (posterior). Cambia de superficie un estado si varia mas de `relative` y de `minKm2`.
     * Devuelve listas ordenadas por tamaño del cambio. Los estados se emparejan por nombre: un estado que cambia de nombre sale como
     * «desaparece» + «aparece»; la fuente no trae un identificador estable que permita decir otra cosa.
     */
    function diffPolities(fcA, fcB, { relative = 0.1, minKm2 = 5000 } = {}) {
        const A = byPolity(fcA); const B = byPolity(fcB);
        const added = []; const removed = []; const changed = []; let same = 0;
        for (const [n, b] of B) {
            const a = A.get(n);
            if (!a) { added.push({ name: n, areaKm2: b.areaKm2, geoms: b.geoms, subject: b.subject }); continue; }
            const d = b.areaKm2 - a.areaKm2;
            if (Math.abs(d) > minKm2 && Math.abs(d) > relative * Math.max(a.areaKm2, 1)) changed.push({ name: n, areaA: a.areaKm2, areaB: b.areaKm2, deltaKm2: d, geoms: [...a.geoms, ...b.geoms] });
            else same++;
        }
        for (const [n, a] of A) if (!B.has(n)) removed.push({ name: n, areaKm2: a.areaKm2, geoms: a.geoms, subject: a.subject });
        added.sort((x, y) => y.areaKm2 - x.areaKm2); removed.sort((x, y) => y.areaKm2 - x.areaKm2); changed.sort((x, y) => Math.abs(y.deltaKm2) - Math.abs(x.deltaKm2));
        return { added, removed, changed, same, total: A.size + added.length };
    }

    /* ---- 3. sucesos del intervalo ---- */

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /** Años (astronomicos) que abarca un suceso, a partir de su tiempo BP. */
    function eventYears(f) {
        const t = f.properties.time; const a = PRESENT - t.start_ybp; const b = PRESENT - t.end_ybp;
        return { from: Math.min(a, b), to: Math.max(a, b) };
    }

    /**
     * Tipo de suceso deducido SOLO del nombre en ingles (los datos no traen tipo): se rotula como deducido, y «other» cuando no hay pista.
     * No es una clasificacion de Wikidata.
     */
    function classify(name) {
        const n = norm(name);
        if (/\b(treaty|peace of|peace treaty|accord|pact|concordat|convention of|edict|armistice|capitulation)\b/.test(n)) return 'treaty';
        if (/\b(battle|siege|sack of)\b/.test(n)) return 'battle';
        if (/\b(war|wars|campaign|invasion|conquest|uprising|rebellion|revolt|mutiny)\b/.test(n)) return 'war';
        if (/\b(revolution|coup|independence|declaration|proclamation|abdication|coronation|partition)\b/.test(n)) return 'political';
        if (/\b(earthquake|tsunami|eruption|flood|famine|plague|epidemic|pandemic|hurricane|cyclone|meteorite|impact)\b/.test(n)) return 'natural';
        return 'other';
    }

    /**
     * Sucesos que caen dentro de [fromYear, toYear] y su relacion con el cambio `diff`.
     * opts.kinds: clases de registro que cuentan (por defecto solo `event`).
     * opts.minImportance: umbral de notoriedad para el grupo «time» (que sin él sería una lista de todo lo ocurrido); max por grupo.
     * Devuelve { items, counts, withGeometry }: `withGeometry` dice cuantos sucesos del intervalo tenian coordenadas (si es 0 no se pudo
     * comprobar el lugar y la interfaz tiene que decirlo).
     */
    function relatedEvents(events, diff, fromYear, toYear, { minImportance = 0.5, kinds = ['event'], max = { documented: 50, place: 30, name: 30, time: 25 } } = {}) {
        if (!(fromYear <= toYear)) throw fail('BAD_INTERVAL', 'intervalo invertido o no numerico');
        const polities = [...diff.added, ...diff.removed, ...diff.changed];
        const patterns = polities.filter((p) => norm(p.name).replace(/[^a-z]/g, '').length >= 4)
            .map((p) => ({ p, re: new RegExp('(^|[^a-z0-9])' + esc(norm(p.name)) + '($|[^a-z0-9])') }));
        const items = []; let withGeometry = 0; let inInterval = 0;
        for (const f of events) {
            if (!kinds.includes(f.properties.kind)) continue;   // nacimientos, obras o descubrimientos no cambian fronteras: solo los «sucesos»
            const y = eventYears(f);
            if (y.to < fromYear || y.from > toYear) continue;
            inInterval++;
            const g = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
            if (g) withGeometry++;
            const links = (Array.isArray(f.properties.links) ? f.properties.links : []).filter((l) => l && (l.rel === 'cause' || l.rel === 'effect'));
            const hay = norm([f.properties.name, f.properties.labels && f.properties.labels.es, f.properties.labels && f.properties.labels.en].join(' | '));
            let tier = 'time'; let hits = [];
            if (links.length) { tier = 'documented'; }
            else if (g) {
                hits = polities.filter((p) => p.geoms.some((ge) => pointInGeometry(g[0], g[1], ge))).map((p) => p.name);
                if (hits.length) tier = 'place';
            }
            if (tier === 'time') {
                hits = patterns.filter((q) => q.re.test(hay)).map((q) => q.p.name);
                if (hits.length) tier = 'name';
            }
            const kind = classify(f.properties.name);
            // Solo coincidencia de fecha: se exige notoriedad Y una clase deducible; si no, la lista seria todo lo ocurrido (olimpiadas, grandes premios...)
            if (tier === 'time' && (!(f.properties.importance >= minImportance) || kind === 'other')) continue;
            items.push({ f, tier, polities: hits, years: y, kind });
        }
        items.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || (b.f.properties.importance || 0) - (a.f.properties.importance || 0));
        const counts = { documented: 0, place: 0, name: 0, time: 0 };
        const kept = items.filter((it) => (counts[it.tier]++ < max[it.tier]));
        const total = { documented: 0, place: 0, name: 0, time: 0 }; items.forEach((it) => total[it.tier]++);
        return { items: kept, total, inInterval, withGeometry };
    }

    /** Resumen legible del cambio: cuantos estados aparecen, desaparecen o cambian. */
    function summarize(diff) { return { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, same: diff.same }; }

    return { sortedYears, nearest, displayWindow, areaKm2, pointInGeometry, byPolity, diffPolities, eventYears, classify, relatedEvents, summarize, TIERS, PRESENT };
});
