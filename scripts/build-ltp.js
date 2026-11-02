#!/usr/bin/env node
// Extrae las tablas de la precesion de largo plazo (Vondrak, Capitaine y Wallace 2011) del TEXTO de ERFA (BSD)
// y escribe data/sky/ltp.json con su procedencia. No ejecuta codigo ajeno ni se teclea ningun coeficiente a mano.
//   node scripts/build-ltp.js --src <clon de liberfa/erfa> --commit <sha> --out data/sky
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const src = arg('src'); const commit = arg('commit'); const out = arg('out') || path.join(__dirname, '..', 'data', 'sky');
if (!src || !commit) { console.error('uso: build-ltp.js --src <dir de erfa> --commit <sha> [--out dir]'); process.exit(2); }
const read = (f) => fs.readFileSync(path.join(src, 'src', f), 'utf8');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const NUM = /[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?/g;
const nums = (txt) => (txt.match(NUM) || []).map(Number);
function block(text, name) {           // contenido entre las llaves de `static const double <name>... = { ... };`
    const i = text.indexOf(name); if (i < 0) throw new Error('no esta ' + name);
    const a = text.indexOf('{', text.indexOf('=', i)); let d = 0; let j = a;
    for (; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}') { d--; if (d === 0) break; } }
    return text.slice(a + 1, j);
}
const rows = (flat, n) => { if (flat.length % n) throw new Error('longitud inesperada ' + flat.length); const r = []; for (let i = 0; i < flat.length; i += n) r.push(flat.slice(i, i + n)); return r; };

const files = { 'era00.c': read('era00.c'), 'ltpequ.c': read('ltpequ.c'), 'ltpecl.c': read('ltpecl.c'), 'ltpb.c': read('ltpb.c'), 'obl06.c': read('obl06.c'), 'ltp.c': read('ltp.c') };
const xypol = rows(nums(block(files['ltpequ.c'], 'xypol')), 4); const xyper = rows(nums(block(files['ltpequ.c'], 'xyper')), 5);
const pqpol = rows(nums(block(files['ltpecl.c'], 'pqpol')), 4); const pqper = rows(nums(block(files['ltpecl.c'], 'pqper')), 5);
const eps0 = Number((files['ltpecl.c'].match(/eps0\s*=\s*([-+\d.eE]+)\s*\*\s*ERFA_DAS2R/) || [])[1]);
const bias = {}; for (const k of ['dx', 'de', 'dr']) bias[k] = Number((files['ltpb.c'].match(new RegExp(k + '\\s*=\\s*([-+\\d.eE]+)\\s*\\*\\s*ERFA_DAS2R')) || [])[1]);
// polinomio de la oblicuidad media IAU 2006 (eraObl06), por las mismas reglas: numeros del bloque de eps0
const oblTxt = files['obl06.c'].slice(files['obl06.c'].indexOf('eps0 = (') + 'eps0 = ('.length, files['obl06.c'].indexOf('ERFA_DAS2R;'));
const obl06 = nums(oblTxt.replace(/\(/g, ' ').replace(/\)/g, ' ').replace(/\*/g, ' ').replace(/\+/g, ' '));
const das2r = Number((read('erfam.h').match(/define ERFA_DAS2R \(([\d.eE+-]+)\)/) || [])[1]);

const eraM = files['era00.c'].match(/f\s*\+\s*([\d.]+)\s*\+\s*([\d.]+)\s*\*\s*t/);
const era = eraM ? { a: Number(eraM[1]), b: Number(eraM[2]) } : null;   // ERA = 2 pi (f + a + b Tu); f = parte fraccionaria de Tu
const must = (c, m) => { if (!c) throw new Error('extraccion invalida: ' + m); };
must(xypol.length === 2 && xyper.length === 14 && pqpol.length === 2 && pqper.length === 8, 'numero de filas');
must(Number.isFinite(eps0) && Object.values(bias).every(Number.isFinite) && Number.isFinite(das2r), 'constantes');
must(obl06.length === 6, 'obl06 tiene 6 coeficientes, hay ' + obl06.length);
must(era && Number.isFinite(era.a) && Number.isFinite(era.b), 'era00');
const tables = { era, xypol, xyper, pqpol, pqper, eps0_arcsec: eps0, bias_arcsec: bias, obl06_arcsec: obl06, das2r };
const doc = {
    generated_at: new Date().toISOString(),
    description: 'Precesion de largo plazo (modelo de 400 milenios): Vondrak, Capitaine y Wallace 2011, A&A 534, A22; corrigendum 2012, A&A 541, C1. Tablas extraidas del texto de ERFA.',
    valid_epoch_years: [-200000, 200000],
    accuracy_note: 'Segun ERFA (eraLtpb): coincide con la precesion IAU 2006 en J2000.0; unos segundos de arco en todo el periodo historico; empeora a unas decimas de grado en los extremos de +/-200.000 anos.',
    source: { repo: 'https://github.com/liberfa/erfa', commit, license: 'BSD-3-Clause (derivada, con permiso, de SOFA del IAU; ver NOTICE)', files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha(v)])) },
    tables,
    tables_sha256: sha(JSON.stringify(tables)),
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ltp.json'), JSON.stringify(doc, null, 1) + '\n');
fs.writeFileSync(path.join(out, 'ltp-LICENSE-ERFA.txt'), fs.readFileSync(path.join(src, 'LICENSE'), 'utf8'));
console.log('ltp.json escrito: xyper', xyper.length, 'pqper', pqper.length, 'eps0', eps0, 'bias', bias, 'obl06', obl06);
