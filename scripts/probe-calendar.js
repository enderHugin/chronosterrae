#!/usr/bin/env node
// probe-calendar.js - ¿En que calendario viene la fecha de QLever (wikibase:timeValue) cuando Wikidata la guarda como juliana?
//
//   node scripts/probe-calendar.js > calendar.json        (en Actions: workflow calendar-probe.yml, resultado en la rama calendar-probe)
//
// Sospecha (2026-11-12, vista en los datos): build-events.js trata el literal de timeValue como fecha EN el calendario declarado, pero
// los registros julianos parecen traer ya la fecha pasada al gregoriano: la batalla de Hastings sale «1066-10-20 (juliano)» cuando la fecha
// conocida es el 14 de octubre juliano (= 20 gregoriano); Carlos II de Inglaterra muere «1685-02-16 (juliano)» (6 feb. juliano = 16 gregoriano).
// Si es asi, se convierte dos veces: el reloj cae 6-13 dias despues. Regla 6: no se supone, se mira. Para cada (elemento, propiedad) se
// compara lo GUARDADO en Wikidata (wbgetentities: time, precision, calendarmodel) con lo que da QLever (timeValue, timePrecision,
// timeCalendarModel). Los QID salen de nuestros propios datos (data/events); la etiqueta se devuelve para comprobarlos.
'use strict';
const QLEVER = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'ChronosTerrae-Probe/0.1 (https://github.com/enderHugin/chronosterrae)';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX wikibase: <http://wikiba.se/ontology#> ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [QID, propiedad, lo que nuestros datos dicen hoy]: dia, mes y año julianos, y uno gregoriano de control
const CASES = [
    ['Q83224', 'P585', 'Battle of Hastings: 1066-10-20 julian day'],
    ['Q122553', 'P570', 'Charles II of England: 1685-02-16 julian day'],
    ['Q164047', 'P569', 'Alexander Pope: 1688-05-31 julian + 1688-05-21 gregorian'],
    ['Q11812', 'P569', 'Thomas Jefferson: 1743-04-13 julian day'],
    ['Q33391', 'P569', 'Leon Trotsky: 1879-11-07 julian day'],
    ['Q1750892', 'P580', 'Siege of Constantinople (1204): 1204-04-20 julian'],
    ['Q1414', 'P570', 'Galba: 0069-01 julian month'],
    ['Q42887', 'P570', 'Clement: 0099 julian year'],
    ['Q179826', 'P585', 'First Council of Constantinople: 0381 julian year'],
    ['Q937', 'P569', 'Albert Einstein: 1879-03-14 gregorian day (control)']
];

async function getJson(url, opt) {
    for (let a = 0; ; a++) {
        try {
            const res = await fetch(url, Object.assign({ headers: { 'User-Agent': UA, Accept: 'application/json, application/sparql-results+json' }, signal: AbortSignal.timeout(60000) }, opt || {}));
            const text = await res.text();
            if (res.status === 429 && a < 3) { await sleep(8000 * (a + 1)); continue; }
            return { status: res.status, body: (() => { try { return JSON.parse(text); } catch (e) { return text.slice(0, 300); } })() };
        } catch (e) { if (a >= 2) return { status: 0, error: String(e.message || e) }; await sleep(3000); }
    }
}
async function main() {
    const out = { generated_at: new Date().toISOString(), cases: [] };
    const ids = [...new Set(CASES.map((c) => c[0]))];
    const api = await getJson(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|claims', languages: 'en', format: 'json' }));
    const ents = api.body && api.body.entities;
    out.api_status = api.status;
    for (const [q, prop, note] of CASES) {
        const c = { qid: q, prop, note };
        const e = ents && ents[q];
        c.label = e && e.labels && e.labels.en ? e.labels.en.value : null;
        c.stored = e && e.claims && e.claims[prop] ? e.claims[prop].map((cl) => { const v = cl.mainsnak && cl.mainsnak.datavalue && cl.mainsnak.datavalue.value; return v ? { time: v.time, precision: v.precision, calendar: (v.calendarmodel || '').split('/').pop(), rank: cl.rank } : null; }) : null;
        const r = await getJson(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' },
            body: PRE + `SELECT ?t ?prec ?cal WHERE { wd:${q} p:${prop} ?s . ?s psv:${prop} ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal }` });
        c.qlever_status = r.status;
        c.qlever = r.body && r.body.results ? r.body.results.bindings.map((b) => ({ t: b.t.value, prec: b.prec.value, cal: b.cal.value.split('/').pop() })) : (r.error || r.body);
        out.cases.push(c);
        await sleep(1500);
    }
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
main().catch((e) => { process.stderr.write('fallo: ' + (e && e.stack || e) + '\n'); process.exit(1); });
