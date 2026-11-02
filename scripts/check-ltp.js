#!/usr/bin/env node
// Pruebas de sky/ltp.js (precesion de largo plazo). Sin red.
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const Astronomy = require('astronomy-engine');
const L = require('../sky/ltp.js');
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'ltp.json'), 'utf8'));
const ltp = L.make(doc.tables);
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : '  XX  ') + name + (extra ? ' ' + extra : '')); if (!ok) fails++; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angArcsec = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI * 3600;
const sph = (raDeg, decDeg) => { const r = raDeg * Math.PI / 180; const d = decDeg * Math.PI / 180; return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]; };

check('procedencia: las tablas no se han tocado (sha256 del contenido) y senalan un commit de ERFA', () =>
    crypto.createHash('sha256').update(JSON.stringify(doc.tables)).digest('hex') === doc.tables_sha256 && /^[0-9a-f]{40}$/.test(doc.source.commit)
    && doc.tables.xyper.length === 14 && doc.tables.pqper.length === 8);
check('las filas de la matriz son ortonormales en todo el intervalo de validez (+/-200.000 anos)', () => {
    let worst = 0;
    for (let y = -200000; y <= 200000; y += 5000) {
        const m = ltp.matrix(y);
        worst = Math.max(worst, Math.abs(dot(m[0], m[0]) - 1), Math.abs(dot(m[1], m[1]) - 1), Math.abs(dot(m[2], m[2]) - 1), Math.abs(dot(m[0], m[1])), Math.abs(dot(m[0], m[2])), Math.abs(dot(m[1], m[2])));
    }
    return worst < 1e-12 ? true : 'peor desviacion ' + worst;
});
check('en J2000.0 la matriz con sesgo es el sesgo del marco ICRS (<= 20 mas) y sin sesgo es la identidad', () => {
    const b = ltp.matrixBias(2000); const m = ltp.matrix(2000); let dev = 0; let devI = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { dev = Math.max(dev, Math.abs(b[i][j] - (i === j ? 1 : 0))); devI = Math.max(devI, Math.abs(m[i][j] - (i === j ? 1 : 0))); }
    return dev < 20 * 4.848e-9 * 1.5 && devI < 1e-9 ? true : `sesgo ${dev} identidad ${devI}`;
});
check('el angulo entre el polo del ecuador y el de la ecliptica coincide con la oblicuidad IAU 2006 (+/-3000 anos): < 3"', () => {
    let worst = 0;
    for (let y = -1000; y <= 5000; y += 100) { const a = Math.acos(dot(ltp.equatorPole(y), ltp.eclipticPole(y))); worst = Math.max(worst, Math.abs(a - ltp.obliquityIAU2006(y)) * 180 / Math.PI * 3600); }
    return worst < 3 ? true : 'peor ' + worst.toFixed(2) + '"';
});
check('contra astronomy-engine (IAU 2006 + nutacion) en 1900-2100: separacion < 25" (la nutacion llega a ~20")', () => {
    let worst = 0;
    const vs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], sph(101.287, -16.716), sph(213.9, 19.18), sph(279.23, 38.78), sph(37.95, 89.26)];
    for (let y = 1900; y <= 2100; y += 20) {
        const t = new Astronomy.AstroTime(new Date(Date.UTC(2000, 0, 1, 12) + (y - 2000) * 365.25 * 86400000));
        const R = Astronomy.Rotation_EQJ_EQD(t).rot; const m = ltp.matrixBias((t.tt / 365.25) + 2000);
        for (const v of vs) { const ae = [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]]; worst = Math.max(worst, angArcsec(ae, L.apply(m, v))); }
    }
    return worst < 25 ? true : 'peor ' + worst.toFixed(1) + '"';
});
check('fisica: el polo se aleja al maximo (~2 x oblicuidad, 42-48 grados) a MEDIO ciclo de precesion: 2000 + 25772/2 = ~14900 (+/-1500)', () => {
    const p0 = ltp.equatorPole(2000); let best = null;
    for (let y = 2000; y <= 20000; y += 10) { const a = Math.acos(dot(p0, ltp.equatorPole(y))) * 180 / Math.PI; if (!best || a > best.a) best = { a, y }; }
    return best.a > 42 && best.a < 48 && Math.abs(best.y - (2000 + 25772 / 2)) <= 1500 ? true : JSON.stringify(best);
});

// Hechos historicos con las coordenadas del propio catalogo (HYG, J2000)
const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'stars.json'), 'utf8'));
const col = (hip) => { const r = cat.stars.find((s) => String(s[0]) === String(hip)); if (!r) throw new Error('no esta HIP ' + hip); return { ra: r[1], dec: r[2], pmra: r[3], pmde: r[4] }; };
const pole = (y) => ltp.equatorPole(y);
const sepDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI;
check('historia: Thuban (HIP 68756) fue la estrella polar en el III milenio a. C.: minimo de separacion con el polo entre -3300 y -2000, < 0,5 grados', () => {
    const t = col(68756); const s = sph(t.ra, t.dec); let best = null;
    for (let y = -4500; y <= -1000; y += 5) { const d = sepDeg(pole(y), s); if (!best || d < best.d) best = { d, y }; }
    return best.y >= -3300 && best.y <= -2000 && best.d < 0.5 ? true : JSON.stringify(best);
});
check('historia: Vega (HIP 91262), con su movimiento propio, sera la estrella polar hacia el ano 14000: minimo entre 12000 y 15500, < 8 grados', () => {
    const t = col(91262); let best = null;
    for (let y = 10000; y <= 18000; y += 10) {
        const dt = y - 2000; const dec = t.dec + (t.pmde * dt) / 3.6e6; const ra = t.ra + (t.pmra * dt) / 3.6e6 / Math.cos(t.dec * Math.PI / 180);   // lineal en el plano tangente (mas/ano)
        const d = sepDeg(pole(y), sph(ra, dec)); if (!best || d < best.d) best = { d, y };
    }
    return best.y >= 12000 && best.y <= 15500 && best.d < 8 ? true : JSON.stringify(best);
});
check('historia: Polaris (HIP 11767) esta a menos de 1,5 grados del polo hoy y a mas de 20 grados hace 12.000 anos', () => {
    const t = col(11767); const s = sph(t.ra, t.dec);
    return sepDeg(pole(2026), s) < 1.5 && sepDeg(pole(-10000), s) > 20 ? true : `hoy ${sepDeg(pole(2026), s).toFixed(2)} hace ${sepDeg(pole(-10000), s).toFixed(1)}`;
});
check('rechazo vs roto: la prueba de la oblicuidad detecta una tabla corrompida (50" en un termino de Y) y NO salta con la buena', () => {
    const worstOf = (tables) => { const l2 = L.make(tables); let w = 0; for (let y = -1000; y <= 5000; y += 100) { const a = Math.acos(dot(l2.equatorPole(y), l2.eclipticPole(y))); w = Math.max(w, Math.abs(a - l2.obliquityIAU2006(y)) * 180 / Math.PI * 3600); } return w; };
    const bad = JSON.parse(JSON.stringify(doc.tables)); bad.xyper[0][2] += 50;
    const good = worstOf(doc.tables); const broken = worstOf(bad);
    return good < 3 && broken > 10 ? true : `buena ${good.toFixed(2)}" corrompida ${broken.toFixed(2)}"`;
});
console.log(fails ? '\nHay fallos.' : '\nPrecesion de largo plazo: todo verde.');
process.exitCode = fails ? 1 : 0;
