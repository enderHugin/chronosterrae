#!/usr/bin/env node
// probe-links.js - ¿Que trae Wikidata (via QLever) para ligar un suceso con su lugar, su causa y su clase?
// Preguntas que debe contestar ANTES de tocar build-events.js (CLAUDE.md regla 6: no se supone el comportamiento de una API):
//   1. ¿En que forma llega P625 (coordenadas)? El build actual espera «Point(x y)» y los 27 421 sucesos salieron sin coordenadas.
//   2. ¿Cuantos sucesos notorios tienen causa (P828), efecto (P1542), «parte de» (P361), pais (P17), lugar (P276), participantes (P710, P1344)?
//   3. ¿Cuantos sucesos notorios se dan como intervalo (P580 inicio / P582 fin) en vez de momento (P585)? (guerras, reinados, asedios)
//   4. ¿Que clases (P31) tienen? Sirve para clasificar por dato y no por el nombre.
// stdout = JSON; stderr = progreso. Corre en Actions.
'use strict';

const UA = 'ChronosTerrae-Probe/0.6 (https://github.com/enderHugin/chronosterrae)';
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');
const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ';

async function run(q, timeoutMs, nRaw) {
    const t0 = Date.now();
    try {
        const res = await fetch(QLEVER + '?query=' + encodeURIComponent(PRE + q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
        const text = await res.text(); const ms = Date.now() - t0;
        if (!res.ok) return { status: res.status, ms, error: text.slice(0, 500) };
        const rows = (JSON.parse(text).results || {}).bindings || [];
        return { status: res.status, ms, rows: rows.length, raw: rows.slice(0, nRaw), sample: rows.slice(0, 15).map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))) };
    } catch (e) { return { ms: Date.now() - t0, error: describe(e) }; }
}

// «Suceso notorio»: el mismo criterio del build (>= 25 sitelinks) con momento (P585) o intervalo (P580/P582)
const NOTABLE = (extra) => `?item wikibase:sitelinks ?sl . FILTER(?sl >= 25) ${extra}`;
const EVENT_TIME = '{ ?item wdt:P585 ?when } UNION { ?item wdt:P580 ?when }';
const count = (body) => `SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { ${NOTABLE(body)} }`;

async function main() {
    const out = { probed_at: new Date().toISOString(), steps: {} };
    const step = async (name, q, timeoutMs = 240000, nRaw = 3) => { out.steps[name] = await run(q, timeoutMs, nRaw); console.error(name, JSON.stringify({ status: out.steps[name].status, ms: out.steps[name].ms, rows: out.steps[name].rows, error: out.steps[name].error })); };

    // 1. forma de P625 en un suceso con momento: valor crudo completo (type, datatype, value)
    await step('coord-raw-p585', `SELECT ?item ?coord WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= 100) ?item wdt:P585 ?w . ?item wdt:P625 ?coord } LIMIT 5`, 120000, 5);
    await step('coord-via-p276', `SELECT ?item ?place ?coord WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= 100) ?item wdt:P585 ?w . ?item wdt:P276 ?place . ?place wdt:P625 ?coord } LIMIT 5`, 120000, 5);
    // 3. momento frente a intervalo
    await step('count-p585', count('?item wdt:P585 ?w .'));
    await step('count-p580-p582-sin-p585', count('?item wdt:P580 ?a . ?item wdt:P582 ?b . FILTER NOT EXISTS { ?item wdt:P585 ?w }'));
    await step('count-p580-sin-p582', count('?item wdt:P580 ?a . FILTER NOT EXISTS { ?item wdt:P582 ?b } FILTER NOT EXISTS { ?item wdt:P585 ?w }'));
    await step('p580-p582-raw', `SELECT ?item ?a ?b ?pa ?pb WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= 100) ?item p:P580 ?s1 . ?s1 psv:P580 ?v1 . ?v1 wikibase:timeValue ?a ; wikibase:timePrecision ?pa . ?item p:P582 ?s2 . ?s2 psv:P582 ?v2 . ?v2 wikibase:timeValue ?b ; wikibase:timePrecision ?pb . } LIMIT 5`, 120000, 5);
    // 2. vinculos y lugar, sobre sucesos notorios con momento o inicio
    for (const [name, prop] of [['p828-causa', 'P828'], ['p1542-efecto', 'P1542'], ['p361-parte-de', 'P361'], ['p17-pais', 'P17'], ['p276-lugar', 'P276'], ['p710-participante', 'P710'], ['p1344-participante-en', 'P1344'], ['p625-coord-propia', 'P625'], ['p131-unidad-administrativa', 'P131']]) {
        await step('count-' + name, `SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { ${NOTABLE(EVENT_TIME + ' ?item wdt:' + prop + ' ?o .')} }`);
    }
    await step('p828-muestra', `SELECT ?item ?label ?cause ?causeLabel WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= 25) ${EVENT_TIME} ?item wdt:P828 ?cause . ?item rdfs:label ?label . FILTER(LANG(?label)="en") ?cause rdfs:label ?causeLabel . FILTER(LANG(?causeLabel)="en") } LIMIT 20`, 180000, 3);
    await step('p1542-muestra', `SELECT ?item ?label ?eff ?effLabel WHERE { ?item wikibase:sitelinks ?sl . FILTER(?sl >= 25) ${EVENT_TIME} ?item wdt:P1542 ?eff . ?item rdfs:label ?label . FILTER(LANG(?label)="en") ?eff rdfs:label ?effLabel . FILTER(LANG(?effLabel)="en") } LIMIT 20`, 180000, 3);
    // 4. clases (P31) de los sucesos notorios, las 60 mas frecuentes
    await step('clases-p31', `SELECT ?cls ?clsLabel (COUNT(DISTINCT ?item) AS ?n) WHERE { ${NOTABLE(EVENT_TIME + ' ?item wdt:P31 ?cls .')} OPTIONAL { ?cls rdfs:label ?clsLabel . FILTER(LANG(?clsLabel)="en") } } GROUP BY ?cls ?clsLabel ORDER BY DESC(?n) LIMIT 60`, 300000, 2);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
