#!/usr/bin/env node
// build-events.js - Sucesos con fecha (y a veces hora) desde Wikidata, listos para ChronosTerrae.
//
//   node scripts/build-events.js --out <carpeta> [--kinds birth,death,publication,composition,discovery,event]
//
// Wikidata (CC0) se consulta por SPARQL en trozos de tiempo, solo elementos con muchos articulos en
// Wikipedia (sitelinks), que es la medida de notoriedad que usamos para decidir que mostrar a cada escala.
// Se ejecuta en Actions (el entorno de desarrollo no alcanza Wikidata). No se inventa nada:
//   - sin etiqueta, sin fecha o con precision menor que el año => no entra;
//   - calendario: el que Wikidata declara para ESA fecha (juliano o gregoriano);
//   - la hora del dia NO existe en estos datos (Wikidata solo da hora en casos muy raros): lo que no es
//     dia/mes/año se declara como tal; las horas verificadas viven en data/events/seed.json.
// Salida: shards c<siglo>.json (FeatureCollection que cumple schemas/record.schema.json), index.json, manifest.json.

'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../sky/sky.js');

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'ChronosTerrae-Build/0.2 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 75000;
const JD_1950 = 2433282.5;                 // 1950-01-01 0 h: el "presente" de BP
const FIRST_YEAR = 1;                      // antes del año 1 hay que calibrar la numeracion de Wikidata (no existe año 0)

const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };

/* ------------------------------------------------------------------ */
/* Tipos de suceso                                                     */
/* ------------------------------------------------------------------ */
// minSitelinks: notoriedad minima; norm: sitelinks que valen importancia 1; place: propiedad del lugar (o null)
const KINDS = {
    birth: { prop: 'P569', filter: '?item wdt:P31 wd:Q5 .', place: 'P19', minSl: 60, norm: 2.5, steps: [[1, 1500, 100], [1500, 1900, 25], [1900, 2027, 10]] },
    death: { prop: 'P570', filter: '?item wdt:P31 wd:Q5 .', place: 'P20', minSl: 60, norm: 2.5, steps: [[1, 1500, 100], [1500, 1900, 25], [1900, 2027, 10]] },
    publication: { prop: 'P577', filter: '?item wdt:P50 ?by .', place: 'P291', minSl: 30, norm: 2.0, steps: [[1, 1600, 100], [1600, 1900, 25], [1900, 2027, 10]] },
    composition: { prop: 'P571', filter: '?item wdt:P86 ?by .', place: null, minSl: 12, norm: 1.8, steps: [[1, 1700, 100], [1700, 1900, 25], [1900, 2027, 25]] },
    discovery: { prop: 'P575', filter: '', place: 'P189', minSl: 15, norm: 1.9, steps: [[1, 1600, 100], [1600, 1900, 25], [1900, 2027, 10]] },
    event: { prop: 'P585', filter: '', place: null, ownCoord: true, minSl: 25, norm: 2.2, steps: [[1, 1600, 100], [1600, 1900, 25], [1900, 2027, 10]] }
};

function windows(steps) {
    const out = [];
    for (const [a, b, step] of steps) for (let y = a; y < b; y += step) out.push([y, Math.min(b, y + step)]);
    return out;
}

function query(kind, y0, y1) {
    const k = KINDS[kind];
    const dt = (y) => '"' + String(y).padStart(4, '0') + '-01-01T00:00:00Z"^^xsd:dateTime';
    const coord = k.ownCoord ? 'OPTIONAL { ?item wdt:P625 ?coord }' : k.place ? 'OPTIONAL { ?item wdt:' + k.place + '/wdt:P625 ?coord }' : '';
    return `SELECT ?item ?label ?es ?sl ?t ?prec ?cal ?coord WHERE {
  ${k.filter}
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${k.minSl})
  ?item p:${k.prop} ?st . ?st psv:${k.prop} ?v ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
  ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal .
  FILTER(?t >= ${dt(y0)} && ?t < ${dt(y1)} && ?prec >= 9)
  ${coord}
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es) = "es") }
}`;
}

/* ------------------------------------------------------------------ */
/* Conversion de una fila de resultados a registro                      */
/* ------------------------------------------------------------------ */
const CAL = { Q1985727: 'gregorian', Q1985786: 'julian' };
const bindingValue = (b, k) => (b[k] ? b[k].value : undefined);

function ybpOf(jd) { return (JD_1950 - jd) / 365.25; }

/** Devuelve el Feature o {skip: motivo}. Funcion pura: se prueba sin red. */
function bindingToFeature(kind, b, retrievedAt) {
    const k = KINDS[kind];
    const itemUrl = bindingValue(b, 'item') || '';
    const qid = itemUrl.split('/').pop();
    if (!/^Q\d+$/.test(qid)) return { skip: 'sin identificador de Wikidata' };
    const label = bindingValue(b, 'label');
    if (!label || /^Q\d+$/.test(label)) return { skip: 'sin etiqueta' };
    const m = /^(-?\d{4,})-(\d{2})-(\d{2})T/.exec(bindingValue(b, 't') || '');
    if (!m) return { skip: 'fecha ilegible' };
    const year = parseInt(m[1], 10); const month = parseInt(m[2], 10); const day = parseInt(m[3], 10);
    if (year < FIRST_YEAR) return { skip: 'anterior al año 1 (numeracion sin calibrar)' };
    const prec = parseInt(bindingValue(b, 'prec'), 10);
    const cal = CAL[(bindingValue(b, 'cal') || '').split('/').pop()];
    if (!cal) return { skip: 'calendario desconocido' };
    let start; let end; let precision; let uncertaintyYr;
    try {
        if (prec >= 11) {
            const jd = S.calendarToJD({ year, month, day }, cal).jd;
            start = jd; end = jd; precision = 'day'; uncertaintyYr = 0.5 / 365.25;
        } else if (prec === 10) {
            start = S.calendarToJD({ year, month, day: 1 }, cal).jd;
            const next = month === 12 ? S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd : S.calendarToJD({ year, month: month + 1, day: 1 }, cal).jd;
            end = next; precision = 'month'; uncertaintyYr = (end - start) / 2 / 365.25;
        } else {
            start = S.calendarToJD({ year, month: 1, day: 1 }, cal).jd;
            end = S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd; precision = 'year'; uncertaintyYr = 0.5;
        }
    } catch (e) { return { skip: 'fecha invalida: ' + e.message }; }
    let geometry = null;
    const c = /^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(bindingValue(b, 'coord') || '');
    if (c) {
        const lng = parseFloat(c[1]); const lat = parseFloat(c[2]);
        if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) geometry = { type: 'Point', coordinates: [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] };
    }
    const sl = parseInt(bindingValue(b, 'sl'), 10) || 0;
    const importance = Math.round(Math.max(0, Math.min(1, Math.log10(Math.max(sl, 1)) / k.norm)) * 100) / 100;
    const iso = m[1] + '-' + m[2] + '-' + m[3];
    const time = {
        start_ybp: +ybpOf(start).toFixed(6), end_ybp: +ybpOf(end).toFixed(6), uncertainty_yr: +uncertaintyYr.toFixed(6), precision,
        iso: precision === 'day' ? iso : precision === 'month' ? m[1] + '-' + m[2] : m[1], calendar: cal
    };
    const labels = { en: label }; const es = bindingValue(b, 'es'); if (es) labels.es = es;
    return {
        feature: {
            type: 'Feature', geometry,
            properties: {
                id: 'wd.' + qid.toLowerCase() + '.' + kind, name: label, labels, layer: 'event', kind, importance,
                evidence: 'documentary', time, scale: { min_m: 100, max_m: 20000000 },
                sources: [{ kind: 'wikidata', id: qid, citation: 'Wikidata ' + qid + ', ' + k.prop + (geometry ? ' y lugar (' + (k.ownCoord ? 'P625' : k.place + '/P625') + ')' : ''), retrieved_at: retrievedAt }],
                status: 'raw'
            }
        },
        jd: (start + end) / 2, sitelinks: sl
    };
}

/* ------------------------------------------------------------------ */
/* Red                                                                 */
/* ------------------------------------------------------------------ */
async function sparql(q) {
    const res = await fetch(ENDPOINT + '?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 160).replace(/\s+/g, ' '));
    return JSON.parse(text).results.bindings;
}

// Si un trozo falla (tiempo agotado), se divide a la mitad hasta llegar a 1 año.
async function fetchRange(kind, y0, y1, log, stats, depth = 0) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        try { const rows = await sparql(query(kind, y0, y1)); stats.queries++; return rows; } catch (e) { lastErr = e; await sleep(3000 * (attempt + 1)); }
    }
    if (y1 - y0 <= 1) { stats.failed.push({ kind, from: y0, to: y1, error: describe(lastErr) }); log('XX  ' + kind + ' ' + y0 + '-' + y1 + ' ' + describe(lastErr)); return []; }
    log('..  ' + kind + ' ' + y0 + '-' + y1 + ' dividido (' + describe(lastErr) + ')');
    const mid = Math.floor((y0 + y1) / 2);
    return [...await fetchRange(kind, y0, mid, log, stats, depth + 1), ...await fetchRange(kind, mid, y1, log, stats, depth + 1)];
}

async function main() {
    const out = arg('out'); if (!out) throw new Error('falta --out');
    const kinds = (arg('kinds') || Object.keys(KINDS).join(',')).split(',');
    const log = (m) => console.error(m);
    const retrievedAt = new Date().toISOString();
    const stats = { queries: 0, failed: [], skipped: {}, rows: 0 };
    const byShard = new Map(); const perKind = {};
    for (const kind of kinds) {
        if (!KINDS[kind]) throw new Error('tipo desconocido: ' + kind);
        perKind[kind] = 0;
        const seen = new Map();
        for (const [y0, y1] of windows(KINDS[kind].steps)) {
            const rows = await fetchRange(kind, y0, y1, log, stats);
            stats.rows += rows.length;
            for (const b of rows) {
                const r = bindingToFeature(kind, b, retrievedAt);
                if (r.skip) { stats.skipped[r.skip] = (stats.skipped[r.skip] || 0) + 1; continue; }
                const f = r.feature;
                const n = (seen.get(f.properties.id) || 0) + 1; seen.set(f.properties.id, n);
                if (n > 1) f.properties.id += '.' + n;         // el mismo elemento con varias fechas: se conservan todas, declaradas
                const century = Math.floor(ybpToYear(f.properties.time.start_ybp, f.properties.time.end_ybp) / 100);
                const key = 'c' + (century < 0 ? 'm' + (-century) : century);
                if (!byShard.has(key)) byShard.set(key, []);
                byShard.get(key).push(f); perKind[kind]++;
            }
            log('OK  ' + kind + ' ' + y0 + '-' + y1 + ' filas=' + rows.length);
            await sleep(1500);
        }
    }
    fs.mkdirSync(out, { recursive: true });
    const index = { shards: {}, generated_at: retrievedAt };
    for (const [key, feats] of byShard) {
        feats.sort((a, b) => a.properties.time.start_ybp - b.properties.time.start_ybp || b.properties.importance - a.properties.importance);
        const file = key + '.json';
        fs.writeFileSync(path.join(out, file), JSON.stringify({ type: 'FeatureCollection', features: feats }) + '\n');
        index.shards[key] = { file, count: feats.length, bytes: fs.statSync(path.join(out, file)).size };
    }
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generated_at: retrievedAt, source: 'Wikidata (CC0) via query.wikidata.org', kinds, per_kind: perKind, stats }, null, 2) + '\n');
    log(JSON.stringify({ perKind, queries: stats.queries, failed: stats.failed.length, skipped: stats.skipped }));
}

// año calendario (de la fecha media) a partir de BP, para elegir siglo
function ybpToYear(startYbp, endYbp) { return Math.floor(1950 - (startYbp + endYbp) / 2); }

if (require.main === module) main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
module.exports = { KINDS, query, bindingToFeature, windows, ybpToYear };
