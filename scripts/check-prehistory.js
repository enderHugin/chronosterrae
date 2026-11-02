#!/usr/bin/env node
// Pruebas de sky/prehistory.js (cielo estelar de la prehistoria): integra stars3d + ltp + ERA. Sin red.
'use strict';
const fs = require('fs'); const path = require('path');
const Astronomy = require('astronomy-engine');
const P = require('../sky/prehistory.js'); const S3 = require('../sky/stars3d.js'); const Sky = require('../sky/sky.js'); const Space = require('../sky/space.js');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const stars = read('data/sky/stars.json'); const s3 = read('data/sky/stars3d.json'); const ltpDoc = read('data/sky/ltp.json'); const con = read('data/sky/constellations.json');
const cat = S3.buildCatalogue(stars, s3);
const pre = P.create({ ltpTables: ltpDoc.tables, cat });
const ARC = 180 / Math.PI * 3600; const TAU = 2 * Math.PI;
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const jdOfYear = (y) => 2451545.0 + (y - 2000) * 365.25;
const engineDT = (jd) => { const t = new Astronomy.AstroTime(jd - 2451545.0); return (t.tt - t.ut) * 86400; };
const angDiff = (a) => { a = Math.abs(a) % TAU; return a > Math.PI ? TAU - a : a; };

// ---- Contra el camino antiguo (astronomy-engine + catalogo lineal) donde ambos valen
function oldPath(year) {
    const jd = jdOfYear(year); const time = new Astronomy.AstroTime(jd - 2451545.0);
    const oldCat = Sky.prepareCatalog(stars, con);
    const eq = Space.starsOfDate(oldCat, time);
    return { ra: eq.ra, dec: eq.dec, gast: Astronomy.SiderealTime(time) * 15 * Math.PI / 180, n: oldCat.n, hip: oldCat.hip };
}
function compare(year) {
    const o = oldPath(year); const jd = jdOfYear(year); const nw = pre.at(jd, engineDT(jd));
    const idx = new Map(); for (let i = 0; i < cat.n; i++) idx.set(cat.hip[i], i);
    let worstH = 0; let worstD = 0; let count = 0;
    for (let k = 0; k < o.n; k++) {
        const i = idx.get(o.hip[k]); if (i === undefined || cat.extra[i]) continue;
        if (cat.rv[i] === cat.rv[i] && Math.abs(year - 2000) > 200) continue;      // con radial conocida el antiguo (lineal) no vale lejos
        const hOld = o.gast - o.ra[k]; const hNew = nw.era - nw.ra[i];
        worstH = Math.max(worstH, angDiff(hOld - hNew) * ARC * Math.cos(o.dec[k])); worstD = Math.max(worstD, Math.abs(o.dec[k] - nw.dec[i]) * ARC); count++;
    }
    return { worstH, worstD, count };
}
for (const [year, tol] of [[2000, 40], [1000, 40], [0, 40], [-1000, 40], [-2000, 60]]) {
    const r = compare(year);
    check('contra el camino antiguo (astronomy-engine, con nutacion) en el ano ' + year + ': angulo horario y declinacion < ' + tol + '" (peor ' + r.worstH.toFixed(1) + '" / ' + r.worstD.toFixed(1) + '", ' + r.count + ' estrellas)', () => r.worstH < tol && r.worstD < tol);
}
check('rechazo vs roto: si se usa el tiempo sidereo con 1 minuto de error el cotejo SI falla', () => {
    const o = oldPath(2000); const jd = jdOfYear(2000); const nw = pre.at(jd, engineDT(jd)); let worst = 0;
    for (let k = 0; k < 200; k++) { const i = k; worst = Math.max(worst, angDiff(o.gast - o.ra[k] - (nw.era + 60 / 86400 * TAU - nw.ra[i])) * ARC); }
    return worst > 600 ? true : 'solo ' + worst.toFixed(0) + '"';
});

// ---- Altura y azimut: contra starPositions (camino antiguo) en 2000, donde ambos valen
check('altura y azimut contra el camino antiguo (ano 2000, Madrid y Sidney): < 40" tras aplicar la misma refraccion', () => {
    const jd = jdOfYear(2000) + 0.37; const time = new Astronomy.AstroTime(jd - 2451545.0); const oldCat = Sky.prepareCatalog(stars, con);
    const idx = new Map(); for (let i = 0; i < cat.n; i++) idx.set(cat.hip[i], i);
    const nw = pre.at(jd, (time.tt - time.ut) * 86400); let worst = 0; let compared = 0;
    for (const [lat, lon] of [[40.4, -3.7], [-33.9, 151.2]]) {
        const o = Sky.starPositions(oldCat, time, lat, lon); const h = pre.horizontal(nw, lat, lon);
        for (let k = 0; k < oldCat.n; k++) {
            const i = idx.get(oldCat.hip[k]); if (cat.extra[i]) continue;
            const altN = h.alt[i] + Astronomy.Refraction('normal', h.alt[i]); if (o.alt[k] < 5) continue;       // cerca del horizonte la refraccion amplifica cualquier diferencia
            let da = Math.abs(o.az[k] - h.az[i]); if (da > 180) da = 360 - da;
            worst = Math.max(worst, Math.abs(o.alt[k] - altN) * 3600, da * Math.cos(o.alt[k] * Math.PI / 180) * 3600); compared++;
        }
    }
    return worst < 40 ? true : 'peor ' + worst.toFixed(1) + '" en ' + compared;
});
check('puntos cardinales: una estrella en el polo celeste norte esta a la altura de la latitud y una en el meridiano hacia el sur culmina en azimut 180', () => {
    const res = { era: 0, ra: new Float64Array(cat.n), dec: new Float64Array(cat.n) };
    res.dec[0] = Math.PI / 2; res.ra[0] = 0; res.dec[1] = 0; res.ra[1] = 0.0 + 0;   // RA 0, H = lon = 0 -> en el meridiano
    const h = pre.horizontal(res, 40, 0);
    return Math.abs(h.alt[0] - 40) < 1e-9 && Math.abs(h.alt[1] - 50) < 1e-9 && Math.abs(h.az[1] - 180) < 1e-9;
});
check('rechazo vs roto: invertir el signo del angulo horario (espejo este-oeste) se detecta en la misma prueba del camino antiguo', () => {
    const jd = jdOfYear(2000) + 0.37; const time = new Astronomy.AstroTime(jd - 2451545.0); const oldCat = Sky.prepareCatalog(stars, con);
    const nw = pre.at(jd, (time.tt - time.ut) * 86400); const o = Sky.starPositions(oldCat, time, 40.4, -3.7);
    const bad = { era: -nw.era, ra: Float64Array.from(nw.ra, (v) => -v), dec: nw.dec }; const h = pre.horizontal(bad, 40.4, 3.7); let worst = 0;
    for (let k = 0; k < oldCat.n; k++) if (o.alt[k] > 5) { let da = Math.abs(o.az[k] - h.az[k]); if (da > 180) da = 360 - da; worst = Math.max(worst, da * Math.cos(o.alt[k] * Math.PI / 180) * 3600); }
    return worst > 3600 ? true : 'solo ' + worst.toFixed(0) + '"';
});

// ---- Propiedades del modelo en toda la ventana
check('toda la ventana (-100000..-2001, 40 fechas): ra en [0, 2pi), dec en [-pi/2, pi/2], magnitudes finitas', () => {
    for (let y = -100000; y <= -2000; y += 2500) {
        const jd = jdOfYear(y); const r = pre.at(jd, engineDT(jd));
        for (let i = 0; i < cat.n; i++) if (!(r.ra[i] >= 0 && r.ra[i] < TAU && r.dec[i] >= -Math.PI / 2 && r.dec[i] <= Math.PI / 2 && Number.isFinite(r.mag[i]))) return 'estrella ' + cat.hip[i] + ' en ' + y;
    }
    return true;
});
check('Delta T incierto: un error de 1 ano en TT - UT mueve cada estrella < 100" (precesion ~50"/ano + movimiento propio)', () => {
    let worst = 0;
    for (const y of [-100000, -50000, -12000, -4000]) {
        const jd = jdOfYear(y); const a = pre.at(jd, 0); const b = pre.at(jd, 365.25 * 86400);
        for (let i = 0; i < cat.n; i++) worst = Math.max(worst, Math.hypot(angDiff(a.ra[i] - b.ra[i]) * Math.cos(a.dec[i]), a.dec[i] - b.dec[i]) * ARC);
    }
    return worst < 100 ? true : 'peor ' + worst.toFixed(1) + '"';
});
check('la ERA no depende de Delta T (solo del reloj UT)', () => { const jd = jdOfYear(-30000); return pre.at(jd, 0).era === pre.at(jd, 3e7).era; });
check('la ERA avanza 1,00273781191 vueltas por dia UT (una vuelta sideral = 23 h 56 min 4,0905 s)', () => {
    const jd = jdOfYear(-50000); const a = pre.at(jd, 0).era; const b = pre.at(jd + 1, 0).era; let d = (b - a) % TAU; if (d < 0) d += TAU;
    return Math.abs(d - (0.00273781191135448 * TAU)) < 1e-6 ? true : String(d / TAU);
});
check('Vega, con el movimiento propio y la precesion de largo plazo, se acerca al polo (< 8 grados) hacia el ano 13600 d.C.', () => {
    const i = Array.from(cat.hip).indexOf(91262); let best = 9; let at = 0;
    for (let y = 12000; y <= 15500; y += 100) { const jd = jdOfYear(y); const r = pre.at(jd, 0); const sep = (Math.PI / 2 - r.dec[i]) * 180 / Math.PI; if (sep < best) { best = sep; at = y; } }
    return best < 8 && at > 12500 && at < 14500 ? true : best.toFixed(2) + ' en ' + at;
});
check('Thuban (HIP 68756) pasa a < 1 grado del polo entre -3300 y -2000, hacia el ano -2800 (era del Imperio Antiguo)', () => {
    const i = Array.from(cat.hip).indexOf(68756); let best = 9; let at = 0;
    for (let y = -4000; y <= -1000; y += 25) { const jd = jdOfYear(y); const r = pre.at(jd, engineDT(jd)); const sep = (Math.PI / 2 - r.dec[i]) * 180 / Math.PI; if (sep < best) { best = sep; at = y; } }
    return best < 1 && at >= -3300 && at <= -2000 ? true : best.toFixed(2) + ' en ' + at;
});
// Informativo (no es un criterio): cuantas estrellas del catalogo estan por encima de V = 6,5 en cada epoca.
// Es una COTA INFERIOR en el pasado: faltan las estrellas hoy debiles sin radial medida que pudieran haberse visto.
for (const y of [-100000, -50000, -12000, 0]) { const jd = jdOfYear(y); const r = pre.at(jd, 0); let c = 0; for (let i = 0; i < cat.n; i++) if (r.mag[i] <= 6.5) c++; console.log('  info  ano ' + y + ': ' + c + ' estrellas con V <= 6,5 en el catalogo'); }

console.log(fails ? '\nHay fallos.' : '\nCielo estelar de la prehistoria: todo verde.');
process.exitCode = fails ? 1 : 0;
