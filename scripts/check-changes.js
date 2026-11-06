#!/usr/bin/env node
// Pruebas de map/changes.js: ventanas de las instantaneas, diferencia entre instantaneas y relacion de los sucesos con el cambio. Sin red.
// Los años de las instantaneas son los REALES de aourednik/historical-basemaps (commit da7a4b7, index.json): ver CFG.hbCommit en index.html.
'use strict';
const C = require('../map/changes.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };

const YEARS = [-123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010];
// cuadrado de `side` grados con la esquina en (x, y)
const sq = (x, y, side) => [[x, y], [x + side, y], [x + side, y + side], [x, y + side], [x, y]];
const poly = (name, ring, extra = {}) => ({ type: 'Feature', properties: { NAME: name, ...extra }, geometry: { type: 'Polygon', coordinates: [ring] } });
const fc = (...fs) => ({ type: 'FeatureCollection', features: fs });
const ev = (id, name, year, extra = {}) => ({ type: 'Feature', geometry: extra.geometry || null, properties: { id, name, layer: 'event', kind: 'event', importance: extra.importance === undefined ? 0.8 : extra.importance, evidence: 'documentary', time: { start_ybp: 1950 - year, end_ybp: 1950 - (extra.endYear === undefined ? year : extra.endYear), uncertainty_yr: 0.5, precision: 'year' }, scale: { min_m: 100, max_m: 2e7 }, sources: [{ kind: 'wikidata', id: 'Q1' }], status: 'raw', ...(extra.links ? { links: extra.links } : {}) } });

check('el caso del usuario: con 1783 y 1800, el 6 dic 1791 (1791,93) y el 6 ene 1792 (1792,02) se muestran con LA MISMA instantanea (1800); el cambio de 1783 a 1800 ocurre a mediados de 1791,5', () =>
    C.nearest(YEARS, 1791.93) === 1800 && C.nearest(YEARS, 1792.02) === 1800 && C.nearest(YEARS, 1791.49) === 1783 && C.nearest(YEARS, 1791.51) === 1800);
check('empate exacto (1791,5): gana la posterior, como la regla del mapa', () => C.nearest(YEARS, 1791.5) === 1800);
check('ventana de la instantanea 1800: de 1791,5 a 1807,5, vecinas 1783 y 1815', () => { const w = C.displayWindow(YEARS, 1800); return w.from === 1791.5 && w.to === 1807.5 && w.prev === 1783 && w.next === 1815 ? true : JSON.stringify(w); });
check('extremos: la primera no tiene inicio y la ultima no tiene fin (ventana abierta, no inventada)', () => { const a = C.displayWindow(YEARS, -123000); const b = C.displayWindow(YEARS, 2010); return a.from === null && a.prev === null && b.to === null && b.next === null; });
check('las ventanas de instantaneas consecutivas encajan sin hueco ni solape', () => { const ys = C.sortedYears(YEARS); for (let i = 1; i < ys.length; i++) if (C.displayWindow(ys, ys[i - 1]).to !== C.displayWindow(ys, ys[i]).from) return ys[i]; return true; });
check('RECHAZOS: lista vacia, no lista o con NaN -> BAD_YEARS; un año que no es instantanea -> NOT_A_SNAPSHOT', () =>
    [[], null, 'x', [1, NaN], [1, 'a']].every((v) => rejects(() => C.sortedYears(v), 'BAD_YEARS') === true) && rejects(() => C.displayWindow(YEARS, 1791), 'NOT_A_SNAPSHOT') === true);

check('superficie: 1x1 grado en el ecuador ≈ 12 364 km²; a 60° de latitud, ≈ la mitad', () => {
    const a0 = C.areaKm2({ type: 'Polygon', coordinates: [sq(0, 0, 1)] }); const a60 = C.areaKm2({ type: 'Polygon', coordinates: [sq(0, 60, 1)] });
    return Math.abs(a0 - 12364) < 30 && Math.abs(a60 / a0 - 0.5) < 0.02 ? true : [a0, a60];
});
check('superficie: un agujero se resta y un MultiPolygon suma; geometria nula o punto = 0', () => {
    const outer = sq(0, 0, 4); const hole = sq(1, 1, 2).reverse();
    const full = C.areaKm2({ type: 'Polygon', coordinates: [outer] }); const holed = C.areaKm2({ type: 'Polygon', coordinates: [outer, hole] });
    const multi = C.areaKm2({ type: 'MultiPolygon', coordinates: [[sq(0, 0, 1)], [sq(5, 5, 1)]] });
    return holed < full && Math.abs((full - holed) / C.areaKm2({ type: 'Polygon', coordinates: [sq(1, 1, 2)] }) - 1) < 0.01 && multi > 2 * 12000 && C.areaKm2(null) === 0 && C.areaKm2({ type: 'Point', coordinates: [0, 0] }) === 0 ? true : [full, holed, multi];
});
check('superficie cruzando el antimeridiano no explota (170 a -170)', () => { const a = C.areaKm2({ type: 'Polygon', coordinates: [[[170, 0], [-170, 0], [-170, 10], [170, 10], [170, 0]]] }); return a > 2e6 && a < 3e6 ? true : a; });
check('punto en poligono: dentro, fuera, y dentro de un agujero cuenta como fuera', () => {
    const g = { type: 'Polygon', coordinates: [sq(0, 0, 10), sq(4, 4, 2)] };
    return C.pointInGeometry(1, 1, g) && !C.pointInGeometry(11, 1, g) && !C.pointInGeometry(5, 5, g) && !C.pointInGeometry(1, 1, null) ? true : false;
});

const A = fc(poly('Francia', sq(0, 40, 8)), poly('Prusia', sq(10, 50, 4)), poly('Polonia', sq(20, 50, 6)), poly('Estable', sq(40, 0, 3)), { type: 'Feature', properties: { NAME: null }, geometry: { type: 'Polygon', coordinates: [sq(60, 0, 20)] } });
const B = fc(poly('Francia', sq(0, 40, 12)), poly('Prusia', sq(10, 50, 4)), poly('Imperio Nuevo', sq(20, 50, 6)), poly('Estable', sq(40, 0, 3)), { type: 'Feature', properties: { NAME: null }, geometry: { type: 'Polygon', coordinates: [sq(60, 0, 25)] } });
const D = C.diffPolities(A, B);
check('diferencia: Francia crece (cambiado), Polonia desaparece, Imperio Nuevo aparece, Prusia y Estable igual; la tierra sin nombre no cuenta', () =>
    D.changed.length === 1 && D.changed[0].name === 'Francia' && D.changed[0].deltaKm2 > 0 && D.removed.map((x) => x.name).join() === 'Polonia' && D.added.map((x) => x.name).join() === 'Imperio Nuevo' && D.same === 2 ? true : JSON.stringify(C.summarize(D)));
check('diferencia de una instantanea consigo misma: nada cambia', () => { const d = C.diffPolities(A, A); return d.added.length + d.removed.length + d.changed.length === 0 && d.same === 4; });
check('umbral: un cambio de superficie pequeño (<10 % y <5000 km²) no cuenta como cambio', () => { const d = C.diffPolities(fc(poly('X', sq(0, 0, 10))), fc(poly('X', sq(0, 0, 10.2)))); return d.changed.length === 0; });
check('RECHAZOS: coleccion nula o sin features -> BAD_COLLECTION; intervalo invertido -> BAD_INTERVAL', () =>
    rejects(() => C.diffPolities(null, B), 'BAD_COLLECTION') === true && rejects(() => C.diffPolities(A, {}), 'BAD_COLLECTION') === true && rejects(() => C.relatedEvents([], D, 1800, 1700), 'BAD_INTERVAL') === true && rejects(() => C.relatedEvents([], D, NaN, 1700), 'BAD_INTERVAL') === true);

check('classify sin clases de la fuente: se deduce del nombre en ingles (source = name); lo que no da pista es «other» (no se adivina)', () => {
    const k = (n) => C.classify(n);
    return k('Treaty of Ghent').kind === 'treaty' && k('Battle of Boyacá').kind === 'battle' && k('Swabian War').kind === 'war' && k('French Revolution').kind === 'political' && k('2011 Tarlay earthquake').kind === 'natural' && k('1928 Summer Olympics medal table').kind === 'other' && k('Treaty of Ghent').source === 'name';
});
check('classify con clases de Wikidata: manda la clase de la fuente (source = wikidata), aunque el nombre diga otra cosa', () => {
    const r = C.classify('Peace of Nothing', [{ id: 'Q178561', label: 'battle' }]); return r.kind === 'battle' && r.source === 'wikidata';
});
check('classify: si la fuente clasifica el suceso con una clase que no interesa (deporte, serie...), es «other» y NO se recurre al nombre', () => {
    const r = C.classify('Battle of the Sexes (tennis)', [{ id: 'Q47345468', label: 'tennis tournament edition' }]); return r.kind === 'other' && r.source === 'wikidata';
});
check('toda clase de CLASS_KINDS tiene un QID bien formado y un valor conocido', () => Object.entries(C.CLASS_KINDS).every(([q, k]) => /^Q\d+$/.test(q) && ['treaty', 'battle', 'war', 'political', 'natural', 'violence'].includes(k)));

const evs = [
    ev('a', 'Guerra de Polonia', 1795),                                   // nombre contiene «Polonia» y cae dentro
    ev('b', 'Guerras de Francia', 1792, { importance: 0.3 }),             // nombre contiene «Francia»; poca notoriedad pero entra por nombre
    ev('c', 'Battle of Elsewhere', 1790, { importance: 0.9 }),            // solo tiempo, notoriedad alta, clase deducible
    ev('d', 'Minor battle', 1790, { importance: 0.2 }),                   // solo tiempo, poca notoriedad: fuera
    ev('k', '1790 Grand Prix', 1790, { importance: 0.95 }),               // solo tiempo, muy notorio pero sin clase deducible: fuera
    { ...ev('l', 'Himno nacional de Polonia', 1795), properties: { ...ev('l', 'x', 1795).properties, name: 'Himno nacional de Polonia', kind: 'publication' } },   // nombra a Polonia, pero es una publicacion: fuera
    ev('e', 'Fuera de intervalo Francia', 1750),                          // antes de 1783
    ev('f', 'Posterior', 1801),                                           // despues de 1800
    ev('g', 'Algo en el territorio', 1795, { geometry: { type: 'Point', coordinates: [22, 52] } }),   // dentro de Polonia
    ev('h', 'Con vinculo', 1796, { links: [{ rel: 'cause', target: { kind: 'wikidata', id: 'Q2' }, source: { kind: 'wikidata', id: 'Q1' } }] }),
    ev('i', 'Solo parte de otro', 1796, { importance: 0.1, links: [{ rel: 'part_of', target: { kind: 'wikidata', id: 'Q3' } }] }),   // part_of no es causa
    ev('j', 'Siege of Long', 1780, { endYear: 1790 })             // el intervalo solo toca su final
];
const R = C.relatedEvents(evs, D, 1783, 1800);
const ids = R.items.map((i) => i.f.properties.id);
check('sucesos: se incluyen los del intervalo (incluidos los que solo lo rozan) y se excluyen los de fuera', () => !ids.includes('e') && !ids.includes('f') && ids.includes('j') ? true : ids.join());
check('nivel exacto de cada suceso', () => { const t = Object.fromEntries(R.items.map((i) => [i.f.properties.id, i.tier])); return t.h === 'documented' && t.g === 'place' && t.a === 'name' && t.b === 'name' && t.c === 'time' && t.j === 'time' ? true : JSON.stringify(t); });
check('solo cuentan los registros de clase `event`: una publicacion que nombra a Polonia no sale; un suceso notorio sin clase deducible (Grand Prix) tampoco sale solo por la fecha', () => !ids.includes('l') && !ids.includes('k'));
check('con clases de la fuente, un suceso solo-fecha sin clase historica (aunque el nombre diga «Battle») no entra y uno con clase historica si', () => {
    const sport = ev('s1x', 'Battle of the Sexes', 1790, { importance: 0.9 }); sport.properties.classes = [{ id: 'Q47345468' }];
    const war = ev('s2x', 'Algo sin pista', 1790, { importance: 0.9 }); war.properties.classes = [{ id: 'Q198' }];
    const r = C.relatedEvents([sport, war], D, 1783, 1800); const t = r.items.map((i) => i.f.properties.id + ':' + i.kindSource);
    return t.join() === 's2x:wikidata' ? true : t.join();
});
check('«part_of» NO cuenta como vinculo causal, y un suceso poco notorio sin otra relacion no entra', () => !ids.includes('i') && !ids.includes('d'));
check('orden: documentado, lugar, nombre, tiempo', () => { const order = R.items.map((i) => C.TIERS.indexOf(i.tier)); return order.every((v, k) => k === 0 || order[k - 1] <= v) ? true : order.join(); });
check('el suceso por lugar declara el territorio que cambio; el de nombre, el estado', () => R.items.find((i) => i.f.properties.id === 'g').polities.includes('Polonia') && R.items.find((i) => i.f.properties.id === 'a').polities.join() === 'Polonia');
check('se cuenta cuantos sucesos del intervalo tienen coordenadas (para avisar de que el lugar no se pudo comprobar)', () => R.withGeometry === 1 && R.inInterval === 9 ? true : [R.withGeometry, R.inInterval]);
check('sin sucesos con coordenadas: withGeometry = 0 y nadie sale como «lugar»', () => { const r = C.relatedEvents(evs.filter((e) => !e.geometry), D, 1783, 1800); return r.withGeometry === 0 && r.items.every((i) => i.tier !== 'place'); });
check('un nombre de estado muy corto (<4 letras) no se busca en los nombres de sucesos (evita falsos «Ur» dentro de «Durante»)', () => {
    const d = C.diffPolities(fc(poly('Ur', sq(0, 0, 5))), fc());
    const r = C.relatedEvents([ev('z', 'Durante la guerra', 1795, { importance: 0.1 })], d, 1783, 1800); return r.items.length === 0;
});
check('el nombre se busca como palabra entera: «Francia» no casa con «Franciacorta»', () => { const r = C.relatedEvents([ev('y', 'Vinos de Franciacorta', 1795, { importance: 0.1 })], D, 1783, 1800); return r.items.length === 0; });
check('tope por grupo: se limita lo mostrado pero se informa del total', () => {
    const many = Array.from({ length: 40 }, (_, i) => ev('m' + i, 'Battle of ' + i, 1790, { importance: 0.9 }));
    const r = C.relatedEvents(many, D, 1783, 1800, { max: { documented: 5, place: 5, name: 5, time: 7 } }); return r.items.length === 7 && r.total.time === 40 ? true : [r.items.length, r.total.time];
});

// ---- esquema: el campo `links` (vinculos documentados) ----
{
    const Ajv2020 = require('ajv/dist/2020'); const addFormats = require('ajv-formats');
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    const validate = ajv.compile(require('../schemas/record.schema.json'));
    const base = () => JSON.parse(JSON.stringify(ev('ev.test1', 'Treaty of Test', 1800)));
    const withLinks = (links) => { const r = base(); r.properties.links = links; return r; };
    const why = (rec) => { const ok = validate(rec); return ok ? 'valido' : validate.errors.filter((e) => e.keyword !== 'if').map((e) => e.instancePath.replace(/^\/properties/, '') + ' ' + e.keyword).join('; '); };
    const good = { rel: 'cause', target: { kind: 'wikidata', id: 'Q123', label: 'x' }, source: { kind: 'wikidata', id: 'Q1', citation: 'Wikidata P828' } };
    check('esquema: un registro sin `links` sigue siendo valido (el campo es opcional)', () => why(base()) === 'valido' ? true : why(base()));
    check('esquema: un vinculo completo (rel, destino Wikidata, fuente) es valido', () => why(withLinks([good])) === 'valido' ? true : why(withLinks([good])));
    check('RECHAZO: rel desconocida («coincides») -> rechazada por enum en /links/0/rel (no por otra causa)', () => why(withLinks([{ ...good, rel: 'coincides' }])) === '/links/0/rel enum' ? true : why(withLinks([{ ...good, rel: 'coincides' }])));
    check('RECHAZO: vinculo sin fuente -> falta `source` (required en /links/0)', () => why(withLinks([{ rel: 'cause', target: good.target }])) === '/links/0 required' ? true : why(withLinks([{ rel: 'cause', target: good.target }])));
    check('RECHAZO: destino Wikidata inventado sin forma Q<numero> -> pattern en /links/0/target/id', () => why(withLinks([{ ...good, target: { kind: 'wikidata', id: 'guerra' } }])) === '/links/0/target/id pattern' ? true : why(withLinks([{ ...good, target: { kind: 'wikidata', id: 'guerra' } }])));
    check('RECHAZO: campo extra en el vinculo (p. ej. `confidence` inventada) -> additionalProperties', () => why(withLinks([{ ...good, confidence: 0.9 }])) === '/links/0 additionalProperties' ? true : why(withLinks([{ ...good, confidence: 0.9 }])));
}
console.log(fails ? '\n' + fails + ' fallo(s)' : '\ntodo bien');
process.exit(fails ? 1 : 0);
