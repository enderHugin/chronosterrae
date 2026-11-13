#!/usr/bin/env node
// cross-borders.js - CONTRASTE de fronteras: lo que dibuja la web (historical-basemaps) frente a una fuente independiente (Cliopatria, Seshat).
//
//   node scripts/cross-borders.js --hb <carpeta de historical-basemaps> --clio <cliopatria.geojson> [--land data/borders/ne-land-mask.json]
//                                 [--step 0.5] [--years 1500,1600] [--out informe.json]
//
// Pedido del creador (2026-11-14): «necesitamos fuentes de datos mas fiables y revision… mas intensiva y proactiva» → inventario, busqueda y
// CONTRASTE. Este es el primer contraste automatico. No guarda datos de ninguna fuente: solo cifras de acuerdo y desacuerdo (historical-basemaps
// es GPL y se usa solo en ejecucion; Cliopatria es CC BY 4.0).
//
// Metodo (sin emparejar nombres, que difieren entre fuentes): una rejilla regular sobre la tierra actual (Natural Earth; sin Antartida), cada
// punto pesado por su area (cos lat). En cada año de mapa de historical-basemaps (dentro de -3400..2024, lo que cubre Cliopatria) se mira que
// entidad tiene cada punto en cada fuente. Para cada entidad de historical-basemaps: la entidad de Cliopatria que mas comparte con ella y que
// parte comparten (IoU, interseccion / union en area). Lo que sale bajo es DESACUERDO ENTRE FUENTES, no un error demostrado de ninguna: el
// informe no dice cual tiene razon. Tambien cuenta tierra con entidad en una fuente y sin ella en la otra.
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

/** Punto en anillo (par-impar). */
function inRing(x, y, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const xi = r[i][0]; const yi = r[i][1]; const xj = r[j][0]; const yj = r[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
}
/** Poligono GeoJSON (anillos) que contiene el punto: dentro del exterior y fuera de los huecos. */
function inPoly(x, y, poly) { if (!inRing(x, y, poly[0])) return false; for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false; return true; }

/** Indice simple: cada poligono con su caja. items: [{ key, polys }]. */
function indexShapes(items) {
    const out = [];
    for (const it of items) {
        for (const poly of it.polys) {
            let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity;
            for (const p of poly[0]) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; }
            out.push({ key: it.key, area: it.area || 0, poly, box: [a, b, c, d] });
        }
    }
    return out;
}
/** Clave de la entidad que contiene el punto; con varias (solapes), la de menor area (la mas concreta). null si ninguna. */
function lookup(ix, x, y) {
    let best = null; let bestA = Infinity;
    for (const s of ix) {
        const b = s.box; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
        if (inPoly(x, y, s.poly) && s.area < bestA) { best = s.key; bestA = s.area; }
    }
    return best;
}
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/** Rejilla de puntos de tierra: [{x, y, w}] con w = cos(lat) (area relativa). */
function landGrid(landFc, step) {
    const ix = indexShapes([{ key: 'land', polys: landFc.features.flatMap((f) => polysOf(f.geometry)) }]);
    const pts = [];
    for (let y = -60 + step / 2; y < 84; y += step) {
        for (let x = -180 + step / 2; x < 180; x += step) if (lookup(ix, x, y)) pts.push({ x, y, w: Math.cos(y * Math.PI / 180) });
    }
    return pts;
}

/**
 * Compara dos «quien tiene cada punto» sobre los mismos puntos. a, b: arrays de clave o null; w: pesos.
 * Devuelve { totals, entities: [{ a, w, best, iou, shareInB }] } ordenado por peso.
 */
function compare(a, b, w) {
    const tot = { both: 0, onlyA: 0, onlyB: 0, none: 0 }; const pair = new Map(); const wa = new Map(); const wb = new Map();
    for (let i = 0; i < w.length; i++) {
        const ka = a[i]; const kb = b[i]; const wi = w[i];
        if (ka && kb) tot.both += wi; else if (ka) tot.onlyA += wi; else if (kb) tot.onlyB += wi; else tot.none += wi;
        if (ka) wa.set(ka, (wa.get(ka) || 0) + wi);
        if (kb) wb.set(kb, (wb.get(kb) || 0) + wi);
        if (ka) { const m = pair.get(ka) || new Map(); pair.set(ka, m); const k2 = kb || ''; m.set(k2, (m.get(k2) || 0) + wi); }
    }
    const entities = [];
    for (const [ka, m] of pair) {
        let best = ''; let bw = 0; for (const [kb, v] of m) if (kb && v > bw) { bw = v; best = kb; }
        const uni = wa.get(ka) + (best ? wb.get(best) : 0) - bw;
        const e = { a: ka, w: wa.get(ka), best: best || null, iou: uni > 0 ? bw / uni : 0, shareInB: bw / wa.get(ka), shareOfB: best ? bw / wb.get(best) : 0, noneInB: (m.get('') || 0) / wa.get(ka) };
        e.kind = classify(e); entities.push(e);
    }
    entities.sort((p, q) => q.w - p.w);
    return { totals: tot, entities };
}

/**
 * Que clase de (des)acuerdo es. Solo «desacuerdo» es un conflicto entre fuentes; lo demas es diferencia de alcance o de detalle:
 *  - acuerdo: IoU >= 0,7.
 *  - sin_equivalente: en >= 70 % de su tierra la otra fuente no pone ninguna entidad (Cliopatria solo tiene estados; historical-basemaps
 *    tambien pueblos sin estado: «Inuit», «Bantu peoples»).
 *  - a_mas_detallado: >= 80 % de la entidad cae dentro de UNA de la otra fuente, mas grande (la otra agrupa: «French Africa»).
 *  - b_mas_detallado: >= 80 % de la mejor entidad de la otra fuente cae dentro de esta, mas grande (esta agrupa: Dinamarca con Groenlandia).
 *  - desacuerdo: el resto. Que haya desacuerdo no dice cual de las dos tiene razon.
 */
const KIND_LABEL = { a_mas_detallado: 'hb_mas_detallado', b_mas_detallado: 'clio_mas_detallado' };
function classify(e) {
    if (e.iou >= 0.7) return 'acuerdo';
    if (e.noneInB >= 0.7) return 'sin_equivalente';
    if (e.shareInB >= 0.8) return 'a_mas_detallado';
    if (e.shareOfB >= 0.8) return 'b_mas_detallado';
    return 'desacuerdo';
}

function run() {
    const hbDir = opt('hb'); const clioFile = opt('clio');
    const landFile = opt('land', path.join(__dirname, '../data/borders/ne-land-mask.json'));
    const step = Number(opt('step', '0.5')); const only = opt('years') ? opt('years').split(',').map(Number) : null;
    if (!hbDir || !clioFile) { console.error('uso: --hb <carpeta historical-basemaps> --clio <cliopatria.geojson> [--land f] [--step 0.5] [--years a,b] [--out f]'); process.exit(2); }
    const grid = landGrid(JSON.parse(fs.readFileSync(landFile, 'utf8')), step); const W = grid.map((p) => p.w);
    const clio = JSON.parse(fs.readFileSync(clioFile, 'utf8')).features.filter((f) => f.properties.Type === 'POLITY');
    const hbIndex = JSON.parse(fs.readFileSync(path.join(hbDir, 'index.json'), 'utf8')).years;
    const years = hbIndex.filter((y) => y.year >= -3400 && y.year <= 2024 && (!only || only.includes(y.year)));
    const report = { generated_at: new Date().toISOString(), method: 'rejilla de ' + step + ' grados sobre la tierra actual (Natural Earth, sin Antartida), pesada por area; IoU por entidad sin emparejar nombres', grid_points: grid.length, years: [] };
    const sumW = W.reduce((s, v) => s + v, 0); const pct = (v) => Math.round(1000 * v / sumW) / 10;
    for (const y of years) {
        const hb = JSON.parse(fs.readFileSync(path.join(hbDir, 'geojson', y.filename), 'utf8')).features;
        const ixA = indexShapes(hb.filter((f) => f.properties && f.properties.NAME).map((f) => ({ key: f.properties.NAME, polys: polysOf(f.geometry), area: 0 })));
        const act = clio.filter((f) => f.properties.FromYear <= y.year && y.year <= f.properties.ToYear);
        const ixB = indexShapes(act.map((f) => ({ key: f.properties.Name + ' [' + f.properties.Wikidata + ']', polys: polysOf(f.geometry), area: f.properties.Area })));
        const a = grid.map((p) => lookup(ixA, p.x, p.y)); const b = grid.map((p) => lookup(ixB, p.x, p.y));
        const c = compare(a, b, W);
        const byKind = {}; for (const e of c.entities) byKind[e.kind] = (byKind[e.kind] || 0) + e.w;
        const r2 = (v) => Math.round(v * 100) / 100;
        const row = {
            year: y.year, hb_entities: new Set(ixA.map((s) => s.key)).size, clio_entities: new Set(ixB.map((s) => s.key)).size,
            land_pct: { both: pct(c.totals.both), only_hb: pct(c.totals.onlyA), only_clio: pct(c.totals.onlyB), neither: pct(c.totals.none) },
            hb_land_by_kind_pct: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [KIND_LABEL[k] || k, pct(v)])),
            // los desacuerdos de verdad, de mayor a menor (entidades de >= 3 puntos de rejilla: lo menor es ruido de muestreo)
            disagreements: c.entities.filter((e) => e.kind === 'desacuerdo' && e.w >= 3).slice(0, 30)
                .map((e) => ({ hb: e.a, clio_best: e.best, iou: r2(e.iou), hb_share_in_clio: r2(e.shareInB), clio_share_in_hb: r2(e.shareOfB), hb_land_without_clio: r2(e.noneInB), size: Math.round(e.w) }))
        };
        report.years.push(row);
        console.error(y.year, JSON.stringify(row.hb_land_by_kind_pct), 'solo clio', row.land_pct.only_clio);
    }
    const out = opt('out'); const txt = JSON.stringify(report, null, 1);
    if (out) fs.writeFileSync(out, txt); else console.log(txt);
}

if (require.main === module) run();
module.exports = { inRing, inPoly, indexShapes, lookup, compare, classify, landGrid };
