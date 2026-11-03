#!/usr/bin/env node
// Pruebas de map/borders-resolution.js: resolucion medida de los poligonos y zoom a partir del cual dejan de dar detalle. Sin red.
'use strict';
const R = require('../map/borders-resolution.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
// Anillo cuadrado de lado `side` grados en el ecuador con un vertice cada `step` grados
const ring = (side, step) => { const p = []; for (let x = 0; x < side; x += step) p.push([x, 0]); for (let y = 0; y < side; y += step) p.push([side, y]); for (let x = side; x > 0; x -= step) p.push([x, side]); for (let y = side; y > 0; y -= step) p.push([0, y]); p.push([0, 0]); return p; };
const fc = (...rings) => ({ type: 'FeatureCollection', features: rings.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } })) });

check('mediana de un anillo con un vertice cada 0,1 grado en el ecuador: 11,12 km', () => { const m = R.medianSegmentKm(fc(ring(1, 0.1))); return Math.abs(m - 11.1195) < 0.01 ? true : m; });
check('la mediana usa la latitud: el mismo paso en longitud a 60 grados mide la mitad', () => {
    const at = (lat) => R.medianSegmentKm({ features: [{ geometry: { type: 'Polygon', coordinates: [[[0, lat], [0.1, lat], [0.2, lat], [0.3, lat], [0.3, lat]]] } }] });
    return Math.abs(at(60) / at(0) - 0.5) < 0.01 ? true : at(60) / at(0);
});
check('la mediana resiste valores extremos (un tramo gigante no la mueve)', () => { const r = ring(1, 0.1); r.splice(3, 0, [50, 50]); const m = R.medianSegmentKm(fc(r)); return m < 20 ? true : m; });
check('con mas de 40.000 tramos toma una muestra y da la misma mediana', () => { const big = fc(ring(40, 0.0005)); const m = R.medianSegmentKm(big); return Math.abs(m - 0.0005 * 111.195) < 0.01 ? true : m; });
check('MultiPolygon y varios anillos (agujeros) cuentan', () => R.medianSegmentKm({ features: [{ geometry: { type: 'MultiPolygon', coordinates: [[ring(1, 0.1), ring(0.5, 0.1)]] } }] }) > 0);
check('sin poligonos, geometria nula o tramos de longitud cero: null (no se inventa una resolucion)', () => R.medianSegmentKm(null) === null && R.medianSegmentKm({ features: [] }) === null && R.medianSegmentKm({ features: [{ geometry: null }] }) === null && R.medianSegmentKm({ features: [{ geometry: { type: 'Polygon', coordinates: [[[1, 1], [1, 1], [1, 1]]] } }] }) === null);
check('kmPerPx: a zoom 0 en el ecuador, 78,27 km por pixel (40075,017/512); cada zoom lo divide por 2; a 60 grados, la mitad', () => Math.abs(R.kmPerPx(0, 0) - 40075.017 / 512) < 1e-9 && Math.abs(R.kmPerPx(0, 0) - 78.27) < 0.01 && Math.abs(R.kmPerPx(3, 0) - 40075.017 / 512 / 8) < 1e-9 && Math.abs(R.kmPerPx(0, 60) / R.kmPerPx(0, 0) - 0.5) < 1e-9);
check('zoomLimit: justo en ese zoom el tramo mide exactamente segPx pixeles', () => { for (const [res, lat, px] of [[17.7, 50, 4], [2.5, 20, 4], [30, 0, 3], [0.5, 45, 6]]) { const z = R.zoomLimit(res, lat, px); if (Math.abs(res / R.kmPerPx(z, lat) - px) > 1e-9) return JSON.stringify([res, lat, px, z]); } return true; });
check('zoomLimit: mas fino el dato, mas zoom aguanta (2,5 km frente a 17,7 km: log2(7,08) = 2,82 niveles mas)', () => Math.abs(R.zoomLimit(2.5, 40) - R.zoomLimit(17.7, 40) - Math.log2(17.7 / 2.5)) < 1e-9);
check('zoomLimit baja con la latitud (el pixel mide menos km) y es finito en los polos', () => R.zoomLimit(17.7, 60) < R.zoomLimit(17.7, 0) && Number.isFinite(R.zoomLimit(17.7, 89.9)));
check('caso real: 1945 (mediana medida 17,7 km, lat 50): el limite cae en zoom ~3,5; el globo (zoom 1,4) esta dentro y el zoom 4 de la captura de revision, fuera', () => {
    const z = R.zoomLimit(17.7, 50); return Math.abs(z - 3.51) < 0.05 && !R.tooFine(17.7, 1.4, 50) && R.tooFine(17.7, 4, 50) ? true : z;
});
check('RECHAZOS: resolucion 0, negativa, NaN o no numerica -> BAD_RES; tolerancia 0 -> BAD_PX; vista no numerica -> BAD_VIEW', () =>
    [0, -3, NaN, Infinity, 'x', null].every((v) => rejects(() => R.zoomLimit(v, 40), 'BAD_RES') === true) && rejects(() => R.zoomLimit(10, 40, 0), 'BAD_PX') === true && rejects(() => R.kmPerPx(NaN, 0), 'BAD_VIEW') === true);

console.log(fails ? '\n' + fails + ' prueba(s) con fallo.' : '\nResolucion de fronteras: todo verde.');
process.exit(fails ? 1 : 0);
