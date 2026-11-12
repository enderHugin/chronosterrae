#!/usr/bin/env node
// probe-live.js - Dos preguntas antes de construir nada (regla 6: no suponer el comportamiento de una API externa)
//
//   node scripts/probe-live.js > live.json      (en Actions: workflow live-probe.yml, resultado en la rama live-probe)
//
// 1) BUSQUEDA EN DIRECTO EN WIKIDATA (el creador, 2026-11-12: «no aparece ninguna coincidencia con "Jaime"»). Nuestro indice solo tiene las
//    ~6.400 personas dibujadas en el mapa. ¿Puede la web preguntar a Wikidata desde el navegador?
//      a) wbsearchentities con origin=* y cabecera Origin de la web: estado, Access-Control-Allow-Origin, resultados y tiempo;
//      b) action=query&list=search con «haswbstatement:P31=Q5» (solo personas): lo mismo;
//      c) wbgetentities de los primeros: ¿traen P569/P570, P19/P20 y su P625 (otra peticion), P18?
// 2) LUGAR DE LOS DESCUBRIMIENTOS (el creador: «¿einstenio sin lugar de descubrimiento?»). El 97 % de nuestros descubrimientos no tiene
//    lugar porque solo se mira P189 (lugar del descubrimiento). ¿Que declara Wikidata del einstenio (Q1892, sacado de nuestros datos)? ¿Y cuantos
//    de nuestros descubrimientos sin lugar tendrian uno por descubridor (P61) -> lugar de trabajo (P937) o empleador (P108) con coordenadas?
//    Eso seria un lugar DEDUCIDO (donde trabajaba quien lo descubrio), no el del descubrimiento: hay que saber cuantos y como son antes de decidir.
'use strict';
const fs = require('fs');
const path = require('path');
const API = 'https://www.wikidata.org/w/api.php';
const QLEVER = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const UA = 'ChronosTerrae-Probe/0.2 (https://github.com/enderHugin/chronosterrae)';
const ORIGIN = 'https://enderhugin.github.io';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX wikibase: <http://wikiba.se/ontology#> ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, extra) {
    const t0 = Date.now();
    try {
        const res = await fetch(url, Object.assign({ headers: { 'User-Agent': UA, Origin: ORIGIN, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }, extra || {}));
        const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 300); }
        return { status: res.status, ms: Date.now() - t0, acao: res.headers.get('access-control-allow-origin'), bytes: text.length, body };
    } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e) }; }
}
async function sparql(q) {
    for (let a = 0; a < 4; a++) {
        const r = await get(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' }, body: PRE + q });
        if (r.status === 429) { await sleep(10000 * (a + 1)); continue; }
        await sleep(1200);
        if (r.status !== 200 || !r.body || !r.body.results) return { error: r.status + ' ' + JSON.stringify(r.body).slice(0, 300) };
        return { rows: r.body.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))), ms: r.ms };
    }
    return { error: '429' };
}
const claimIds = (e, p) => ((e && e.claims && e.claims[p]) || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean);

async function live() {
    const out = {};
    for (const [lang, q] of [['es', 'Jaime'], ['es', 'Jaime I de Aragón'], ['en', 'James I of Aragon'], ['es', 'einstenio']]) {
        const r = await get(API + '?' + new URLSearchParams({ action: 'wbsearchentities', search: q, language: lang, uselang: lang, type: 'item', limit: '10', format: 'json', origin: '*' }));
        out['wbsearchentities:' + lang + ':' + q] = { status: r.status, ms: r.ms, acao: r.acao, bytes: r.bytes, results: r.body && r.body.search ? r.body.search.map((x) => [x.id, x.label, x.description]) : r.body || r.error };
        await sleep(400);
    }
    for (const [lang, q] of [['es', 'Jaime haswbstatement:P31=Q5'], ['es', 'Jaime haswbstatement:P31=Q5 haswbstatement:P569']]) {
        const r = await get(API + '?' + new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: '10', srnamespace: '0', format: 'json', origin: '*', uselang: lang }));
        out['search:' + q] = { status: r.status, ms: r.ms, acao: r.acao, bytes: r.bytes, results: r.body && r.body.query ? r.body.query.search.map((x) => [x.title, x.snippet && x.snippet.slice(0, 80)]) : r.body || r.error };
        await sleep(400);
    }
    // c) detalles de los primeros de la busqueda filtrada
    const s = out['search:Jaime haswbstatement:P31=Q5 haswbstatement:P569'];
    const ids = Array.isArray(s.results) ? s.results.map((x) => x[0]).filter((x) => /^Q\d+$/.test(x)).slice(0, 8) : [];
    if (ids.length) {
        const r = await get(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims|sitelinks', languages: 'es|en', format: 'json', origin: '*' }));
        const ents = (r.body && r.body.entities) || {};
        const places = new Set();
        const people = ids.map((id) => { const e = ents[id]; const pl = [...claimIds(e, 'P19'), ...claimIds(e, 'P20')].map((v) => v.id); pl.forEach((x) => places.add(x));
            return { id, es: e && e.labels && e.labels.es && e.labels.es.value, desc: e && e.descriptions && e.descriptions.es && e.descriptions.es.value, sitelinks: e && e.sitelinks ? Object.keys(e.sitelinks).length : 0,
                P569: claimIds(e, 'P569').map((v) => [v.time, v.precision, v.calendarmodel.split('/').pop()]), P570: claimIds(e, 'P570').map((v) => [v.time, v.precision]), P19: claimIds(e, 'P19').map((v) => v.id), P20: claimIds(e, 'P20').map((v) => v.id), P18: claimIds(e, 'P18').slice(0, 1) }; });
        out.details = { status: r.status, ms: r.ms, acao: r.acao, bytes: r.bytes, people };
        const pr = await get(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: [...places].slice(0, 50).join('|'), props: 'labels|claims', languages: 'es', format: 'json', origin: '*' }));
        const pe = (pr.body && pr.body.entities) || {};
        out.places = { status: pr.status, ms: pr.ms, acao: pr.acao, bytes: pr.bytes, list: [...places].map((id) => [id, pe[id] && pe[id].labels && pe[id].labels.es && pe[id].labels.es.value, claimIds(pe[id], 'P625').map((v) => [v.longitude, v.latitude])[0] || null]) };
    }
    return out;
}

async function discoveries() {
    const out = {};
    // einstenio, tal como lo tenemos
    const r = await get(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: 'Q1892', props: 'labels|claims', languages: 'es|en', format: 'json' }));
    const e = r.body && r.body.entities && r.body.entities.Q1892;
    const pick = (p) => ((e && e.claims && e.claims[p]) || []).map((c) => { const v = c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return v && v.id ? v.id : v && v.time ? v.time : v; });
    out.einsteinium = { label: e && e.labels && e.labels.en && e.labels.en.value, P31: pick('P31'), P575: pick('P575'), P189: pick('P189'), P61: pick('P61'), P138: pick('P138'), props: e && e.claims ? Object.keys(e.claims).length : 0 };
    const linked = [...new Set([...out.einsteinium.P31, ...out.einsteinium.P61, ...out.einsteinium.P138, ...out.einsteinium.P189].filter((x) => typeof x === 'string' && /^Q\d+$/.test(x)))];
    if (linked.length) {
        const lr = await get(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: linked.join('|'), props: 'labels|claims', languages: 'es|en', format: 'json' }));
        const le = (lr.body && lr.body.entities) || {};
        out.einsteinium.linked = linked.map((id) => ({ id, en: le[id] && le[id].labels && le[id].labels.en && le[id].labels.en.value, es: le[id] && le[id].labels && le[id].labels.es && le[id].labels.es.value,
            P937: claimIds(le[id], 'P937').map((v) => v.id), P108: claimIds(le[id], 'P108').map((v) => v.id), P625: claimIds(le[id], 'P625').map((v) => [v.longitude, v.latitude]) }));
    }
    // cobertura en NUESTROS descubrimientos sin lugar
    const dir = path.join(__dirname, '..', 'data', 'events'); const qs = [];
    for (const f of fs.readdirSync(dir).filter((x) => /^c\d+\.json$/.test(x))) for (const ft of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features || []) {
        if (ft.properties.kind === 'discovery' && !ft.geometry) { const w = (ft.properties.sources || []).find((s) => s.kind === 'wikidata'); if (w) qs.push(w.id); }
    }
    out.placeless = qs.length;
    const sample = qs.slice(0, 2500); const V = sample.map((q) => 'wd:' + q).join(' ');
    const q1 = await sparql(`SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { VALUES ?item { ${V} } ?item wdt:P61 ?d }`);
    const q2 = await sparql(`SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { VALUES ?item { ${V} } ?item wdt:P61/wdt:P937/wdt:P625 ?c }`);
    const q3 = await sparql(`SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { VALUES ?item { ${V} } ?item wdt:P61/wdt:P108 ?org . { ?org wdt:P625 ?c } UNION { ?org wdt:P159/wdt:P625 ?c } }`);
    const q4 = await sparql(`SELECT ?cls ?l (COUNT(DISTINCT ?item) AS ?n) WHERE { VALUES ?item { ${V} } ?item wdt:P31 ?cls . OPTIONAL { ?cls rdfs:label ?l . FILTER(LANG(?l) = "es") } } GROUP BY ?cls ?l ORDER BY DESC(?n) LIMIT 25`);
    const q5 = await sparql(`SELECT ?item ?d ?dl ?w ?wl ?c WHERE { VALUES ?item { ${sample.slice(0, 40).map((q) => 'wd:' + q).join(' ')} } ?item wdt:P61 ?d . OPTIONAL { ?d rdfs:label ?dl . FILTER(LANG(?dl) = "en") } OPTIONAL { ?d wdt:P937 ?w . ?w wdt:P625 ?c . OPTIONAL { ?w rdfs:label ?wl . FILTER(LANG(?wl) = "en") } } } LIMIT 80`);
    out.coverage = { sample: sample.length, with_discoverer: q1.rows ? +q1.rows[0].n : q1.error, discoverer_work_location_coord: q2.rows ? +q2.rows[0].n : q2.error, discoverer_employer_coord: q3.rows ? +q3.rows[0].n : q3.error,
        classes: q4.rows ? q4.rows.map((x) => [x.cls.split('/').pop(), x.l, +x.n]) : q4.error, examples: q5.rows ? q5.rows.slice(0, 40).map((x) => [x.item.split('/').pop(), x.dl, x.wl || null, x.c || null]) : q5.error };
    // facetas para el buscador: clase P31 y «lleva el nombre de» P138 en todos los sucesos que no son personas
    return out;
}

(async () => {
    const out = { generated_at: new Date().toISOString() };
    try { out.live = await live(); } catch (e) { out.live = { error: String(e.stack || e) }; }
    try { out.discoveries = await discoveries(); } catch (e) { out.discoveries = { error: String(e.stack || e) }; }
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
