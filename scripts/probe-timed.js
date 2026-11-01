#!/usr/bin/env node
// probe-timed.js - Que hay realmente en Wikidata con HORA del dia (no solo fecha).
//
// Regla del proyecto: no se asume el comportamiento de una API externa. Esta sonda mira:
//   1. Para personas concretas (resueltas por busqueda, nunca con identificadores escritos a mano):
//      la fecha de nacimiento/muerte, su precision (11 dia, 12 hora, 13 minuto, 14 segundo),
//      el campo timezone y el calendario.
//   2. Consultas SPARQL masivas con precision >= minuto, para saber si hay datos suficientes.
// stdout = JSON; stderr = progreso. Corre en Actions (el entorno de desarrollo no alcanza Wikidata).

'use strict';

const UA = 'ChronosTerrae-Probe/0.2 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 120000;
const log = (...a) => console.error(...a);
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');

async function getJSON(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 300));
    return JSON.parse(text);
}
const sparql = (q) => getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q));

const NAMES = ['Frédéric Chopin', 'Edgar Allan Poe', 'Pope Pius XII', 'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven',
    'Neil Armstrong', 'Yuri Gagarin', 'Albert Einstein', 'Wright Flyer'];

async function entityTimes(qid) {
    const j = await getJSON('https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json');
    const e = j.entities[qid];
    const out = { qid, label: e.labels && e.labels.en && e.labels.en.value };
    for (const [pid, key] of [['P569', 'birth'], ['P570', 'death'], ['P571', 'inception'], ['P585', 'point_in_time']]) {
        const cl = e.claims && e.claims[pid];
        if (cl) out[key] = cl.map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean);
    }
    for (const [pid, key] of [['P19', 'birth_place'], ['P20', 'death_place']]) {
        const cl = e.claims && e.claims[pid];
        if (cl && cl[0].mainsnak.datavalue) out[key] = cl[0].mainsnak.datavalue.value.id;
    }
    return out;
}

const bulk = (prop, extra = '') => `SELECT ?item ?itemLabel ?t ?prec WHERE {
  ?item p:${prop} ?st . ?st psv:${prop} ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
  FILTER(?prec >= 13) ${extra}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es". }
} LIMIT 60`;

async function main() {
    const out = { probed_at: new Date().toISOString(), people: [], bulk: {} };
    for (const name of NAMES) {
        try {
            const s = await getJSON('https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=3&search=' + encodeURIComponent(name));
            const hit = s.search && s.search[0];
            if (!hit) { out.people.push({ name, error: 'sin resultados' }); continue; }
            const t = await entityTimes(hit.id);
            out.people.push({ name, search_hit: { id: hit.id, label: hit.label, description: hit.description }, ...t });
            log('OK  ', name, hit.id);
        } catch (e) { out.people.push({ name, error: describe(e) }); log('XX  ', name, describe(e)); }
        await new Promise((r) => setTimeout(r, 400));
    }
    for (const [key, q] of Object.entries({
        births_minute: bulk('P569'), deaths_minute: bulk('P570'),
        inception_minute: bulk('P571'), point_in_time_minute: bulk('P585')
    })) {
        try {
            const r = await sparql(q);
            out.bulk[key] = r.results.bindings.map((b) => ({ item: b.item.value, label: b.itemLabel && b.itemLabel.value, t: b.t.value, prec: b.prec.value }));
            log('OK  ', key, out.bulk[key].length);
        } catch (e) { out.bulk[key] = { error: describe(e) }; log('XX  ', key, describe(e)); }
        await new Promise((r) => setTimeout(r, 1500));
    }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { log('[ERR] ' + describe(e)); process.exitCode = 1; });
