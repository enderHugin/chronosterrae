#!/usr/bin/env node
/* check-milkyway.js - El fondo de la Via Lactea: geometria del muestreo, inversas de camara (globo y vista solar) y marcos.
 * Las pruebas de geometria usan texturas sinteticas con marcas en posiciones conocidas (la textura real no se descodifica en Node);
 * la orientacion de la textura real se comprueba aparte (scripts/check-milkyway-data.py: la LMC y la SMC deben verse). */
'use strict';
const Astronomy = require('astronomy-engine');
const MW = require('../sky/milkyway.js'); const Space = require('../sky/space.js'); const Solar = require('../sky/solar.js'); const Sky = require('../sky/sky.js');
let fails = 0;
const pending = [];
function report(name, ok, err) { console.log((ok ? '  ok  ' : '  XX  ') + name + (ok ? '' : err)); if (!ok) fails++; }
function check(name, fn) {
    let r; try { r = fn(); } catch (e) { report(name, false, ' (' + e.message + ')'); return; }
    if (r && typeof r.then === 'function') pending.push(r.then((ok) => report(name, ok === true, ''), (e) => report(name, false, ' (' + e.message + ')')));   // una promesa NO cuenta como exito: hay que esperarla
    else report(name, r === true, '');
}
const near = (a, b, e) => Math.abs(a - b) <= e;
const DEG = Math.PI / 180;
const vec = (raDeg, decDeg) => [Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG), Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG), Math.sin(decDeg * DEG)];

// --- uv ---
check('uvOf: AR 0 h en el centro; la AR crece hacia la izquierda; Dec +90 arriba y -90 abajo', () => {
    const c = MW.uvOf(...vec(0, 0)); const l = MW.uvOf(...vec(90, 0)); const r = MW.uvOf(...vec(-90, 0)); const n = MW.uvOf(0, 0, 1); const s = MW.uvOf(0, 0, -1);
    return near(c[0], 0.5, 1e-12) && near(c[1], 0.5, 1e-12) && near(l[0], 0.25, 1e-12) && near(r[0], 0.75, 1e-12) && near(n[1], 0, 1e-12) && near(s[1], 1, 1e-12);
});

// --- muestreo con textura sintetica: R = columna, G = fila ---
const W = 64; const H = 32; const tex = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; tex.data[k] = i * 4; tex.data[k + 1] = j * 8; tex.data[k + 2] = 7; tex.data[k + 3] = 255; }
const raOf = (col) => (0.5 - (col + 0.5) / W) * 360; const decOf = (row) => (0.5 - (row + 0.5) / H) * 180;
check('sample: en el centro de cada texel devuelve ese texel (columna y fila de 9 posiciones del cielo, sin espejo ni transposicion)', () => {
    const out = [0, 0, 0];
    return [[10, 5], [50, 5], [10, 27], [50, 27], [32, 16], [0, 0], [63, 31], [31, 8], [40, 20]].every(([c, r]) => {
        MW.sample(tex, ...vec(raOf(c), decOf(r)), out); return near(out[0], c * 4, 1e-6) && near(out[1], r * 8, 1e-6);
    });
});
check('sample: un punto con AR +30 grados cae a la IZQUIERDA del centro y con AR -30 a la derecha (el espejo daria lo contrario)', () => {
    const a = [0, 0, 0]; const b = [0, 0, 0]; MW.sample(tex, ...vec(30, 0), a); MW.sample(tex, ...vec(-30, 0), b); return a[0] < b[0];
});
check('sample: continuidad en la costura de AR 12 h (promedio de la ultima y la primera columna) y sin NaN en los polos', () => {
    const o = [0, 0, 0]; MW.sample(tex, -1, 0, 0, o); const seam = near(o[0], ((W - 1) * 4 + 0) / 2, 1e-6);
    const p1 = [0, 0, 0]; const p2 = [0, 0, 0]; MW.sample(tex, 0, 0, 1, p1); MW.sample(tex, 0, 0, -1, p2);
    return seam && p1.every(Number.isFinite) && p2.every(Number.isFinite) && p1[1] < 8 && p2[1] > 8 * (H - 2);
});
check('downsample2: mitad de tamano y promedio 2x2 (franjas 0/200 -> 100)', () => {
    const t = { w: 4, h: 2, data: new Uint8ClampedArray(4 * 2 * 4) };
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { const k = (j * 4 + i) * 4; const v = i % 2 ? 200 : 0; t.data[k] = v; t.data[k + 1] = v; t.data[k + 2] = v; t.data[k + 3] = 255; }
    const d = MW.downsample2(t); return d.w === 2 && d.h === 1 && d.data[0] === 100 && d.data[3] === 255;
});
check('render: tamano ceil(ancho/paso) x ceil(alto/paso); alfa 0 donde no hay vista, 255 donde si; la ganancia escala y satura', () => {
    const dirs = (px, py, out) => { if (px > 30) return false; const v = vec(raOf(10), decOf(5)); out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return true; };
    const r = MW.render({ width: 100, height: 50, step: 4, tex, direction: dirs, gain: 1 });
    const r2 = MW.render({ width: 100, height: 50, step: 4, tex, direction: dirs, gain: 10 });
    return r.w === 25 && r.h === 13 && r.data[3] === 255 && r.data[(0 * 25 + 24) * 4 + 3] === 0 && near(r.data[0], 40, 1) && r2.data[0] === 255 && r2.data[1] === 255;
});

check('render: la curva gamma oscurece los tonos medios y respeta el negro y el blanco (v=128 con gamma 2,2 -> ~28; 0 -> 0; 255 -> 255)', () => {
    const flat = (v) => ({ w: 4, h: 2, data: new Uint8ClampedArray(32).fill(v) });
    const dir = (px, py, out) => { out[0] = 1; out[1] = 0; out[2] = 0; return true; };
    const at = (v, o) => MW.render(Object.assign({ width: 4, height: 4, step: 4, tex: flat(v), direction: dir }, o)).data[0];
    return at(0, { gamma: 2.2 }) === 0 && at(255, { gamma: 2.2 }) === 255 && near(at(128, { gamma: 2.2 }), 255 * Math.pow(128 / 255, 2.2), 1.5) && at(128, {}) === 128 && near(at(255, { gamma: 2.2, gain: 0.5 }), 127.5, 1);
});

check('ensure: avisa una sola vez al quedar lista y no vuelve a llamar al callback despues (si no, "vuelve a dibujar" como callback en cada fotograma seria un bucle infinito)', () => {
    global.Image = function () { const self = this; Object.defineProperty(self, 'src', { set() { setTimeout(() => self.onload && self.onload(), 0); } }); };
    global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) }) }) };
    let calls = 0; const cb = () => { calls++; };
    const a = MW.ensure('x.jpg', cb); const b = MW.ensure('x.jpg', cb);            // dos peticiones antes de que termine: una descarga, un callback
    return new Promise((res) => setTimeout(() => { const c = MW.ensure('x.jpg', cb); const d = MW.ensure('x.jpg', cb); res(a === 'loading' && b === 'loading' && c === 'ready' && d === 'ready' && calls === 1); }, 30));
});

// --- globo: inversa de la proyeccion ---
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
check('makeProjector.unproject es la inversa de infinity (400 camaras y direcciones al azar: lng, lat, rumbo, cabeceo, alabeo, zoom y tamano)', () => {
    let worst = 0; let n = 0;
    for (let k = 0; k < 400; k++) {
        const pr = Space.makeProjector({ lng: rnd() * 360 - 180, lat: rnd() * 160 - 80, bearing: rnd() * 360 - 180, pitch: rnd() * 60, roll: rnd() * 30 - 15, worldSize: 512 * Math.pow(2, rnd() * 4), fovDeg: 20 + rnd() * 60, width: 300 + rnd() * 1500, height: 300 + rnd() * 900 });
        const th = rnd() * Math.PI; const ph = rnd() * 2 * Math.PI; const v = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        const s = pr.infinity(v[0], v[1], v[2]); if (!s) continue;
        const o = pr.unproject(s[0], s[1], [0, 0, 0]); n++; worst = Math.max(worst, Math.hypot(o[0] - v[0], o[1] - v[1], o[2] - v[2]));
    }
    return n > 100 && worst < 1e-9;
});
check('unproject: el pixel central con rumbo 0 y sin cabeceo mira hacia el centro de la Tierra, es decir, al OPUESTO de la vertical del lugar', () => {
    const pr = Space.makeProjector({ lng: 20, lat: 40, bearing: 0, pitch: 0, roll: 0, worldSize: 512, fovDeg: 36.87, width: 800, height: 600 });
    const o = pr.unproject(400, 300, [0, 0, 0]); const zen = [Math.cos(40 * DEG) * Math.sin(20 * DEG), Math.sin(40 * DEG), Math.cos(40 * DEG) * Math.cos(20 * DEG)];
    return near(o[0], -zen[0], 1e-9) && near(o[1], -zen[1], 1e-9) && near(o[2], -zen[2], 1e-9);
});

// --- globo: del marco del modelo a J2000 ---
check('j2000FromModel invierte modelDirection + la rotacion J2000 -> fecha (6 fechas entre -3000 y 2026, direcciones al azar, error < 1e-9)', () => {
    let worst = 0;
    for (const yr of [-3000, -1000, 0, 1000, 1800, 2026]) {
        const jd = Sky.J2000_JD + (yr - 2000) * 365.25; const time = new Astronomy.AstroTime(jd - Sky.J2000_JD);
        const rot = Astronomy.Rotation_EQJ_EQD(time).rot; const gast = Astronomy.SiderealTime(time) * 15 * DEG;
        for (let k = 0; k < 50; k++) {
            const th = Math.acos(2 * rnd() - 1); const ph = rnd() * 2 * Math.PI; const v = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
            // igual que starsOfDate (sin movimiento propio): v de fecha = rot^T v
            const e = [rot[0][0] * v[0] + rot[1][0] * v[1] + rot[2][0] * v[2], rot[0][1] * v[0] + rot[1][1] * v[1] + rot[2][1] * v[2], rot[0][2] * v[0] + rot[1][2] * v[1] + rot[2][2] * v[2]];
            const ra = Math.atan2(e[1], e[0]); const dec = Math.asin(e[2]); const m = [0, 0, 0]; Space.modelDirection(ra, dec, gast, m, 0);
            const b = Space.j2000FromModel(m[0], m[1], m[2], gast, rot, [0, 0, 0]); worst = Math.max(worst, Math.hypot(b[0] - v[0], b[1] - v[1], b[2] - v[2]));
        }
    }
    return worst < 1e-9;
});
// Referencia independiente: Thuban (alfa Dra, AR 211,097 grados, Dec +64,376 grados J2000) fue la estrella polar hacia el 2787 a. C.; hoy lo es Polaris, a 0,7 grados del polo.
const thuban = vec(211.097, 64.376);
const poleJ2000At = (year) => { const time = new Astronomy.AstroTime((year - 2000) * 365.25); const rot = Astronomy.Rotation_EQJ_EQD(time).rot; return Space.j2000FromModel(0, 1, 0, 0, rot, [0, 0, 0]); };
const sepDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / DEG;
check('precesion real: el polo celeste del modelo estaba en Thuban hacia el -2787 (a menos de 0,5 grados) y hoy esta a menos de 0,5 grados del polo J2000', () =>
    sepDeg(poleJ2000At(-2787), thuban) < 0.5 && sepDeg(poleJ2000At(2026), [0, 0, 1]) < 0.5 && sepDeg(poleJ2000At(-3000), [0, 0, 1]) > 20);

check('j2000FromModelCio invierte modelDirection con el marco de la prehistoria (CIO/CIP/ERA) en -100000, -50000, -10000 y -3000 (error < 1e-9)', () => {
    const fs = require('fs'); const path = require('path'); const Ltp = require('../sky/ltp.js');
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'ltp.json'), 'utf8'));
    const fr = Ltp.makeFrame(Ltp.make(doc.tables), doc.tables); let worst = 0;
    for (const yr of [-100000, -50000, -10000, -3000]) {
        const f = fr.frame(yr); const era = fr.era((yr - 2000) * 365.25);
        for (let k = 0; k < 40; k++) {
            const th = Math.acos(2 * rnd() - 1); const ph = rnd() * 2 * Math.PI; const v = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
            const r = fr.toCIP(f, v); const m = [0, 0, 0]; Space.modelDirection(r.ra, r.dec, era, m, 0);
            const b = Space.j2000FromModelCio(m[0], m[1], m[2], era, f, [0, 0, 0]); worst = Math.max(worst, Math.hypot(b[0] - v[0], b[1] - v[1], b[2] - v[2]));
        }
    }
    return worst < 1e-9;
});
check('la precesion LTP coincide con la de astronomy-engine donde ambas valen: el polo del modelo en el -2787 (CIP) tambien esta a menos de 0,5 grados de Thuban', () => {
    const fs = require('fs'); const path = require('path'); const Ltp = require('../sky/ltp.js');
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sky', 'ltp.json'), 'utf8'));
    const fr = Ltp.makeFrame(Ltp.make(doc.tables), doc.tables);
    return sepDeg(Space.j2000FromModelCio(0, 1, 0, 0, fr.frame(-2787), [0, 0, 0]), thuban) < 0.5;
});

// --- vista solar ---
check('Solar.eqFromEcl invierte eclFromEq y el polo de la ecliptica queda a la oblicuidad (23,44 grados) del polo celeste', () => {
    const v = vec(123, -37); const e = Solar.eclFromEq(v[0], v[1], v[2]); const b = Solar.eqFromEcl(e[0], e[1], e[2]);
    const p = Solar.eqFromEcl(0, 0, 1);
    return near(b[0], v[0], 1e-12) && near(b[1], v[1], 1e-12) && near(b[2], v[2], 1e-12) && near(Math.acos(p[2]) / DEG, 23.4393, 0.001) && near(p[0], 0, 1e-12);
});
check('camara solar: ray invierte project (direcciones lejanas, 200 poses al azar)', () => {
    let worst = 0; let n = 0;
    for (let k = 0; k < 200; k++) {
        const cam = Solar.makeCamera({ target: [0, 0, 0], yaw: rnd() * 6.28, pitch: rnd() * 2 - 1, distance: 1e7, fovDeg: 20 + rnd() * 60, width: 400 + rnd() * 1200, height: 300 + rnd() * 700 });
        const d = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; const l = Math.hypot(...d); const u = d.map((c) => c / l);
        const far = u.map((c, i) => cam.eye[i] + c * 1e15); const q = cam.project(far); if (!q) continue;
        const o = cam.ray(q[0], q[1], [0, 0, 0]); n++; worst = Math.max(worst, Math.hypot(o[0] - u[0], o[1] - u[1], o[2] - u[2]));
    }
    return n > 40 && worst < 1e-6;
});
check('de la vista solar a la textura: el polo norte de la ecliptica mirado de frente cae en la fila de Dec = +66,56 (oblicuidad) y AR = 18 h', () => {
    const cam = Solar.makeCamera({ target: [0, 0, 0], eyeDir: [0, 0, -1], up: [0, 1, 0], distance: 1e7, fovDeg: 40, width: 800, height: 600 });     // mira hacia +z ecliptico (el polo)
    const o = cam.ray(400, 300, [0, 0, 0]); const eq = Solar.eqFromEcl(o[0], o[1], o[2]); const uv = MW.uvOf(eq[0], eq[1], eq[2]);
    return near(o[2], 1, 1e-9) && near(uv[1], 0.5 - 66.56 / 180, 0.001) && near(uv[0], 0.5 - (270 / 360) + 1, 0.001);
});

Promise.all(pending).then(() => { console.log(fails ? '\nFALLAN ' + fails : '\nOK'); process.exit(fails ? 1 : 0); });
