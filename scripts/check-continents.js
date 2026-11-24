#!/usr/bin/env node
// check-continents.js - Continentes de la rueda (map/continents.js + data/borders/continents.json, Natural Earth). Sin red.
'use strict';
const fs = require('fs'); const path = require('path');
const C = require('../map/continents.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = JSON.stringify(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? 'ok   ' : 'FALLA') + ' ' + name + (extra ? ' -> ' + extra : '')); };
const file = path.join(__dirname, '..', 'data', 'borders', 'continents.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
check('el fichero dice de donde viene: Natural Earth, dominio publico, commit y sha256 de cada fuente', () => /Natural Earth/.test(data.meta.source) && /Dominio publico/.test(data.meta.license) && /^[0-9a-f]{40}$/.test(data.meta.commit) && data.meta.files.length === 2 && data.meta.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.url.includes(data.meta.commit)));
check('siete continentes geograficos y las unidades con su continente (mas el mar)', () => data.geo.map((x) => x.k).sort().join() === 'AF,AN,AS,EU,NA,OC,SA' && ['AF', 'AS', 'EU', 'NA', 'OC', 'SA', 'sea'].every((k) => data.units.some((x) => x.k === k)));
const I = C.create(data);
// lugares conocidos (capitales y ciudades) y su continente segun la convencion de Natural Earth
const P = { Londres: [-0.13, 51.5, 'EU'], Tokio: [139.7, 35.7, 'AS'], Reikiavik: [-21.9, 64.1, 'EU'], Palermo: [13.36, 38.1, 'EU'], Moscu: [37.6, 55.75, 'EU'], Novosibirsk: [82.9, 55.0, 'AS'], Vladivostok: [131.9, 43.1, 'AS'], Ankara: [32.85, 39.93, 'AS'], ElCairo: [31.2, 30.0, 'AF'], Panama: [-79.5, 8.98, 'NA'], Honolulu: [-157.86, 21.3, 'NA'], Madrid: [-3.7, 40.4, 'EU'], Yakarta: [106.8, -6.2, 'AS'], Sidney: [151.2, -33.87, 'OC'], Nuuk: [-51.7, 64.2, 'NA'], Cayena: [-52.3, 4.9, 'SA'], LaHabana: [-82.4, 23.1, 'NA'], Wellington: [174.8, -41.3, 'OC'], Atlanta: [-84.4, 33.75, 'NA'], BuenosAires: [-58.4, -34.6, 'SA'], Lagos: [3.4, 6.45, 'AF'], Valletta: [14.51, 35.9, 'EU'] };
check('lugares conocidos caen en su continente', () => { const bad = Object.entries(P).filter(([, [x, y, k]]) => I.at(x, y) !== k).map(([n, [x, y]]) => n + ':' + I.at(x, y)); return bad.length ? bad : true; });
check('en mitad del Atlantico o del Pacifico, mar; junto a la costa, el continente de la costa', () => I.at(-40, 35) === 'sea' && I.at(-130, -40) === 'sea' && I.at(-6, 46) === 'EU');
check('longitudes fuera de [-180, 180] se envuelven; sin coordenadas, null (rechazado, no roto)', () => I.at(360 - 0.13, 51.5) === 'EU' && I.at(NaN, 3) === null && C.create(null) === null && C.create({ geo: [] }) === null);
check('center: el centro de cada continente cae dentro de el (Europa, Africa, Sudamerica...) y null si no existe', () => {
    const bad = ['EU', 'AF', 'SA', 'NA', 'AS', 'OC'].filter((k) => { const c = I.center(k); return !c || I.at(c[0], c[1]) !== k; }).map((k) => k + ':' + JSON.stringify(I.center(k)));
    return bad.length || I.center('xx') !== null ? bad : true;
});
check('nombres: largo y corto en los dos idiomas', () => C.nameOf('NA', 'es') === 'América del Norte' && C.nameOf('NA', 'en', true) === 'N.Am' && C.nameOf('sea', 'es') === 'Mares y océanos' && C.nameOf('xx', 'es') === '');
if (fails) { console.log('\n' + fails + ' prueba(s) fallida(s)'); process.exit(1); }
console.log('\nContinentes: todo verde.');
