#!/usr/bin/env node
// make-validation-rotation.js - Convierte las respuestas REALES de JPL Horizons (sonda del workflow probe.yml, rama probe-results,
// carpeta samples/) en el archivo de validacion de la rotacion de los planetas y de su forma (radios). No inventa nada: cada cifra
// sale del texto de Horizons y el archivo de salida cita la consulta exacta.
//   node scripts/make-validation-rotation.js <carpeta samples> [salida]
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2]; const out = process.argv[3] || path.join(__dirname, '..', 'data', 'sky', 'validation-rotation.json');
if (!dir) { console.error('uso: node scripts/make-validation-rotation.js <carpeta samples> [salida]'); process.exit(2); }
const TLIST = [2415020.5, 2433282.5, 2451545.0, 2461000.5, 2470000.5, 2488069.5];     // mismos que en scripts/probe.js
const PLANETS = [['Mercury', 199], ['Venus', 299], ['Mars', 499], ['Jupiter', 599], ['Saturn', 699], ['Uranus', 799], ['Neptune', 899]];

const fail = (m) => { throw new Error(m); };
const result = { source: 'NASA/JPL Horizons API (ssd.jpl.nasa.gov/api/horizons.api), consultado por el workflow probe.yml', license: 'Datos de la NASA/JPL (sin restricciones de uso; se cita la fuente)',
    query: "EPHEM_TYPE='OBSERVER', CENTER='500@399' (geocentrico), QUANTITIES='14,17,13' (sub-observador lon/lat, angulo de posicion del polo norte y distancia, diametro angular), ANG_FORMAT='DEG', TLIST_TYPE='JD', TLIST='" + TLIST.join(' ') + "'",
    timeScale: 'Horizons da la hora en UT (UT1 antes de 1962, UTC despues); el futuro usa el ultimo segundo intercalar conocido', bodies: {} };
for (const [name, id] of PLANETS) {
    const text = fs.readFileSync(path.join(dir, 'horizons-rotation-' + name.toLowerCase() + '.txt'), 'utf8');
    const radii = /Target radii\s*:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*km/.exec(text) || fail(name + ': sin radios');
    const conv = /Target pole\/equ\s*:\s*(\S+)\s*\{(West|East)-longitude positive\}/.exec(text) || fail(name + ': sin convencion de longitud');
    const rows = (/\$\$SOE([\s\S]*?)\$\$EOE/.exec(text) || fail(name + ': sin tabla'))[1].trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim()));
    if (rows.length !== TLIST.length) fail(name + ': ' + rows.length + ' filas, se esperaban ' + TLIST.length);
    const head = /Date__\(UT\)__HR:MN:SC\.fff,([^\n]*)/.exec(text) || fail(name + ': sin cabecera');
    if (!/ObsSub-LON,\s*ObsSub-LAT,\s*NP\.ang,\s*NP\.dist,\s*Ang-diam/.test(head[1])) fail(name + ': columnas inesperadas: ' + head[1]);
    result.bodies[name] = {
        horizonsId: id, frame: conv[1], longitudePositive: conv[2] === 'West' ? 'west' : 'east',
        radiiKm: { a: +radii[1], b: +radii[2], c: +radii[3] },
        rows: rows.map((r, i) => ({ jdUT: TLIST[i], horizonsTime: r[0], subLonDeg: +r[3], subLatDeg: +r[4], npAngDeg: +r[5], npDistArcsec: +r[6], angDiamArcsec: +r[7] }))
    };
    for (const r of result.bodies[name].rows) for (const k of ['subLonDeg', 'subLatDeg', 'npAngDeg', 'npDistArcsec', 'angDiamArcsec']) if (!Number.isFinite(r[k])) fail(name + ': ' + k + ' no numerico en ' + r.horizonsTime);
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log('escrito', out, Object.keys(result.bodies).join(', '));
