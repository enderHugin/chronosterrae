#!/usr/bin/env node
// probe-bulk.js - ¿Que forma de pedir a Wikidata datos masivos por notoriedad NO agota el tiempo?
// El build por ventanas de fecha (scripts/build-events.js) filtraba por fecha primero y recorria todos los
// humanos: 504/429 continuos. Aqui se prueban: (a) bandas de sitelinks en WDQS sin filtro de fecha y
// (b) el servidor QLever (mismo grafo, otra implementacion). Se anota tiempo, filas y errores.
// stdout = JSON; stderr = progreso. Corre en Actions.

'use strict';

const UA = 'ChronosTerrae-Probe/0.5 (https://github.com/enderHugin/chronosterrae)';
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');

async function run(endpoint, q, timeoutMs) {
    const t0 = Date.now();
    const url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'query=' + encodeURIComponent(q);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
        const text = await res.text();
        const ms = Date.now() - t0;
        if (!res.ok) return { status: res.status, ms, error: text.slice(0, 400) };
        const j = JSON.parse(text);
        const rows = (j.results && j.results.bindings) || [];
        return { status: res.status, ms, bytes: text.length, rows: rows.length, sample: rows.slice(0, 3).map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))) };
    } catch (e) { return { ms: Date.now() - t0, error: describe(e) }; }
}

const WDQS = 'https://query.wikidata.org/sparql?format=json';
const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> ';

// Humanos con notoriedad en una banda y fecha de nacimiento (sin filtrar por fecha en el servidor).
const humans = (lo, hi) => `SELECT ?item ?sl ?t ?prec ?cal WHERE {
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${lo} && ?sl < ${hi})
  ?item wdt:P31 wd:Q5 .
  ?item p:P569 ?st . ?st psv:P569 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal .
}`;
const count = (lo, hi) => `SELECT (COUNT(*) AS ?n) WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${lo} && ?sl < ${hi}) ?item wdt:P31 wd:Q5 }`;
// Con etiquetas (en/es) para saber el coste de pedirlas en la misma consulta.
const humansLabelled = (lo, hi) => `SELECT ?item ?label ?es ?sl ?t ?prec WHERE {
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${lo} && ?sl < ${hi})
  ?item wdt:P31 wd:Q5 .
  ?item p:P569 ?st . ?st psv:P569 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es) = "es") }
}`;
// Sucesos (P585 'momento') con notoriedad media, para ver el volumen en QLever.
const events = (lo) => `SELECT ?item ?sl ?t ?prec WHERE {
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${lo})
  ?item p:P585 ?st . ?st psv:P585 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
}`;

async function main() {
    const out = { probed_at: new Date().toISOString(), steps: {} };
    const step = async (name, endpoint, q, timeoutMs = 150000) => { out.steps[name] = await run(endpoint, PRE + q, timeoutMs); console.error(name, JSON.stringify({ status: out.steps[name].status, ms: out.steps[name].ms, rows: out.steps[name].rows, error: out.steps[name].error && out.steps[name].error.slice(0, 120) })); };
    // WDQS: de la banda mas estrecha (muy famosos) a la mas ancha
    await step('wdqs-count-100+', WDQS, count(100, 1000));
    await step('wdqs-humans-150+', WDQS, humans(150, 1000));
    await step('wdqs-humans-100-150', WDQS, humans(100, 150));
    await step('wdqs-humans-60-80', WDQS, humans(60, 80), 150000);
    // QLever: la misma consulta, bandas anchas
    await step('qlever-count-60+', QLEVER, count(60, 1000));
    await step('qlever-humans-60+', QLEVER, humans(60, 1000), 300000);
    await step('qlever-humans-60+-labelled', QLEVER, humansLabelled(60, 1000), 300000);
    await step('qlever-humans-30+', QLEVER, humans(30, 1000), 300000);
    await step('qlever-events-25+', QLEVER, events(25), 300000);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
