#!/usr/bin/env node
// check-cross.js - Pruebas del contraste entre fuentes (scripts/cross-borders.js) y de la lectura de licencias de la sonda (scripts/probe-sources.js).
'use strict';

const assert = require('assert');
const X = require('./cross-borders.js');
const P = require('./probe-sources.js');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

t('punto en poligono respeta los huecos', () => {
    const poly = [sq(0, 0, 10, 10), sq(4, 4, 6, 6)];
    assert.strictEqual(X.inPoly(1, 1, poly), true);
    assert.strictEqual(X.inPoly(5, 5, poly), false);      // en el hueco
    assert.strictEqual(X.inPoly(11, 5, poly), false);
});

t('con solapes gana la entidad mas pequeña (la mas concreta)', () => {
    const ix = X.indexShapes([{ key: 'imperio', polys: [[sq(0, 0, 10, 10)]], area: 100 }, { key: 'reino', polys: [[sq(0, 0, 3, 3)]], area: 9 }]);
    assert.strictEqual(X.lookup(ix, 1, 1), 'reino');
    assert.strictEqual(X.lookup(ix, 8, 8), 'imperio');
    assert.strictEqual(X.lookup(ix, 20, 20), null);
});

t('clases: acuerdo, detalle distinto, sin equivalente y desacuerdo de verdad', () => {
    // 10 puntos de igual peso. a = lo que dice una fuente; b = la otra.
    const w = new Array(10).fill(1);
    const same = X.compare(['A', 'A', 'A', 'A', 'A', null, null, null, null, null], ['B', 'B', 'B', 'B', 'B', null, null, null, null, null], w);
    assert.strictEqual(same.entities[0].kind, 'acuerdo');
    // a parte en dos lo que b agrupa (colonias frente a «imperio»)
    const finer = X.compare(['A1', 'A1', 'A2', 'A2', 'A2', null, null, null, null, null], ['B', 'B', 'B', 'B', 'B', null, null, null, null, null], w);
    assert.deepStrictEqual(finer.entities.map((e) => e.kind).sort(), ['a_mas_detallado', 'a_mas_detallado']);
    // a agrupa lo que b parte (Dinamarca con Groenlandia frente a Groenlandia sola)
    const coarser = X.compare(['A', 'A', 'A', 'A', 'A', 'A', null, null, null, null], ['B1', 'B1', null, null, null, null, null, null, null, null], w);
    assert.strictEqual(coarser.entities[0].kind, 'b_mas_detallado');            // 4 de 6 sin nada en b (< 70 %), y lo de b cae entero dentro de A
    const coarser2 = X.compare(['A', 'A', 'A', 'A', 'A', null, null, null, null, null], ['B1', 'B1', 'B2', 'B2', 'B3', null, null, null, null, null], w);
    assert.strictEqual(coarser2.entities[0].kind, 'b_mas_detallado');
    // pueblos sin estado en una fuente, nada en la otra
    const scope = X.compare(['Inuit', 'Inuit', 'Inuit', null, null, null, null, null, null, null], [null, null, null, null, null, null, null, null, null, null], w);
    assert.strictEqual(scope.entities[0].kind, 'sin_equivalente');
    // frontera desplazada: la mitad de cada lado en la otra entidad (Chaco: Paraguay frente a Bolivia)
    const shifted = X.compare(['P', 'P', 'P', 'P', 'Q', 'Q', 'Q', 'Q', null, null], ['Q2', 'Q2', 'P2', 'P2', 'P2', 'P2', 'Q2', 'Q2', null, null], w);
    const p = shifted.entities.find((e) => e.a === 'P');
    assert.strictEqual(p.kind, 'desacuerdo');
    assert.ok(p.iou < 0.5 && p.shareInB === 0.5 && p.shareOfB === 0.5);
});

t('totales de tierra: ambos, solo una, solo otra, ninguna', () => {
    const c = X.compare(['A', 'A', null, null], ['B', null, 'B', null], [1, 2, 3, 4]);
    assert.deepStrictEqual(c.totals, { both: 1, onlyA: 2, onlyB: 3, none: 4 });
});

t('licencias: anota la frase de la pagina, no una conclusion', () => {
    const f = P.licenceFindings('<p>This data is licensed under a Creative Commons Attribution 4.0 International License.</p>');
    assert.deepStrictEqual(f.map((x) => x.licence), ['CC BY 4.0']);
    assert.ok(/Attribution 4\.0/.test(f[0].excerpt));
    const nc = P.licenceFindings('Data are not to be used for any commercial activity. Please cite the dataset.');
    assert.deepStrictEqual(nc.map((x) => x.licence), ['NC (no comercial)', 'pide cita']);
});

t('licencias: pagina leida sin licencia (lista vacia) no es lo mismo que pagina rota', () => {
    assert.deepStrictEqual(P.licenceFindings('<html><body>Welcome to our data portal</body></html>'), []);
    assert.deepStrictEqual(P.licenceFindings(''), []);
    // el script de la sonda distingue los dos casos: licence_found = [] (leida) frente a licence_found = null con licence_page.ok = false (rota)
    assert.ok(/licence_found: lic\.ok \? licenceFindings\(lic\.text\) : null/.test(require('fs').readFileSync(require.resolve('./probe-sources.js'), 'utf8')));
});

t('cada fuente de la sonda tiene pagina de licencia y para que sirve', () => {
    const ids = new Set();
    for (const s of P.TARGETS) { assert.ok(/^https:\/\//.test(s.licence_url), s.id); assert.ok(s.what && s.what.length > 4, s.id); assert.ok(!ids.has(s.id), 'repetida ' + s.id); ids.add(s.id); }
});

console.log(n + ' pruebas de contraste correctas');
