#!/usr/bin/env node
// build-built.js - Construcciones con fecha (catedrales, piramides, castillos, puentes...) desde Wikidata, para la capa «Construcciones».
//
//   node scripts/build-built.js --out <carpeta> [--min-sl 20]
//
// Lo pide el creador (2026-11-12): "Superficie de la tierra, construcciones, catedrales, piramides, capas de nombres".
// Sonda previa (places-probe, 2026-11-12): con coordenadas (P625) y fecha de construccion (P571) hay 5 344 "estructuras construidas"
// (Q811979 y subclases) con >= 20 Wikipedias y 18 014 con >= 10; la fecha suele ser al año (3 880 de 5 344), 421 al siglo.
// Servidor: QLever (mismo grafo de Wikidata; WDQS agotaba el tiempo). Corre en Actions: el entorno de desarrollo no alcanza Wikidata.
//
// Reglas (nada se inventa):
//   - Cada QID de clase se verifica por su etiqueta inglesa ANTES de usarlo; si no coincide, esa familia no se usa (y se dice).
//   - Fechas antes del año 1 y con precision de decada/siglo/milenio: la numeracion de los años en el RDF de Wikidata no es la de su
//     interfaz (no hay año 0 en una y si en la otra) y la de siglo depende de la convencion. NO se supone: se CALIBRA con una muestra,
//     comparando el valor del RDF con el texto que la propia Wikibase genera para esa misma declaracion (wbformatvalue: "2560 BCE",
//     "12th century"). Un grupo (precision x era) que no queda calibrado sin contradicciones se descarta entero y se cuenta.
//   - Varias fechas de construccion (reconstrucciones: Santa Sofia 360, 415, 537): se toma la MAS ANTIGUA como inicio y se guardan todas.
//   - P576 ("disuelto, abolido o demolido") mezcla demolicion y abandono (Machu Picchu 1572 sigue en pie como ruina): NO se borra la
//     construccion en esa fecha; se marca como "fin segun Wikidata" y la capa la atenua. Solo cuenta si es posterior a la ultima P571
//     (si no, se refiere a un edificio anterior en el mismo sitio).
//   - Todo entra como status "raw" (ingesta automatica), evidence "documentary", con la fuente (QID y propiedades).
// Salida: built.json (FeatureCollection que cumple schemas/record.schema.json) y manifest.json (recuentos, descartes, calibracion).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../sky/sky.js');

const ENDPOINT = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const API = process.env.CT_WIKIDATA_API || 'https://www.wikidata.org/w/api.php';
const UA = 'ChronosTerrae-Build/0.4 (https://github.com/enderHugin/chronosterrae)';
const JD_1950 = 2433282.5;
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

// Familias, por prioridad (un elemento que es a la vez templo y piramide va a "piramide"). Etiqueta inglesa esperada al lado:
// todas verificadas en la sonda places-probe (wbgetentities o wbsearchentities, 2026-11-12) y se vuelven a verificar en cada build.
const FAMILIES = [
    ['pyramid', [['Q12516', 'pyramid'], ['Q2270185', 'Mesoamerican pyramid'], ['Q170153', 'ziggurat']]],
    ['religious', [['Q2977', 'cathedral'], ['Q16970', 'church building'], ['Q44539', 'temple'], ['Q32815', 'mosque'], ['Q34627', 'synagogue'],
        ['Q842402', 'Hindu temple'], ['Q5393308', 'Buddhist temple'], ['Q180987', 'stupa'], ['Q44613', 'monastery']]],
    // 2a pasada: museos y chateaux (las etiquetas vienen de las clases P31 que trajo la 1a; se vuelven a verificar)
    ['palace', [['Q16560', 'palace'], ['Q751876', 'château'], ['Q33506', 'museum']]],
    ['fortification', [['Q23413', 'castle'], ['Q57821', 'fortification']]],
    ['monument', [['Q4989906', 'monument'], ['Q162875', 'mausoleum'], ['Q193475', 'menhir'], ['Q164240', 'megalith'], ['Q1935728', 'stone circle']]],
    ['venue', [['Q54831', 'amphitheatre'], ['Q483110', 'stadium'], ['Q641226', 'arena'], ['Q24354', 'theatre building'], ['Q153562', 'opera house'], ['Q1060829', 'concert hall']]],
    ['tower', [['Q12518', 'tower'], ['Q11303', 'skyscraper'], ['Q39715', 'lighthouse']]],
    ['infrastructure', [['Q12280', 'bridge'], ['Q12323', 'dam'], ['Q474', 'aqueduct'], ['Q1248784', 'airport'], ['Q55488', 'railway station'], ['Q928830', 'metro station']]],
    ['archaeological', [['Q839954', 'archaeological site']]]
];
const BASE = [['Q811979', 'built structure'], ['Q839954', 'archaeological site'], ['Q486972', 'human settlement']];
// 1a pasada: entraban ciudades (Atenas, Damasco, El Cairo, Constantinopla...) porque Wikidata las tipa tambien como yacimiento. Una ciudad no es
// una construccion: va a la capa de nombres. Se excluye todo lo que es asentamiento humano (Q486972 y subclases).
const PROPS = [['P571', 'inception'], ['P576', 'dissolved, abolished or demolished'], ['P625', 'coordinate location'], ['P31', 'instance of'], ['P279', 'subclass of']];
const CAL = { Q1985727: 'gregorian', Q1985786: 'julian' };
const PREC = { 6: 'millennium', 7: 'century', 8: 'decade', 9: 'year', 10: 'month', 11: 'day' };
const COORD_RE = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i;
const PREFIXES = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ';

/* ------------------------------------------------------------------ */
/* Fechas: valor del RDF -> intervalo en años astronomicos               */
/* ------------------------------------------------------------------ */
const ymd = (t) => { const m = /^(-?\d{1,})-(\d{2})-(\d{2})T/.exec(t || ''); return m ? { y: parseInt(m[1], 10), mo: parseInt(m[2], 10), d: parseInt(m[3], 10), m } : null; };
/** Grupo de calibracion de un valor: precision y era (la era la decide el año tal como viene en el RDF). */
const groupOf = (yRdf, prec) => (prec >= 9 ? (yRdf >= 1 ? 'year+|ce' : 'year+|bce') : PREC[prec] + '|' + (yRdf >= 1 ? 'ce' : 'bce'));

/**
 * Intervalo [a, b] en años ASTRONOMICOS (inclusive, años enteros) que denota un valor del RDF con su precision, segun una regla de
 * numeracion: 'astro' = el año del RDF ya es astronomico (0 = 1 a. C.); 'hist' = es historico (sin año 0: -1 = 1 a. C.).
 * Siglo, decada y milenio se toman como en la interfaz de Wikidata: el siglo que CONTIENE ese año (1200 -> s. XII = 1101-1200).
 */
function rdfInterval(yRdf, prec, rule) {
    const astro = rule === 'hist' && yRdf < 1 ? yRdf + 1 : yRdf;      // a astronomico
    if (prec >= 9) return [astro, astro];
    const hist = astro >= 1 ? astro : -(1 - astro);                   // historico con signo: 1 a. C. = -1
    const unit = prec === 8 ? 10 : prec === 7 ? 100 : prec === 6 ? 1000 : null;
    if (!unit) return null;
    if (prec === 8) {                                                // decada: "1950s" = 1950-1959; "2560s BCE" = 2569-2560 a. C.
        if (hist > 0) { const d0 = Math.floor(hist / 10) * 10; return [d0, d0 + 9]; }
        const n = Math.floor(-hist / 10) * 10; return [1 - (n + 9), 1 - n];
    }
    if (hist > 0) { const n = Math.ceil(hist / unit); return [unit * (n - 1) + 1, unit * n]; }
    const n = Math.ceil(-hist / unit); return [1 - unit * n, 1 - (unit * (n - 1) + 1)];
}
/** Texto de Wikibase (wbformatvalue, en) -> intervalo en años astronomicos. null si no se entiende (y entonces no calibra). */
function textInterval(text) {
    const s = String(text || '').trim().replace(/\s+/g, ' ');
    let m;
    const bce = /\s(BCE|BC)$/.test(s); const core = s.replace(/\s(BCE|BC|CE|AD)$/, '');
    const hist = (n) => (bce ? 1 - n : n);
    if ((m = /^(\d+)$/.exec(core))) { const y = hist(+m[1]); return [y, y]; }
    if ((m = /^(\d+)s$/.exec(core))) { const n = +m[1]; return bce ? [1 - (n + 9), 1 - n] : [n, n + 9]; }
    if ((m = /^(\d+)(?:st|nd|rd|th)\.? century$/.exec(core)) || (m = /^(\d+)\. century$/.exec(core))) { const n = +m[1]; return bce ? [1 - 100 * n, 1 - (100 * (n - 1) + 1)] : [100 * (n - 1) + 1, 100 * n]; }
    if ((m = /^(\d+)(?:st|nd|rd|th)\.? millennium$/.exec(core)) || (m = /^(\d+)\. millennium$/.exec(core))) { const n = +m[1]; return bce ? [1 - 1000 * n, 1 - (1000 * (n - 1) + 1)] : [1000 * (n - 1) + 1, 1000 * n]; }
    // dia o mes ("16 February 360", "February 360 BCE"): solo interesa el año
    if ((m = /(?:^|\s)(\d+)$/.exec(core))) { const y = hist(+m[1]); return [y, y]; }
    return null;
}
/**
 * Calibracion: muestras [{yRdf, prec, text}] -> regla por grupo ('astro' | 'hist' | null si no hay una que valga para TODAS las del grupo).
 * Un grupo sin muestras queda sin regla (y sus fechas se descartan).
 */
function calibrate(samples) {
    const groups = {};
    for (const s of samples) {
        const g = groupOf(s.yRdf, s.prec); const want = textInterval(s.text);
        (groups[g] = groups[g] || { n: 0, astro: 0, hist: 0, unreadable: 0, examples: [] }).n++;
        if (!want) { groups[g].unreadable++; continue; }
        for (const rule of ['astro', 'hist']) { const got = rdfInterval(s.yRdf, s.prec, rule); if (got && got[0] === want[0] && got[1] === want[1]) groups[g][rule]++; }
        if (groups[g].examples.length < 4) groups[g].examples.push({ rdf: s.yRdf, prec: s.prec, text: s.text });
    }
    const rules = {};
    for (const [g, c] of Object.entries(groups)) {
        const ok = c.n - c.unreadable;
        c.rule = ok >= 2 && c.astro === ok && c.hist !== ok ? 'astro' : ok >= 2 && c.hist === ok && c.astro !== ok ? 'hist' : ok >= 2 && c.astro === ok && c.hist === ok ? 'astro' : null;
        rules[g] = c.rule;
    }
    return { rules, groups };
}

/** Intervalo en JD [a, b) de un valor del RDF (con su calendario), segun las reglas calibradas; {skip} si no se puede. */
function valueToJD(t, prec, calIri, rules) {
    const v = ymd(t); if (!v) return { skip: 'fecha ilegible' };
    const cal = CAL[String(calIri || '').split('/').pop()]; if (!cal) return { skip: 'calendario desconocido' };
    if (!(prec >= 6)) return { skip: 'precision menor que el milenio' };
    const g = groupOf(v.y, prec); const rule = rules[g];
    if (!rule) return { skip: 'sin calibrar: ' + g };
    const iv = rdfInterval(v.y, prec, rule);
    try {
        if (prec >= 11) { const y = iv[0]; const jd = S.calendarToJD({ year: y, month: v.mo, day: v.d }, cal).jd; return { a: jd, b: jd + 1, cal, prec, years: iv }; }
        if (prec === 10) { const y = iv[0]; const a = S.calendarToJD({ year: y, month: v.mo, day: 1 }, cal).jd; const b = v.mo === 12 ? S.calendarToJD({ year: y + 1, month: 1, day: 1 }, cal).jd : S.calendarToJD({ year: y, month: v.mo + 1, day: 1 }, cal).jd; return { a, b, cal, prec, years: iv }; }
        return { a: S.calendarToJD({ year: iv[0], month: 1, day: 1 }, cal).jd, b: S.calendarToJD({ year: iv[1] + 1, month: 1, day: 1 }, cal).jd, cal, prec, years: iv };
    } catch (e) { return { skip: 'fecha invalida: ' + e.message }; }
}
const ybpOf = (jd) => (JD_1950 - jd) / 365.25;
const isoYear = (y) => (y < 0 ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0'));
function isoOf(v, iv, prec) {
    if (prec >= 11) return isoYear(iv[0]) + '-' + String(v.mo).padStart(2, '0') + '-' + String(v.d).padStart(2, '0');
    if (prec === 10) return isoYear(iv[0]) + '-' + String(v.mo).padStart(2, '0');
    return iv[0] === iv[1] ? isoYear(iv[0]) : isoYear(iv[0]) + '/' + isoYear(iv[1]);
}

/* ------------------------------------------------------------------ */
/* Filas -> registros                                                    */
/* ------------------------------------------------------------------ */
/**
 * rows: filas de la consulta principal (item, label, es, sl, coord, t, prec, cal) y de la de fin (item, t, prec, cal en endRows).
 * families: Map qid -> familia; classes: Map qid -> [{id, label}]. Devuelve { features, skipped }.
 */
function rowsToFeatures(rows, endRows, families, classes, rules, retrievedAt) {
    const by = new Map(); const skipped = {};
    const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
    for (const b of rows) {
        const qid = String(b.item || '').split('/').pop(); if (!/^Q\d+$/.test(qid)) { skip('sin identificador'); continue; }
        let it = by.get(qid);
        if (!it) { it = { qid, label: b.label, es: b.es, sl: parseInt(b.sl, 10) || 0, coord: null, starts: new Map(), ends: new Map() }; by.set(qid, it); }
        if (!it.es && b.es) it.es = b.es;
        if (!it.coord) { const c = COORD_RE.exec(b.coord || ''); if (c && Math.abs(+c[1]) <= 180 && Math.abs(+c[2]) <= 90) it.coord = [Math.round(+c[1] * 1e5) / 1e5, Math.round(+c[2] * 1e5) / 1e5]; }
        const key = b.t + '|' + b.prec + '|' + b.cal; if (!it.starts.has(key)) it.starts.set(key, b);
    }
    for (const b of endRows) {
        const qid = String(b.item || '').split('/').pop(); const it = by.get(qid); if (!it) continue;
        const key = b.t + '|' + b.prec + '|' + b.cal; if (!it.ends.has(key)) it.ends.set(key, b);
    }
    const features = [];
    for (const it of by.values()) {
        if (!it.label || /^Q\d+$/.test(it.label) || /^\d{1,4}$/.test(it.label)) { skip('sin etiqueta'); continue; }
        if (!it.coord) { skip('sin coordenadas legibles'); continue; }
        const starts = [];
        for (const b of it.starts.values()) { const r = valueToJD(b.t, parseInt(b.prec, 10), b.cal, rules); if (r.skip) skip('inicio: ' + r.skip); else starts.push(Object.assign(r, { v: ymd(b.t) })); }
        if (!starts.length) { skip('sin fecha de construccion utilizable'); continue; }
        starts.sort((x, y) => (x.a + x.b) - (y.a + y.b));
        const first = starts[0]; const lastStartMid = (starts[starts.length - 1].a + starts[starts.length - 1].b) / 2;
        const ends = [];
        for (const b of it.ends.values()) { const r = valueToJD(b.t, parseInt(b.prec, 10), b.cal, rules); if (!r.skip) ends.push(Object.assign(r, { v: ymd(b.t) })); else skip('fin: ' + r.skip); }
        // el fin solo vale si es posterior a la ULTIMA construccion (si no, habla de un edificio anterior en el mismo sitio)
        const validEnds = ends.filter((e) => (e.a + e.b) / 2 > lastStartMid).sort((x, y) => (y.a + y.b) - (x.a + x.b));
        if (ends.length && !validEnds.length) skip('fin anterior a la ultima construccion (se ignora el fin)');
        const end = validEnds[0] || null;
        const mid = (first.a + first.b) / 2;
        const now = Date.parse(retrievedAt) / 86400000 + 2440587.5;
        const time = {
            start_ybp: +ybpOf(mid).toFixed(4), end_ybp: +ybpOf(end ? (end.a + end.b) / 2 : now).toFixed(4), uncertainty_yr: +((first.b - first.a) / 2 / 365.25).toFixed(4),
            precision: PREC[Math.min(first.prec, 11)], iso: isoOf(first.v, first.years, first.prec), calendar: first.cal
        };
        if (time.end_ybp > time.start_ybp) time.end_ybp = time.start_ybp;
        const fam = families.get(it.qid) || 'other';
        const labels = { en: it.label }; if (it.es) labels.es = it.es;
        const props = {
            id: 'wd.' + it.qid.toLowerCase() + '.built', name: it.label, labels, layer: 'built',
            importance: Math.round(Math.max(0, Math.min(1, Math.log10(Math.max(it.sl, 1)) / 2.2)) * 100) / 100,
            evidence: 'documentary', time, scale: { min_m: 50, max_m: 20000000 },
            sources: [{ kind: 'wikidata', id: it.qid, citation: 'Wikidata ' + it.qid + ': P571 (construccion)' + (end ? ', P576 (fin)' : '') + ', P625 (lugar)', retrieved_at: retrievedAt }],
            status: 'raw',
            built: {
                family: fam,
                dates: starts.map((s) => ({ iso: isoOf(s.v, s.years, s.prec), precision: PREC[Math.min(s.prec, 11)], calendar: s.cal })),
                end: end ? { iso: isoOf(end.v, end.years, end.prec), precision: PREC[Math.min(end.prec, 11)], calendar: end.cal } : null
            }
        };
        const cls = classes.get(it.qid); if (cls && cls.length) props.classes = cls.slice(0, 6);
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: it.coord }, properties: props });
    }
    features.sort((a, b) => b.properties.importance - a.properties.importance || a.properties.id.localeCompare(b.properties.id));
    return { features, skipped };
}

/* ------------------------------------------------------------------ */
/* Red (solo en Actions)                                                 */
/* ------------------------------------------------------------------ */
let lastQ = 0;
async function sparql(q, timeoutMs = 300000) {
    for (let attempt = 0; ; attempt++) {
        const wait = 1500 - (Date.now() - lastQ); if (wait > 0) await sleep(wait);
        const t0 = Date.now(); let res; let text;
        try {
            res = await fetch(ENDPOINT + '?query=' + encodeURIComponent(PREFIXES + q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
            text = await res.text();
        } catch (e) { lastQ = Date.now(); if (attempt >= 3) throw e; log('red:', e.message, '- reintento'); await sleep(10000 * (attempt + 1)); continue; }
        lastQ = Date.now();
        if (res.status === 429 && attempt < 4) { log('429: espero'); await sleep(10000 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error('SPARQL ' + res.status + ': ' + text.slice(0, 300));
        const j = JSON.parse(text);
        log('  consulta', (Date.now() - t0) + ' ms,', j.results.bindings.length, 'filas');
        return j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    }
}
async function api(params) {
    const u = API + '?' + new URLSearchParams(Object.assign({ format: 'json' }, params));
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
            if (res.status === 429 && attempt < 3) { await sleep(5000 * (attempt + 1)); continue; }
            return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
        } catch (e) { if (attempt >= 2) return { error: e.message }; await sleep(3000); }
    }
}
const ITEMS = (minSl) => `{ ?item wdt:P31/wdt:P279* wd:Q811979 } UNION { ?item wdt:P31/wdt:P279* wd:Q839954 }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${minSl})
  ?item wdt:P625 ?coord .
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q486972 }`;

async function main() {
    const out = arg('out'); if (!out) throw new Error('falta --out');
    const minSl = parseInt(arg('min-sl') || '20', 10);
    fs.mkdirSync(out, { recursive: true });
    const retrievedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const manifest = { generated_at: retrievedAt, source: 'Wikidata (CC0) via QLever (' + ENDPOINT + ')', min_sitelinks: minSl, verify: {}, calibration: null, families: {}, counts: {}, skipped: {} };

    // 1. Verificar identificadores por su etiqueta
    const want = [...BASE, ...FAMILIES.flatMap(([, l]) => l), ...PROPS];
    const ents = {};
    for (let i = 0; i < want.length; i += 40) {
        const j = await api({ action: 'wbgetentities', ids: want.slice(i, i + 40).map((x) => x[0]).join('|'), props: 'labels', languages: 'en' });
        if (!j.entities) throw new Error('no se pudieron verificar los identificadores (roto, no rechazado): ' + JSON.stringify(j).slice(0, 200));
        Object.assign(ents, j.entities);
    }
    const ok = (id, label) => { const l = ents[id] && ents[id].labels && ents[id].labels.en && ents[id].labels.en.value; manifest.verify[id] = { want: label, got: l || null, ok: !!l && l.toLowerCase() === label.toLowerCase() }; return manifest.verify[id].ok; };
    want.forEach(([id, l]) => ok(id, l));
    if (!BASE.every(([id]) => manifest.verify[id].ok) || !PROPS.every(([id]) => manifest.verify[id].ok)) throw new Error('clases base o propiedades sin verificar: ' + JSON.stringify(manifest.verify));

    // 2. Calibrar la numeracion de años y las precisiones bajas con el texto de la propia Wikibase
    const sampleQ = (cond, lim) => `SELECT ?item ?st ?t ?prec ?cal WHERE { ${ITEMS(minSl)} ?item p:P571 ?st . ?st psv:P571 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal . FILTER(${cond}) } ORDER BY DESC(?sl) LIMIT ${lim}`;
    const DT = (y) => '"' + (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0') + '-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>';
    let sample = [];
    for (const cond of [`?prec >= 9 && ?t < ${DT(1)}`, `?prec >= 9 && ?t >= ${DT(1)}`, `?prec = 8 && ?t < ${DT(1)}`, `?prec = 8 && ?t >= ${DT(1)}`,
        `?prec = 7 && ?t < ${DT(1)}`, `?prec = 7 && ?t >= ${DT(1)}`, `?prec = 6 && ?t < ${DT(1)}`, `?prec = 6 && ?t >= ${DT(1)}`]) {
        try { sample = sample.concat(await sparql(sampleQ(cond, 14))); } catch (e) { log('muestra fallida:', cond, e.message); }
    }
    const byItem = {};
    sample.forEach((s) => { const q = s.item.split('/').pop(); (byItem[q] = byItem[q] || []).push(s); });
    const qids = Object.keys(byItem); const claims = {};
    for (let i = 0; i < qids.length; i += 40) {
        const j = await api({ action: 'wbgetentities', ids: qids.slice(i, i + 40).join('|'), props: 'claims' });
        if (j.entities) for (const [q, e] of Object.entries(j.entities)) for (const c of ((e.claims || {}).P571 || [])) claims[c.id] = c.mainsnak && c.mainsnak.datavalue;
    }
    const calSamples = [];
    for (const s of sample) {
        const id = s.st.split('/').pop().replace(/^(Q\d+)-/, '$1$');
        const dv = claims[id]; if (!dv) continue;
        const f = await api({ action: 'wbformatvalue', datavalue: JSON.stringify(dv), generate: 'text/plain', uselang: 'en' });
        await sleep(300);
        const v = ymd(s.t); if (!v || !f.result) continue;
        calSamples.push({ yRdf: v.y, prec: parseInt(s.prec, 10), text: f.result, json: dv.value && dv.value.time, rdf: s.t });
    }
    const cal = calibrate(calSamples);
    manifest.calibration = { samples: calSamples.length, rules: cal.rules, groups: cal.groups, method: 'valor del RDF (QLever) frente al texto de wbformatvalue de la misma declaracion (por su id); una regla vale si cuadra con TODAS las muestras del grupo' };
    log('calibracion', JSON.stringify(cal.rules));

    // 3. Datos: construccion (P571), fin (P576), familias y clases directas
    const rows = await sparql(`SELECT ?item ?label ?es ?sl ?coord ?t ?prec ?cal WHERE { ${ITEMS(minSl)}
  ?item p:P571 ?st . ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) ?st psv:P571 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en") OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es) = "es") } }`);
    const endRows = await sparql(`SELECT ?item ?t ?prec ?cal WHERE { ${ITEMS(minSl)} ?item wdt:P571 ?any .
  ?item p:P576 ?st . ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) ?st psv:P576 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal . }`);
    const families = new Map();
    for (const [fam, roots] of FAMILIES) {
        const good = roots.filter(([id]) => manifest.verify[id] && manifest.verify[id].ok);
        manifest.families[fam] = { roots: good.map(([id, l]) => id + ' ' + l), rejected: roots.filter((r) => !good.includes(r)).map(([id, l]) => id + ' ' + l), n: 0 };
        if (!good.length) continue;
        const r = await sparql(`SELECT DISTINCT ?item WHERE { VALUES ?root { ${good.map(([id]) => 'wd:' + id).join(' ')} } ?item wdt:P31/wdt:P279* ?root . ${ITEMS(minSl)} ?item wdt:P571 ?t . }`);
        for (const b of r) { const q = b.item.split('/').pop(); if (!families.has(q)) { families.set(q, fam); manifest.families[fam].n++; } }
    }
    const clsRows = await sparql(`SELECT ?item ?cls ?cl WHERE { ${ITEMS(minSl)} ?item wdt:P571 ?t . ?item wdt:P31 ?cls . OPTIONAL { ?cls rdfs:label ?cl . FILTER(LANG(?cl) = "en") } }`);
    const classes = new Map();
    for (const b of clsRows) {
        const q = b.item.split('/').pop(); const c = b.cls.split('/').pop(); if (!/^Q\d+$/.test(c)) continue;
        const l = classes.get(q) || []; if (!l.some((x) => x.id === c)) l.push(b.cl ? { id: c, label: b.cl } : { id: c }); classes.set(q, l);
    }

    // 4. Registros
    const { features, skipped } = rowsToFeatures(rows, endRows, families, classes, cal.rules, retrievedAt);
    manifest.skipped = skipped;
    manifest.counts = { rows: rows.length, end_rows: endRows.length, features: features.length, with_end: features.filter((f) => f.properties.built.end).length, bce: features.filter((f) => f.properties.time.start_ybp > 1950).length,
        by_family: features.reduce((o, f) => { o[f.properties.built.family] = (o[f.properties.built.family] || 0) + 1; return o; }, {}),
        by_precision: features.reduce((o, f) => { o[f.properties.time.precision] = (o[f.properties.time.precision] || 0) + 1; return o; }, {}) };
    const body = JSON.stringify({ type: 'FeatureCollection', features });
    fs.writeFileSync(path.join(out, 'built.json'), body + '\n');
    manifest.file = { name: 'built.json', bytes: Buffer.byteLength(body) + 1, sha256: crypto.createHash('sha256').update(body + '\n').digest('hex') };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
    log('hecho:', JSON.stringify(manifest.counts));
}

module.exports = { rdfInterval, textInterval, calibrate, valueToJD, rowsToFeatures, groupOf, FAMILIES };
if (require.main === module) main().catch((e) => { log('fallo:', e && e.stack || e); process.exit(1); });
