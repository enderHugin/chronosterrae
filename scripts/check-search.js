#!/usr/bin/env node
/* check-search.js - Pruebas del buscador: map/search.js (normalizar, puntuar, resaltar) y scripts/build-search.js sobre los datos del repo. */
'use strict';
const S = require('../map/search.js');
const B = require('./build-search.js');
let fails = 0; const passes = [];
function check(name, fn) { let ok = false, err = ''; try { const r = fn(); ok = r === true; if (!ok) err = ' -> ' + JSON.stringify(r).slice(0, 400); } catch (e) { err = ' (' + e.message + ')'; } if (ok) passes.push(name); else { fails++; console.log('  XX  ' + name + err); } }

check('normalizar: sin tildes, minusculas, guiones y signos como espacio', () => S.normalize('  Ángel  Russell–Einstein (1955) ¿?') === 'angel russell einstein 1955');
const tb = { fields: ['id', 'kind', 'en', 'es', 'imp'], rows: [
    ['a', 'event', 'einsteinium', 'einstenio', 0.7], ['b', 'person', 'Albert Einstein', null, 1], ['c', 'built', 'Einstein Tower', 'Torre Einstein', 0.6],
    ['d', 'event', 'Einstein–Szilárd letter', 'Carta Einstein-Szilárd', 0.71], ['e', 'person', 'Bastian Schweinsteiger', null, 0.8], ['f', 'person', 'Ángel Ganivet', null, 0.5]] };
const E = S.prepare(tb);
const ids = (q, o) => S.query(E, q, o).map((e) => e.id).join('');
check('«einstein»: Albert Einstein el primero (palabra entera y persona), antes que «einsteinium»', () => ids('einstein')[0] === 'b' || ids('einstein'));
check('«einst» (a medio escribir): Albert Einstein primero; «Schweinsteiger» no sale (no es principio de palabra) salvo como subcadena, al final', () => { const r = ids('einst'); return (r[0] === 'b' && (r.indexOf('e') < 0 || r.indexOf('e') === r.length - 1)) || r; });
check('se busca en los dos idiomas y sin tildes: «torre ein» y «angel»', () => ids('torre ein') === 'c' && ids('angel') === 'f');
check('menos de 2 letras: nada (no se lanza una lista con cada tecla)', () => S.query(E, 'e').length === 0);
check('limite de resultados', () => S.query(E, 'ein', { limit: 2 }).length === 2);
check('resaltado: marca el principio de palabra y respeta tildes y mayusculas del original', () => JSON.stringify(S.highlight('Ángel Ganivet', 'angel')) === JSON.stringify([{ t: 'Ángel', m: true }, { t: ' Ganivet', m: false }]) && S.highlight('Albert Einstein', 'einst').map((p) => (p.m ? '[' + p.t + ']' : p.t)).join('') === 'Albert [Einst]ein');

// --- indice construido con los datos del repo
const idx = B.build(); const F = Object.fromEntries(idx.fields.map((k, i) => [k, i]));
const rows = idx.rows;
check('indice: campos esperados', () => ['id', 'kind', 'icon', 'en', 'es', 'lng', 'lat', 'jd', 'iso', 'imp', 'qid', 'img', 'd', 'ek'].every((k) => k in F));
check('indice: el id omitido se reconstruye igual que el del registro (personas, sucesos, construcciones)', () => {
    const fs = require('fs'); const path = require('path'); const want = new Set();
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'data', 'events')).filter((x) => /^c\d+\.json$/.test(x))) JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'events', f), 'utf8')).features.forEach((ft) => want.add(ft.properties.id));
    const E2 = S.prepare(idx); const bad = E2.filter((e) => e.kind !== 'built' && !want.has(e.id)).slice(0, 5).map((e) => e.id);
    return (bad.length === 0 && E2.find((e) => e.qid === 'Q2981' && e.kind === 'built').id === 'wd.q2981.built') || bad;
});
check('indice: cada persona sale UNA vez (nacimiento y muerte juntos)', () => { const q = rows.filter((r) => r[F.kind] === 'person').map((r) => r[F.qid]); return q.length === new Set(q).size || q.length - new Set(q).size; });
const ein = rows.find((r) => r[F.qid] === 'Q937' && r[F.kind] === 'person');
check('Albert Einstein: lleva al nacimiento (Ulm, 1879-03-14) y trae la muerte (1955-04-18)', () => (ein && S.idOf({ qid: 'Q937', kind: 'person', icon: ein[F.icon] }) === 'wd.q937.birth' && ein[F.iso] === '1879-03-14' && Math.abs(ein[F.lng] - 9.99) < 0.05 && Math.abs(ein[F.lat] - 48.4) < 0.05 && ein[F.d] === '1955-04-18') || ein);
check('Albert Einstein: el JD del nacimiento es el de ese dia (mediodia UT)', () => { const S2 = require('../sky/sky.js'); const jd0 = S2.calendarToJD({ year: 1879, month: 3, day: 14 }, 'gregorian').jd; return Math.abs(ein[F.jd] - (jd0 + 0.5)) < 0.6 || [ein[F.jd], jd0]; });
check('buscar «einstein» en el indice real: Albert Einstein el primero', () => { const r = S.query(S.prepare(idx), 'einstein', { limit: 5 }); return (r[0] && r[0].qid === 'Q937' && r[0].kind === 'person') || r.map((e) => e.en); });
check('construcciones en el indice: Notre-Dame de Paris con su fecha (1163)', () => { const r = rows.find((x) => x[F.qid] === 'Q2981' && x[F.kind] === 'built'); return (r && r[F.kind] === 'built' && r[F.iso] === '1163') || r; });
check('sucesos sin lugar tambien se encuentran (lng null) y no rompen el indice', () => rows.some((r) => r[F.kind] === 'event' && r[F.lng] === null) && rows.every((r) => r[F.lng] === null || (Math.abs(r[F.lng]) <= 180 && Math.abs(r[F.lat]) <= 90)));
check('imagenes: solo nombres de archivo (nunca una URL ni datos de imagen)', () => rows.every((r) => r[F.img] === null || (typeof r[F.img] === 'string' && !/^https?:|^data:/.test(r[F.img]) && /\.(jpe?g|png|gif|svg|tiff?|webp)$/i.test(r[F.img]))));

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nBuscador: todo verde.');
