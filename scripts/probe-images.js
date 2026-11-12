#!/usr/bin/env node
// probe-images.js - ¿Podemos enseñar la imagen de cada personaje, suceso o construccion? (lo pide el creador, 2026-11-12)
//
// Plan que se quiere comprobar (regla 6: nada se supone):
//   1. Nombres de archivo de la imagen principal (Wikidata P18) en un build, por lotes, desde QLever: ¿acepta POST? ¿cuanto tarda?
//      ¿que proporcion de nuestros QID tienen P18? (solo recuentos: no se descarga ninguna imagen en Node).
//   2. En un NAVEGADOR real y desde el origen de la web publicada (CORS de verdad):
//      - la API de Commons con origin=* devuelve la miniatura y los metadatos de licencia (autor, licencia, si exige atribucion);
//      - un <img> de la miniatura y de Special:FilePath?width= carga (naturalWidth > 0);
//      - la API de Wikidata con origin=* responde (por si hay que pedir P18 en ejecucion).
//   La prueba de navegador usa SOLO construcciones (Torre Eiffel, Notre-Dame...): no hace falta la foto de una persona para saber
//   si el servicio funciona.
// stdout = JSON; stderr = progreso. Corre en Actions (workflow images-probe.yml; informe en la rama images-probe).
'use strict';
const fs = require('fs');
const path = require('path');

const UA = 'ChronosTerrae-Probe/0.7 (https://github.com/enderHugin/chronosterrae)';
const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const SITE = process.argv[2] || 'https://enderhugin.github.io/chronosterrae/';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> ';
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, '..');

function eventQids() {
    const dir = path.join(root, 'data', 'events'); const q = new Map();
    for (const f of fs.readdirSync(dir).filter((x) => /^c\d+\.json$/.test(x))) {
        for (const ft of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features) {
            const p = ft.properties; const s = (p.sources || []).find((x) => x.kind === 'wikidata'); if (!s) continue;
            if (!q.has(s.id)) q.set(s.id, p.kind);
        }
    }
    return q;
}
function builtQids(n) {
    const t = JSON.parse(fs.readFileSync(path.join(root, 'data', 'built', 'built-map.json'), 'utf8'));
    const ix = Object.fromEntries(t.fields.map((k, i) => [k, i]));
    return t.rows.slice().sort((a, b) => b[ix.importance] - a[ix.importance]).slice(0, n).map((r) => r[ix.qid]);
}
async function q(method, query, how) {
    const t0 = Date.now();
    try {
        let res;
        if (method === 'GET') res = await fetch(QLEVER + '?query=' + encodeURIComponent(PRE + query), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(180000) });
        else if (how === 'form') res = await fetch(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: PRE + query }), signal: AbortSignal.timeout(180000) });
        else res = await fetch(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' }, body: PRE + query, signal: AbortSignal.timeout(180000) });
        const text = await res.text(); const ms = Date.now() - t0;
        if (!res.ok) return { method, how, status: res.status, ms, error: text.slice(0, 300) };
        const rows = JSON.parse(text).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
        return { method, how, status: res.status, ms, rows };
    } catch (e) { return { method, how, ms: Date.now() - t0, error: 'roto: ' + e.message }; }
    finally { await sleep(1500); }
}

(async () => {
    const out = { probed_at: new Date().toISOString(), site: SITE, qlever: {}, coverage: {}, browser: {} };
    // 1. P18 de unas construcciones: GET, POST de formulario y POST sparql-query
    const top = builtQids(4); log('construcciones de prueba', top.join(' '));
    const small = `SELECT ?item ?img WHERE { VALUES ?item { ${top.map((x) => 'wd:' + x).join(' ')} } ?item wdt:P18 ?img }`;
    for (const [m, how] of [['GET'], ['POST', 'form'], ['POST', 'sparql-query']]) {
        const r = await q(m, small, how); out.qlever[m + (how ? ' ' + how : '')] = r.rows ? { status: r.status, ms: r.ms, rows: r.rows } : r; log('qlever', m, how || '', r.status || r.error, r.ms + ' ms');
    }
    const files = ((out.qlever.GET && out.qlever.GET.rows) || []).map((r) => ({ item: r.item.split('/').pop(), url: r.img, file: decodeURIComponent(String(r.img).split('/Special:FilePath/')[1] || '') }));
    out.files = files;
    // 2. Cobertura de P18 en nuestros QID de sucesos (por tipo) y en las construcciones: lotes grandes por POST
    const ev = eventQids(); out.coverage.eventQids = ev.size;
    const postOk = ['POST form', 'POST sparql-query'].find((k) => out.qlever[k] && out.qlever[k].rows);
    const how = postOk ? postOk.split(' ')[1] : null;
    if (how) {
        const all = [...ev.keys()]; const byKind = {};
        for (const size of [2000, 8000]) {
            const batch = all.slice(0, size);
            const r = await q('POST', `SELECT ?item (SAMPLE(?img) AS ?i) WHERE { VALUES ?item { ${batch.map((x) => 'wd:' + x).join(' ')} } ?item wdt:P18 ?img } GROUP BY ?item`, how);
            out.coverage['batch' + size] = r.rows ? { ms: r.ms, withP18: r.rows.length, of: batch.length } : r;
            log('lote', size, r.rows ? r.rows.length + ' con P18 en ' + r.ms + ' ms' : r.error);
            if (r.rows && size === 8000) {
                const has = new Set(r.rows.map((x) => x.item.split('/').pop()));
                batch.forEach((qid) => { const k = ev.get(qid); byKind[k] = byKind[k] || [0, 0]; byKind[k][1]++; if (has.has(qid)) byKind[k][0]++; });
                out.coverage.byKind8000 = Object.fromEntries(Object.entries(byKind).map(([k, [a, b]]) => [k, a + '/' + b]));
            }
        }
        const bq = builtQids(5000);
        const r = await q('POST', `SELECT ?item (SAMPLE(?img) AS ?i) WHERE { VALUES ?item { ${bq.map((x) => 'wd:' + x).join(' ')} } ?item wdt:P18 ?img } GROUP BY ?item`, how);
        out.coverage.built = r.rows ? { ms: r.ms, withP18: r.rows.length, of: bq.length } : r;
    }

    // 3. Navegador real desde el origen de la web: CORS de las APIs y carga de miniaturas (solo construcciones)
    let chromium; try { ({ chromium } = require('playwright')); } catch (e) { out.browser.error = 'sin playwright: ' + e.message; }
    if (chromium && files.length) {
        const browser = await chromium.launch(); const page = await browser.newPage();
        try {
            await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
            out.browser.origin = await page.evaluate(() => location.origin);
            const titles = files.map((f) => 'File:' + f.file);
            out.browser.commons = await page.evaluate(async (titles) => {
                const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '320', iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl|AttributionRequired|UsageTerms|Copyrighted|Restrictions', format: 'json', origin: '*' });
                const t0 = performance.now();
                try {
                    const r = await fetch(u); const j = await r.json();
                    const pages = Object.values((j.query && j.query.pages) || {});
                    return { status: r.status, ms: Math.round(performance.now() - t0), acao: r.headers.get('access-control-allow-origin'), normalized: j.query && j.query.normalized,
                        pages: pages.map((p) => { const ii = (p.imageinfo || [])[0] || {}; const m = ii.extmetadata || {}; const v = (k) => (m[k] ? String(m[k].value).replace(/<[^>]+>/g, '').trim().slice(0, 200) : null);
                            return { title: p.title, missing: 'missing' in p, mime: ii.mime, size: [ii.width, ii.height], thumburl: ii.thumburl, thumbsize: [ii.thumbwidth, ii.thumbheight], descriptionurl: ii.descriptionurl,
                                artist: v('Artist'), credit: v('Credit'), license: v('LicenseShortName'), licenseUrl: v('LicenseUrl'), attributionRequired: v('AttributionRequired'), usageTerms: v('UsageTerms'), copyrighted: v('Copyrighted'), restrictions: v('Restrictions') }; }) };
                } catch (e) { return { error: 'roto (red o CORS): ' + e.message, ms: Math.round(performance.now() - t0) }; }
            }, titles);
            const thumbs = ((out.browser.commons && out.browser.commons.pages) || []).map((p) => p.thumburl).filter(Boolean);
            const fp = files.map((f) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f.file) + '?width=96');
            out.browser.img = await page.evaluate(async (urls) => Promise.all(urls.map((u) => new Promise((res) => {
                const im = new Image(); const t0 = performance.now(); const done = (ok) => res({ url: u, ok, w: im.naturalWidth, h: im.naturalHeight, ms: Math.round(performance.now() - t0) });
                im.onload = () => done(true); im.onerror = () => done(false); setTimeout(() => done(false), 20000); im.src = u;
            }))), thumbs.concat(fp));
            out.browser.wikidata = await page.evaluate(async (qid) => {
                const u = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json', origin: '*' });
                try { const r = await fetch(u); const j = await r.json(); return { status: r.status, acao: r.headers.get('access-control-allow-origin'), p18: ((j.claims && j.claims.P18) || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value) }; }
                catch (e) { return { error: 'roto (red o CORS): ' + e.message }; }
            }, files[0].item);
            // ¿Wikipedia da un resumen corto (para la ficha)? Solo comprobar CORS y forma con una construccion
            out.browser.wikipediaSummary = await page.evaluate(async () => {
                try { const r = await fetch('https://es.wikipedia.org/api/rest_v1/page/summary/Torre_Eiffel'); const j = await r.json(); return { status: r.status, acao: r.headers.get('access-control-allow-origin'), keys: Object.keys(j).slice(0, 30), extractLen: (j.extract || '').length, hasThumb: !!j.thumbnail }; }
                catch (e) { return { error: 'roto (red o CORS): ' + e.message }; }
            });
        } catch (e) { out.browser.error = e.message; }
        await browser.close();
    }
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})().catch((e) => { log('fallo', e && e.stack || e); process.exit(1); });
