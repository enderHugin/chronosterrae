#!/usr/bin/env node
// probe-ofm-tile.js - ¿Como llegan en las teselas de OpenFreeMap los espigones, diques y puertos (obras humanas modernas)?
// Hace falta saberlo para no dibujarlos en fechas anteriores a que existieran. No se asume el esquema: se baja una tesela
// z14 de varios puertos y de una costa natural, se decodifica y se cuentan capas, clases y atributos. stdout = JSON.
// Necesita: npm i @mapbox/vector-tile pbf   (lo hace el workflow probe-ofm.yml). Corre en Actions.
'use strict';
const zlib = require('zlib');
const { VectorTile } = require('@mapbox/vector-tile');
const Protobuf = require('pbf');
const UA = 'ChronosTerrae-Probe/0.3 (https://github.com/enderHugin/chronosterrae)';
const tileOf = (lon, lat, z) => { const n = 2 ** z; const r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
const PLACES = { barcelona_puerto: [2.17, 41.36], rotterdam_maasvlakte: [4.03, 51.95], hamburgo: [9.97, 53.54], fisterra_costa_natural: [-9.27, 42.91], pier_santa_monica: [-118.497, 34.009] };
async function main() {
    const out = { probed_at: new Date().toISOString(), tilejson: null, tiles: {} };
    const tj = await fetch('https://tiles.openfreemap.org/planet', { headers: { 'User-Agent': UA } });
    out.tilejson = tj.ok ? await tj.json() : { status: tj.status };
    const tpl = out.tilejson && out.tilejson.tiles && out.tilejson.tiles[0];
    out.template = tpl || null;
    for (const [name, [lon, lat]] of Object.entries(PLACES)) {
        const [x, y] = tileOf(lon, lat, 14);
        try {
            const res = await fetch(tpl.replace('{z}', 14).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': UA } });
            let buf = Buffer.from(await res.arrayBuffer());
            if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
            const tile = new VectorTile(new Protobuf(buf));
            const layers = {};
            for (const [ln, layer] of Object.entries(tile.layers)) {
                const attrs = {}; const classes = {};
                for (let i = 0; i < layer.length; i++) {
                    const f = layer.feature(i);
                    for (const [k, v] of Object.entries(f.properties)) { if (k.startsWith('name')) continue; attrs[k] = attrs[k] || {}; const key = String(v); if (Object.keys(attrs[k]).length < 25) attrs[k][key] = (attrs[k][key] || 0) + 1; }
                }
                layers[ln] = { features: layer.length, extent: layer.extent, attributes: attrs };
            }
            out.tiles[name] = { x, y, status: res.status, bytes: buf.length, layers };
        } catch (e) { out.tiles[name] = { error: e.message }; }
    }
    console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });
