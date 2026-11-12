#!/usr/bin/env node
// build-images.js - Nombre del archivo de la imagen principal (Wikidata P18) de cada suceso, persona y construccion que tenemos.
//
//   node scripts/build-images.js --out <carpeta>
//
// Solo se guarda el NOMBRE del archivo (dato de Wikidata, CC0). La imagen NO se copia: el navegador la pide a Wikimedia Commons al
// enseñarla, con su autor y su licencia (API de Commons). Sonda previa (images-probe, 2026-11-12): QLever acepta POST y resuelve 8 000
// QID en ~1,2 s; tienen P18 el 96 % de los QID de sucesos (99 % de personas) y el 99 % de las construcciones; desde el origen de la web
// la API de Commons (origin=*) da miniatura, autor y licencia, y las miniaturas cargan.
// Si un elemento tiene varias P18 se toma la primera por orden alfabetico (determinista; Wikidata no ordena las "verdaderas").
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QLEVER = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const UA = 'ChronosTerrae-Build/0.5 (https://github.com/enderHugin/chronosterrae)';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> ';
const root = path.join(__dirname, '..');
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** QID de nuestros datos: fuentes Wikidata de los sucesos y construcciones. */
function ourQids() {
    const q = new Set();
    const ev = path.join(root, 'data', 'events');
    for (const f of fs.readdirSync(ev).filter((x) => /^(c\d+|seed)\.json$/.test(x))) {
        for (const ft of JSON.parse(fs.readFileSync(path.join(ev, f), 'utf8')).features || []) (ft.properties.sources || []).forEach((s) => { if (s.kind === 'wikidata' && /^Q\d+$/.test(s.id)) q.add(s.id); });
    }
    const bm = path.join(root, 'data', 'built', 'built-map.json');
    if (fs.existsSync(bm)) { const t = JSON.parse(fs.readFileSync(bm, 'utf8')); const i = t.fields.indexOf('qid'); t.rows.forEach((r) => { if (/^Q\d+$/.test(r[i])) q.add(r[i]); }); }
    return [...q].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
}
/** URL de Special:FilePath del RDF -> nombre de archivo de Commons (sin "File:"). null si no tiene esa forma. */
function fileOf(url) {
    const m = /^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/(.+)$/.exec(String(url || ''));
    if (!m) return null;
    let f; try { f = decodeURIComponent(m[1]); } catch (e) { return null; }
    return /\.(jpe?g|png|gif|svg|tiff?|webp)$/i.test(f) && !/[\u0000-\u001f]/.test(f) ? f : null;
}
async function post(query) {
    for (let attempt = 0; ; attempt++) {
        const t0 = Date.now();
        try {
            const res = await fetch(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' }, body: PRE + query, signal: AbortSignal.timeout(180000) });
            const text = await res.text();
            if (res.status === 429 && attempt < 4) { await sleep(10000 * (attempt + 1)); continue; }
            if (!res.ok) throw new Error('SPARQL ' + res.status + ': ' + text.slice(0, 200));
            log('  lote', Date.now() - t0, 'ms');
            return JSON.parse(text).results.bindings;
        } catch (e) { if (attempt >= 3) throw e; log('reintento:', e.message); await sleep(5000 * (attempt + 1)); }
        finally { await sleep(1200); }
    }
}
async function main() {
    const out = arg('out'); if (!out) throw new Error('falta --out');
    const qids = ourQids(); log('QID:', qids.length);
    const files = {}; let rows = 0, bad = 0;
    for (let i = 0; i < qids.length; i += 6000) {
        const batch = qids.slice(i, i + 6000);
        const b = await post(`SELECT ?item ?img WHERE { VALUES ?item { ${batch.map((x) => 'wd:' + x).join(' ')} } ?item wdt:P18 ?img }`);
        rows += b.length;
        for (const r of b) {
            const q = r.item.value.split('/').pop(); const f = fileOf(r.img.value);
            if (!f) { bad++; continue; }
            if (!files[q] || f < files[q]) files[q] = f;
        }
    }
    const sorted = Object.fromEntries(Object.keys(files).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)).map((k) => [k, files[k]]));
    const body = JSON.stringify({ note: 'Nombre del archivo de Wikimedia Commons de la imagen principal (Wikidata P18) de cada QID de data/events y data/built. Solo nombres (Wikidata, CC0); la imagen se pide a Commons al enseñarla, con su autor y su licencia.',
        source: 'Wikidata (CC0) via QLever', retrieved_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), qids: qids.length, with_image: Object.keys(sorted).length, rows, unusable: bad, files: sorted });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'p18.json'), body + '\n');
    log('hecho:', Object.keys(sorted).length, 'de', qids.length, 'con imagen;', bad, 'valores no utilizables;', crypto.createHash('sha256').update(body + '\n').digest('hex').slice(0, 12));
}
module.exports = { fileOf, ourQids };
if (require.main === module) main().catch((e) => { log('fallo:', e && e.stack || e); process.exit(1); });
