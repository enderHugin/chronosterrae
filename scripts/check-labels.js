#!/usr/bin/env node
// Pruebas de map/labels.js: donde se pone el nombre de cada estado. Sin red.
'use strict';
const L = require('../map/labels.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const inside = (p, rings) => { const xs = []; for (const r of rings) for (let i = 0; i < r.length - 1; i++) { const y0 = r[i][1]; const y1 = r[i + 1][1]; if ((y0 > p[1]) !== (y1 > p[1])) xs.push(r[i][0] + (p[1] - y0) * (r[i + 1][0] - r[i][0]) / (y1 - y0)); } xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) if (p[0] >= xs[i] && p[0] <= xs[i + 1]) return true; return false; };
// «C»: cuadrado de 10 con una muesca que entra desde la derecha y deja el centroide en el hueco
const C = [[[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10], [0, 0]]];
const donut = [sq(0, 0, 10), sq(3, 3, 4).reverse()];
const poly = (name, rings, extra = {}) => ({ type: 'Feature', properties: { NAME: name, ...extra }, geometry: { type: 'Polygon', coordinates: rings } });

check('cuadrado: el punto es el centro', () => { const p = L.labelPoint([sq(0, 0, 10)]); return Math.abs(p[0] - 5) < 1e-9 && Math.abs(p[1] - 5) < 1e-9 ? true : p; });
check('forma de C: el centroide cae en el hueco, el punto del rotulo cae DENTRO del poligono', () => {
    const cx = (() => { let a = 0, x = 0, y = 0; const r = C[0]; for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; x += (r[i][0] + r[i + 1][0]) * f; y += (r[i][1] + r[i + 1][1]) * f; } return [x / (3 * a), y / (3 * a)]; })();
    const p = L.labelPoint(C); return !inside(cx, C) && inside(p, C) ? true : JSON.stringify({ cx, p });
});
check('anillo con agujero (donut): el punto no cae en el agujero', () => { const p = L.labelPoint(donut); return inside(p, donut) ? true : p; });
check('poligono degenerado, vacio o sin anillo -> null (no se inventa un punto)', () => L.labelPoint([[[0, 0], [1, 1], [0, 0]]]) === null && L.labelPoint([]) === null && L.labelPoint(null) === null && L.labelPoint([[[0, 0], [1, 0], [2, 0], [0, 0]]]) === null);

const fc = { type: 'FeatureCollection', features: [
    poly('Grande', [sq(0, 0, 10)], { SUBJECTO: 'Imperio' }), poly('Colonia', [sq(40, 0, 2)], { SUBJECTO: 'Imperio' }), poly('Pequeño', [sq(20, 0, 1)]), poly('En C', C.map((r) => r.map(([x, y]) => [x + 60, y]))),
    { type: 'Feature', properties: { NAME: null }, geometry: { type: 'Polygon', coordinates: [sq(80, 0, 10)] } }, { type: 'Feature', properties: { NAME: 'Sin geometria' }, geometry: null }
] };
const key = (f) => f.properties.SUBJECTO || f.properties.NAME;
const out = L.polityLabels(fc, key);
check('rotulos: uno por estado (la colonia y la metropoli del mismo SUBJECTO comparten rotulo), ordenados del mayor al menor', () => out.map((o) => o.key).join() === 'Imperio,En C,Pequeño' ? true : out.map((o) => o.key).join());
check('el rotulo del estado con varias partes va en su parte MAYOR, no en la colonia', () => { const o = out.find((x) => x.key === 'Imperio'); return o.lng > 0 && o.lng < 10 ? true : JSON.stringify(o); });
check('el rotulo de la C cae dentro del poligono desplazado', () => { const o = out.find((x) => x.key === 'En C'); return inside([o.lng, o.lat], C.map((r) => r.map(([x, y]) => [x + 60, y]))) ? true : JSON.stringify(o); });
check('la tierra sin nombre y la geometria nula no se rotulan', () => !out.some((o) => o.key === 'Sin geometria' || o.key === null));
check('superficie y anchura: 10x10 grados en el ecuador ≈ 1,24 millones de km² y ≈ 1112 km de ancho; la suma incluye la colonia', () => { const o = out.find((x) => x.key === 'Imperio'); return o.areaKm2 > 1.2e6 && o.widthKm > 1100 && o.widthKm < 1125 && o.areaKm2 > 1.2364e6 + 40000 ? true : JSON.stringify(o); });
check('el texto puede venir de otra funcion (p. ej. el nombre en el idioma de la interfaz)', () => L.polityLabels(fc, key, (f) => 'X-' + f.properties.NAME).find((o) => o.key === 'En C').text === 'X-En C');
check('RECHAZOS: coleccion no valida -> BAD_COLLECTION; sin funcion de clave -> BAD_KEY', () => rejects(() => L.polityLabels(null, key), 'BAD_COLLECTION') === true && rejects(() => L.polityLabels({}, key), 'BAD_COLLECTION') === true && rejects(() => L.polityLabels(fc), 'BAD_KEY') === true);

// Estilo con la estructura real de OpenFreeMap (capa de agua en cursiva primero, luego lugares); los ids son ilustrativos: se elige por estructura
const sym = (id, font, srcLayer, filter) => ({ id, type: 'symbol', 'source-layer': srcLayer, filter, layout: { 'text-font': font, 'text-field': '{name}' } });
const style = { layers: [{ id: 'bg', type: 'background' }, sym('water_name', ['Noto Sans Italic'], 'water_name'), sym('road_label', ['Noto Sans Regular'], 'transportation_name'), sym('label_town', ['Noto Sans Regular'], 'place', ['==', 'class', 'town']), sym('label_country_big', ['Noto Sans Bold'], 'place', ['==', 'class', 'country']), sym('expr', [{ x: 1 }], 'place')] };
check('tipografia: no es la de la primera capa de texto (agua, cursiva) sino la de paises, recta', () => { const f = L.pickFont(style); return f && f[0] === 'Noto Sans Bold' ? true : JSON.stringify(f); });
check('tipografia: sin capa de paises, la de lugares recta; sin lugares, la primera recta', () => {
    const a = L.pickFont({ layers: style.layers.filter((l) => l.id !== 'label_country_big') }); const b = L.pickFont({ layers: style.layers.filter((l) => ['water_name', 'road_label'].includes(l.id)) });
    return a[0] === 'Noto Sans Regular' && b[0] === 'Noto Sans Regular' ? true : JSON.stringify([a, b]);
});
check('tipografia: si todas son cursivas se usa la primera (no se inventa una fuente); sin capas de texto, null', () => L.pickFont({ layers: [sym('a', ['Foo Italic'], 'water_name')] })[0] === 'Foo Italic' && L.pickFont({ layers: [{ id: 'bg', type: 'background' }] }) === null && L.pickFont(null) === null && L.pickFont({}) === null);
check('tipografia: una capa con la fuente dada por expresion (no una lista de cadenas) no se toma', () => { const f = L.pickFont({ layers: [sym('e', [{ x: 1 }], 'place')] }); return f === null ? true : JSON.stringify(f); });
check('capa de paises: por id o por filtro, solo de `place` y solo texto', () => L.isCountryLabel(sym('label_country_1', ['x'], 'place')) && L.isCountryLabel(sym('foo', ['x'], 'place', ['==', 'class', 'country'])) === true && !L.isCountryLabel(sym('label_town', ['x'], 'place', ['==', 'class', 'town'])) && !L.isCountryLabel(sym('country_x', ['x'], 'water_name')) && !L.isCountryLabel({ id: 'label_country', type: 'line', 'source-layer': 'place' }) && !L.isCountryLabel(null));

/* ---- Con las fronteras apagadas: solo accidentes geograficos (capas REALES del estilo de OpenFreeMap, scripts/fixtures/ofm-liberty-symbol-layers.json) ---- */
const FIX = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'ofm-liberty-symbol-layers.json'), 'utf8'));
// Evaluador minimo de expresiones de estilo de MapLibre (solo lo que usan estas capas): no se confia en que el filtro "se vea bien", se EJECUTA sobre elementos.
function ev(e, f) {
    if (!Array.isArray(e)) return e;
    const [op, ...a] = e; const g = (x) => ev(x, f);
    switch (op) {
        case 'literal': return a[0];
        case 'get': return f.props[a[0]] === undefined ? null : f.props[a[0]];
        case 'has': return f.props[a[0]] !== undefined;
        case 'geometry-type': return f.geom;
        case 'all': return a.every((x) => g(x) === true);
        case 'any': return a.some((x) => g(x) === true);
        case '!': return !g(a[0]);
        case '==': return g(a[0]) === g(a[1]);
        case '!=': return g(a[0]) !== g(a[1]);
        case '>=': return g(a[0]) !== null && g(a[0]) >= g(a[1]);
        case '<=': return g(a[0]) !== null && g(a[0]) <= g(a[1]);
        case '<': return g(a[0]) !== null && g(a[0]) < g(a[1]);
        case '>': return g(a[0]) !== null && g(a[0]) > g(a[1]);
        case 'match': { const v = g(a[0]); for (let i = 1; i + 1 < a.length; i += 2) { const k = Array.isArray(a[i]) ? a[i] : [a[i]]; if (k.includes(v)) return g(a[i + 1]); } return g(a[a.length - 1]); }
        case 'coalesce': { for (const x of a) { const v = g(x); if (v !== null && v !== undefined) return v; } return null; }
        case 'concat': return a.map((x) => String(g(x))).join('');
        case 'to-string': return String(g(a[0]));
        case 'case': { for (let i = 0; i + 1 < a.length; i += 2) if (g(a[i])) return g(a[i + 1]); return g(a[a.length - 1]); }
        default: throw new Error('operador no soportado por el evaluador de la prueba: ' + op);
    }
}
const feat = (props, geom = 'Point') => ({ props, geom });
const placeLayers = FIX.capas.filter((l) => l['source-layer'] === 'place');
// los 'element' que realmente trae `place` en las teselas reales (clasesDePlaceEnLasTeselas), con varios rangos y capitales
const placeFeatures = []; for (const c of FIX.clasesDePlaceEnLasTeselas) for (const rank of [1, 2, 3, 6, 11]) for (const capital of [undefined, 2, 4]) placeFeatures.push(feat({ class: c, rank, ...(capital ? { capital } : {}) }));
const placeShownBy = (usarGeo) => (f) => placeLayers.some((l) => { const g = usarGeo ? L.geoNames(l) : { show: true, filter: l.filter }; return g.show && (g.filter === null || ev(g.filter, f) === true); });

check('fixture: es el estilo real (25 capas de texto, con las de pais, estado, ciudad, agua y rio) y las clases de place incluyen island', () => FIX.capas.length === 25 && ['label_country_1', 'label_state', 'label_city', 'water_name_line_label', 'waterway_line_label'].every((id) => FIX.capas.some((l) => l.id === id)) && FIX.clasesDePlaceEnLasTeselas.includes('island') ? true : FIX.capas.length);
check('sin geoNames el estilo SI rotula paises, estados, ciudades y pueblos (el evaluador no es vacuo: distingue clases)', () => {
    const shown = new Set(placeFeatures.filter(placeShownBy(false)).map((f) => f.props.class));
    return ['country', 'state', 'city', 'town', 'village', 'hamlet', 'province', 'island'].every((c) => shown.has(c)) && !shown.has('continent') ? true : [...shown].join();
});
check('con geoNames, de `place` solo queda la isla: ninguna otra clase (pais, estado, provincia, ciudad, pueblo, aldea, barrio, tierras indigenas, continente) se rotula con ningun rango ni capital', () => {
    const shown = new Set(placeFeatures.filter(placeShownBy(true)).map((f) => f.props.class));
    return shown.size === 1 && shown.has('island') ? true : [...shown].join();
});
check('con geoNames se ve el nombre de los mares, bahias, estrechos y lagos (water_name) y de los rios (waterway), sin cambiar su filtro', () => {
    const ids = FIX.capas.filter((l) => L.geoNames(l).show && l['source-layer'] !== 'place').map((l) => l.id).sort().join();
    const mismoFiltro = FIX.capas.filter((l) => L.geoNames(l).show && l['source-layer'] !== 'place').every((l) => JSON.stringify(L.geoNames(l).filter) === JSON.stringify(l.filter || null));
    return ids === 'water_name_line_label,water_name_point_label,waterway_line_label' && mismoFiltro ? true : ids;
});
check('con geoNames se OCULTAN carreteras, escudos, POI, estaciones y aeropuertos (todas las capas que no son agua, relieve ni isla)', () => {
    const hidden = FIX.capas.filter((l) => !L.geoNames(l).show).map((l) => l['source-layer']); const set = new Set(hidden);
    return ['transportation', 'poi', 'transportation_name', 'aerodrome_label'].every((c) => set.has(c)) && !set.has('place') && !set.has('water_name') && !set.has('waterway') ? true : [...set].join();
});
check('lo desconocido se oculta (parque, edificios, numeros de portal, capas sin capa de origen) y lo que no es de texto tampoco se muestra', () =>
    ['park', 'housenumber', 'building', 'landuse', 'boundary'].every((sl) => !L.geoNames({ type: 'symbol', 'source-layer': sl }).show) && !L.geoNames({ type: 'symbol' }).show && !L.geoNames({ type: 'line', 'source-layer': 'waterway' }).show && !L.geoNames(null).show);
check('las clases geograficas de place son solo las observadas en las teselas reales (no se supone ninguna): island', () => L.GEO_PLACE_CLASSES.every((c) => FIX.clasesDePlaceEnLasTeselas.includes(c)) && L.GEO_PLACE_CLASSES.join() === 'island');
check('las capas de origen geograficas coinciden con capas reales del esquema: water_name y mountain_peak traen sus clases (mar, bahia, estrecho, lago; pico, collado, volcan)', () => L.GEO_SOURCE_LAYERS.has('water_name') && L.GEO_SOURCE_LAYERS.has('waterway') && L.GEO_SOURCE_LAYERS.has('mountain_peak') && FIX.clasesDeWaterName.join() === 'bay,lake,sea,strait' && FIX.clasesDeMountainPeak.join() === 'peak,saddle,volcano');
const peak = L.peakLayer('ofm-openmaptiles', ['Noto Sans Regular']);
check('picos: capa de mountain_peak desde z8, con la fuente de letra dada; muestra picos y volcanes con nombre, no collados ni lo que no tiene nombre', () =>
    peak['source-layer'] === 'mountain_peak' && peak.minzoom === 8 && peak.layout['text-font'][0] === 'Noto Sans Regular' && peak.source === 'ofm-openmaptiles'
    && ev(peak.filter, feat({ class: 'peak', name: 'X' })) === true && ev(peak.filter, feat({ class: 'volcano', name: 'X' })) === true
    && ev(peak.filter, feat({ class: 'saddle', name: 'Col' })) === false && ev(peak.filter, feat({ class: 'peak' })) === false);
check('picos: el texto lleva la altitud tal como la trae el dato (campo ele, metros); sin ele, solo el nombre; prefiere name:latin; no inventa nada', () => {
    const tf = peak.layout['text-field'];
    return ev(tf, feat({ name: 'Mont Blanc', ele: 4806 })) === 'Mont Blanc\n4806 m' && ev(tf, feat({ name: 'Cima Sin Altura' })) === 'Cima Sin Altura'
        && ev(tf, feat({ name: '雅鲁藏布', 'name:latin': 'Yarlung', ele: 3000 })) === 'Yarlung\n3000 m';
});
check('picos: se ordenan por rank (menor primero = el mas alto de su tesela)', () => JSON.stringify(peak.layout['symbol-sort-key']) === JSON.stringify(['get', 'rank']));
console.log(fails ? '\n' + fails + ' fallo(s)' : '\ntodo bien');
process.exit(fails ? 1 : 0);
