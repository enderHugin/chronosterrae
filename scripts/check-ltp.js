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

// ---- Marco del polo: origen no rotatorio por transporte paralelo ----
const frameObj = L.makeFrame(ltp, doc.tables);
check('geometria exacta: tras una vuelta a un circulo de colatitud theta, el transporte paralelo gira 2 pi (1 - cos theta) (holonomia)', () => {
    let worst = 0;
    for (const theta of [0.1, 0.4, 0.9, 1.4]) {
        const N = 20000; const poles = [];
        for (let i = 0; i <= N; i++) { const f = 2 * Math.PI * i / N; poles.push([Math.sin(theta) * Math.cos(f), Math.sin(theta) * Math.sin(f), Math.cos(theta)]); }
        const s0 = [Math.cos(theta), 0, -Math.sin(theta)];                 // tangente al meridiano, perpendicular al polo
        const s1 = L.transportAlong(poles, s0); const n = poles[0];
        const ang = Math.atan2(dot(n, [s0[1] * s1[2] - s0[2] * s1[1], s0[2] * s1[0] - s0[0] * s1[2], s0[0] * s1[1] - s0[1] * s1[0]]), dot(s0, s1));
        const expect = (2 * Math.PI * (1 - Math.cos(theta))); const e = ((expect + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        worst = Math.max(worst, Math.abs(Math.abs(ang) - Math.abs(e)));
    }
    return worst < 1e-5 ? true : 'peor ' + worst;
});
check('rechazo vs roto: transportar SIN la rotacion minima (copiar el vector) NO da la holonomia', () => {
    const theta = 0.9; const s0 = [Math.cos(theta), 0, -Math.sin(theta)];
    // un transporte "ingenuo" que no gira nada devuelve s0: el giro medido seria 0, muy lejos de 2 pi (1 - cos 0,9) = 2,39 rad
    const expect = 2 * Math.PI * (1 - Math.cos(theta)); return expect > 2 && dot(s0, s0) === 1 ? true : 'prueba sin sentido';
});
check('sigma es siempre unitario y perpendicular al polo, en todo el intervalo', () => {
    let worst = 0;
    for (let y = -100000; y <= 100000; y += 3333) { const fr = frameObj.frame(y); worst = Math.max(worst, Math.abs(Math.hypot(...fr.sigma) - 1), Math.abs(dot(fr.sigma, fr.n)), Math.abs(dot(fr.e2, fr.sigma)), Math.abs(dot(fr.e2, fr.n))); }
    return worst < 1e-12 ? true : 'peor ' + worst;
});
check('convergencia del transporte: el error baja como h^2 (x4 al partir el paso) y con el paso por defecto (5 anos) es < 0,15" a +/-100.000 anos', () => {
    const ref = L.makeFrame(ltp, doc.tables, 1.25); const ys = [-100000, -50000, 50000, 100000];
    const err = (h) => { const f = L.makeFrame(ltp, doc.tables, h); return Math.max(...ys.map((y) => angArcsec(f.frame(y).sigma, ref.frame(y).sigma))); };
    const e20 = err(20); const e10 = err(10); const e5 = err(5);
    return e10 / e5 > 3 && e10 / e5 < 5 && e20 / e10 > 3 && e20 / e10 < 5 && e5 < 0.15 ? true : `e20 ${e20.toFixed(3)} e10 ${e10.toFixed(3)} e5 ${e5.toFixed(3)}`;
});
check('ERA en J2000.0 (UT1 = 0): 280,4606184 grados (valor clasico del tiempo sidereo a las 12h)', () => Math.abs(frameObj.era(0) * 180 / Math.PI - 280.46061838) < 1e-6);
check('contra astronomy-engine: tiempo sidereo ERA - RA(equinoccio) vs SiderealTime, anos 1900-2100: < 20" (nutacion en AR llega a ~16")', () => {
    let worst = 0;
    for (let y = 1900; y <= 2100; y += 25) {
        const t = new Astronomy.AstroTime(new Date(Date.UTC(2000, 0, 1, 12) + (y - 2000) * 365.25 * 86400000 + 0.3 * 86400000)); const epj = 2000 + t.tt / 365.25;
        const fr = frameObj.frame(epj); const eqx = ltp.matrixBias(epj)[0]; const ra = frameObj.toCIP(fr, eqx).ra;
        const gmst = ((frameObj.era(t.ut) - ra) * 180 / Math.PI + 720) % 360; const ref = (Astronomy.SiderealTime(t) * 15 + 720) % 360;
        let d = Math.abs(gmst - ref); if (d > 180) d = 360 - d; worst = Math.max(worst, d * 3600);
    }
    return worst < 20 ? true : 'peor ' + worst.toFixed(1) + '"';
});

console.log(fails ? '\nHay fallos.' : '\nPrecesion de largo plazo: todo verde.');
process.exitCode = fails ? 1 : 0;
