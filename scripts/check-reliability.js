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
    assert.deepStrictEqual(R.fromRow('gnd', ['a', '1879', '118529579', 'y', 1]), { source: 'gnd', result: 'a', value: '1879', ref: '118529579', level: 'y', independent: true, alt: false });
    assert.strictEqual(R.fromRow('gnd', ['c', '1594-12-19', 'x', 'd', 1, 0]).result, 'c');
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

t('otro calendario y fechas aproximadas: ni suben ni bajan la medalla, pero se dicen', () => {
    const m = R.medal(wd, [{ source: 'gnd', result: 'c', value: '1594-12-19', independent: true }]);
    assert.strictEqual(m.medal, 'bronze'); assert.strictEqual(m.disputed, false); assert.ok(m.reasons.some((r) => r.k === 'calendar'));
    const u = R.medal(wd, [{ source: 'gnd', result: 'u', value: '0055', independent: true }]);
    assert.strictEqual(u.medal, 'bronze'); assert.strictEqual(u.disputed, false); assert.ok(u.reasons.some((r) => r.k === 'approx'));
    assert.ok(R.medal(wd, [{ source: 'gnd', result: 'd', value: '1694-11-21', independent: true, alt: true }]).reasons.some((r) => r.k === 'disputed-alt'));
});
t('clases de diferencia con casos reales de la primera pasada (2026-11-14)', () => {
    const P = G.parseDate;
    // Gustavo Adolfo: 9-12-1594 (juliano) frente a 19-12-1594 = desfase de 10 dias en esa fecha
    assert.strictEqual(G.classifyDiff(P('1594-12-09'), P('1594-12-19'), 'd', false), 'c');
    // Ana de Rusia, 1740: desfase de 11 dias
    assert.strictEqual(G.classifyDiff(P('1740-10-17'), P('1740-10-28'), 'd', false), 'c');
    // Robert Boyle: 25-1-1626 frente a 25-1-1627 (el año empezaba el 25 de marzo)
    assert.strictEqual(G.classifyDiff(P('1626-01-25'), P('1627-01-25'), 'd', false), 'c');
    // Tacito: 54 frente a 55 (antes de 1500, año, hasta 5): aproximadas
    assert.strictEqual(G.classifyDiff(P('0054'), P('0055'), 'y', false), 'u');
    // Ptolomeo: 165 frente a 178: discrepan
    assert.strictEqual(G.classifyDiff(P('0165'), P('0178'), 'y', false), 'd');
    // con «circa» en Wikidata, hasta 10 años
    assert.strictEqual(G.classifyDiff(P('1565'), P('1556'), 'y', true), 'u');
    assert.strictEqual(G.classifyDiff(P('1565'), P('1550'), 'y', false), 'd');
    // contradicciones reales: Voltaire (20-2 frente a 21-11-1694), Marat (1793 frente a 1703), un dia de diferencia
    assert.strictEqual(G.classifyDiff(P('1694-02-20'), P('1694-11-21'), 'd', false), 'd');
    assert.strictEqual(G.classifyDiff(P('1793-07-13'), P('1703-07-13'), 'd', false), 'd');
    assert.strictEqual(G.classifyDiff(P('1837-06-14'), P('1837-06-15'), 'd', false), 'd');
    assert.strictEqual(G.jgOffset(P('1582-10-14')), 0); assert.strictEqual(G.jgOffset(P('1900-03-01')), 13);
});

console.log(n + ' pruebas de fiabilidad correctas');
