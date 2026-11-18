#!/usr/bin/env node
// check-sky-point.js - El cielo al apuntar con el movil (sky/sky-point.js): orientacion del telefono -> direccion, proyeccion, horizonte.
'use strict';
const fs = require('fs'); const path = require('path');
const P = require('../sky/sky-point.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = JSON.stringify(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? 'ok   ' : 'FALLA') + ' ' + name + (extra ? ' -> ' + extra : '')); };
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);
const vnear = (a, b, e) => a.every((x, i) => near(x, b[i], e === undefined ? 1e-9 : e));
const aa = (v) => { const r = P.vecAltAz(v); return [Math.round(r.alt * 1e6) / 1e6, Math.round(r.az * 1e6) / 1e6 % 360]; };

check('de pie, en vertical y el borde de arriba al norte (alpha 0, beta 90): la camara mira al norte, al horizonte; arriba, el cenit; derecha, el este', () => {
    const f = P.frameFromOrientation(0, 90, 0, 0); return vnear(f.look, [0, 1, 0], 1e-12) && vnear(f.up, [0, 0, 1], 1e-12) && vnear(f.right, [1, 0, 0], 1e-12);
});
check('alpha crece en sentido antihorario visto desde arriba: alpha 90 en vertical mira al oeste', () => { const r = aa(P.frameFromOrientation(90, 90, 0, 0).look); return near(r[0], 0, 1e-6) && near(r[1], 270, 1e-6) ? true : r; });
check('tumbado boca arriba (beta 0): la camara de atras mira al suelo (nadir); boca abajo sobre la cabeza (beta 180): al cenit', () => near(P.vecAltAz(P.frameFromOrientation(0, 0, 0, 0).look).alt, -90, 1e-6) && near(P.vecAltAz(P.frameFromOrientation(0, 180, 0, 0).look).alt, 90, 1e-6));
check('inclinar hacia atras el borde de arriba (beta 120) levanta la mirada 30 grados', () => { const r = aa(P.frameFromOrientation(0, 120, 0, 0).look); return near(r[0], 30, 1e-6) && near(r[1], 0, 1e-6) ? true : r; });
check('apaisado (pantalla girada 90): el arriba de la pantalla es el lado derecho del telefono', () => {
    const f0 = P.frameFromOrientation(30, 70, 20, 0); const f9 = P.frameFromOrientation(30, 70, 20, 90);
    return vnear(f9.up, f0.right.map((x) => x), 1e-9) && vnear(f9.look, f0.look, 1e-12);
});
check('siempre un marco ortonormal (mirada, arriba y derecha perpendiculares y unitarios)', () => {
    for (let i = 0; i < 200; i++) {
        const f = P.frameFromOrientation((i * 37) % 360, ((i * 53) % 360) - 180, ((i * 29) % 180) - 90, [0, 90, 180, 270][i % 4]);
        const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        if (!near(d(f.look, f.up), 0, 1e-9) || !near(d(f.look, f.right), 0, 1e-9) || !near(d(f.up, f.right), 0, 1e-9) || !near(d(f.look, f.look), 1, 1e-9)) return 'caso ' + i;
    }
    return true;
});
check('frameFromAltAz: mirando al sur a 40 grados, con la pantalla derecha (la derecha en el horizonte)', () => { const f = P.frameFromAltAz(40, 180); const r = aa(f.look); return near(r[0], 40, 1e-9) && near(r[1], 180, 1e-9) && near(f.right[2], 0, 1e-12) && f.up[2] > 0; });
check('rotateAz: corrige la brujula (10 grados mas de acimut)', () => { const r = aa(P.rotateAz(P.frameFromOrientation(0, 100, 0, 0), 10).look); return near(r[1], 10, 1e-6) && near(r[0], 10, 1e-6) ? true : r; });
check('smooth: con k = 1 es el destino; con k pequeño se acerca sin llegar y el marco sigue ortonormal', () => {
    const a = P.frameFromAltAz(10, 0); const b = P.frameFromAltAz(10, 40);
    const m = P.smooth(a, b, 0.25); const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return P.smooth(a, b, 1).look.every((x, i) => near(x, b.look[i], 1e-12)) && P.angleBetween(m, a) > 1 && P.angleBetween(m, b) > 1 && near(d(m.look, m.up), 0, 1e-9) && P.smooth(null, b, 0.1) === b;
});
check('cuaternion: ida y vuelta deja el mismo marco', () => { for (let i = 0; i < 50; i++) { const f = P.frameFromOrientation((i * 41) % 360, ((i * 67) % 360) - 180, ((i * 23) % 180) - 90, [0, 90, 270][i % 3]); const g = P.fromQuat(P.toQuat(f)); if (!vnear(f.look, g.look, 1e-9) || !vnear(f.up, g.up, 1e-9)) return 'caso ' + i; } return true; });
check('suavizado de sur a norte pasando por el cenit: llega derecho, no boca abajo (fallo visto en la prueba)', () => {
    let f = P.frameFromAltAz(30, 180); const tgt = P.frameFromOrientation(0, 130, 0, 0);
    for (let i = 0; i < 80; i++) f = P.smooth(f, tgt, 0.22);
    const d = f.up[0] * tgt.up[0] + f.up[1] * tgt.up[1] + f.up[2] * tgt.up[2];
    return P.angleBetween(f, tgt) < 0.01 && d > 0.9999 ? true : [P.angleBetween(f, tgt), d];
});
check('proyector: el centro de la mirada en el centro; a la derecha el este; arriba, mas alto; detras, nada', () => {
    const f = P.frameFromAltAz(20, 0); const pr = P.projector(f, 60, 400, 800);
    const c = pr(20, 0); const e = pr(20, 10); const u = pr(30, 0);
    return near(c[0], 200, 1e-9) && near(c[1], 400, 1e-9) && e[0] > 200 && near(e[1], 400, 3) && u[1] < 400 && near(u[0], 200, 1e-9) && pr(-20, 180) === null;
});
check('proyector: el borde del campo de vision (en el lado corto) cae en el borde de la pantalla', () => { const pr = P.projector(P.frameFromAltAz(0, 90), 60, 400, 800); const p = pr(0, 120); return near(p[0], 400, 1e-6) ? true : p; });
check('horizonte mirando al horizonte: una recta por el centro y el suelo debajo', () => { const h = P.horizon(P.frameFromAltAz(0, 0), 60, 400, 800); return h.kind === 'line' && near(h.y1, 400, 1e-6) && near(h.y2, 400, 1e-6) && h.gy > 400 ? true : h; });
check('horizonte mirando 30 grados arriba: una circunferencia que pasa por debajo del centro; el centro (cielo) dentro, el suelo fuera', () => {
    const f = P.frameFromAltAz(30, 0); const h = P.horizon(f, 60, 400, 800); const pr = P.projector(f, 60, 400, 800); const q = pr(0, 0);
    return h.kind === 'circle' && !h.groundInside && Math.hypot(200 - h.x, 400 - h.y) < h.r && q[1] > 400 && near(Math.hypot(q[0] - h.x, q[1] - h.y), h.r, 1e-6) ? true : h;
});
check('horizonte mirando 30 grados abajo: el suelo dentro de la circunferencia (con el centro)', () => { const h = P.horizon(P.frameFromAltAz(-30, 0), 60, 400, 800); return h.kind === 'circle' && h.groundInside && Math.hypot(200 - h.x, 400 - h.y) < h.r ? true : h; });
check('horizonte mirando al cenit: una circunferencia alrededor del centro y el suelo fuera', () => { const h = P.horizon(P.frameFromAltAz(89.9, 0), 90, 400, 400); return h.kind === 'circle' && !h.groundInside && near(h.x, 200, 2) && near(h.y, 200, 2) ? true : h; });

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('index.html carga sky/sky-point.js y pide permiso al tocar (iOS) antes de escuchar la orientacion', () => /<script src="\.\/sky\/sky-point\.js"><\/script>/.test(html) && /DeviceOrientationEvent\.requestPermission/.test(html) && /deviceorientationabsolute/.test(html) && /webkitCompassHeading/.test(html));
check('no se guarda la posicion del usuario (solo se usa mientras se apunta)', () => { const i = html.indexOf('function skpOpen('); const b = html.slice(i, html.indexOf('\nfunction ', i + 10)); return i > 0 && /getCurrentPosition/.test(html) && !/savePrefs\([^)]*(lat|lon|pos)/.test(b) && !/localStorage/.test(b); });
if (fails) { console.log('\n' + fails + ' prueba(s) fallida(s)'); process.exit(1); }
console.log('\nApuntar al cielo: todo verde.');
