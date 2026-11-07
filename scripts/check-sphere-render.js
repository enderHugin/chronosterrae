#!/usr/bin/env node
/* check-sphere-render.js - Pruebas del dibujo de esferas con textura y anillos (solar/sphere-render.js). Se comprueba la geometria con
 * texturas sinteticas que codifican su propia longitud y latitud, no con imagenes reales. */
'use strict';
const R = require('../solar/sphere-render.js');
let fails = 0;
function check(name, fn) { let ok = false, err = ''; try { ok = fn(); } catch (e) { err = ' (' + e.message + ')'; } console.log((ok ? '  ok  ' : '  XX  ') + name + (ok ? '' : err)); if (!ok) fails++; }
const near = (a, b, e) => Math.abs(a - b) <= e;

// textura 64x32: R = longitud (0-255 de -180 a 180), G = latitud (0-255 de 90 a -90), B = 200
const W = 64, H = 32; const td = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; td[i] = Math.round(255 * (x + 0.5) / W); td[i + 1] = Math.round(255 * (y + 0.5) / H); td[i + 2] = 200; td[i + 3] = 255; }
const tex = [{ w: W, h: H, data: td }];
// observador sobre (lon 0, lat 0): x del cuerpo hacia el observador (+z camara), este (y) a la derecha, polo arriba
const faceOn = { x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0] };
const full = [0, 0, 1];                                   // Sol detras del observador: fase llena
const px = (img, i, j) => { const o = (j * img.size + i) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]; };

const a = R.render({ pr: 40, axes: faceOn, light: full, flat: 1, tex, law: 'lambert', night: 1 });   // night 1: sin sombreado, solo geometria
const c = a.half;
check('el centro del disco es el punto sub-observador (lon 0, lat 0)', () => { const p = px(a, c, c); return near(p[0], 127.5, 8) && near(p[1], 127.5, 8); });
check('hacia la derecha crece la longitud ESTE', () => px(a, c + 20, c)[0] > px(a, c, c)[0] + 20 && px(a, c - 20, c)[0] < px(a, c, c)[0] - 20);
check('hacia arriba (polo norte) crece la latitud (la fila de la textura baja)', () => px(a, c, c - 20)[1] < px(a, c, c)[1] - 20);
check('la longitud a 0,95 radios a la derecha es asin(0,95) = 71,8 grados este (R ~ 178)', () => near(px(a, c + 38, c)[0], 255 * (180 + 71.8) / 360, 6));
check('fuera del disco no hay nada (alfa 0) y dentro todo es opaco', () => px(a, c + 41, c)[3] === 0 && px(a, c + 30, c)[3] === 255 && a.size === 2 * (40 + 2));

const fl = R.render({ pr: 40, axes: faceOn, light: full, flat: 0.5, tex, law: 'lambert', night: 1 });
check('achatamiento: el semieje polar mide c/a del ecuatorial', () => {
    let top = 0, right = 0; for (let k = 0; k < fl.size; k++) { if (px(fl, fl.half, k)[3] > 0) top = Math.max(top, Math.abs(k - fl.half)); if (px(fl, k, fl.half)[3] > 0) right = Math.max(right, Math.abs(k - fl.half)); }
    return near(top, 20, 1.5) && near(right, 40, 1.5);
});

check('antialias del limbo: la suma de coberturas es el area del disco (pi r^2, error < 0,5 %) y hay pixeles parcialmente cubiertos', () => {
    let sum = 0, part = 0; for (let k = 0; k < a.data.length; k += 4) { sum += a.data[k + 3] / 255; if (a.data[k + 3] > 0 && a.data[k + 3] < 255) part++; }
    return Math.abs(sum / (Math.PI * 40 * 40) - 1) < 0.005 && part > 60;
});
check('antialias con achatamiento: area de la elipse = pi a c (error < 0,5 %)', () => {
    let sum = 0; for (let k = 0; k < fl.data.length; k += 4) sum += fl.data[k + 3] / 255;
    return Math.abs(sum / (Math.PI * 40 * 20) - 1) < 0.005;
});

// iluminacion
const side = R.render({ pr: 40, axes: faceOn, light: [1, 0, 0], flat: 1, color: [200, 200, 200], law: 'lambert', night: 0 });
check('Sol a la derecha: el lado derecho esta iluminado y el izquierdo a oscuras', () => px(side, side.half + 30, side.half)[0] > 150 && px(side, side.half - 30, side.half)[0] === 0);
const lam = R.render({ pr: 40, axes: faceOn, light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0 });
const lom = R.render({ pr: 40, axes: faceOn, light: full, flat: 1, color: [200, 200, 200], law: 'lommel', night: 0 });
check('Lambert en fase llena: el limbo es mas oscuro que el centro', () => px(lam, lam.half + 37, lam.half)[0] < px(lam, lam.half, lam.half)[0] * 0.5);
check('Lommel-Seeliger en fase llena: disco casi uniforme (como la Luna llena)', () => near(px(lom, lom.half + 37, lom.half)[0], px(lom, lom.half, lom.half)[0], 3));
check('la luz minima de la noche se respeta', () => { const n = R.render({ pr: 20, axes: faceOn, light: [0, 0, -1], flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.05 }); return near(px(n, n.half, n.half)[0], 10, 1); });

// nivel de reduccion: la textura reducida conserva el promedio
const mips = R.makeMips({ w: 256, h: 128, data: (() => { const d = new Uint8ClampedArray(256 * 128 * 4); for (let i = 0; i < d.length; i += 4) { d[i] = (i / 4) % 2 ? 255 : 0; d[i + 1] = 100; d[i + 2] = 100; d[i + 3] = 255; } return d; })() });
check('makeMips: cada nivel mide la mitad y promedia (franjas 0/255 -> ~127)', () => mips[1].w === 128 && mips[1].h === 64 && near(mips[1].data[0], 127.5, 1) && mips.length >= 3);

// anillos (perfil sintetico de tau = 1 entre 66000 y 142000 km)
const n = Math.round((142000 - 66000) / 25);
const ring = { inKm: 74500, outKm: 140200, aKm: 60268, profile: { r0Km: 66000, stepKm: 25, n, tau: new Array(n).fill(1) }, color: [220, 200, 170], albedo: 1 };
// polo inclinado 60 grados hacia el observador: el plano del anillo se ve de frente a 30 grados de elevacion... mu = cos(60)
const ax = (deg) => { const t = deg * Math.PI / 180; const z = [0, Math.cos(t), Math.sin(t)]; const x = [0, -Math.sin(t), Math.cos(t)]; return { x, y: [1, 0, 0], z }; };
const ringImg = R.render({ pr: 30, axes: ax(60), light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03, ring });
const noRing = R.render({ pr: 30, axes: ax(60), light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03 });
check('el lienzo con anillos es mas ancho que el del planeta solo (radio exterior / ecuatorial)', () => near(ringImg.half, Math.ceil(140200 / 60268 * 30) + 2, 1) && noRing.half === 32);
// pixel del anillo fuera del disco, en el eje x de pantalla (y=0): radio = X * 60268 / ... con mu = sin(60 deg)? el plano se ve con elevacion 60: mu = cos(30)? se calcula con la formula
check('anillo fuera del disco: alfa = 1 - exp(-tau/mu), con mu = |coseno entre la visual y la normal del anillo|', () => {
    const mu = ax(60).z[2]; const X = 2.0; const p = px(ringImg, ringImg.half + Math.round(X * 30), ringImg.half);
    return near(p[3] / 255, 1 - Math.exp(-1 / mu), 0.02);
});
const ringShort = Object.assign({}, ring, { outKm: 100000 });
const rs2 = R.render({ pr: 30, axes: ax(60), light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03, ring: ringShort });
check('fuera del intervalo radial [interior, exterior] no hay anillo aunque el perfil tenga datos (y dentro si)', () =>
    px(rs2, rs2.half + Math.round(1.1 * 30), rs2.half)[3] === 0 && px(rs2, rs2.half + Math.round(1.4 * 30), rs2.half)[3] > 0 && px(rs2, rs2.half + Math.round(1.6 * 30), rs2.half)[3] > 0 && rs2.half === Math.ceil(100000 / 60268 * 30) + 2);
check('borde exterior del anillo con antialias: el alfa baja de forma gradual (al menos un pixel intermedio) y nunca sube hacia fuera', () => {
    const al = []; for (let i = rs2.half + 44; i <= rs2.half + 52; i++) al.push(px(rs2, i, rs2.half)[3]);
    let mono = true; for (let k = 1; k < al.length; k++) if (al[k] > al[k - 1]) mono = false;
    const top = Math.max.apply(null, al);
    return mono && top > 100 && al[al.length - 1] === 0 && al.some((a) => a > 0 && a < top - 2);
});
check('borde exterior del anillo escorzado (elevacion 15 grados): sigue habiendo transicion gradual en vertical', () => {
    const rg = R.render({ pr: 30, axes: ax(15), light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 1, ring: ringShort });
    const a = []; for (let j = 0; j < rg.size; j++) a.push(px(rg, rg.half + 40, j)[3]);
    const top = Math.max.apply(null, a);
    return top > 100 && a.filter((v) => v > 0 && v < top - 2).length >= 2;          // la columna cruza el borde de arriba y el de abajo: cada uno aporta pixeles intermedios
});
// elevacion baja (20 grados): el borde cercano del anillo cruza por DELANTE de la mitad inferior del disco; el lejano, por detras
const lo = ax(20); const rLo = R.render({ pr: 30, axes: lo, light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 1, ring });
const nLo = R.render({ pr: 30, axes: lo, light: full, flat: 1, color: [200, 200, 200], law: 'lambert', night: 1 });
check('el anillo que pasa DELANTE del planeta lo atenua (borde cercano, abajo)', () => {
    const p1 = px(rLo, rLo.half, rLo.half + Math.round(1.3 * 30 * 0.342)); const p0 = px(nLo, nLo.half, nLo.half + Math.round(1.3 * 30 * 0.342));
    return p0[3] === 255 && p1[3] === 255 && Math.abs(p1[0] - p0[0]) > 20;
});
check('el anillo DETRAS del planeta queda oculto: el pixel es identico al del planeta solo (borde lejano, arriba)', () => {
    const dy = -Math.round(1.3 * 30 * 0.342); const p1 = px(rLo, rLo.half, rLo.half + dy); const p0 = px(nLo, nLo.half, nLo.half + dy);
    return p0[3] === 255 && p1[0] === p0[0] && p1[1] === p0[1] && p1[2] === p0[2];
});
// sombra del planeta sobre el anillo: Sol 10 grados sobre el plano del anillo, hacia el eje x del cuerpo
const sunAt = (axs, deg) => { const t = deg * Math.PI / 180; const bx = axs.x; const bz = axs.z; return [Math.cos(t) * bx[0] + Math.sin(t) * bz[0], Math.cos(t) * bx[1] + Math.sin(t) * bz[1], Math.cos(t) * bx[2] + Math.sin(t) * bz[2]]; };
const sh = R.render({ pr: 30, axes: ax(60), light: sunAt(ax(60), 10), flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03, ring });
check('sombra del planeta sobre el anillo: el lado opuesto al Sol (arriba) es negro y el del Sol (abajo) esta iluminado, ambos con anillo', () => {
    const d = Math.round(1.6 * 30 * Math.sin(60 * Math.PI / 180));
    const up = px(sh, sh.half, sh.half - d); const dn = px(sh, sh.half, sh.half + d);
    return up[3] > 0 && dn[3] > 0 && up[0] < 3 && dn[0] > 20;
});
// sombra del anillo sobre el planeta: Sol 20 grados sobre el plano del anillo
const l20 = sunAt(ax(60), 20);
const rs = R.render({ pr: 30, axes: ax(60), light: l20, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03, ring });
const rn = R.render({ pr: 30, axes: ax(60), light: l20, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03 });
check('sombra del anillo sobre el planeta: algun punto iluminado del planeta se oscurece con el anillo', () => {
    let dark = 0;
    for (let j = 0; j < 62; j++) for (let i = 0; i < 62; i++) { const p0 = px(rn, i, j); const p1 = px(rs, i + (rs.half - rn.half), j + (rs.half - rn.half)); if (p0[3] === 255 && p0[0] > 60 && p1[3] === 255 && p1[0] < p0[0] * 0.6) dark++; }
    return dark > 20;
});
check('sin anillo no se oscurece nada: render sin ring identico a si mismo (determinista)', () => { const b = R.render({ pr: 30, axes: ax(60), light: l20, flat: 1, color: [200, 200, 200], law: 'lambert', night: 0.03 }); return Buffer.compare(Buffer.from(b.data), Buffer.from(rn.data)) === 0; });
check('ringTau: interpolacion lineal y los huecos (null) no se rellenan', () => {
    const r = { profile: { r0Km: 0, stepKm: 10, n: 4, tau: [0, 2, null, 1] } };
    return near(R.ringTau(r, 10), 1, 0.01) && near(R.ringTau(r, 15), 2, 0.01) && R.ringTau(r, 21) === 0 && R.ringTau(r, 100) === 0;
});
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nOK');
