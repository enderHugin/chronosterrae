#!/usr/bin/env node
// build-borders.js - Fronteras vigentes de Natural Earth 10m (dominio publico) listas para ChronosTerrae.
//
//   node scripts/build-borders.js --src <ne_10m_admin_0_countries.geojson> --commit <sha> --out data/borders
//
// No se inventa ni se edita ninguna geometria: solo se (1) recortan las propiedades a las que usa la web,
// (2) redondean las coordenadas a 4 decimales (~11 m, muy por debajo de la resolucion de la fuente, ~1,7 km
// de mediana) y (3) se registra el origen exacto (commit y sha256 del fichero original) y la resolucion medida.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const src = arg('src'); const commit = arg('commit'); const out = arg('out') || path.join(__dirname, '../data/borders');
if (!src || !/^[0-9a-f]{40}$/.test(commit || '')) { console.error('uso: --src <geojson> --commit <sha de 40 caracteres> [--out carpeta]'); process.exit(2); }

const raw = fs.readFileSync(src);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
const fc = JSON.parse(raw.toString('utf8'));
if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) || !fc.features.length) throw new Error('no es una FeatureCollection');

const r4 = (n) => Math.round(n * 1e4) / 1e4;
function ring(r) {
    const o = [];
    for (const [x, y] of r) { const p = [r4(x), r4(y)]; const l = o[o.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) o.push(p); }
    return o.length >= 4 ? o : null;
}
function geom(g) {
    if (g.type === 'Polygon') { const rs = g.coordinates.map(ring).filter(Boolean); return rs.length ? { type: 'Polygon', coordinates: rs } : null; }
    if (g.type === 'MultiPolygon') { const ps = g.coordinates.map((p) => p.map(ring).filter(Boolean)).filter((p) => p.length); return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null; }
    return null;
}
const seg = (a, b) => { const la = (a[1] + b[1]) / 2 * Math.PI / 180; return Math.hypot((b[0] - a[0]) * Math.cos(la) * 111.32, (b[1] - a[1]) * 110.57); };

const features = []; const lens = []; let vertices = 0; let dropped = 0;
for (const f of fc.features) {
    const g = f.geometry && geom(f.geometry);
    if (!g) { dropped++; continue; }
    const p = f.properties || {};
    const name = p.NAME || p.ADMIN;
    if (!name) { dropped++; continue; }
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach((poly) => poly.forEach((r) => { vertices += r.length; for (let i = 0; i < r.length - 1; i++) lens.push(seg(r[i], r[i + 1])); }));
    features.push({
        type: 'Feature', geometry: g,
        properties: { NAME: name, NAME_ES: p.NAME_ES || undefined, SUBJECTO: p.SOVEREIGNT || name, ADM0_A3: p.ADM0_A3, TYPE: p.TYPE, WIKIDATAID: p.WIKIDATAID || undefined }
    });
}
lens.sort((a, b) => a - b);
const meta = {
    source: 'Natural Earth 10m admin 0 countries (nvkelso/natural-earth-vector)',
    source_url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' + commit + '/geojson/ne_10m_admin_0_countries.geojson',
    commit, source_sha256: sha256, license: 'Dominio publico (Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/)',
    retrieved_at: new Date().toISOString(), valid_from_year: 2016,
    transformations: ['propiedades recortadas a NAME, NAME_ES, SUBJECTO (=SOVEREIGNT), ADM0_A3, TYPE, WIKIDATAID', 'coordenadas redondeadas a 4 decimales', 'puntos consecutivos repetidos eliminados'],
    features: features.length, dropped, vertices, segment_median_km: +lens[lens.length >> 1].toFixed(2), segment_p90_km: +lens[Math.floor(lens.length * 0.9)].toFixed(2), segment_max_km: +lens[lens.length - 1].toFixed(1)
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ne-10m-countries.json'), JSON.stringify({ type: 'FeatureCollection', meta, features }) + '\n');
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta));
