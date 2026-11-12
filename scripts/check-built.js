#!/usr/bin/env node
/* check-built.js - Pruebas sin red de scripts/build-built.js (construcciones con fecha desde Wikidata) y de data/built si existe.
 * Lo delicado es la fecha: numeracion de años antes del 1 y precision de siglo. Se prueba que la calibracion ELIGE la regla que cuadra con
 * el texto de Wikibase, que RECHAZA un grupo contradictorio (y lo distingue de "sin muestras"), y la regla de fin (P576). */
'use strict';
const fs = require('fs'); const path = require('path');
const B = require('./build-built.js');
let fails = 0; const passes = [];
function check(name, fn) { let ok = false, err = ''; try { const r = fn(); ok = r === true; if (!ok) err = ' -> ' + JSON.stringify(r); } catch (e) { err = ' (' + e.message + ')'; } if (ok) passes.push(name); else { fails++; console.log('  XX  ' + name + err); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- textos de Wikibase -> años astronomicos
check('texto: "2560 BCE" = año astronomico -2559; "1163" = 1163', () => eq(B.textInterval('2560 BCE'), [-2559, -2559]) && eq(B.textInterval('1163'), [1163, 1163]));
check('texto: "12th century" = 1101-1200; "5th century BCE" = 500-401 a. C. (-499..-400)', () => eq(B.textInterval('12th century'), [1101, 1200]) && eq(B.textInterval('5th century BCE'), [-499, -400]));
check('texto: "3rd millennium BCE" = 3000-2001 a. C.; "1950s" = 1950-1959; "16 February 360" = 360', () => eq(B.textInterval('3rd millennium BCE'), [-2999, -2000]) && eq(B.textInterval('1950s'), [1950, 1959]) && eq(B.textInterval('16 February 360'), [360, 360]));
check('texto ilegible -> null (no calibra)', () => B.textInterval('circa the Bronze Age') === null);

// --- reglas de numeracion
check('regla astro: el año del RDF ya es astronomico; regla hist: -1 = 1 a. C.', () => eq(B.rdfInterval(-2559, 9, 'astro'), [-2559, -2559]) && eq(B.rdfInterval(-2560, 9, 'hist'), [-2559, -2559]) && eq(B.rdfInterval(1163, 9, 'hist'), [1163, 1163]));
check('siglo: 1200 -> s. XII (1101-1200); 1201 -> s. XIII', () => eq(B.rdfInterval(1200, 7, 'astro'), [1101, 1200]) && eq(B.rdfInterval(1201, 7, 'astro'), [1201, 1300]));

// --- calibracion
const s = (yRdf, prec, text) => ({ yRdf, prec, text });
check('calibracion: si el RDF da -2559 para "2560 BCE" (y asi en toda la muestra) la regla de años a. C. es astro', () => {
    const c = B.calibrate([s(-2559, 9, '2560 BCE'), s(-3000, 9, '3001 BCE'), s(-278, 9, '279 BCE')]); return c.rules['year+|bce'] === 'astro' || c;
});
check('calibracion: si el RDF da -2560 para "2560 BCE" la regla es hist', () => B.calibrate([s(-2560, 9, '2560 BCE'), s(-279, 9, '279 BCE')]).rules['year+|bce'] === 'hist');
check('calibracion: muestras CONTRADICTORIAS -> grupo rechazado (null), no se elige una al azar', () => {
    const c = B.calibrate([s(-2559, 9, '2560 BCE'), s(-279, 9, '279 BCE')]); return c.rules['year+|bce'] === null && c.groups['year+|bce'].astro === 1 && c.groups['year+|bce'].hist === 1;
});
check('calibracion: una sola muestra no basta (null); un grupo sin muestras no aparece (y sus fechas se descartan como "sin calibrar")', () => {
    const c = B.calibrate([s(-2559, 9, '2560 BCE')]); const r = B.valueToJD('-0500-01-01T00:00:00Z', 7, 'http://www.wikidata.org/entity/Q1985786', c.rules);
    return c.rules['year+|bce'] === null && !('century|bce' in c.rules) && r.skip === 'sin calibrar: century|bce';
});
check('rechazado y roto se distinguen: calendario desconocido o fecha ilegible dan su propio motivo', () => {
    const rules = { 'year+|ce': 'astro' };
    return B.valueToJD('1163-01-01T00:00:00Z', 9, 'http://www.wikidata.org/entity/Q999', rules).skip === 'calendario desconocido' && B.valueToJD('xx', 9, 'http://www.wikidata.org/entity/Q1985786', rules).skip === 'fecha ilegible';
});

// --- filas -> registros
const JUL = 'http://www.wikidata.org/entity/Q1985786'; const GRE = 'http://www.wikidata.org/entity/Q1985727';
const RULES = { 'year+|ce': 'astro', 'year+|bce': 'astro', 'century|ce': 'astro', 'century|bce': 'hist' };
const row = (q, label, t, prec, cal, extra) => Object.assign({ item: 'http://www.wikidata.org/entity/' + q, label, sl: '90', coord: 'POINT(28.98 41.008333)', t, prec: String(prec), cal }, extra || {});
const AT = '2026-11-12T00:00:00Z';
const run = (rows, ends, fam) => B.rowsToFeatures(rows, ends, new Map(fam || []), new Map(), RULES, AT);
check('varias fechas de construccion (Santa Sofia 360, 415, 537): inicio = la mas antigua y se guardan todas', () => {
    const r = run([row('Q12506', 'Hagia Sophia', '0537-12-27T00:00:00Z', 11, JUL), row('Q12506', 'Hagia Sophia', '0360-02-15T00:00:00Z', 11, JUL), row('Q12506', 'Hagia Sophia', '0415-10-10T00:00:00Z', 11, JUL)], []);
    const p = r.features[0].properties; return (r.features.length === 1 && p.built.dates.length === 3 && p.time.iso === '0360-02-15' && p.time.precision === 'day') || p;
});
check('un fin ANTERIOR a la ultima construccion se ignora (habla de un edificio anterior) y se cuenta', () => {
    const r = run([row('Q12506', 'Hagia Sophia', '0360-02-15T00:00:00Z', 11, JUL), row('Q12506', 'Hagia Sophia', '0537-12-27T00:00:00Z', 11, JUL)], [{ item: 'http://www.wikidata.org/entity/Q12506', t: '0532-01-16T00:00:00Z', prec: '11', cal: JUL }]);
    return (r.features[0].properties.built.end === null && r.skipped['fin anterior a la ultima construccion (se ignora el fin)'] === 1) || r;
});
check('un fin posterior (Bastilla 1370-1789) se guarda como fin segun la fuente; el registro sigue existiendo despues', () => {
    const r = run([row('Q1865480', 'Bastille', '1370-01-01T00:00:00Z', 9, JUL)], [{ item: 'http://www.wikidata.org/entity/Q1865480', t: '1789-01-01T00:00:00Z', prec: '9', cal: GRE }]);
    const p = r.features[0].properties; return (p.built.end && p.built.end.iso === '1789' && p.time.start_ybp > p.time.end_ybp && Math.abs(p.time.end_ybp - (1950 - 1789.5)) < 0.1) || p;
});
check('año a. C. con regla astro: "-2559" del RDF = 2560 a. C. (start_ybp ~ 4509,5)', () => {
    const p = run([row('Q37200', 'Great Pyramid of Giza', '-2559-01-01T00:00:00Z', 9, JUL)], [], [['Q37200', 'pyramid']]).features[0].properties;
    return (Math.abs(p.time.start_ybp - (1950 + 2559 - 0.5)) < 0.05 && p.built.family === 'pyramid' && p.time.iso === '-2559') || p;
});
check('siglo a. C. con regla hist: "-0500" prec 7 = s. V a. C. (500-401 a. C.), centro ~450 a. C. (año astronomico -449), incertidumbre ~50 años', () => {
    const p = run([row('Q10288', 'Parthenon', '-0500-01-01T00:00:00Z', 7, JUL)], []).features[0].properties;
    return (Math.abs(p.time.start_ybp - (1950 + 449)) < 0.1 && Math.abs(p.time.uncertainty_yr - 50) < 0.1 && p.time.precision === 'century' && p.built.family === 'other') || p;
});
check('sin coordenadas o sin etiqueta: fuera, con su motivo', () => {
    const r = run([row('Q1', 'X', '1500-01-01T00:00:00Z', 9, JUL, { coord: 'nada' }), row('Q2', 'Q2', '1500-01-01T00:00:00Z', 9, JUL)], []);
    return (r.features.length === 0 && r.skipped['sin coordenadas legibles'] === 1 && r.skipped['sin etiqueta'] === 1) || r.skipped;
});
check('los registros cumplen schemas/record.schema.json (layer built)', () => {
    const Ajv2020 = require('ajv/dist/2020'); const addFormats = require('ajv-formats');
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    const v = ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'record.schema.json'), 'utf8')));
    const r = run([row('Q1865480', 'Bastille', '1370-01-01T00:00:00Z', 9, JUL), row('Q10288', 'Parthenon', '-0500-01-01T00:00:00Z', 7, JUL)], [{ item: 'http://www.wikidata.org/entity/Q1865480', t: '1789-01-01T00:00:00Z', prec: '9', cal: GRE }]);
    return r.features.every((f) => v(f)) || v.errors;
});
check('familias: el orden de prioridad pone piramide antes que religioso y yacimiento al final', () => B.FAMILIES[0][0] === 'pyramid' && B.FAMILIES[1][0] === 'religious' && B.FAMILIES[B.FAMILIES.length - 1][0] === 'archaeological');

// --- modulo del cliente (map/built.js)
const CB = require('../map/built.js'); const EIc = require('../map/event-icons.js');
check('iconos: una familia por cada una del esquema, todas con dibujo valido dentro de la rejilla 24x24', () => {
    const schemaFam = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'record.schema.json'), 'utf8')).properties.properties.properties.built.properties.family.enum;
    if (JSON.stringify(schemaFam) !== JSON.stringify(CB.IDS)) return { schema: schemaFam, client: CB.IDS };
    return CB.IDS.every((f) => CB.GLYPHS[f] && CB.GLYPHS[f].every((p) => { const b = EIc.pathBox(p.d); return b.minX >= 0.5 && b.minY >= 0.5 && b.maxX <= 23.5 && b.maxY <= 23.5; }));
});
check('iconos: el marfil de las construcciones no es el color de ningun tipo de suceso', () => !Object.values(EIc.COLORS).map((c) => c.toLowerCase()).includes(CB.COLOR));
const rec = (s, e) => ({ time: { start_ybp: s, end_ybp: e === undefined ? -76 : e }, built: { end: e === undefined ? null : { iso: 'x', precision: 'year' } } });
check('estado: antes de construirse no se ve; despues si; pasado el fin de la fuente, atenuada (no borrada)', () =>
    CB.stateAt(rec(160.5, -76), 200) === 'future' && CB.stateAt(rec(580, 160.5), 300) === 'standing' && CB.stateAt(rec(580, 160.5), 100) === 'ended' && CB.stateAt(rec(580), -50) === 'standing');
check('datos compactos: fin solo si la fuente lo da; familia desconocida -> other; nombre en el idioma', () => {
    const f = (fam, end, labels) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: Object.assign({ id: 'wd.q1.built', name: 'X', labels, importance: 0.5 }, rec(500, end), { built: { family: fam, end: end === undefined ? null : { iso: '1789', precision: 'year' } } }) });
    const c = CB.compact([f('palace', 160, { en: 'Palace', es: 'Palacio' }), f('nope', undefined, { en: 'Y' })], 'es').features.map((x) => x.properties);
    return (c[0].e === 160 && c[0].n === 'Palacio' && c[1].e === undefined && c[1].f === 'other' && c[1].n === 'Y') || c;
});
check('texto de fechas: año, intervalo de siglo, dia', () => {
    const fy = (y) => (y >= 1 ? y + ' d. C.' : (1 - y) + ' a. C.');
    return CB.dateText({ iso: '-2559' }, fy) === '2560 a. C.' && CB.dateText({ iso: '-0499/-0400' }, fy) === '500 a. C. – 401 a. C.' && CB.dateText({ iso: '0537-12-27' }, fy) === '27/12/537 d. C.';
});

// --- datos publicados (si existen)
const dir = path.join(__dirname, '..', 'data', 'built');
if (fs.existsSync(path.join(dir, 'manifest.json'))) {
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const fc = JSON.parse(fs.readFileSync(path.join(dir, 'built.json'), 'utf8'));
    check('data/built: huella y recuento coinciden con el manifiesto', () => require('crypto').createHash('sha256').update(fs.readFileSync(path.join(dir, 'built.json'))).digest('hex') === man.file.sha256 && fc.features.length === man.counts.features);
    check('data/built: todo es raw, documentary y con fuente Wikidata', () => fc.features.every((f) => f.properties.status === 'raw' && f.properties.evidence === 'documentary' && f.properties.sources[0].kind === 'wikidata'));
    check('data/built: la calibracion quedo registrada y ningun año a. C. entro sin regla', () => man.calibration && typeof man.calibration.rules === 'object' && fc.features.every((f) => f.properties.time.start_ybp <= 1950 || man.calibration.rules[f.properties.time.precision === 'day' || f.properties.time.precision === 'month' || f.properties.time.precision === 'year' ? 'year+|bce' : f.properties.time.precision + '|bce']));
}

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nConstrucciones: todo verde.');
