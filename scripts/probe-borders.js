#!/usr/bin/env node
// probe-borders.js - ¿Que fuentes de fronteras sirven para precision cientifica, con que licencia y resolucion?
// No se asume ninguna URL ni licencia: se listan repositorios y APIs, se leen sus ficheros de licencia reales,
// se descargan los datos y se MIDE (vertices, longitud de segmento, en que poligono cae Ceuta/Melilla).
// Corre en Actions. stdout = JSON; stderr = progreso. Un fallo se registra tal cual.

'use strict';

const UA = 'ChronosTerrae-Probe/0.6 (https://github.com/enderHugin/chronosterrae)';
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');
const log = (...a) => console.error(...a);

async function get(url, { json = false, timeout = 120000, headers = {} } = {}) {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*', ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
    const text = await res.text();
    const meta = { status: res.status, ok: res.ok, bytes: text.length, ms: Date.now() - t0, acao: res.headers.get('access-control-allow-origin'), type: res.headers.get('content-type') };
    return { meta, text, json: json && res.ok ? JSON.parse(text) : undefined };
}

/* ---- geometria ---- */
const rings = (g) => (g ? (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []).flatMap((p) => p) : []);
function inRing(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function contains(g, pt) { const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []; return polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h))); }
const seg = (a, b) => { const la = (a[1] + b[1]) / 2 * Math.PI / 180; return Math.hypot((b[0] - a[0]) * Math.cos(la) * 111.32, (b[1] - a[1]) * 110.57); };
function stats(g) { const L = []; let n = 0; for (const r of rings(g)) { n += r.length; for (let i = 0; i < r.length - 1; i++) L.push(seg(r[i], r[i + 1])); } L.sort((x, y) => x - y); return { vertices: n, segment_median_km: +(L[L.length >> 1] || 0).toFixed(2), segment_p90_km: +(L[Math.floor(L.length * 0.9)] || 0).toFixed(2), segment_max_km: +(L[L.length - 1] || 0).toFixed(1) }; }
const POINTS = { Ceuta: [-5.32, 35.89], Melilla: [-2.94, 35.29], Madrid: [-3.70, 40.42], Tegucigalpa: [-87.2, 14.08] };
const NAMES = ['Spain', 'Honduras', 'El Salvador', 'Luxembourg'];
const nameOf = (p) => p.NAME || p.name || p.ADMIN || p.shapeName || p.NAME_EN || p.SOVEREIGNT;

function analyze(fc) {
    const out = { features: fc.features.length, property_keys: Object.keys(fc.features[0].properties || {}).slice(0, 40), countries: {}, points: {} };
    for (const f of fc.features) { const nm = nameOf(f.properties || {}); if (NAMES.includes(nm) && f.geometry) out.countries[nm] = { ...(out.countries[nm] || {}), ...stats(f.geometry), geometry: f.geometry.type }; }
    for (const [k, pt] of Object.entries(POINTS)) out.points[k] = fc.features.filter((f) => f.geometry && contains(f.geometry, pt)).map((f) => nameOf(f.properties || {}) || '(sin nombre)');
    return out;
}

async function main() {
    const out = { probed_at: new Date().toISOString(), steps: {} };
    const step = async (name, fn) => { try { out.steps[name] = await fn(); log('OK  ', name); } catch (e) { out.steps[name] = { error: describe(e) }; log('XX  ', name, describe(e)); } };
    const GH = { Accept: 'application/vnd.github+json' };

    // 1. Natural Earth (repositorio espejo en GitHub): listar, leer licencia, medir
    let neFiles = [];
    await step('naturalearth-listing', async () => {
        const r = await get('https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson', { json: true, headers: GH });
        neFiles = r.json.filter((f) => /admin_0_(countries|map_units|sovereignty|disputed|boundary)/.test(f.name)).map((f) => ({ name: f.name, size: f.size, download_url: f.download_url }));
        return { ...r.meta, matching: neFiles.map((f) => f.name + ' ' + f.size) };
    });
    await step('naturalearth-license', async () => {
        const r = await get('https://api.github.com/repos/nvkelso/natural-earth-vector', { json: true, headers: GH });
        const l = await get('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/README.md').catch(() => null);
        return { ...r.meta, repo_license: r.json.license, description: r.json.description, readme_terms: l && (l.text.match(/[^.]*public domain[^.]*\./i) || [''])[0].trim() };
    });
    for (const want of ['ne_10m_admin_0_countries.geojson', 'ne_10m_admin_0_map_units.geojson', 'ne_50m_admin_0_countries.geojson']) {
        await step('naturalearth-' + want, async () => {
            const f = neFiles.find((x) => x.name === want);
            if (!f) throw new Error('no esta en el listado del repositorio');
            const r = await get(f.download_url, { json: true, timeout: 300000 });
            return { ...r.meta, ...analyze(r.json) };
        });
    }

    // 2. geoBoundaries: API de metadatos (licencia declarada por el propio servicio) y medicion
    await step('geoboundaries-api-ESP', async () => {
        const r = await get('https://www.geoboundaries.org/api/current/gbOpen/ESP/ADM0/', { json: true });
        const d = Array.isArray(r.json) ? r.json[0] : r.json;
        const meta = { ...r.meta, keys: Object.keys(d), license: d.boundaryLicense, license_detail: d.licenseDetail, source: d.boundarySource, year: d.boundaryYearRepresented, canonical: d.boundaryCanonical, download_keys: Object.keys(d).filter((k) => /Download/i.test(k)) };
        const url = d.gjDownloadURL || d.simplifiedGeometryGeoJSON;
        if (url) { const g = await get(url, { json: true, timeout: 300000 }); meta.geojson = { url, ...g.meta, ...analyze(g.json) }; }
        return meta;
    });

    // 3. Fronteras historicas con fecha: se descubre, no se asume. Busqueda de repositorios y comprobacion de OHM.
    await step('github-search-cshapes', async () => {
        const r = await get('https://api.github.com/search/repositories?q=cshapes&per_page=8', { json: true, headers: GH });
        const items = r.json.items.map((i) => ({ full_name: i.full_name, license: i.license && i.license.spdx_id, description: (i.description || '').slice(0, 140), stars: i.stargazers_count, pushed_at: i.pushed_at }));
        return { ...r.meta, items };
    });
    await step('github-search-historical-borders', async () => {
        const r = await get('https://api.github.com/search/repositories?q=historical+country+borders+geojson&per_page=8', { json: true, headers: GH });
        return { ...r.meta, items: r.json.items.map((i) => ({ full_name: i.full_name, license: i.license && i.license.spdx_id, description: (i.description || '').slice(0, 140), stars: i.stargazers_count })) };
    });
    for (const [name, url] of [['ohm-site', 'https://www.openhistoricalmap.org/'], ['ohm-api-capabilities', 'https://www.openhistoricalmap.org/api/capabilities'], ['ohm-vtiles-tilejson', 'https://vtiles.openhistoricalmap.org/maps/osm/metadata.json']]) {
        await step(name, async () => { const r = await get(url); return { ...r.meta, head: r.text.slice(0, 500) }; });
    }

    // 4. Como trata OpenStreetMap a Ceuta y Melilla (Nominatim: <= 1 peticion/s, con User-Agent identificado)
    for (const place of ['Ceuta', 'Melilla']) {
        await step('nominatim-' + place, async () => {
            const r = await get('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&accept-language=es&q=' + encodeURIComponent(place), { json: true });
            await new Promise((s) => setTimeout(s, 1500));
            return { ...r.meta, results: r.json.map((x) => ({ name: x.display_name, class: x.category, type: x.type, country: x.address && x.address.country, country_code: x.address && x.address.country_code })) };
        });
    }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
