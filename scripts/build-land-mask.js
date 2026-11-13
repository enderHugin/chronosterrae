#!/usr/bin/env node
// build-land-mask.js - Mascara de tierra actual (Natural Earth 10m, dominio publico) para recortar el color politico contra la costa REAL.
//
//   node scripts/build-land-mask.js --src <ne_10m_land.geojson> [--src <ne_10m_minor_islands.geojson>] --commit <sha> --out data/borders
//
// Para que sirve: con la «Tierra natural» (imagen de NASA, costas de hoy) el color de cada pais se recortaba contra la costa del mapa base
// (PaleoMAP a 0 Ma, ~15.500 vertices en todo el globo): se salia al mar o se quedaba corto (lo vio el creador, 2026-11-13: «estas costas aun
// no estan bien coloreadas o definidas»). Esta mascara solo dice DONDE HAY TIERRA; no se dibuja ni dice de quien es nada.
//
// Transformaciones (y nada mas): (1) simplificacion Douglas-Peucker de cada anillo con tolerancia TOL_KM (por debajo de la resolucion de la
// fuente, ~1 km entre vertices); (2) coordenadas a 3 decimales (~110 m); (3) se quitan los anillos de menos de MIN_KM2 (a la escala a la que
// se usa la mascara —de cerca manda el agua de OpenStreetMap— no ocupan ni un pixel). Origen exacto (commit y sha256) en `meta`.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOL_KM = 0.6;
const MIN_KM2 = 0.5;

const args = process.argv.slice(2);
const all = (n) => args.flatMap((a, i) => (a === '--' + n ? [args[i + 1]] : []));
const one = (n) => all(n)[0];

const KM_LAT = 110.57;
const kmX = (dlng, lat) => dlng * Math.cos(lat * Math.PI / 180) * 111.32;
/** Distancia (km) del punto p al segmento a-b, en un plano local (equirectangular en la latitud media). */
function segDistKm(p, a, b) {
    const lat = (a[1] + b[1]) / 2;
    const ax = 0; const ay = 0; const bx = kmX(b[0] - a[0], lat); const by = (b[1] - a[1]) * KM_LAT;
    const px = kmX(p[0] - a[0], lat); const py = (p[1] - a[1]) * KM_LAT;
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
}
/** Douglas-Peucker iterativo (sin recursion: hay anillos de decenas de miles de vertices). */
function simplify(ring, tolKm) {
    const n = ring.length; if (n < 5) return ring.slice();
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    // anillo cerrado: se parte en dos por el vertice mas lejano al primero, para que ningun tramo empiece y acabe en el mismo punto
    let far = 1; let fd = -1; for (let i = 1; i < n - 1; i++) { const d = Math.hypot(kmX(ring[i][0] - ring[0][0], ring[0][1]), (ring[i][1] - ring[0][1]) * KM_LAT); if (d > fd) { fd = d; far = i; } }
    keep[far] = 1;
    const stack = [[0, far], [far, n - 1]];
    while (stack.length) {
        const [s, e] = stack.pop(); let idx = -1; let dmax = tolKm;
        for (let i = s + 1; i < e; i++) { const d = segDistKm(ring[i], ring[s], ring[e]); if (d > dmax) { dmax = d; idx = i; } }
        if (idx >= 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    return ring.filter((_, i) => keep[i]);
}
/** Area (km2) de un anillo, aproximada en plano local. */
function areaKm2(ring) {
    let a = 0; const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += kmX(ring[j][0], lat) * ring[i][1] * KM_LAT - kmX(ring[i][0], lat) * ring[j][1] * KM_LAT;
    return Math.abs(a) / 2;
}
const r3 = (x) => Math.round(x * 1000) / 1000;
function cleanRing(r) {
    const s = simplify(r, TOL_KM); const o = [];
    for (const [x, y] of s) { const p = [r3(x), r3(y)]; const l = o[o.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) o.push(p); }
    if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0].slice());
    return o.length >= 4 && areaKm2(o) >= MIN_KM2 ? o : null;
}

function build(srcs, commit) {
    const polys = []; const sources = []; let vin = 0; let vout = 0; let droppedRings = 0;
    for (const src of srcs) {
        const raw = fs.readFileSync(src); const fc = JSON.parse(raw.toString('utf8'));
        if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error(src + ': no es una FeatureCollection');
        sources.push({ file: path.basename(src), sha256: crypto.createHash('sha256').update(raw).digest('hex'), features: fc.features.length });
        for (const f of fc.features) {
            const g = f.geometry; if (!g) continue;
            const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
            for (const p of list) {
                p.forEach((r) => { vin += r.length; });
                const outer = cleanRing(p[0]); if (!outer) { droppedRings += p.length; continue; }
                const holes = p.slice(1).map(cleanRing); droppedRings += holes.filter((h) => !h).length;
                const poly = [outer].concat(holes.filter(Boolean)); poly.forEach((r) => { vout += r.length; });
                polys.push(poly);
            }
        }
    }
    return {
        type: 'FeatureCollection',
        meta: {
            what: 'Mascara de tierra actual para recortar el color politico contra la costa con la Tierra natural (imagen de NASA). No se dibuja.',
            source: 'Natural Earth 10m land (+ minor islands) via nvkelso/natural-earth-vector', commit,
            source_url: 'https://github.com/nvkelso/natural-earth-vector/tree/' + commit + '/geojson',
            license: 'Dominio publico (Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/)',
            sources, transformations: ['Douglas-Peucker por anillo, tolerancia ' + TOL_KM + ' km', 'coordenadas a 3 decimales (~110 m)', 'sin anillos de menos de ' + MIN_KM2 + ' km2'],
            polygons: polys.length, vertices_in: vin, vertices_out: vout, dropped_rings: droppedRings
        },
        features: [{ type: 'Feature', properties: { kind: 'land' }, geometry: { type: 'MultiPolygon', coordinates: polys } }]
    };
}

if (require.main === module) {
    const srcs = all('src'); const commit = one('commit'); const out = one('out') || path.join(__dirname, '../data/borders');
    if (!srcs.length || !/^[0-9a-f]{40}$/.test(commit || '')) { console.error('uso: --src <geojson> [--src <geojson>] --commit <sha de 40 caracteres> [--out carpeta]'); process.exit(2); }
    const fc = build(srcs, commit);
    const file = path.join(out, 'ne-land-mask.json');
    fs.writeFileSync(file, JSON.stringify(fc));
    console.log(JSON.stringify(fc.meta, null, 1));
    console.log('escrito', file, fs.statSync(file).size, 'bytes');
}
module.exports = { simplify, areaKm2, cleanRing, build, TOL_KM, MIN_KM2 };
