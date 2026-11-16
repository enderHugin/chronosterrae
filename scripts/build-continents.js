#!/usr/bin/env node
// build-continents.js - Continentes para agrupar la rueda de la leyenda (Natural Earth 10m, dominio publico).
//
//   node scripts/build-continents.js --regions <ne_10m_geography_regions_polys.geojson> --units <ne_10m_admin_0_map_units.geojson> \
//        --commit <sha> --out data/borders
//
// Para que sirve: la rueda agrupa por continente, pais y tipo (el creador, 2026-11-16: «tener en cuenta los continentes como grupos para no
// saltear países… si no, Estados Unidos aparecería al lado de España»). El continente de un punto sale de dos capas de Natural Earth:
//   - geo: los 7 poligonos de clase «Continent» de geography_regions_polys (campo REGION). Son geograficos: Siberia es Asia, Moscu Europa.
//     No cubren todas las islas ni todas las costas.
//   - units: las unidades de admin_0_map_units con su CONTINENT (Guayana Francesa, America del Sur; Islandia, Europa; «Seven seas» = mar).
// Se mira primero geo y, si el punto no cae en ninguno, units (lo hace map/continents.js). No se dibuja nada con esto.
//
// Transformaciones (y nada mas): (1) solo el codigo de continente de cada poligono; (2) simplificacion Douglas-Peucker de cada anillo con
// tolerancia TOL_KM; (3) coordenadas a 2 decimales (~1 km); (4) fuera los anillos de menos de MIN_KM2. Origen exacto (commit y sha256 de cada
// fichero) en `meta`.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOL_KM = 15;
const GEO_TOL_KM = 4;        // los continentes geograficos, mas finos: que las ciudades de la costa caigan dentro
const MIN_KM2 = 40;
const CODE = { 'Africa': 'AF', 'Antarctica': 'AN', 'Asia': 'AS', 'Europe': 'EU', 'North America': 'NA', 'Oceania': 'OC', 'South America': 'SA', 'Seven seas (open ocean)': 'sea' };

const args = process.argv.slice(2);
const one = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };

const KM_LAT = 110.57;
const kmX = (dlng, lat) => dlng * Math.cos(lat * Math.PI / 180) * 111.32;
function segDistKm(p, a, b) {
    const lat = (a[1] + b[1]) / 2;
    const bx = kmX(b[0] - a[0], lat); const by = (b[1] - a[1]) * KM_LAT;
    const px = kmX(p[0] - a[0], lat); const py = (p[1] - a[1]) * KM_LAT;
    const L2 = bx * bx + by * by;
    const t = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
}
/** Douglas-Peucker iterativo (hay anillos de decenas de miles de vertices). */
function simplify(ring, tolKm) {
    const n = ring.length; if (n < 5) return ring.slice();
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
        const [a, b] = stack.pop(); let dmax = -1; let idx = -1;
        for (let i = a + 1; i < b; i++) { const d = segDistKm(ring[i], ring[a], ring[b]); if (d > dmax) { dmax = d; idx = i; } }
        if (dmax > tolKm && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return ring.filter((_, i) => keep[i]);
}
/** Area aproximada (km2) de un anillo, en un plano local. */
function areaKm2(ring) {
    let s = 0; const lat0 = ring[0][1];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = kmX(ring[i][0], lat0); const yi = ring[i][1] * KM_LAT; const xj = kmX(ring[j][0], lat0); const yj = ring[j][1] * KM_LAT;
        s += xj * yi - xi * yj;
    }
    return Math.abs(s) / 2;
}
const r2 = (x) => Math.round(x * 100) / 100;
/** Poligonos (lista de anillos: el primero exterior, los demas huecos) de una geometria, simplificados. */
function polys(geom, tol) {
    const ps = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    const out = [];
    for (const p of ps) {
        if (!p[0] || areaKm2(p[0]) < MIN_KM2) continue;
        const rings = p.map((r) => simplify(r, tol).map((c) => [r2(c[0]), r2(c[1])])).filter((r, i) => r.length >= 4 && (i === 0 || areaKm2(r) >= MIN_KM2));
        if (rings.length && rings[0].length >= 4) out.push(rings);
    }
    return out;
}
function layer(fc, field, filter, tol) {
    const by = new Map();
    for (const f of fc.features) {
        if (filter && !filter(f)) continue;
        const k = CODE[f.properties[field]]; if (!k || !f.geometry) continue;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(...polys(f.geometry, tol));
    }
    return [...by.entries()].map(([k, p]) => ({ k, p }));
}

const regions = one('regions'); const units = one('units'); const commit = one('commit'); const out = one('out');
if (!regions || !units || !commit || !out) { console.error('uso: --regions <geojson> --units <geojson> --commit <sha> --out <dir>'); process.exit(2); }
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const R = JSON.parse(fs.readFileSync(regions, 'utf8')); const U = JSON.parse(fs.readFileSync(units, 'utf8'));
const geo = layer(R, 'REGION', (f) => f.properties.FEATURECLA === 'Continent', GEO_TOL_KM);
const un = layer(U, 'CONTINENT', null, TOL_KM);
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' + commit + '/geojson/';
const doc = {
    meta: {
        source: 'Natural Earth 10m (nvkelso/natural-earth-vector): geography_regions_polys (clase Continent, campo REGION) y admin_0_map_units (campo CONTINENT)',
        license: 'Dominio publico (Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/)',
        files: [{ url: base + path.basename(regions), sha256: sha(regions) }, { url: base + path.basename(units), sha256: sha(units) }],
        commit, built_at: new Date().toISOString(),
        transformations: ['solo el codigo de continente (' + Object.entries(CODE).map(([a, b]) => b + ' = ' + a).join(', ') + ')', 'Douglas-Peucker por anillo, ' + GEO_TOL_KM + ' km (geo) y ' + TOL_KM + ' km (units)', 'coordenadas a 2 decimales', 'fuera los anillos de menos de ' + MIN_KM2 + ' km2'],
        use: 'Primero geo; si el punto no cae en ninguno, units; si tampoco, el mas cercano de units hasta cierta distancia (map/continents.js).'
    },
    geo, units: un
};
const file = path.join(out, 'continents.json');
fs.writeFileSync(file, JSON.stringify(doc));
const nv = (L) => L.reduce((s, x) => s + x.p.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0), 0);
console.log(file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB', 'vertices geo', nv(geo), 'units', nv(un), 'continentes', geo.map((x) => x.k).join(','), '/', un.map((x) => x.k).join(','));
