#!/usr/bin/env node
// Pruebas de sky/solar.js (vista del sistema solar): marco, rangos fisicos conocidos, fases frente al motor, camara y rechazos. Sin red.
'use strict';
const Astronomy = require('astronomy-engine');
const Solar = require('../sky/solar.js'); const Sky = require('../sky/sky.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const AU = Solar.AU_KM; const J2000 = 2451545.0; const jdOfYear = (y) => J2000 + (y - 2000) * 365.25;
const len = (p) => Math.hypot(p[0], p[1], p[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

check('la ventana es la misma que la del cielo validado', () => Solar.WINDOW.minYear === Sky.WINDOW.minYear && Solar.WINDOW.maxYear === Sky.WINDOW.maxYear);
check('14 cuerpos (Sol, 8 planetas, Luna y 4 lunas galileanas), radios positivos y el Sol es el unico emisor', () => Solar.BODIES.length === 14 && Solar.BODIES.every((b) => b.radiusKm > 0) && Solar.BODIES.filter((b) => b.emissive).map((b) => b.id).join() === 'Sun');

// ---- Marco y orden de magnitud en J2000
const p0 = Solar.positions(J2000);
check('Sol en el origen', () => len(p0.Sun) === 0);
check('Tierra a 0,9833 AU del Sol el 1-1-2000 (cerca del perihelio)', () => Math.abs(len(p0.Earth) / AU - 0.9833) < 0.0005, (len(p0.Earth) / AU).toFixed(5));
check('la Tierra esta en el plano de la ecliptica (|z| < 1e5 km)', () => Math.abs(p0.Earth[2]) < 1e5, p0.Earth[2].toFixed(0));
check('el marco es ecliptico, no ecuatorial: el eje z de un planeta casi coplanario es pequeno frente a x,y (Venus, Marte)', () => ['Venus', 'Mars'].every((id) => Math.abs(p0[id][2]) < 0.06 * Math.hypot(p0[id][0], p0[id][1])));
check('Luna a 356.000-407.000 km de la Tierra', () => { const d = len(sub(p0.Moon, p0.Earth)); return d > 356000 && d < 407000 ? true : d; });

// ---- Rangos fisicos conocidos (perihelio-afelio de la ficha de planetas de la NASA, que son valores de J2000) durante 5000 anos.
// Margen del 2 %: las perturbaciones mutuas (sobre todo Jupiter-Saturno) cambian las orbitas con los siglos; Saturno llega a 8,92 AU (1,4 % bajo su perihelio de J2000).
// Sirve para cazar errores de marco, de escala o de unidades (que serian de factores, no de porcentajes).
const RANGE = { Mercury: [0.307, 0.467], Venus: [0.718, 0.728], Earth: [0.983, 1.017], Mars: [1.381, 1.666], Jupiter: [4.95, 5.458], Saturn: [9.04, 10.12], Uranus: [18.3, 20.1], Neptune: [29.8, 30.33] };
for (const [id, [lo, hi]] of Object.entries(RANGE)) {
    check('distancia heliocentrica de ' + id + ' entre ' + lo + ' y ' + hi + ' AU en 40 fechas de -2000 a 3000', () => {
        let mn = 1e9; let mx = 0;
        for (let k = 0; k < 40; k++) { const d = len(Solar.positions(jdOfYear(-2000 + k * 5000 / 39.0001))[id]) / AU; mn = Math.min(mn, d); mx = Math.max(mx, d); }
        return mn >= lo * 0.98 && mx <= hi * 1.02 ? true : mn.toFixed(3) + '..' + mx.toFixed(3);
    });
}
// ---- Lunas galileanas: distancia al centro de Jupiter dentro de la orbita conocida (semieje mayor +-2 %, que cubre la excentricidad) en 200 fechas
const JOV = { Io: 421800, Europa: 671100, Ganymede: 1070400, Callisto: 1882700 };
for (const [id, a] of Object.entries(JOV)) {
    check(id + ' orbita Jupiter a ' + a + ' km +-2 % en 200 fechas de -2000 a 3000 (y es hija de Jupiter)', () => {
        let mn = 1e12; let mx = 0; for (let k = 0; k < 200; k++) { const p = Solar.positions(jdOfYear(-2000 + k * 25.1)); const d = len(sub(p[id], p.Jupiter)); mn = Math.min(mn, d); mx = Math.max(mx, d); }
        return Solar.byId[id].parent === 'Jupiter' && mn > a * 0.98 && mx < a * 1.02 ? true : mn.toFixed(0) + '..' + mx.toFixed(0);
    });
}
check('la Luna nunca se aleja de la Tierra mas de lo posible (356.000-407.000 km +-1 %) en 200 fechas', () => {
    let mn = 1e9; let mx = 0; for (let k = 0; k < 200; k++) { const p = Solar.positions(jdOfYear(-2000 + k * 25.1)); const d = len(sub(p.Moon, p.Earth)); mn = Math.min(mn, d); mx = Math.max(mx, d); }
    return mn > 356000 * 0.99 && mx < 407000 * 1.01 ? true : mn.toFixed(0) + '..' + mx.toFixed(0);
});

// ---- Fases: fraccion iluminada desde la Tierra, con MIS vectores, frente a Illumination() del motor (otro camino de calculo)
for (const year of [-1500, 0, 1700, 2026, 2500]) {
    check('fase de Venus, Marte, Jupiter y la Luna vista desde la Tierra coincide con el motor en ' + year + ' (< 0,002)', () => {
        const jd = jdOfYear(year) + 123.4; const p = Solar.positions(jd); const time = Solar.timeFromJD(jd); let worst = 0;
        for (const id of ['Venus', 'Mars', 'Jupiter', 'Moon']) {
            const cam = Solar.makeCamera({ target: p[id], yaw: Math.atan2(p.Earth[1] - p[id][1], p.Earth[0] - p[id][0]), pitch: Math.asin((p.Earth[2] - p[id][2]) / len(sub(p.Earth, p[id]))), distance: len(sub(p.Earth, p[id])), width: 800, height: 600 });
            const ill = Solar.lighting(cam, p[id], p.Sun).fraction;
            const ref = Astronomy.Illumination(Astronomy.Body[id], time).phase_fraction;
            worst = Math.max(worst, Math.abs(ill - ref));
        }
        return worst < 0.002 ? true : worst;
    });
}
check('fase: el Sol detras del cuerpo respecto a la camara da fraccion 0; delante, 1', () => {
    const cam = Solar.makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6, width: 100, height: 100 });   // camara en +x mirando al origen
    return Math.abs(Solar.lighting(cam, [0, 0, 0], [-1e9, 0, 0]).fraction) < 1e-12 && Math.abs(Solar.lighting(cam, [0, 0, 0], [1e9, 0, 0]).fraction - 1) < 1e-12 && Math.abs(Solar.lighting(cam, [0, 0, 0], [0, 1e9, 0]).fraction - 0.5) < 1e-12;
});

// ---- Camara
check('camara: el objetivo cae en el centro de la pantalla y a profundidad = distancia', () => {
    const c = Solar.makeCamera({ target: [5e8, -2e8, 3e7], yaw: 1.1, pitch: -0.3, distance: 7e6, width: 1000, height: 600 });
    const q = c.project([5e8, -2e8, 3e7]); return Math.abs(q[0] - 500) < 1e-6 && Math.abs(q[1] - 300) < 1e-6 && Math.abs(q[2] - 7e6) < 1e-3 ? true : q.join();
});
check('camara: la base es ortonormal y el norte eclíptico queda arriba en pantalla', () => {
    const c = Solar.makeCamera({ target: [0, 0, 0], yaw: 0.7, pitch: 0.5, distance: 1e6, width: 800, height: 600 });
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const up = c.project([0, 0, 1e5]);
    return Math.abs(d(c.r, c.u)) < 1e-12 && Math.abs(d(c.r, c.f)) < 1e-12 && Math.abs(d(c.u, c.f)) < 1e-12 && Math.abs(Math.hypot(...c.u) - 1) < 1e-12 && up[1] < 300 ? true : up.join();
});
check('camara: un punto a la derecha del eje cae a la derecha (x mayor) y uno detras de la camara se rechaza', () => {
    const c = Solar.makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e6, width: 800, height: 600 });   // ojo en +x, mira a -x; derecha = ?
    const right = c.project([0, 1e5 * (c.r[1] > 0 ? 1 : -1), 0]);
    return right[0] > 400 && c.project([2e6, 0, 0]) === null ? true : String(right) + ' / ' + c.project([2e6, 0, 0]);
});
check('escala: el Sol visto desde la Tierra mide 0,533 grados (2 atan(R/1 AU)) y la Luna 0,49-0,56', () => {
    const p = Solar.positions(jdOfYear(2026) + 10);
    const mk = (from, to) => { const d = sub(to, from); const dist = len(d); return Solar.makeCamera({ target: to, yaw: Math.atan2(-d[1], -d[0]), pitch: Math.asin(-d[2] / dist), distance: dist, fovDeg: 10, width: 1000, height: 1000 }); };
    const cs = mk(p.Earth, p.Sun); const rs = cs.discPx(p.Sun, Solar.byId.Sun.radiusKm);
    const degSun = 2 * Math.atan(rs / cs.fpx) * 180 / Math.PI;
    const cm = mk(p.Earth, p.Moon); const rm = cm.discPx(p.Moon, Solar.byId.Moon.radiusKm);
    const degMoon = 2 * Math.atan(rm / cm.fpx) * 180 / Math.PI;
    return Math.abs(degSun - 0.533) < 0.02 && degMoon > 0.49 && degMoon < 0.56 ? true : degSun.toFixed(3) + ' / ' + degMoon.toFixed(3);
});

check('discPx: de lejos coincide con radiusPx (< 1e-6 relativo); de cerca es mayor y exacto asin(R/d); dentro de la esfera da Infinity', () => {
    const c = Solar.makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e9, width: 1000, height: 800 });
    const far = c.discPx([0, 0, 0], 7e5); const approx = c.radiusPx(7e5, 1e9);
    const near = Solar.makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 2e4, width: 1000, height: 800 }); const dn = near.discPx([0, 0, 0], 1e4);
    const exact = near.fpx * Math.tan(Math.asin(0.5));
    return Math.abs(far / approx - 1) < 1e-6 && Math.abs(dn - exact) < 1e-9 && dn > near.radiusPx(1e4, 2e4) && near.discPx([0, 0, 0], 3e4) === Infinity ? true : [far, approx, dn, exact].join();
});
check('eclFromEq: el polo norte ecuatorial queda a 23,44 grados del polo eclíptico y el equinoccio (1,0,0) no cambia', () => {
    const pole = Solar.eclFromEq(0, 0, 1); const eq = Solar.eclFromEq(1, 0, 0); const ang = Math.acos(pole[2]) * 180 / Math.PI;
    return Math.abs(ang - 23.4393) < 0.001 && Math.abs(eq[0] - 1) < 1e-12 && Math.abs(len(pole) - 1) < 1e-12 ? true : ang;
});

// ---- Trayectorias
check('trayectoria de Marte: cierra una revolucion (primer y ultimo punto casi iguales) y pasa por la posicion actual', () => {
    const jd = jdOfYear(2026); const t = Solar.trail('Mars', jd, 240); const a = t.points[0]; const b = t.points[240]; const mid = t.points[120]; const now = Solar.positions(jd).Mars;
    return len(sub(a, b)) < 2e5 && len(sub(mid, now)) < 1e3 && t.relativeTo === 'Sun' ? true : len(sub(a, b)).toFixed(0) + ' / ' + len(sub(mid, now)).toFixed(0);
});
check('trayectoria de la Luna: respecto a la Tierra, radio 356.000-407.000 km', () => {
    const t = Solar.trail('Moon', jdOfYear(2026), 120); const r = t.points.map(len); return t.relativeTo === 'Earth' && Math.min(...r) > 350000 && Math.max(...r) < 410000 ? true : Math.min(...r) + '..' + Math.max(...r);
});

// ---- La Tierra del mapa dentro de la escena: marco ecliptico -> globo, y la camara del globo como camara en perspectiva
const Space = require('../sky/space.js');
const DEG = Math.PI / 180;
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b))))) / DEG;
const TEST_JDS = [-1500, 0, 1492, 1945, 2026, 2026.5, 2500].map(jdOfYear);
check('earthFrame es una rotacion (ortonormal, determinante +1) en 7 fechas', () => TEST_JDS.every((jd) => {
    const M = Solar.earthFrame(jd).M; let ok = true;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const d = M[i][0] * M[j][0] + M[i][1] * M[j][1] + M[i][2] * M[j][2]; if (Math.abs(d - (i === j ? 1 : 0)) > 1e-12) ok = false; }
    const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    return ok && Math.abs(det - 1) < 1e-12;
}));
check('eclToGlobe y globeToEcl son inversas', () => { const f = Solar.earthFrame(jdOfYear(2026)); const v = [0.3, -1.2, 0.7]; const w = Solar.globeToEcl(f, Solar.eclToGlobe(f, v)); return len(sub(v, w)) < 1e-12; });
// Contraste independiente: la direccion del Sol, la Luna y los planetas vista desde el centro de la Tierra, en el marco del globo, por dos caminos
// distintos: (a) sky/solar.js (efemerides geometricas simultaneas + earthFrame) y (b) ChronosSpace (GeoVector con tiempo de luz y aberracion +
// modelDirection). Un error de marco (ejes, signo del tiempo sidereo, precesion) daria grados; las diferencias fisicas esperadas son la aberracion
// (20,5 segundos de arco = 0,0057 grados) y el tiempo de luz de un planeta que se mueve respecto a la Tierra (hasta ~0,02 grados).
const TOL_DEG = { Sun: 0.01, Moon: 0.01, Mercury: 0.03, Venus: 0.03, Mars: 0.03, Jupiter: 0.03, Saturn: 0.03, Uranus: 0.03, Neptune: 0.03 };
const worst = {};
for (const jd of TEST_JDS) {
    const P = Solar.positions(jd); const f = Solar.earthFrame(jd);
    const time = new Astronomy.AstroTime(jd - J2000);
    const gast = Astronomy.SiderealTime(time) * 15 * DEG;
    for (const b of Space.bodiesGeocentric(time)) {
        const v = new Float64Array(3); Space.modelDirection(b.ra, b.dec, gast, v, 0);
        const mine = Solar.eclToGlobe(f, sub(P[b.id], P.Earth));
        worst[b.id] = Math.max(worst[b.id] || 0, angleDeg(mine, [v[0], v[1], v[2]]));
    }
}
for (const id of Object.keys(TOL_DEG)) check('marco del globo: direccion de ' + id + ' por dos caminos independientes (7 fechas, -1500..2500) < ' + TOL_DEG[id] + ' grados', () => worst[id] < TOL_DEG[id] ? true : 'peor ' + worst[id].toFixed(4));
console.log('  (peor diferencia medida: ' + Object.entries(worst).map(([k, v]) => k + ' ' + v.toFixed(4) + '°').join(', ') + ')');

check('mapBasis / mapFromBasis: ida y vuelta en 200 orientaciones al azar (lat <= 85)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 200; k++) {
        const o = { lng: rnd() * 360 - 180, lat: rnd() * 170 - 85, bearing: rnd() * 360 - 180 };
        const b = Solar.mapBasis(o.lng, o.lat, o.bearing); const r = Solar.mapFromBasis(b.dir, b.up);
        const dB = Math.abs(((r.bearing - o.bearing + 540) % 360) - 180); const dL = Math.abs(((r.lng - o.lng + 540) % 360) - 180);
        if (dB > 1e-7 || dL > 1e-7 || Math.abs(r.lat - o.lat) > 1e-7) return JSON.stringify([o, r]);
        if (Math.abs(len(b.dir) - 1) > 1e-12 || Math.abs(len(b.up) - 1) > 1e-12 || Math.abs(b.dir[0] * b.up[0] + b.dir[1] * b.up[1] + b.dir[2] * b.up[2]) > 1e-12) return 'base no ortonormal';
    }
    return true;
});
check('mapBasis: con bearing 0 el norte queda arriba y con bearing 90 el este (convencion de MapLibre)', () => {
    const a = Solar.mapBasis(0, 0, 0); const b = Solar.mapBasis(0, 0, 90);
    return len(sub(a.up, [0, 1, 0])) < 1e-12 && len(sub(b.up, [1, 0, 0])) < 1e-12 ? true : JSON.stringify([a, b]);
});

// La camara por base debe dar EXACTAMENTE lo mismo que la proyeccion del globo (ChronosSpace.makeProjector, ya contrastada con map.project).
check('camara por base == proyeccion del globo: 300 puntos x 40 orientaciones/zooms (< 1e-6 px en lo que cae a menos de 1e5 px) y contorno de la Tierra (discPx == silPx)', () => {
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let worstPx = 0; let n = 0;
    for (let k = 0; k < 40; k++) {
        const o = { lng: rnd() * 360 - 180, lat: rnd() * 150 - 75, bearing: rnd() * 360 - 180, zoom: rnd() * 4 };
        const width = 600 + Math.floor(rnd() * 1000); const height = 400 + Math.floor(rnd() * 600); const fovDeg = 36.86989764584402;
        const pr = Space.makeProjector({ lng: o.lng, lat: o.lat, bearing: o.bearing, pitch: 0, worldSize: 512 * Math.pow(2, o.zoom), fovDeg, width, height });
        const g = Solar.globe({ zoom: o.zoom, latDeg: o.lat, width, height, fovDeg });
        if (Math.abs(g.Rpx - pr.globeRadiusPx) > 1e-9 || Math.abs(g.Dpx - pr.cameraDistancePx) > 1e-9) return 'globe() no coincide con el proyector';
        const bs = Solar.mapBasis(o.lng, o.lat, o.bearing);
        const cam = Solar.makeCamera({ target: [0, 0, 0], eyeDir: bs.dir, up: bs.up, distance: g.dER, fovDeg, width, height });
        if (Math.abs(cam.discPx([0, 0, 0], 1) - g.silPx) > 1e-9) return 'contorno: ' + cam.discPx([0, 0, 0], 1) + ' vs ' + g.silPx;
        for (let i = 0; i < 300; i++) {
            const rr = Math.pow(10, rnd() * 5 - 0.3); const th = Math.acos(2 * rnd() - 1); const ph = rnd() * 2 * Math.PI;
            const P = [rr * Math.sin(th) * Math.cos(ph), rr * Math.cos(th), rr * Math.sin(th) * Math.sin(ph)];
            const a = pr.near(P[0], P[1], P[2]); const c = cam.project(P);
            if (!a !== !c) { if (Math.hypot(P[0], P[1], P[2]) > 0.5) return 'uno proyecta y el otro no: ' + JSON.stringify([P, a, c]); continue; }
            if (!a || Math.hypot(a.x, a.y) > 1e5) continue;      // puntos casi en el plano de la camara: coordenadas de millones de px, donde el error relativo (1e-11) ya no es de pixeles
            worstPx = Math.max(worstPx, Math.hypot(a.x - c[0], a.y - c[1])); n++;
        }
    }
    return worstPx < 1e-6 ? true : 'peor ' + worstPx + ' px en ' + n;
});
check('zoomForDistance es la inversa de globe() (zoom -3..9, lat -80..80)', () => {
    for (const z of [-3, 0, 0.7, 2.1, 5, 9]) for (const la of [-80, -30, 0, 45, 80]) {
        const g = Solar.globe({ zoom: z, latDeg: la, width: 1000, height: 700 }); const back = Solar.zoomForDistance({ dER: g.dER, latDeg: la, height: 700 });
        if (Math.abs(back - z) > 1e-9) return JSON.stringify([z, la, back]);
    }
    return true;
});
check('con el zoom del mapa en 0 la Tierra queda a ~15,7 radios en el ecuador y ~8,4 a 60 grados (la camara del globo se acerca con la latitud) y el contorno ocupa menos de media pantalla', () => {
    const e = Solar.globe({ zoom: 0, latDeg: 0, width: 1200, height: 800 }); const p = Solar.globe({ zoom: 0, latDeg: 60, width: 1200, height: 800 });
    return e.dER > 15.5 && e.dER < 16 && p.dER > 8.2 && p.dER < 8.6 && e.silPx * 2 < 800 / 2 ? true : JSON.stringify([e, p]);
});

// ---- Rechazos: «rechazado» frente a «roto» (rule 7)
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
check('fuera de la ventana (ano 3500) se RECHAZA con OUT_OF_WINDOW, y el limite 2999 se acepta', () => rejects(() => Solar.positions(jdOfYear(3500)), 'OUT_OF_WINDOW') === true && Object.keys(Solar.positions(jdOfYear(2999))).length === 14);
check('antes de la ventana (-2500) se RECHAZA con OUT_OF_WINDOW', () => rejects(() => Solar.positions(jdOfYear(-2500)), 'OUT_OF_WINDOW'));
check('instante no numerico se RECHAZA con BAD_TIME', () => rejects(() => Solar.positions(NaN), 'BAD_TIME'));
check('trayectoria de un cuerpo sin ella (Sol) se RECHAZA con BAD_BODY', () => rejects(() => Solar.trail('Sun', J2000), 'BAD_BODY'));

// ---- Exactitud medida
const fakeReport = { summary: { Venus: { '1700-2200': 12, '0-1699': 340, 'antes de 0': 9000, 'despues de 2200': null }, Jupiter: { '1700-2200': 50 } } };
check('accuracy: devuelve el error de la franja y NO inventa lo que el informe no trae', () => {
    const a = Solar.accuracy(fakeReport, 'Venus', 1990); const b = Solar.accuracy(fakeReport, 'Venus', -500); const c = Solar.accuracy(fakeReport, 'Venus', 2500); const d = Solar.accuracy(fakeReport, 'Mars', 1990); const e = Solar.accuracy(null, 'Venus', 1990);
    const j = Solar.accuracy(fakeReport, 'Jupiter', 2000);
    return a.km === 12 && a.band === '1700-2200' && b.km === 9000 && c === null && d === null && e === null && j.barycenter === true && a.barycenter === false ? true : JSON.stringify([a, b, c, d, e]);
});
check('franjas: 1699 -> 0-1699, 1700 y 2200 -> 1700-2200, 2201 -> despues de 2200, -1 -> antes de 0', () => Solar.bandOf(1699) === '0-1699' && Solar.bandOf(1700) === '1700-2200' && Solar.bandOf(2200) === '1700-2200' && Solar.bandOf(2201) === 'despues de 2200' && Solar.bandOf(-1) === 'antes de 0');
check('luz del Sol a Neptuno: 4 h 10 min aprox (30,07 AU)', () => { const m = Solar.lightMinutes(30.07 * AU); return m > 249 && m < 252 ? true : m; });

console.log(fails ? '\n' + fails + ' prueba(s) con fallo.' : '\nVista del sistema solar: todo verde.');
process.exit(fails ? 1 : 0);
