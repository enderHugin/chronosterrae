#!/usr/bin/env node
// probe-basemap.js - ¿Se puede usar OpenFreeMap (teselas vectoriales de OpenStreetMap, sin clave) desde el navegador?
// No se asume nada: se pide el estilo, el TileJSON y una tesela real, y se anota CORS, forma y tamano.
// Corre en Actions (el entorno de desarrollo solo alcanza GitHub y npm). stdout = JSON.

'use strict';

const ORIGIN = 'https://enderhugin.github.io';
const UA = 'ChronosTerrae-Probe/0.3 (https://github.com/enderHugin/chronosterrae)';
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');

async function get(url, binary) {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: ORIGIN }, signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ok: res.ok, bytes: buf.length, ms: Date.now() - t0, acao: res.headers.get('access-control-allow-origin'), type: res.headers.get('content-type'), encoding: res.headers.get('content-encoding'), cache: res.headers.get('cache-control'), body: binary ? buf : buf.toString('utf8') };
}
const lonLatToTile = (lon, lat, z) => { const n = 2 ** z; const x = Math.floor((lon + 180) / 360 * n); const r = lat * Math.PI / 180; const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); return [x, y]; };

async function main() {
    const out = { probed_at: new Date().toISOString(), steps: {} };
    const step = async (name, fn) => { try { out.steps[name] = await fn(); console.error('OK  ', name); } catch (e) { out.steps[name] = { error: describe(e) }; console.error('XX  ', name, describe(e)); } };
    let style;
    for (const name of ['liberty', 'positron', 'bright']) {
        await step('style-' + name, async () => {
            const r = await get('https://tiles.openfreemap.org/styles/' + name);
            const { body, ...meta } = r;
            if (r.ok) {
                const j = JSON.parse(body);
                if (name === 'liberty') style = j;
                const byType = {}; j.layers.forEach((l) => { byType[l.type] = (byType[l.type] || 0) + 1; });
                meta.summary = { sources: j.sources, glyphs: j.glyphs, sprite: j.sprite, layers: j.layers.length, byType, projection: j.projection, name: j.name };
                if (name === 'liberty') meta.layers = j.layers.map((l) => [l.id, l.type, l.source, l['source-layer'], l.minzoom, l.maxzoom].join(' '));
            }
            return meta;
        });
    }
    let tileUrl;
    await step('tilejson', async () => {
        const src = style && style.sources && Object.values(style.sources).find((s) => s.type === 'vector');
        if (!src || !src.url) throw new Error('el estilo no declara una fuente vectorial con url');
        const r = await get(src.url); const { body, ...meta } = r;
        if (r.ok) { const j = JSON.parse(body); tileUrl = j.tiles && j.tiles[0]; meta.summary = { tiles: j.tiles, minzoom: j.minzoom, maxzoom: j.maxzoom, attribution: j.attribution, bounds: j.bounds, vector_layers: (j.vector_layers || []).map((l) => l.id) }; }
        return meta;
    });
    await step('tile', async () => {
        if (!tileUrl) throw new Error('sin plantilla de tesela');
        const res = {};
        for (const [z, lon, lat, label] of [[6, 10, 48, 'europa-z6'], [12, -3.7, 40.4, 'madrid-z12'], [14, -3.7, 40.4, 'madrid-z14']]) {
            const [x, y] = lonLatToTile(lon, lat, z);
            const r = await get(tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y), true);
            const { body, ...meta } = r; res[label] = meta;
        }
        return res;
    });
    await step('glyph', async () => {
        if (!style || !style.glyphs) throw new Error('sin glyphs');
        const r = await get(style.glyphs.replace('{fontstack}', encodeURIComponent('Noto Sans Regular')).replace('{range}', '0-255'), true);
        const { body, ...meta } = r; return meta;
    });
    await step('sprite', async () => {
        if (!style || !style.sprite) throw new Error('sin sprite');
        const r = await get(style.sprite + '.json'); const { body, ...meta } = r; return meta;
    });
    await step('terms-page', async () => { const r = await get('https://openfreemap.org/'); const { body, ...meta } = r; meta.mentions = ['free', 'attribution', 'commercial', 'no limits', 'OpenMapTiles', 'ODbL'].filter((w) => body.toLowerCase().includes(w.toLowerCase())); meta.excerpt = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1800); return meta; });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
