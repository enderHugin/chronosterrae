#!/usr/bin/env node
// Pruebas de map/sphere.js: fraccion del lienzo ocupada por la esfera. Sin red.
'use strict';
const S = require('../map/sphere.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } console.log((ok ? '  ok  ' : ' FALLO ') + name + (ok ? '' : '  -> ' + extra)); if (!ok) fails++; };
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

check('disco entero dentro del lienzo: pi r^2 / (w h) (1280x800, r=300)', () => { const v = S.diskCoverage(640, 400, 300, 1280, 800); const e = Math.PI * 300 * 300 / (1280 * 800); return near(v, e, 1e-3) ? true : v + ' vs ' + e; });
check('disco que cubre todo el lienzo -> 1; disco fuera del lienzo -> 0; radio 0 -> 0', () => S.diskCoverage(640, 400, 2000, 1280, 800) === 1 && S.diskCoverage(5000, 5000, 100, 1280, 800) === 0 && S.diskCoverage(640, 400, 0, 1280, 800) === 0);
check('disco centrado que toca los cuatro lados recortado: r = media diagonal -> 1; r = media altura -> pi h^2/4 / (w h)', () => {
    const full = S.diskCoverage(640, 400, Math.hypot(640, 400) + 1, 1280, 800); const h = S.diskCoverage(640, 400, 400, 1280, 800);
    return full === 1 && near(h, Math.PI * 160000 / (1280 * 800), 1e-3) ? true : JSON.stringify({ full, h });
});
check('disco que corta los cuatro lados (r=500 en 1280x800): area = disco - 4 casquetes laterales; contrastado con Monte Carlo', () => {
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    let hit = 0; const N = 400000; for (let i = 0; i < N; i++) { const x = rnd() * 1280; const y = rnd() * 800; if ((x - 640) ** 2 + (y - 400) ** 2 <= 500 * 500) hit++; }
    const v = S.diskCoverage(640, 400, 500, 1280, 800); return near(v, hit / N, 0.004) ? true : v + ' vs ' + hit / N;
});
check('disco descentrado y parcialmente fuera (mitad del disco en el lienzo): ~ mitad del area del disco', () => { const v = S.diskCoverage(0, 400, 300, 1280, 800); return near(v, Math.PI * 300 * 300 / 2 / (1280 * 800), 1e-3) ? true : v; });
check('monotono: a mayor radio, mas esfera', () => { let p = -1; for (let r = 50; r < 1200; r += 25) { const v = S.diskCoverage(640, 400, r, 1280, 800); if (v < p) return 'baja en r=' + r; p = v; } return true; });
check('el lienzo vertical (movil 400x800) llega al 80 % con un radio MENOR que el horizontal: el corte se adapta a la pantalla', () => {
    const find = (w, h) => { for (let r = 10; r < 3000; r += 1) if (S.diskCoverage(w / 2, h / 2, r, w, h) >= 0.8) return r; return null; };
    const a = find(1280, 800); const b = find(400, 800); return a > b ? true : JSON.stringify({ a, b });
});
check('contorno de la esfera visto con perspectiva: r = D·tan(alfa), con sen(alfa) = R/(D+R)', () => {
    const r = S.silhouetteRadiusPx(1000, 300); const t = 1000 * 300 / Math.sqrt((1300) ** 2 - 300 ** 2);
    return near(r, t, 1e-9) && r > 0 ? true : r;
});
check('RECHAZOS: valores no numericos -> BAD_INPUT; lienzo sin area -> BAD_CANVAS; geometria no positiva -> BAD_GEOMETRY', () =>
    rejects(() => S.diskCoverage(NaN, 0, 1, 10, 10), 'BAD_INPUT') === true && rejects(() => S.diskCoverage(0, 0, 1, 0, 10), 'BAD_CANVAS') === true && rejects(() => S.diskCoverage(0, 0, 1, 10, -1), 'BAD_CANVAS') === true && rejects(() => S.silhouetteRadiusPx(0, 5), 'BAD_GEOMETRY') === true && rejects(() => S.silhouetteRadiusPx(5, -1), 'BAD_GEOMETRY') === true);
console.log(fails ? '\n' + fails + ' fallo(s)' : '\ntodo bien');
process.exit(fails ? 1 : 0);
