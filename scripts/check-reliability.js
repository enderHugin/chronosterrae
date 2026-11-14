#!/usr/bin/env node
// check-reliability.js - Pruebas de las medallas de fiabilidad (map/reliability.js) y del contraste con la GND (scripts/corroborate-gnd.js).
'use strict';

const assert = require('assert');
const R = require('../map/reliability.js');
const G = require('./corroborate-gnd.js');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const wd = { sources: [{ kind: 'wikidata', id: 'Q937' }], status: 'raw' };
const gnd = (result, independent) => ({ source: 'gnd', result, value: '1879-03-14', independent, level: 'd' });

t('sin fuente no hay medalla; con una fuente, bronce', () => {
    assert.strictEqual(R.medal({ sources: [] }).medal, 'none');
    assert.strictEqual(R.medal(wd).medal, 'bronze');
});
t('la fuente de Wikidata cita a la autoridad: plata (no es una segunda fuente)', () => {
    const m = R.medal(wd, [gnd('a', false)]); assert.strictEqual(m.medal, 'silver'); assert.ok(m.reasons.some((r) => r.k === 'cites'));
});
t('una fuente curada independiente coincide: oro; dos: diamante', () => {
    assert.strictEqual(R.medal(wd, [gnd('a', true)]).medal, 'gold');
    assert.strictEqual(R.medal(wd, [gnd('a', true), { source: 'hced', result: 'a', independent: true }]).medal, 'diamond');
});
t('una fuente curada discrepa: en disputa y bronce, aunque otras coincidan', () => {
    const m = R.medal(wd, [gnd('d', true), { source: 'hced', result: 'a', independent: true }]);
    assert.strictEqual(m.disputed, true); assert.strictEqual(m.medal, 'bronze');
    assert.ok(m.reasons.some((r) => r.k === 'disputed' && r.value === '1879-03-14'));
});
t('revision humana: revisado = plata, consenso = oro; una fuente desconocida no cuenta', () => {
    assert.strictEqual(R.medal({ sources: wd.sources, status: 'reviewed' }).medal, 'silver');
    assert.strictEqual(R.medal({ sources: wd.sources, status: 'consensus' }).medal, 'gold');
    assert.strictEqual(R.medal(wd, [{ source: 'blog-cualquiera', result: 'a', independent: true }]).medal, 'bronze');
});
t('fila del fichero de contraste: se acepta la forma buena y se RECHAZA lo roto (null), sin lanzar', () => {
    assert.deepStrictEqual(R.fromRow('gnd', ['a', '1879', '118529579', 'y', 1]), { source: 'gnd', result: 'a', value: '1879', ref: '118529579', level: 'y', independent: true });
    assert.strictEqual(R.fromRow('gnd', ['x', '1879']), null);
    assert.strictEqual(R.fromRow('gnd', null), null);
});

t('fechas: lectura de la GND y de Wikidata', () => {
    assert.deepStrictEqual(G.parseDate('1879-03-14'), { y: 1879, m: 3, d: 14, prec: 'd' });
    assert.deepStrictEqual(G.parseDate('1879'), { y: 1879, m: 0, d: 0, prec: 'y' });
    assert.strictEqual(G.parseDate('ca. 1879'), null);                  // no se adivina: no se compara
    assert.strictEqual(G.parseDate('1879-13-01'), null);
    assert.deepStrictEqual(G.wdTime({ time: '+1879-03-14T00:00:00Z', precision: 11 }), { y: 1879, m: 3, d: 14, prec: 'd' });
    assert.deepStrictEqual(G.wdTime({ time: '+1879-00-00T00:00:00Z', precision: 9 }), { y: 1879, m: 0, d: 0, prec: 'y' });
});
t('comparacion al nivel del menos preciso; antes de 1583 solo el año; a. C. no se compara', () => {
    const P = G.parseDate;
    assert.deepStrictEqual(G.compareDates(P('1879-03-14'), P('1879')), { result: 'a', level: 'y' });
    assert.deepStrictEqual(G.compareDates(P('1879-03-14'), P('1879-03-15')), { result: 'd', level: 'd' });
    assert.deepStrictEqual(G.compareDates(P('1452-04-15'), P('1452-04-24')), { result: 'a', level: 'y' });   // juliano frente a gregoriano: solo el año
    assert.deepStrictEqual(G.compareDates(P('1451-04-15'), P('1452-04-15')), { result: 'd', level: 'y' });
    assert.strictEqual(G.compareDates(P('-0044-03-15'), P('-0044-03-15')), null);
});
t('independencia: la declaracion que cita a la GND no cuenta como fuente aparte', () => {
    assert.strictEqual(G.refIsGnd({ references: [{ snaks: { P248: [{ datavalue: { value: { id: 'Q36578' } } }] } }] }), true);
    assert.strictEqual(G.refIsGnd({ references: [{ snaks: { P854: [{ datavalue: { value: 'https://d-nb.info/gnd/118529579' } }] } }] }), true);
    assert.strictEqual(G.refIsGnd({ references: [{ snaks: { P248: [{ datavalue: { value: { id: 'Q328' } } }] } }] }), false);
    assert.strictEqual(G.refIsGnd({}), false);
});

console.log(n + ' pruebas de fiabilidad correctas');
