#!/usr/bin/env node
// build-events.js - Sucesos con fecha (y a veces hora) desde Wikidata, listos para ChronosTerrae.
//
//   node scripts/build-events.js --out <carpeta> [--kinds birth,death,publication,composition,discovery,event]
//
// Wikidata (CC0) se consulta por SPARQL, solo elementos con muchos articulos en Wikipedia (sitelinks),
// que es la medida de notoriedad que usamos para decidir que mostrar a cada escala.
// Servidor: QLever (https://qlever.cs.uni-freiburg.de/api/wikidata, mismo grafo de Wikidata). Sonda del
// 2026-11-01: 8 355 nacimientos con >= 60 sitelinks en 1,3 s, 43 012 con >= 30 en 2,2 s; query.wikidata.org
// agotaba el tiempo (504/429) incluso en una sola banda, y el build por ventanas de fecha no terminaba.
// Una consulta por tipo, SIN filtrar por fecha en el servidor; el filtro (año >= 1) se aplica aqui.
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

const ENDPOINT = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';   // la variable solo la usan las pruebas
const UA = 'ChronosTerrae-Build/0.3 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 300000;
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

const PREFIXES = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ';

/** Todos los elementos del tipo con su fecha, en una sola consulta (la notoriedad va primero para que el
 *  servidor empiece por los pocos miles de elementos famosos). withRank: descarta declaraciones obsoletas. */
function queryAll(kind, withRank = true) {
    const k = KINDS[kind];
    const coord = k.ownCoord ? 'OPTIONAL { ?item wdt:P625 ?coord }' : k.place ? 'OPTIONAL { ?item wdt:' + k.place + '/wdt:P625 ?coord }' : '';
    const rank = withRank ? `?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)` : '';
    return PREFIXES + `SELECT DISTINCT ?item ?label ?es ?sl ?t ?prec ?cal ?coord WHERE {
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${k.minSl})
  ${k.filter}
  ?item p:${k.prop} ?st . ?st psv:${k.prop} ?v . ${rank}
  ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal .
  FILTER(?prec >= 9)
  ${coord}
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es) = "es") }
}`;
}

/* ------------------------------------------------------------------ */
/* Conversion de una fila de resultados a registro                      */
/* ------------------------------------------------------------------ */
const CAL = { Q1985727: 'gregorian', Q1985786: 'julian' };
const COORD_RE = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i;
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
    // Ruido de Wikidata que no es un suceso: los propios años como elemento ("1999") y los asteroides numerados
    // ("3537 Jürgen", "(5131) 1990 BG", "2000 AB1"), que eran ~9 000 de los ~16 000 "descubrimientos" del siglo XX.
    if (/^\d{1,4}$/.test(label)) return { skip: 'etiqueta que es solo un año' };
    if (kind === 'discovery' && (/^\(\d+\)/.test(label) || /^\d+ \S+$/.test(label) || /^\d{4} [A-Z]{1,2}\d*$/.test(label))) return { skip: 'asteroide numerado o provisional' };
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
    // QLever da las coordenadas como «POINT(lng lat)» en MAYUSCULAS con seis decimales (sonda links-probe del 2026-11-06, geo:wktLiteral);
    // la version anterior esperaba «Point(...)» y descartaba TODAS: los 27 421 sucesos salieron sin lugar.
    const c = COORD_RE.exec(bindingValue(b, 'coord') || '');
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
/* Sucesos con inicio y fin (guerras, batallas, asedios...)             */
/* ------------------------------------------------------------------ */
// Wikidata da las guerras como intervalo (P580 inicio, P582 fin), no como «momento» (P585): la sonda links-probe del 2026-11-06 midio 3 784
// sucesos notorios asi, que este build ignoraba. P580 lo usan tambien series de TV, temporadas y monedas, asi que se limita a las clases
// de la lista «clases-intervalo» de esa sonda que son sucesos historicos. Sin fin (P582) no se inventa uno: se descarta y se cuenta.
const SPAN_CLASSES = { Q198: 'war', Q178561: 'battle', Q8465: 'civil war', Q188055: 'siege', Q645883: 'military operation', Q124734: 'rebellion', Q831663: 'military campaign', Q104212151: 'series of wars', Q3241045: 'disease outbreak' };
const SPAN_MIN_SL = 25; const SPAN_NORM = 2.2;

function spanQuery() {
    return PREFIXES + `SELECT DISTINCT ?item ?label ?es ?sl ?a ?pa ?ca ?b ?pb ?cb ?coord WHERE {
  VALUES ?cls { ${Object.keys(SPAN_CLASSES).map((q) => 'wd:' + q).join(' ')} }
  ?item wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= ${SPAN_MIN_SL})
  FILTER NOT EXISTS { ?item wdt:P585 ?w }
  ?item p:P580 ?s1 . ?s1 psv:P580 ?v1 . ?v1 wikibase:timeValue ?a ; wikibase:timePrecision ?pa ; wikibase:timeCalendarModel ?ca .
  ?item p:P582 ?s2 . ?s2 psv:P582 ?v2 . ?v2 wikibase:timeValue ?b ; wikibase:timePrecision ?pb ; wikibase:timeCalendarModel ?cb .
  FILTER(?pa >= 9 && ?pb >= 9)
  OPTIONAL { ?item wdt:P625 ?coord }
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es) = "es") }
}`;
}

const isoOf = (m, prec) => (prec >= 11 ? m[1] + '-' + m[2] + '-' + m[3] : prec === 10 ? m[1] + '-' + m[2] : m[1]);
// Inicio de un tiempo de Wikidata (JD) y fin de su precision: dia = el mismo dia; mes = siguiente mes; año = siguiente año
function timeBounds(value, prec, cal) {
    const m = /^(-?\d{4,})-(\d{2})-(\d{2})T/.exec(value || ''); if (!m) return null;
    const year = parseInt(m[1], 10); const month = parseInt(m[2], 10); const day = parseInt(m[3], 10);
    if (year < FIRST_YEAR) return { skip: 'anterior al año 1 (numeracion sin calibrar)' };
    if (prec >= 11) { const jd = S.calendarToJD({ year, month, day }, cal).jd; return { m, a: jd, b: jd, prec: 11 }; }
    if (prec === 10) { const a = S.calendarToJD({ year, month, day: 1 }, cal).jd; const b = month === 12 ? S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd : S.calendarToJD({ year, month: month + 1, day: 1 }, cal).jd; return { m, a, b, prec: 10 }; }
    return { m, a: S.calendarToJD({ year, month: 1, day: 1 }, cal).jd, b: S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd, prec: 9 };
}

/**
 * Filas de la consulta de intervalos -> registros. Un elemento con varias fechas de inicio o de fin (Wikidata las admite) se agrupa en UN
 * registro que abarca desde el inicio mas temprano hasta el fin mas tardio: se ensancha, no se elige una al azar. Devuelve { features, skipped }.
 */
function spanRowsToFeatures(rows, retrievedAt) {
    const skipped = {}; const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
    const byItem = new Map();
    for (const b of rows) {
        const qid = (bindingValue(b, 'item') || '').split('/').pop();
        if (!/^Q\d+$/.test(qid)) { skip('sin identificador de Wikidata'); continue; }
        if (!byItem.has(qid)) byItem.set(qid, []);
        byItem.get(qid).push(b);
    }
    const features = [];
    for (const [qid, list] of byItem) {
        const b0 = list[0];
        const label = bindingValue(b0, 'label');
        if (!label || /^Q\d+$/.test(label)) { skip('sin etiqueta'); continue; }
        const calA = list.map((b) => CAL[(bindingValue(b, 'ca') || '').split('/').pop()]); const calB = list.map((b) => CAL[(bindingValue(b, 'cb') || '').split('/').pop()]);
        const cals = new Set([...calA, ...calB]);
        if (cals.has(undefined)) { skip('calendario desconocido'); continue; }
        if (cals.size > 1) { skip('calendarios distintos en inicio y fin'); continue; }
        const cal = [...cals][0];
        let start = null; let end = null; let first = null; let last = null; let prec = 11; let bad = null;
        try {
            for (const b of list) {
                const A = timeBounds(bindingValue(b, 'a'), parseInt(bindingValue(b, 'pa'), 10), cal); const B = timeBounds(bindingValue(b, 'b'), parseInt(bindingValue(b, 'pb'), 10), cal);
                if (!A || !B) { bad = 'fecha ilegible'; break; }
                if (A.skip || B.skip) { bad = A.skip || B.skip; break; }
                if (start === null || A.a < start) { start = A.a; first = { m: A.m, prec: A.prec }; }
                if (end === null || B.b > end) { end = B.b; last = { m: B.m, prec: B.prec }; }
                prec = Math.min(prec, A.prec, B.prec);
            }
        } catch (e) { bad = 'fecha invalida: ' + e.message; }
        if (bad) { skip(bad); continue; }
        if (end < start) { skip('el fin es anterior al inicio'); continue; }
        const sl = parseInt(bindingValue(b0, 'sl'), 10) || 0;
        let geometry = null;
        const c = COORD_RE.exec(bindingValue(b0, 'coord') || '');
        if (c) { const lng = parseFloat(c[1]); const lat = parseFloat(c[2]); if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) geometry = { type: 'Point', coordinates: [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] }; }
        const precision = prec >= 11 ? 'day' : prec === 10 ? 'month' : 'year';
        const labels = { en: label }; const es = bindingValue(b0, 'es'); if (es) labels.es = es;
        features.push({
            type: 'Feature', geometry,
            properties: {
                id: 'wd.' + qid.toLowerCase() + '.event', name: label, labels, layer: 'event', kind: 'event',
                importance: Math.round(Math.max(0, Math.min(1, Math.log10(Math.max(sl, 1)) / SPAN_NORM)) * 100) / 100,
                evidence: 'documentary',
                time: {
                    start_ybp: +ybpOf(start).toFixed(6), end_ybp: +ybpOf(end).toFixed(6), uncertainty_yr: +(prec >= 11 ? 0.5 / 365.25 : prec === 10 ? 15 / 365.25 : 0.5).toFixed(6), precision,
                    iso: isoOf(first.m, first.prec) + '/' + isoOf(last.m, last.prec), calendar: cal
                },
                scale: { min_m: 100, max_m: 20000000 },
                sources: [{ kind: 'wikidata', id: qid, citation: 'Wikidata ' + qid + ', P580 y P582' + (list.length > 1 ? ' (varias fechas: se abarca de la primera a la ultima)' : '') + (geometry ? ' y lugar (P625)' : ''), retrieved_at: retrievedAt }],
                status: 'raw'
            }
        });
    }
    return { features, skipped };
}

/* ------------------------------------------------------------------ */
/* Relaciones: clase, causa, efecto, parte de y lugar                   */
/* ------------------------------------------------------------------ */
// Una consulta POR PROPIEDAD, nunca todas juntas con OPTIONAL: la sonda links-probe midio 86 344 filas y 20 s para 300 elementos (producto
// cartesiano de sus valores), contra 449 filas en 0,4 s para P828 sola. El coste crece con el numero de relaciones, no con su producto.
const REL_NOTABLE = '?item wikibase:sitelinks ?sl . FILTER(?sl >= 25) { ?item wdt:P585 ?w } UNION { ?item wdt:P580 ?w }';
const REL_LABEL = (v) => `OPTIONAL { ?${v} rdfs:label ?${v}Label . FILTER(LANG(?${v}Label) = "en") }`;
const RELATIONS = {
    classes: { query: () => PREFIXES + `SELECT DISTINCT ?item ?o ?oLabel WHERE { ${REL_NOTABLE} ?item wdt:P31 ?o . ${REL_LABEL('o')} }`, cap: 6 },
    cause: { query: () => PREFIXES + `SELECT DISTINCT ?item ?o ?oLabel WHERE { ${REL_NOTABLE} ?item wdt:P828 ?o . ${REL_LABEL('o')} }`, cap: 6, prop: 'P828' },
    effect: { query: () => PREFIXES + `SELECT DISTINCT ?item ?o ?oLabel WHERE { ${REL_NOTABLE} ?item wdt:P1542 ?o . ${REL_LABEL('o')} }`, cap: 8, prop: 'P1542' },
    part_of: { query: () => PREFIXES + `SELECT DISTINCT ?item ?o ?oLabel WHERE { ${REL_NOTABLE} ?item wdt:P361 ?o . ${REL_LABEL('o')} }`, cap: 4, prop: 'P361' },
    place: { query: () => PREFIXES + `SELECT DISTINCT ?item ?o ?coord WHERE { ${REL_NOTABLE} ?item wdt:P276 ?o . ?o wdt:P625 ?coord }`, cap: 50 }
};

/** Filas (?item ?o ?oLabel) -> Map qid -> [{id, label}] sin repetidos y con tope. */
function relationRows(rows, cap) {
    const m = new Map();
    for (const b of rows) {
        const q = (bindingValue(b, 'item') || '').split('/').pop(); const o = (bindingValue(b, 'o') || '').split('/').pop();
        if (!/^Q\d+$/.test(q) || !/^Q\d+$/.test(o)) continue;
        const list = m.get(q) || []; if (!m.has(q)) m.set(q, list);
        if (list.length < cap && !list.some((x) => x.id === o)) { const l = bindingValue(b, 'oLabel'); list.push({ id: o, label: l && !/^Q\d+$/.test(l) ? l : undefined, coord: bindingValue(b, 'coord') }); }
    }
    return m;
}

const qidOf = (f) => (/^wd\.(q\d+)\./.exec(f.properties.id) || [])[1];

/**
 * Añade a los sucesos lo que Wikidata declara de ellos. Nada se deduce: una relacion que Wikidata no tiene no aparece.
 *  - classes: P31 (etiqueta en ingles);   - links: causa (P828), efecto (P1542) y «parte de» (P361), cada uno con su fuente;
 *  - geometria: si el suceso no tiene coordenadas propias y su lugar (P276) tiene UNA sola coordenada distinta, se usa esa y se declara en la cita
 *    (es el lugar donde ocurrio, no el punto exacto); con varios lugares se deja sin geometria en vez de elegir uno.
 * Devuelve { classes, links, placed, ambiguousPlace } (conteos para el manifiesto).
 */
function enrichEvents(features, rel) {
    const out = { classes: 0, links: 0, placed: 0, ambiguousPlace: 0 };
    for (const f of features) {
        if (f.properties.kind !== 'event') continue;
        const q = qidOf(f); if (!q) continue; const Q = q.toUpperCase();
        const cls = rel.classes && rel.classes.get(Q);
        if (cls && cls.length) { f.properties.classes = cls.map((c) => (c.label ? { id: c.id, label: c.label } : { id: c.id })); out.classes++; }
        const links = [];
        for (const [name, rl, prop] of [['cause', 'cause', 'P828'], ['effect', 'effect', 'P1542'], ['part_of', 'part_of', 'P361']]) {
            for (const x of (rel[name] && rel[name].get(Q)) || []) links.push({ rel: rl, target: x.label ? { kind: 'wikidata', id: x.id, label: x.label } : { kind: 'wikidata', id: x.id }, source: { kind: 'wikidata', id: Q, citation: 'Wikidata ' + Q + ', ' + prop } });
        }
        if (links.length) { f.properties.links = links; out.links += links.length; }
        if (!f.geometry && rel.place && rel.place.get(Q)) {
            const coords = [...new Set(rel.place.get(Q).map((x) => x.coord))];
            const c = coords.length === 1 ? COORD_RE.exec(coords[0] || '') : null;
            if (coords.length > 1) out.ambiguousPlace++;
            else if (c) {
                const lng = parseFloat(c[1]); const lat = parseFloat(c[2]);
                if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
                    f.geometry = { type: 'Point', coordinates: [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] };
                    f.properties.sources[0].citation += ' y lugar (P276/P625: coordenada del lugar donde ocurrio, no del punto exacto)';
                    out.placed++;
                }
            }
        }
    }
    return out;
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

// Una consulta por tipo. Si el servidor rechaza el filtro de rango (obsoleto), se repite sin el y se anota.
async function fetchAll(kind, log, stats) {
    let lastErr;
    for (const withRank of [true, false]) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const t0 = Date.now();
                const rows = await sparql(queryAll(kind, withRank)); stats.queries++;
                if (!withRank) (stats.no_rank_filter = stats.no_rank_filter || []).push(kind);
                log('OK  ' + kind + ' filas=' + rows.length + ' ' + (Date.now() - t0) + ' ms' + (withRank ? '' : ' (sin filtro de rango)'));
                return rows;
            } catch (e) { lastErr = e; log('..  ' + kind + (withRank ? '' : ' sin rango') + ' intento ' + (attempt + 1) + ': ' + describe(e)); await sleep(3000 * (attempt + 1)); }
        }
    }
    stats.failed.push({ kind, error: describe(lastErr) });
    return [];
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
        const seen = new Map(); const dup = new Set();
        const rows = await fetchAll(kind, log, stats);
        stats.rows += rows.length;
        for (const b of rows) {
            const r = bindingToFeature(kind, b, retrievedAt);
            if (r.skip) { stats.skipped[r.skip] = (stats.skipped[r.skip] || 0) + 1; continue; }
            const f = r.feature;
            const dkey = f.properties.id + '|' + f.properties.time.iso;   // misma fecha con varias coordenadas: una sola
            if (dup.has(dkey)) { stats.skipped['duplicado (misma fecha, otro lugar)'] = (stats.skipped['duplicado (misma fecha, otro lugar)'] || 0) + 1; continue; }
            dup.add(dkey);
            const n = (seen.get(f.properties.id) || 0) + 1; seen.set(f.properties.id, n);
            if (n > 1) f.properties.id += '.' + n;         // el mismo elemento con varias fechas: se conservan todas, declaradas
            const century = Math.floor(ybpToYear(f.properties.time.start_ybp, f.properties.time.end_ybp) / 100);
            const key = 'c' + (century < 0 ? 'm' + (-century) : century);
            if (!byShard.has(key)) byShard.set(key, []);
            byShard.get(key).push(f); perKind[kind]++;
        }
    }
    // Intervalos (guerras, batallas...) y relaciones: solo si se piden sucesos. Cada consulta es independiente y su fallo se anota sin tirar el resto.
    const addFeature = (f) => {
        const century = Math.floor(ybpToYear(f.properties.time.start_ybp, f.properties.time.end_ybp) / 100);
        const key = 'c' + (century < 0 ? 'm' + (-century) : century);
        if (!byShard.has(key)) byShard.set(key, []);
        byShard.get(key).push(f); perKind.event = (perKind.event || 0) + 1;
    };
    const retry = async (name, fn) => {
        for (let attempt = 0; attempt < 2; attempt++) {
            try { const t0 = Date.now(); const r = await fn(); log('OK  ' + name + ' ' + (Date.now() - t0) + ' ms'); stats.queries++; return r; } catch (e) { log('..  ' + name + ' intento ' + (attempt + 1) + ': ' + describe(e)); await sleep(3000 * (attempt + 1)); }
        }
        stats.failed.push({ kind: name, error: 'agotados los intentos' }); return null;
    };
    if (kinds.includes('event')) {
        const rows = await retry('intervalos', () => sparql(spanQuery()));
        if (rows) {
            const r = spanRowsToFeatures(rows, retrievedAt); stats.rows += rows.length;
            const have = new Set([...byShard.values()].flat().map((f) => f.properties.id));
            let added = 0;
            for (const f of r.features) { if (have.has(f.properties.id)) { stats.skipped['intervalo repetido'] = (stats.skipped['intervalo repetido'] || 0) + 1; continue; } addFeature(f); added++; }
            for (const [why, n] of Object.entries(r.skipped)) stats.skipped['intervalo: ' + why] = (stats.skipped['intervalo: ' + why] || 0) + n;
            stats.intervals = added;
        }
        const rel = {};
        for (const [name, def] of Object.entries(RELATIONS)) {
            const rows2 = await retry('relacion-' + name, () => sparql(def.query()));
            if (rows2) { rel[name] = relationRows(rows2, def.cap); stats.rows += rows2.length; }
        }
        stats.enriched = enrichEvents([...byShard.values()].flat(), rel);
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
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generated_at: retrievedAt, source: 'Wikidata (CC0) via QLever (qlever.cs.uni-freiburg.de/api/wikidata)', kinds, per_kind: perKind, stats }, null, 2) + '\n');
    log(JSON.stringify({ perKind, queries: stats.queries, failed: stats.failed.length, skipped: stats.skipped }));
}

// año calendario (de la fecha media) a partir de BP, para elegir siglo
function ybpToYear(startYbp, endYbp) { return Math.floor(1950 - (startYbp + endYbp) / 2); }

if (require.main === module) main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
module.exports = { KINDS, query, queryAll, bindingToFeature, windows, ybpToYear, spanQuery, spanRowsToFeatures, SPAN_CLASSES, RELATIONS, relationRows, enrichEvents };
