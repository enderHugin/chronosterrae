#!/usr/bin/env node
// probe-places.js - ¿Se puede montar desde Wikidata una capa de CONSTRUCCIONES con fecha (catedrales, piramides, castillos...)
// y una de NOMBRES de lugar que cambian con el tiempo? Lo pide el creador (2026-11-12): "Superficie de la tierra, construcciones,
// catedrales, piramides, capas de nombres".
//
// Regla 1 y 6: no se supone ningun identificador ni el comportamiento del servidor. Esta sonda:
//   1. VERIFICA cada QID/PID candidato leyendo su etiqueta (en/es) y su descripcion, y busca el termino con wbsearchentities;
//      solo se cuentan las clases cuya etiqueta inglesa coincide con la esperada (si no, se anota y se salta).
//   2. Cuenta por clase (P31/P279*): con coordenadas (P625), con fecha de construccion/inicio (P571), con fecha de fin (P576),
//      y con notoriedad (sitelinks >= 10), en QLever (el mismo grafo; WDQS agotaba el tiempo, ver bulk-build).
//   3. Saca una muestra (las mas enlazadas) con la fecha tal como viene: valor, precision y calendario.
//   4. Nombres: cuantas ciudades tienen nombre oficial (P1448) con fechas de inicio/fin, y la muestra de una ciudad conocida.
// stdout = JSON, stderr = progreso. Corre en Actions (workflow places-probe.yml, informe en la rama places-probe).
'use strict';

const UA = 'ChronosTerrae-Probe/0.6 (https://github.com/enderHugin/chronosterrae)';
const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const API = 'https://www.wikidata.org/w/api.php';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/> PREFIX pq: <http://www.wikidata.org/prop/qualifier/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/> ';
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ']' : '');

// Candidatos ESCRITOS DE MEMORIA: por eso se verifican antes de usarlos (la etiqueta inglesa esperada va al lado).
// 1a pasada (2026-11-12): 28 de 30 clases y 11 de 12 propiedades coincidieron; Q193475 es "menhir" (no "megalith"), Q811979 se llama hoy
// "built structure" y P576 "dissolved, abolished or demolished" (sin "date"). Se corrigen las etiquetas esperadas con lo leido.
const CLASSES = [
    ['Q2977', 'cathedral'], ['Q12516', 'pyramid'], ['Q23413', 'castle'], ['Q44539', 'temple'], ['Q32815', 'mosque'],
    ['Q16970', 'church building'], ['Q16560', 'palace'], ['Q57821', 'fortification'], ['Q39715', 'lighthouse'], ['Q12280', 'bridge'],
    ['Q54831', 'amphitheatre'], ['Q4989906', 'monument'], ['Q839954', 'archaeological site'], ['Q162875', 'mausoleum'],
    ['Q180987', 'stupa'], ['Q34627', 'synagogue'], ['Q842402', 'Hindu temple'], ['Q5393308', 'Buddhist temple'], ['Q193475', 'menhir'],
    ['Q12518', 'tower'], ['Q11303', 'skyscraper'], ['Q12323', 'dam'], ['Q41176', 'building'], ['Q811979', 'built structure'],
    // nombres de lugar
    ['Q515', 'city'], ['Q486972', 'human settlement'], ['Q46831', 'mountain range'], ['Q8514', 'desert'], ['Q185113', 'cape'],
    // patrimonio (para P1435)
    ['Q9259', 'World Heritage Site']
];
const PROPS = [['P31', 'instance of'], ['P279', 'subclass of'], ['P571', 'inception'], ['P576', 'dissolved, abolished or demolished'],
    ['P625', 'coordinate location'], ['P1435', 'heritage designation'], ['P1448', 'official name'], ['P2561', 'name'], ['P580', 'start time'],
    ['P582', 'end time'], ['P793', 'significant event'], ['P1082', 'population']];
// Terminos que se buscan tambien por texto, por si el QID de memoria es otro (el informe ensena los 3 primeros resultados).
const SEARCH = ['megalith', 'cathedral', 'pyramid', 'Egyptian pyramid', 'Mesoamerican pyramid', 'castle', 'amphitheatre', 'ziggurat', 'stone circle', 'aqueduct', 'mountain range', 'cape', 'World Heritage Site'];

async function sparql(q, timeoutMs = 120000) {
    const t0 = Date.now();
    try {
        const res = await fetch(QLEVER + '?query=' + encodeURIComponent(PRE + q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
        const text = await res.text(); const ms = Date.now() - t0;
        if (!res.ok) return { status: res.status, ms, error: text.slice(0, 300) };
        const j = JSON.parse(text);
        return { status: res.status, ms, rows: (j.results.bindings || []).map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))) };
    } catch (e) { return { ms: Date.now() - t0, error: describe(e) }; }
}
async function api(params) {
    const u = API + '?' + new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params));
    try {
        const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
        return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: describe(e) }; }
}
const short = (iri) => String(iri).replace('http://www.wikidata.org/entity/', '');

(async () => {
    const out = { probed_at: new Date().toISOString(), endpoint: QLEVER, verify: { classes: [], props: [] }, search: {}, counts: {}, samples: {}, bands: {}, names: {} };

    // 1. Verificacion de identificadores (por la API de Wikidata; si falla, por SPARQL)
    const ids = [...CLASSES.map((c) => c[0]), ...PROPS.map((p) => p[0])];
    const ents = {};
    for (let i = 0; i < ids.length; i += 40) {
        const j = await api({ action: 'wbgetentities', ids: ids.slice(i, i + 40).join('|'), props: 'labels|descriptions', languages: 'en|es' });
        if (j.entities) Object.assign(ents, j.entities); else { log('wbgetentities', JSON.stringify(j).slice(0, 200)); (out.verify.errors = out.verify.errors || []).push('wbgetentities: ' + JSON.stringify(j).slice(0, 200)); }
    }
    if (!Object.keys(ents).length) {
        const r = await sparql(`SELECT ?e ?en ?es WHERE { VALUES ?e { ${ids.map((x) => 'wd:' + x).join(' ')} } OPTIONAL { ?e rdfs:label ?en FILTER(LANG(?en) = "en") } OPTIONAL { ?e rdfs:label ?es FILTER(LANG(?es) = "es") } }`);
        if (!r.rows) (out.verify.errors = out.verify.errors || []).push('sparql: ' + (r.error || r.status));   // roto (sin respuesta), no "rechazado"
        (r.rows || []).forEach((b) => { ents[short(b.e)] = { labels: { en: { value: b.en }, es: { value: b.es } }, descriptions: {} }; });
        out.verify.via = 'sparql';
    } else out.verify.via = 'wbgetentities';
    const lab = (id, lang) => ents[id] && ents[id].labels && ents[id].labels[lang] && ents[id].labels[lang].value || null;
    const desc = (id) => ents[id] && ents[id].descriptions && ents[id].descriptions.en && ents[id].descriptions.en.value || null;
    const okClasses = [];
    CLASSES.forEach(([id, want]) => {
        const en = lab(id, 'en'); const match = !!en && en.toLowerCase() === want.toLowerCase();
        out.verify.classes.push({ id, want, en, es: lab(id, 'es'), desc: desc(id), match });
        if (match) okClasses.push([id, want]);
    });
    PROPS.forEach(([id, want]) => { const en = lab(id, 'en'); out.verify.props.push({ id, want, en, es: lab(id, 'es'), match: !!en && en.toLowerCase() === want.toLowerCase() }); });
    log('verificados', okClasses.length, 'de', CLASSES.length, 'clases;', out.verify.props.filter((p) => p.match).length, 'de', PROPS.length, 'propiedades');
    const propOk = (id) => out.verify.props.some((p) => p.id === id && p.match);
    if (!['P31', 'P279', 'P571', 'P576', 'P625'].every(propOk)) { log('faltan propiedades basicas verificadas: no se cuenta nada'); out.verify.stopped = out.verify.errors ? 'sin respuesta del servidor (roto, no rechazado)' : 'etiquetas que no coinciden (rechazado)'; process.stdout.write(JSON.stringify(out, null, 1) + '\n'); return; }

    for (const term of SEARCH) {
        const j = await api({ action: 'wbsearchentities', search: term, language: 'en', uselang: 'en', type: 'item', limit: '3' });
        out.search[term] = j.search ? j.search.map((s) => ({ id: s.id, label: s.label, desc: s.description })) : j;
    }

    // 2. Recuentos por clase (solo las verificadas)
    for (const [id, name] of okClasses) {
        const cls = `?i wdt:P31/wdt:P279* wd:${id} . ?i wdt:P625 ?co .`;
        const c = {};
        for (const [k, extra] of [['geo', ''], ['geo+P571', '?i wdt:P571 ?t .'], ['geo+P576', '?i wdt:P576 ?d .'], ['geo+P571+sl10', '?i wdt:P571 ?t . ?i wikibase:sitelinks ?sl . FILTER(?sl >= 10)']]) {
            const r = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE { ${cls} ${extra} }`);
            c[k] = r.rows ? Number(r.rows[0].n) : { error: r.error || r.status }; c[k + ':ms'] = r.ms;
        }
        out.counts[id + ' ' + name] = c; log('recuento', id, name, JSON.stringify(c));
        const s = await sparql(`SELECT ?i ?en ?es ?sl ?t ?prec ?cal ?co ?end WHERE { ${cls} ?i wikibase:sitelinks ?sl . ?i p:P571/psv:P571 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec ; wikibase:timeCalendarModel ?cal .
            OPTIONAL { ?i wdt:P576 ?end } OPTIONAL { ?i rdfs:label ?en FILTER(LANG(?en) = "en") } OPTIONAL { ?i rdfs:label ?es FILTER(LANG(?es) = "es") } } ORDER BY DESC(?sl) LIMIT 8`);
        out.samples[id + ' ' + name] = s.rows ? s.rows.map((b) => Object.assign(b, { i: short(b.i), cal: short(b.cal) })) : s;
    }

    // 3. Volumen total de "estructuras arquitectonicas" fechadas y situadas, por notoriedad (para dimensionar la capa)
    if (okClasses.some(([id]) => id === 'Q811979')) {
        for (const lo of [5, 10, 20, 40, 80]) {
            const r = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE { ?i wdt:P31/wdt:P279* wd:Q811979 . ?i wdt:P625 ?co . ?i wdt:P571 ?t . ?i wikibase:sitelinks ?sl . FILTER(?sl >= ${lo}) }`);
            out.bands['Q811979 sl>=' + lo] = r.rows ? Number(r.rows[0].n) : r; log('banda', lo, JSON.stringify(out.bands['Q811979 sl>=' + lo]));
        }
    }
    // Patrimonio de la Humanidad (P1435 = Q9259) con coordenadas y fecha
    if (propOk('P1435') && okClasses.some(([id]) => id === 'Q9259')) {
        const r = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) (COUNT(DISTINCT ?j) AS ?dated) WHERE { ?i wdt:P1435 wd:Q9259 . ?i wdt:P625 ?co . OPTIONAL { ?i wdt:P571 ?t . BIND(?i AS ?j) } }`);
        out.counts['P1435=Q9259'] = r.rows ? r.rows[0] : r;
    }

    // 4. Nombres que cambian con el tiempo: nombre oficial (P1448) con fechas en ciudades y asentamientos
    if (propOk('P1448') && propOk('P580') && propOk('P582')) {
        for (const [id, name] of okClasses.filter(([id]) => id === 'Q515' || id === 'Q486972')) {
            const r1 = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE { ?i wdt:P31/wdt:P279* wd:${id} . ?i wdt:P625 ?co . ?i p:P1448 ?st . }`);
            const r2 = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE { ?i wdt:P31/wdt:P279* wd:${id} . ?i wdt:P625 ?co . ?i p:P1448 ?st . { ?st pq:P580 ?a } UNION { ?st pq:P582 ?b } }`);
            const r3 = await sparql(`SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE { ?i wdt:P31/wdt:P279* wd:${id} . ?i wdt:P625 ?co . ?i p:P1448 ?st . ?st pq:P582 ?b . ?i wikibase:sitelinks ?sl . FILTER(?sl >= 20) }`);
            out.names[id + ' ' + name] = { withOfficialName: r1.rows ? Number(r1.rows[0].n) : r1, withDatedName: r2.rows ? Number(r2.rows[0].n) : r2, withEndedName_sl20: r3.rows ? Number(r3.rows[0].n) : r3 };
            log('nombres', id, JSON.stringify(out.names[id + ' ' + name]));
        }
        // Muestra: las ciudades mas enlazadas con algun nombre oficial terminado, y todos sus nombres con fechas
        const s = await sparql(`SELECT ?i ?en ?sl ?name ?lang ?from ?to WHERE {
            { SELECT DISTINCT ?i ?sl WHERE { ?i wdt:P31/wdt:P279* wd:Q515 . ?i wdt:P625 ?co . ?i p:P1448 ?s0 . ?s0 pq:P582 ?x . ?i wikibase:sitelinks ?sl . } ORDER BY DESC(?sl) LIMIT 6 }
            ?i p:P1448 ?st . ?st ps:P1448 ?name . BIND(LANG(?name) AS ?lang) OPTIONAL { ?st pq:P580 ?from } OPTIONAL { ?st pq:P582 ?to }
            OPTIONAL { ?i rdfs:label ?en FILTER(LANG(?en) = "en") } } ORDER BY DESC(?sl) ?from LIMIT 120`);
        out.names.sample = s.rows ? s.rows.map((b) => Object.assign(b, { i: short(b.i) })) : s;
    }
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})().catch((e) => { log('fallo', e && e.stack || e); process.exit(1); });
