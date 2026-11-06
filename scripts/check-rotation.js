#!/usr/bin/env node
// Pruebas de sky/planets.js: orientacion y rotacion de los planetas contra JPL Horizons (data/sky/validation-rotation.json, respuestas reales
// de su API con 6 instantes entre 1900 y 2100). Sin red. Mide el punto sub-observador (longitud y latitud), el angulo de posicion del polo y
// el diametro angular; cualquier desviacion mayor que la tolerancia es un fallo, no se ajusta la tolerancia para que pase.
'use strict';
const P = require('../sky/planets.js');
const V = require('../data/sky/validation-rotation.json');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
const dl = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

const TOL = { lon: 0.02, lat: 0.01, np: 0.03, diamPct: 0.01 };
// Horizons, para instantes posteriores a su ultimo segundo intercalar conocido, usa ΔT constante = 32,184 + 37 = 69,184 s ("last known
// leap-second is used as a constant"; lo dice su propia salida). Para reproducir SU convencion se fuerza ese ΔT en esas filas.
const HORIZONS_FUTURE_DT = 69.184;

check('radios y sentido de las longitudes iguales a los de Horizons (mismo origen que el archivo de validacion)', () => {
    for (const [n, b] of Object.entries(V.bodies)) {
        const s = P.SHAPE[n]; if (!s) return n + ': sin forma';
        if (s.a !== b.radiiKm.a || s.c !== b.radiiKm.c || b.radiiKm.a !== b.radiiKm.b) return n + ' radios ' + JSON.stringify(s) + ' vs ' + JSON.stringify(b.radiiKm);
        if (s.lon !== b.longitudePositive) return n + ' sentido ' + s.lon + ' vs ' + b.longitudePositive;
    }
    return Object.keys(V.bodies).length === P.ids.length;
});

let worst = { lon: 0, lat: 0, np: 0, diam: 0 };
for (const [name, b] of Object.entries(V.bodies)) {
    for (const r of b.rows) {
        const future = r.jdUT >= 2461406.5;      // 2027-01-01
        check(name + ' ' + r.horizonsTime.slice(0, 11) + (future ? ' (ΔT de Horizons)' : '') + ': sub-observador, polo y diametro', () => {
            const m = P.subObserver(name, r.jdUT, future ? { deltaT: HORIZONS_FUTURE_DT } : undefined);
            const e = { lon: Math.abs(dl(m.lonDeg, r.subLonDeg)), lat: Math.abs(m.latGDeg - r.subLatDeg), np: Math.abs(dl(m.npAngDeg, r.npAngDeg)), diam: Math.abs(m.angDiamArcsec / r.angDiamArcsec - 1) * 100 };
            for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], e[k]);
            const bad = []; if (e.lon > TOL.lon) bad.push('lon ' + e.lon.toFixed(4)); if (e.lat > TOL.lat) bad.push('lat ' + e.lat.toFixed(4)); if (e.np > TOL.np) bad.push('NP ' + e.np.toFixed(4)); if (e.diam > TOL.diamPct) bad.push('diam% ' + e.diam.toFixed(4));
            return bad.length ? bad.join(', ') : true;
        });
    }
}
console.log('  peor desviacion medida: lon ' + worst.lon.toFixed(4) + ' lat ' + worst.lat.toFixed(4) + ' NP ' + worst.np.toFixed(4) + ' grados; diametro ' + worst.diam.toFixed(4) + ' %');

check('la prueba distingue: Saturno 1900 con latitud planetocentrica (la que NO usa Horizons) se desvia > 1 grado', () => {
    const r = V.bodies.Saturn.rows[0]; const m = P.subObserver('Saturn', r.jdUT); return Math.abs(m.latCDeg - r.subLatDeg) > 1 ? true : Math.abs(m.latCDeg - r.subLatDeg);
});
check('la prueba distingue: con el ΔT del modelo en 2100 (no el de Horizons) Jupiter se desvia > 0,5 grados (la fase futura es incierta, y se declara)', () => {
    const r = V.bodies.Jupiter.rows[5]; const m = P.subObserver('Jupiter', r.jdUT); return Math.abs(dl(m.lonDeg, r.subLonDeg)) > 0.5 ? true : Math.abs(dl(m.lonDeg, r.subLonDeg));
});
check('ejes: ortonormales, mano derecha y z = polo norte (todos los planetas)', () => {
    const t = P.engineTime(2461000.5);
    for (const id of P.ids) {
        const f = P.frame(id, t); const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        const cr = [f.x[1] * f.y[2] - f.x[2] * f.y[1], f.x[2] * f.y[0] - f.x[0] * f.y[2], f.x[0] * f.y[1] - f.x[1] * f.y[0]];
        if (Math.abs(d(f.x, f.x) - 1) > 1e-12 || Math.abs(d(f.y, f.y) - 1) > 1e-12 || Math.abs(d(f.z, f.z) - 1) > 1e-12 || Math.abs(d(f.x, f.y)) > 1e-12 || Math.abs(d(f.x, f.z)) > 1e-12) return id + ' no ortonormal';
        if (Math.hypot(cr[0] - f.z[0], cr[1] - f.z[1], cr[2] - f.z[2]) > 1e-12) return id + ' no es mano derecha';
    }
    return true;
});
check('rotacion: el meridiano origen avanza con el tiempo (directa) y Venus gira al reves (retrograda)', () => {
    const w = (id, jd) => P.frame(id, P.engineTime(jd)).wDeg;
    const adv = (id) => dl(w(id, 2461000.5 + 0.01), w(id, 2461000.5));          // grados en 0,01 d
    return adv('Jupiter') > 8.6 && adv('Jupiter') < 8.8 && adv('Mars') > 3.4 && adv('Mars') < 3.6 && adv('Venus') < 0 && Math.abs(adv('Venus') + 0.0148) < 0.002 ? true : [adv('Jupiter'), adv('Mars'), adv('Venus')].join(' ');
});
check('ΔT por segundos intercalares: 2000 = 64,184 s, 2025 = 69,184 s, antes de 1972 y desde 2027 no hay tabla (null)', () =>
    Math.abs(P.deltaTSeconds(2451544.5) - 64.184) < 1e-9 && Math.abs(P.deltaTSeconds(2461000.5) - 69.184) < 1e-9 && P.deltaTSeconds(2440000) === null && P.deltaTSeconds(2461500) === null);
check('ΔT: el valor de la tabla y el del modelo de astronomy-engine difieren < 1 s en 2000 (coherencia, UT1-UTC < 0,9 s)', () => {
    const jd = 2451544.5; const T = require('astronomy-engine'); const t0 = new T.AstroTime(jd - 2451545.0); return Math.abs((t0.tt - t0.ut) * 86400 - P.deltaTSeconds(jd)) < 1 ? true : (t0.tt - t0.ut) * 86400;
});
check('achatamiento: Saturno el mas achatado (1 - c/a = 0,098), Venus esferico, Jupiter 0,065', () => {
    const f = (id) => 1 - P.SHAPE[id].c / P.SHAPE[id].a; return Math.abs(f('Saturn') - 0.0979) < 0.0005 && f('Venus') === 0 && Math.abs(f('Jupiter') - 0.0649) < 0.0005 ? true : [f('Saturn'), f('Jupiter')].join(' ');
});
check('RECHAZOS: cuerpo desconocido o la Tierra -> BAD_BODY (la Tierra va por su propio marco); no es un TypeError', () =>
    rejects(() => P.subObserver('Pluto', 2461000.5), 'BAD_BODY') === true && rejects(() => P.frame('Earth', P.engineTime(2461000.5)), 'BAD_BODY') === true && rejects(() => P.subObserver(undefined, 2461000.5), 'BAD_BODY') === true);

console.log(fails ? '\n' + fails + ' prueba(s) con fallo.' : '\nRotacion de planetas: todo verde.');
process.exit(fails ? 1 : 0);
