#!/usr/bin/env node
// probe-ofm-labels.js - ¿Que capas de ROTULOS trae el estilo de OpenFreeMap (liberty) y que clases de nombre llegan en sus teselas?
// Hace falta para mostrar, con las fronteras apagadas, solo los nombres de accidentes geograficos (mares, rios, montanas, islas...) y no los politicos
// (paises, estados, ciudades). No se supone el esquema: se lee el estilo real y se cuentan clases/atributos de teselas reales. stdout = JSON.
// Necesita: npm i @mapbox/vector-tile pbf   (lo hace el workflow probe-ofm-labels.yml). Corre en Actions.
'use strict';
const zlib = require('zlib');
const { VectorTile } = require('@mapbox/vector-tile');
const PbfModule = require('pbf'); const Protobuf = PbfModule.default || PbfModule;
const UA = 'ChronosTerrae-Probe/0.3 (https://github.com/enderHugin/chronosterrae)';
const tileOf = (lon, lat, z) => { const n = 2 ** z; const r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
// Sitios con accidentes de todo tipo: Alpes/Mediterraneo, Himalaya, Amazonia, Mar Caribe, Islandia, Japon, Sahara/Nilo, Grandes Lagos, Patagonia, Oceano Pacifico
const PLACES = { alpes_mediterraneo: [8, 44], himalaya: [86, 28], amazonia: [-62, -4], caribe: [-75, 15], islandia: [-19, 65], japon: [138, 36], nilo: [31, 27], grandes_lagos: [-84, 45], patagonia: [-72, -48], pacifico: [-150, 0], norte_atlantico: [-30, 40], oceano_indico: [80, -20] };
const ZOOMS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

async function getTile(tpl, z, x, y) {
    const res = await fetch(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': UA } });
    if (!res.ok) return { status: res.status };
    let buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    return { status: res.status, tile: new VectorTile(new Protobuf(buf)) };
}

async function main() {
    const out = { probed_at: new Date().toISOString(), style: null, styleLayers: [], tilejson: null, tileLayers: {} };
    const sr = await fetch('https://tiles.openfreemap.org/styles/liberty', { headers: { 'User-Agent': UA } });
    out.style = { status: sr.status };
    if (sr.ok) {
        const style = await sr.json();
        out.style.sources = Object.keys(style.sources || {});
        out.styleLayers = (style.layers || []).filter((l) => l.type === 'symbol').map((l) => ({
            id: l.id, sourceLayer: l['source-layer'] || null, minzoom: l.minzoom ?? null, maxzoom: l.maxzoom ?? null, filter: l.filter || null,
            textField: l.layout && l.layout['text-field'] !== undefined ? l.layout['text-field'] : null, hasIcon: Boolean(l.layout && l.layout['icon-image'])
        }));
        out.allLayerIds = (style.layers || []).map((l) => l.id + ':' + l.type + ':' + (l['source-layer'] || ''));
    }
    const tj = await fetch('https://tiles.openfreemap.org/planet', { headers: { 'User-Agent': UA } });
    out.tilejson = tj.ok ? { layers: ((await tj.json()).vector_layers || []).map((v) => v.id) } : { status: tj.status };
    const tjFull = await (await fetch('https://tiles.openfreemap.org/planet', { headers: { 'User-Agent': UA } })).json();
    const tpl = tjFull.tiles && tjFull.tiles[0];
    for (const [name, [lon, lat]] of Object.entries(PLACES)) {
        for (const z of ZOOMS) {
            const [x, y] = tileOf(lon, lat, z);
            try {
                const r = await getTile(tpl, z, x, y); if (!r.tile) continue;
                for (const [ln, layer] of Object.entries(r.tile.layers)) {
                    if (!/^(place|water_name|waterway|mountain_peak|poi|boundary|aeroway|park|transportation_name|housenumber|aerodrome_label|island|natural)/.test(ln)) continue;
                    const L = out.tileLayers[ln] = out.tileLayers[ln] || { features: 0, attributes: {}, namedExamples: [] };
                    for (let i = 0; i < layer.length; i++) {
                        const f = layer.feature(i); L.features++;
                        for (const [k, v] of Object.entries(f.properties)) {
                            if (k.startsWith('name') || k === 'ele_ft' || k === 'wikidata' || k === 'wikipedia') continue;
                            const a = L.attributes[k] = L.attributes[k] || {}; const key = String(v);
                            if (Object.keys(a).length < 40 || key in a) a[key] = (a[key] || 0) + 1;
                        }
                        const nm = f.properties.name || f.properties['name:latin'];
                        if (nm && L.namedExamples.length < 60 && !L.namedExamples.some((e) => e.name === nm)) L.namedExamples.push({ name: nm, z, props: Object.fromEntries(Object.entries(f.properties).filter(([k]) => !k.startsWith('name') && k !== 'wikidata' && k !== 'wikipedia')) });
                    }
                }
            } catch (e) { (out.errors = out.errors || []).push(name + ' z' + z + ': ' + e.message); }
        }
    }
    console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });
