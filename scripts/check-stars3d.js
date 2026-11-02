#!/usr/bin/env node
// Pruebas de sky/stars3d.js (movimiento espacial de estrellas) y de data/sky/stars3d.json. Sin red.
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const S3 = require('../sky/stars3d.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const stars = JSON.parse(read('data/sky/stars.json')); const s3 = JSON.parse(read('data/sky/stars3d.json'));
const manifest = JSON.parse(read('data/sky/manifest.json'));
const cat = S3.buildCatalogue(stars, s3); const prep = S3.prepare(cat);
const ref = JSON.parse(read('scripts/ref/stars3d-reference.json'));
const ARC = 180 / Math.PI * 3600;
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const ang = (a, b) => Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
const out = new Float64Array(3);

check('datos: el fichero de radiales y la referencia son los del manifiesto (sha256)', () =>
    sha(read('data/sky/stars3d.json')) === manifest.stars3d.sha256 && ref.stars_sha256 === sha(read('data/sky/stars.json')) && ref.stars3d_sha256 === manifest.stars3d.sha256
    || 'la referencia de Python esta obsoleta: python3 -I scripts/ref/stars3d_ref.py');
check('datos: ninguna velocidad radial guardada es exactamente 0 (HYG usa 0 para "desconocida")', () => Object.values(s3.rv).every((v) => v !== 0) && s3.extra.every((s) => s[9] !== 0));
check('datos: las estrellas nuevas son hoy mas debiles que V = 6,5 y no estan ya en el catalogo', () => {
    const have = new Set(stars.stars.map((s) => s[0]));
    return s3.extra.every((s) => s[6] > 6.5 && !have.has(s[0])) && new Set(s3.extra.map((s) => s[0])).size === s3.extra.length;
});
check('datos: las estrellas nuevas llegan de verdad a V <= 6,5 en [-100000, 0] (modelo completo, con tiempo de luz; tolerancia 0,05 mag por seleccion sin tiempo de luz)', () => {
    let bad = '';
    for (let i = stars.stars.length; i < prep.n; i++) {
        let best = 99; for (let t = -100000; t <= 0; t += 250) { const d = S3.directionAt(prep, i, t, out, 0); best = Math.min(best, S3.magnitude(prep, i, d)); }
        if (best > 6.55) bad += ' ' + cat.hip[i] + '(' + best.toFixed(2) + ')';
    }
    return bad === '' ? true : bad;
});

// ---- Contra la implementacion independiente de Python (otra base, constantes derivadas, brentq para el tiempo de luz)
let worstAng = 0; let worstMag = 0; let n = 0;
for (const s of ref.stars) for (const [t, u, m] of s.obs) { const d = S3.directionAt(prep, s.index, t, out, 0); worstAng = Math.max(worstAng, ang(out, u) * ARC); worstMag = Math.max(worstMag, Math.abs(S3.magnitude(prep, s.index, d) - m)); n++; }
check('contra Python independiente (' + n + ' casos, +/-100.000 anos, movimiento propio grande, cercanas, nuevas, sin paralaje, sin rv): direccion < 0,001" (medido ' + worstAng.toExponential(1) + '") y magnitud < 1e-8', () => worstAng < 1e-3 && worstMag < 1e-8);
check('rechazo vs roto: si se invierte el signo de la radial el mismo cotejo SI falla (peor desviacion > 1\')', () => {
    let worst = 0;
    for (const s of ref.stars) { if (!prep.rvKnown[s.index]) continue; for (const [t, u] of s.obs) { S3.directionAt(prep, s.index, t, out, 0, -cat.rv[s.index]); worst = Math.max(worst, ang(out, u) * ARC); } }
    return worst > 60 ? true : 'solo ' + worst.toFixed(1) + '": el cotejo no distingue';
});
check('rechazo vs roto: sin tiempo de luz el cotejo tambien detecta la diferencia en las estrellas cercanas de mayor velocidad (> 0,01")', () => {
    // Referencia mutada: posicion geometrica P0 + v t (sin resolver el tiempo de luz) para la estrella nuevas y cercanas a -100000
    let worst = 0;
    for (const s of ref.stars) {
        const i = s.index; if (!prep.hasPlx[i]) continue;
        for (const [t, u] of s.obs) { if (t !== -100000) continue; const x = prep.r[3 * i] + prep.v[3 * i] * t; const y = prep.r[3 * i + 1] + prep.v[3 * i + 1] * t; const z = prep.r[3 * i + 2] + prep.v[3 * i + 2] * t; const nn = Math.hypot(x, y, z); worst = Math.max(worst, ang([x / nn, y / nn, z / nn], u) * ARC); }
    }
    return worst > 0.01 ? true : 'solo ' + worst.toExponential(1);
});

// ---- Fisica con solucion cerrada
check('t = 0: la direccion es la del catalogo, la distancia 1000/paralaje y la magnitud la del catalogo', () => {
    for (let i = 0; i < prep.n; i++) {
        const d = S3.directionAt(prep, i, 0, out, 0);
        const sa = Math.sin(cat.ra[i]); const ca = Math.cos(cat.ra[i]); const sd = Math.sin(cat.dec[i]); const cd = Math.cos(cat.dec[i]);
        if (ang(out, [cd * ca, cd * sa, sd]) > 1e-11) return 'direccion de ' + cat.hip[i];
        if (prep.hasPlx[i] && Math.abs(d - 1000 / cat.plx[i]) > 1e-9 * d) return 'distancia de ' + cat.hip[i];
        if (Math.abs(S3.magnitude(prep, i, d) - cat.vmag[i]) > 1e-9) return 'magnitud de ' + cat.hip[i];
    }
    return true;
});
const synth = (o) => S3.prepare({ n: 1, ra: [o.ra || 1], dec: [o.dec || 0.3], pmra: [o.pmra || 0], pmde: [o.pmde || 0], plx: [o.plx === undefined ? 100 : o.plx], rv: [o.rv === undefined ? NaN : o.rv], vmag: [5] });
check('estrella solo con velocidad radial: la direccion NO cambia nunca y la distancia sigue d0 + vr t / (1 + vr/c) (solucion cerrada con tiempo de luz)', () => {
    const p = synth({ plx: 100, rv: -100 }); const vr = -100 * S3.KMS_TO_PCYR; const d0 = 10; const base = [Math.cos(0.3) * Math.cos(1), Math.cos(0.3) * Math.sin(1), Math.sin(0.3)];
    for (const t of [-50000, -1000, 1000, 5000]) {
        const d = S3.directionAt(p, 0, t, out, 0); const exact = d0 + vr * t / (1 + vr / S3.C_PC_YR);
        if (ang(out, base) > 1e-12) return 'la direccion cambio en t=' + t;
        if (Math.abs(d - exact) > 1e-9) return 'distancia en t=' + t + ': ' + d + ' vs ' + exact;
    }
    return true;
});
check('estrella que se acerca se hace mas brillante y la que se aleja mas debil, con la ley 5 log10 (D/D0)', () => {
    const a = synth({ rv: -100 }); const b = synth({ rv: 100 }); const da = S3.directionAt(a, 0, 3000, out, 0); const db = S3.directionAt(b, 0, 3000, out, 0);
    return S3.magnitude(a, 0, da) < 5 && S3.magnitude(b, 0, db) > 5 && Math.abs(S3.magnitude(a, 0, da) - (5 + 5 * Math.log10(da / 10))) < 1e-12;
});
check('movimiento rectilineo: tres instantes de la misma estrella (sin tiempo de luz significativo, estrella lejana) son colineales en el espacio', () => {
    const p = synth({ plx: 2, pmra: 30, pmde: -20, rv: 15 });   // 500 pc: el tiempo de luz es el mismo para los tres puntos salvo ~1e-4
    const pt = (t) => { S3.directionAt(p, 0, t, out, 0); const dist = (() => { const d = S3.directionAt(p, 0, t, out, 0); return d; })(); return [out[0] * dist, out[1] * dist, out[2] * dist]; };
    const A = pt(-2000); const B = pt(0); const C = pt(2000);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]; const v = [C[0] - B[0], C[1] - B[1], C[2] - B[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return Math.hypot(...cr) / (Math.hypot(...u) * Math.hypot(...v)) < 1e-3 ? true : 'no colineales';
});
check('sin radial (desconocida) el modelo es el lineal antiguo de sky.js salvo el tiempo de luz: < 0,5" a +/-100.000 anos en todas las estrellas sin radial o sin paralaje', () => {
    let worst = 0;
    for (let i = 0; i < prep.n; i++) {
        if (prep.rvKnown[i] && prep.hasPlx[i]) continue;
        for (const t of [-100000, -12000, -2000]) {
            S3.directionAt(prep, i, t, out, 0);
            const a = cat.ra[i]; const d = cat.dec[i]; const pa = cat.pmra[i] * 4.84813681109536e-9; const pd = cat.pmde[i] * 4.84813681109536e-9;
            const sa = Math.sin(a); const ca = Math.cos(a); const sd = Math.sin(d); const cd = Math.cos(d);
            const x = cd * ca + t * (-pa * sa - pd * sd * ca); const y = cd * sa + t * (pa * ca - pd * sd * sa); const z = sd + t * pd * cd; const nn = Math.hypot(x, y, z);
            worst = Math.max(worst, ang(out, [x / nn, y / nn, z / nn]) * ARC);
        }
    }
    return worst < 0.5 ? true : 'peor ' + worst.toFixed(3) + '"';
});
check('estrella sin paralaje: no cambia de brillo y no depende de rv', () => {
    const p = synth({ plx: 0, pmra: 100, pmde: 50 }); const d = S3.directionAt(p, 0, -50000, out, 0);
    return S3.magnitude(p, 0, d) === 5;
});
check('incertidumbre por radial desconocida: 0 en J2000.0, crece con |t| y es 0 si la radial es conocida', () => {
    const p = synth({ plx: 100, pmra: 200, pmde: 100 }); const k = synth({ plx: 100, pmra: 200, pmde: 100, rv: 10 });
    const u0 = S3.uncertaintyRad(p, 0, 0, 23.7); const a = S3.uncertaintyRad(p, 0, -5000, 23.7); const b = S3.uncertaintyRad(p, 0, -50000, 23.7);
    return u0 < 1e-12 && a > 0 && b > a && S3.uncertaintyRad(k, 0, -50000, 23.7) === 0;
});
check('el RMS de radiales del manifiesto coincide con las radiales publicadas', () => {
    const v = Object.values(s3.rv); const rms = Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
    return Math.abs(rms - s3.rv_rms_kms) < 0.01 && manifest.stars3d.stats.with_radial_velocity === v.length;
});

console.log(fails ? '\nHay fallos.' : '\nMovimiento estelar 3D: todo verde.');
process.exitCode = fails ? 1 : 0;
