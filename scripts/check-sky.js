#!/usr/bin/env node
// check-sky.js - Pruebas del calculo del cielo (sky/sky.js). Sin red: todo se compara con
// referencias independientes (formulas distintas, fechas astronomicas conocidas, geometria).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('astronomy-engine');
const S = require('../sky/sky.js');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const check = (name, fn) => {
    try {
        const r = fn();
        if (r === true) passes.push(name); else failures.push(r === false ? name : `${name} -> devolvio ${String(r).slice(0, 200)}`);   // solo `true` pasa
    } catch (err) {
        failures.push(`${name} -> ${err.message}`);
    }
};
const throwsCode = (fn, code) => {
    try { fn(); } catch (err) { return err.code === code ? true : (() => { throw new Error('error ' + err.code + ' en vez de ' + code + ': ' + err.message); })(); }
    throw new Error('no lanzo error (se esperaba ' + code + ')');
};

/* ---------------- Calendario ---------------- */
// Numero de dia juliano al mediodia, formulas de Richards (distintas de las de Meeus que usa sky.js).
const jdnGregorian = (y, m, d) => {
    const a = Math.floor((14 - m) / 12); const yy = y + 4800 - a; const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};
const jdnJulian = (y, m, d) => {
    const a = Math.floor((14 - m) / 12); const yy = y + 4800 - a; const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
};

check('calendario: coincide con una formula independiente en 5000 anios, juliano y gregoriano', () => {
    let n = 0;
    for (let y = -2000; y <= 3000; y += 7) {
        for (const m of [1, 2, 3, 6, 10, 12]) {
            for (const d of [1, 15, 28]) {
                for (const cal of ['julian', 'gregorian']) {
                    const got = S.calendarToJD({ year: y, month: m, day: d, hour: 12 }, cal).jd;
                    const want = (cal === 'julian' ? jdnJulian : jdnGregorian)(y, m, d);
                    if (Math.abs(got - want) > 1e-9) throw new Error(`${cal} ${y}-${m}-${d}: ${got} != ${want}`);
                    const back = S.jdToCalendar(got, cal);
                    if (back.year !== y || back.month !== m || back.day !== d) throw new Error(`ida y vuelta ${cal} ${y}-${m}-${d} -> ${JSON.stringify(back)}`);
                    n++;
                }
            }
        }
    }
    return n > 20000;
});

check('calendario: valores de referencia (J2000, reforma gregoriana, origen del dia juliano)', () => {
    const jd = (c, cal) => S.calendarToJD(c, cal).jd;
    return jd({ year: 2000, month: 1, day: 1, hour: 12 }) === 2451545.0
        && jd({ year: 1582, month: 10, day: 4 }) === 2299159.5          // ultimo dia juliano
        && jd({ year: 1582, month: 10, day: 15 }) === 2299160.5         // primer dia gregoriano, un dia despues
        && jd({ year: -4712, month: 1, day: 1, hour: 12 }, 'julian') === 0;
});

check('calendario: auto usa juliano antes de la reforma y gregoriano despues', () => {
    const a = S.calendarToJD({ year: 1500, month: 3, day: 1 });
    const b = S.calendarToJD({ year: 1700, month: 3, day: 1 });
    return a.calendar === 'julian' && b.calendar === 'gregorian';
});

check('calendario: los 10 dias que no existieron en 1582 dan error claro', () => {
    for (const d of [5, 10, 14]) throwsCode(() => S.calendarToJD({ year: 1582, month: 10, day: d }), 'SKIPPED_DATE');
    return true;
});

check('calendario: bisiestos distintos en cada calendario', () => {
    S.calendarToJD({ year: 1900, month: 2, day: 29 }, 'julian');                       // 1900 fue bisiesto en el juliano
    throwsCode(() => S.calendarToJD({ year: 1900, month: 2, day: 29 }, 'gregorian'), 'BAD_DATE');
    S.calendarToJD({ year: 2000, month: 2, day: 29 }, 'gregorian');
    throwsCode(() => S.calendarToJD({ year: 2001, month: 2, day: 29 }), 'BAD_DATE');
    return true;
});

check('calendario: rechaza meses, dias y horas fuera de rango y valores no enteros', () => {
    const bad = [{ year: 2000, month: 13, day: 1 }, { year: 2000, month: 0, day: 1 }, { year: 2000, month: 4, day: 31 },
        { year: 2000, month: 1, day: 1, hour: 24 }, { year: 2000, month: 1, day: 1, minute: 60 }, { year: 2000.5, month: 1, day: 1 },
        { year: NaN, month: 1, day: 1 }, { year: 2000, month: 1 }];
    bad.forEach((c) => throwsCode(() => S.calendarToJD(c), 'BAD_DATE'));
    return true;
});

check('calendario: el anio 0 existe (numeracion astronomica) y 1 a. C. = anio 0', () => {
    const r = S.calendarToJD({ year: 0, month: 3, day: 1 });
    return r.calendar === 'julian' && S.jdToCalendar(r.jd).year === 0;
});

check('hora solar media local -> UT', () => {
    return S.localMeanSolarToUT(12, 0) === 12 && S.localMeanSolarToUT(12, 15) === 11 && S.localMeanSolarToUT(12, -90) === 18;
});

/* ---------------- Estrellas ---------------- */
const mini = (stars) => S.prepareCatalog({ epoch_jyear: 1991.25, fields: ['hip', 'ra_deg', 'dec_deg', 'pmra_mas_yr', 'pmde_mas_yr', 'plx_mas', 'vmag', 'bv'], stars });

check('estrellas: coinciden con la ruta de precesion del motor (1e-9 grados) en 6 epocas y 4 lugares', () => {
    const cat = mini([[1, 101.287155, -16.716116, -546.01, -1223.07, 379.21, -1.44, 0], [2, 213.9153, 19.1824, -1093.45, -1999.4, 88.83, -0.05, 1.23],
        [3, 37.9545, 89.2641, 44.48, -11.85, 7.54, 1.98, 0.6], [4, 300, -80, 0, 0, 5, 3, 0.5]]);
    let worst = 0;
    for (const jd of [2451545.0, 2460000.3, 2305447.5, 1721057.5, 1000000.2, 2800000.7]) {
        for (const [lat, lon] of [[40.4, -3.7], [-33.9, 151.2], [69, 18], [0, 0]]) {
            const time = new A.AstroTime(jd - 2451545);
            const sp = S.starPositions(cat, time, lat, lon);
            const obs = new A.Observer(lat, lon, 0);
            const rot = A.Rotation_EQJ_EQD(time);
            const dt = ((time.tt + 2451545) - cat.epochJD) / 365.25;
            for (let i = 0; i < cat.n; i++) {
                const sa = Math.sin(cat.ra[i]); const ca = Math.cos(cat.ra[i]); const sd = Math.sin(cat.dec[i]); const cd = Math.cos(cat.dec[i]);
                const x = cd * ca + dt * (-cat.pmra[i] * sa - cat.pmde[i] * sd * ca);
                const y = cd * sa + dt * (cat.pmra[i] * ca - cat.pmde[i] * sd * sa);
                const z = sd + dt * cat.pmde[i] * cd;
                const nn = Math.hypot(x, y, z);
                const eq = A.EquatorFromVector(A.RotateVector(rot, new A.Vector(x / nn, y / nn, z / nn, time)));
                const h = A.Horizon(time, obs, eq.ra, eq.dec, 'normal');
                let dAz = Math.abs(h.azimuth - sp.az[i]); if (dAz > 180) dAz = 360 - dAz;
                worst = Math.max(worst, Math.abs(h.altitude - sp.alt[i]), h.altitude < 85 ? dAz : 0, Math.abs(eq.ra - sp.ra[i]) * 15, Math.abs(eq.dec - sp.dec[i]));
            }
        }
    }
    if (worst > 1e-9) throw new Error('diferencia maxima ' + worst + ' grados');
    return true;
});

check('estrellas: la precesion mueve el polo como dicta la geometria (2*23,44*sin(pi*t/25772))', () => {
    // Una estrella en el polo norte de J2000 sin movimiento propio queda a esa distancia del polo de la fecha.
    const cat = mini([[1, 0, 89.9999999, 0, 0, 0, 1, 0]]);
    for (const years of [-2000, -1000, 1000, 1500]) {
        const jd = 2451545.0 + years * 365.25;
        const sp = S.starPositions(cat, new A.AstroTime(jd - 2451545), 0, 0);
        const sep = 90 - sp.dec[0];
        const want = 2 * 23.44 * Math.sin(Math.PI * Math.abs(years) / 25772) * (180 / Math.PI) * (Math.PI / 180);
        if (Math.abs(sep - want) > 0.25) throw new Error(`t=${years}: ${sep.toFixed(2)} grados, esperado ~${want.toFixed(2)}`);
    }
    return true;
});

check('estrellas: el movimiento propio avanza en el sentido y la cantidad correctos', () => {
    // 1000 mas/anio en declinacion durante 100 anios desde la epoca = 0,0278 grados.
    const cat = mini([[1, 120, 10, 0, 1000, 0, 5, 0]]);
    const t0 = new A.AstroTime(0 - 0.0);
    const jdEpoch = cat.epochJD;                                    // sin precesion apreciable: comparamos dos fechas
    const a = S.starPositions(cat, new A.AstroTime(jdEpoch - 2451545), 0, 0);
    const b = S.starPositions(cat, new A.AstroTime(jdEpoch + 100 * 365.25 - 2451545), 0, 0);
    void t0;
    const cat0 = mini([[1, 120, 10, 0, 0, 0, 5, 0]]);
    const a0 = S.starPositions(cat0, new A.AstroTime(jdEpoch - 2451545), 0, 0);
    const b0 = S.starPositions(cat0, new A.AstroTime(jdEpoch + 100 * 365.25 - 2451545), 0, 0);
    const moved = (b.dec[0] - a.dec[0]) - (b0.dec[0] - a0.dec[0]);  // quita la precesion
    return Math.abs(moved - 100 * 1000 / 3.6e6) < 1e-6;
});

/* ---------------- Sol, Luna y planetas: hechos astronomicos conocidos ---------------- */
const jdUT = (y, mo, d, h, mi) => S.calendarToJD({ year: y, month: mo, day: d, hour: h, minute: mi }).jd;

check('Sol: declinacion ~0 en el equinoccio de marzo de 2000 (20 mar 07:35 UT) y ~+23,44 en el solsticio de junio (21 jun 01:48 UT)', () => {
    const eq = S.skyAt({ jd: jdUT(2000, 3, 20, 7, 35), lat: 0, lon: 0 }).sun.dec;
    const so = S.skyAt({ jd: jdUT(2000, 6, 21, 1, 48), lat: 0, lon: 0 }).sun.dec;
    return Math.abs(eq) < 0.03 && Math.abs(so - 23.44) < 0.05;
});

check('Luna: fase nueva el 6 ene 2000 18:14 UT y llena el 21 ene 2000 04:40 UT', () => {
    const near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 1.5;
    const nueva = S.skyAt({ jd: jdUT(2000, 1, 6, 18, 14), lat: 0, lon: 0 }).moon.phaseAngle;
    const llena = S.skyAt({ jd: jdUT(2000, 1, 21, 4, 40), lat: 0, lon: 0 }).moon.phaseAngle;
    return near(nueva, 0) && near(llena, 180);
});

check('Eclipse solar del 29 mayo 1919 (Eddington): visto desde Principe, el Sol y la Luna llegan a solaparse (separacion topocentrica minima < 0,3 grados entre 13:00 y 13:30 UT)', () => {
    const sep = (a, b) => {   // separacion angular entre dos (alt, az) en grados
        const r = Math.PI / 180;
        const c = Math.sin(a.alt * r) * Math.sin(b.alt * r) + Math.cos(a.alt * r) * Math.cos(b.alt * r) * Math.cos((a.az - b.az) * r);
        return Math.acos(Math.max(-1, Math.min(1, c))) / r;
    };
    let min = 99;
    for (let m = 0; m <= 30; m++) {
        const r = S.skyAt({ jd: jdUT(1919, 5, 29, 13, m), lat: 1.6, lon: 7.4 });
        min = Math.min(min, sep(r.sun, r.moon));
    }
    if (min >= 0.3) throw new Error('separacion minima ' + min.toFixed(3) + ' grados');
    return true;
});

check('Sol a mediodia solar: alto y al sur en el hemisferio norte, al norte en el sur', () => {
    const mad = S.skyAt({ jd: jdUT(2000, 6, 21, 12, 15), lat: 40, lon: -3.7 });   // ~mediodia solar en Madrid
    const syd = S.skyAt({ jd: jdUT(2000, 6, 21, 2, 0), lat: -33.9, lon: 151.2 });
    return mad.sun.alt > 70 && Math.abs(mad.sun.az - 180) < 15 && syd.sun.alt > 25 && (syd.sun.az < 30 || syd.sun.az > 330);
});

check('crepusculo: clasificacion por altura del Sol', () => {
    return S.twilightOf(10) === 'day' && S.twilightOf(-0.5) === 'day' && S.twilightOf(-3) === 'civil' && S.twilightOf(-9) === 'nautical'
        && S.twilightOf(-15) === 'astronomical' && S.twilightOf(-30) === 'night';
});

check('skyAt: devuelve 9 cuerpos con magnitudes finitas y rechaza lugares imposibles', () => {
    const r = S.skyAt({ jd: 2451545, lat: 40, lon: -3 });
    if (r.planets.length !== 7 || ![r.sun, r.moon, ...r.planets].every((b) => Number.isFinite(b.alt) && Number.isFinite(b.az) && Number.isFinite(b.mag))) return false;
    throwsCode(() => S.skyAt({ jd: 2451545, lat: 95, lon: 0 }), 'BAD_INPUT');
    throwsCode(() => S.skyAt({ jd: NaN, lat: 0, lon: 0 }), 'BAD_INPUT');
    return true;
});

check('skyAt: funciona en los dos extremos de la ventana de epocas', () => {
    for (const year of [S.WINDOW.minYear, S.WINDOW.maxYear]) {
        const { jd } = S.calendarToJD({ year, month: 6, day: 21, hour: 12 });
        const r = S.skyAt({ jd, lat: 35, lon: 30 });
        if (![r.sun, r.moon, ...r.planets].every((b) => Number.isFinite(b.alt))) throw new Error('NaN en ' + year);
    }
    return true;
});

/* ---------------- El cielo visto desde el espacio (sky/space.js) ---------------- */
const SP = require('../sky/space.js');
const D2R = Math.PI / 180;
{
    const fake = { n: 3, epochJD: 2451545.0, ra: Float64Array.from([1.0, 3.5, 5.9]), dec: Float64Array.from([0.3, -0.8, 1.2]), pmra: Float64Array.from([2e-8, 0, 0]), pmde: Float64Array.from([-1e-8, 0, 0]) };
    const jd = S.calendarToJD({ year: 1500, month: 3, day: 3, hour: 4 }).jd;
    const time = new A.AstroTime(jd - 2451545);
    const gast = A.SiderealTime(time) * 15 * D2R;
    check('espacio: starsOfDate coincide con starPositions (ra/dec de la fecha) a 1e-9', () => {
        const a = SP.starsOfDate(fake, time); const b = S.starPositions(fake, time, 20, 10);
        for (let i = 0; i < 3; i++) {
            if (Math.abs(a.ra[i] - b.ra[i] * 15 * D2R) > 1e-9 || Math.abs(a.dec[i] - b.dec[i] * D2R) > 1e-9) throw new Error('estrella ' + i);
        }
        return true;
    });
    check('espacio: la direccion en el marco del globo da la altura geometrica correcta para un observador', () => {
        const a = SP.starsOfDate(fake, time);
        const [lat, lon] = [40.4, -3.7];
        const up = [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)];
        for (let i = 0; i < 3; i++) {
            const v = new Float64Array(3); SP.modelDirection(a.ra[i], a.dec[i], gast, v, 0);
            const alt = Math.asin(v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / D2R;
            const ref = A.Horizon(time, new A.Observer(lat, lon, 0), a.ra[i] / D2R / 15, a.dec[i] / D2R, null).altitude;
            if (Math.abs(alt - ref) > 1e-6) throw new Error('estrella ' + i + ': ' + alt + ' vs ' + ref);
        }
        return true;
    });
    check('espacio: el Sol esta en el cenit del punto subsolar (altura 90 grados) y la Luna a unos 55-64 radios terrestres', () => {
        const b = SP.bodiesGeocentric(time);
        const sun = b.find((x) => x.id === 'Sun'); const moon = b.find((x) => x.id === 'Moon');
        const v = new Float64Array(3); SP.modelDirection(sun.ra, sun.dec, gast, v, 0);
        const sunLat = Math.asin(v[1]) / D2R; const sunLng = Math.atan2(v[0], v[2]) / D2R;
        const ref = A.Horizon(time, new A.Observer(sunLat, sunLng, 0), sun.ra / D2R / 15, sun.dec / D2R, null).altitude;
        return Math.abs(ref - 90) < 1e-6 && moon.distER > 54 && moon.distER < 64.5;
    });
    check('espacio: el terminador es el circulo maximo a 90 grados del Sol', () => {
        const poly = SP.nightPolygon(20, 35).coordinates[0];
        const sun = [Math.cos(20 * D2R) * Math.sin(35 * D2R), Math.sin(20 * D2R), Math.cos(20 * D2R) * Math.cos(35 * D2R)];
        for (const [lng, lat] of poly.slice(0, 181)) {
            const p = [Math.cos(lat * D2R) * Math.sin(lng * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lng * D2R)];
            if (Math.abs(p[0] * sun[0] + p[1] * sun[1] + p[2] * sun[2]) > 0.01) throw new Error('punto ' + lng + ',' + lat);
        }
        // el anillo cierra y el polo incluido es el opuesto al Sol (Sol al norte -> noche en el polo sur)
        return poly[0][0] === poly[poly.length - 1][0] && poly[poly.length - 3][1] === -89.9;
    });
    check('espacio: proyeccion con camara cenital: el centro cae en el centro, el horizonte tiene el radio del globo, y N queda arriba', () => {
        const cam = { lng: 10, lat: 20, bearing: 0, pitch: 0, roll: 0, worldSize: 512 * Math.pow(2, 0.5), width: 1000, height: 600 };
        const pr = SP.makeProjector(cam);
        const c = pr.surface(10, 20);
        const n = pr.surface(10, 30);
        const e = pr.surface(20, 20);
        return Math.abs(c[0] - 500) < 1e-6 && Math.abs(c[1] - 300) < 1e-6 && n[1] < c[1] && e[0] > c[0];
    });
    check('espacio: rumbo 90 grados pone el este arriba', () => {
        const pr = SP.makeProjector({ lng: 0, lat: 0, bearing: 90, pitch: 0, roll: 0, worldSize: 512, width: 800, height: 800 });
        const c = pr.surface(0, 0); const e = pr.surface(10, 0);
        return e[1] < c[1] - 1 && Math.abs(e[0] - c[0]) < 1e-6;
    });
    check('espacio: la camara mira hacia el centro de la Tierra: se ven los puntos del cielo al otro lado (z<0), no los de detras de la camara', () => {
        const pr = SP.makeProjector({ lng: 0, lat: 0, bearing: 0, pitch: 0, roll: 0, worldSize: 512, width: 800, height: 600 });
        const behindGlobe = pr.infinity(0, 0, -1);
        return behindGlobe !== null && Math.abs(behindGlobe[0] - 400) < 1e-6 && Math.abs(behindGlobe[1] - 300) < 1e-6 && pr.infinity(0, 0, 1) === null;
    });
}

/* ---------------- Integridad de lo vendorizado y del catalogo ---------------- */
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
check('vendor: astronomy-engine es identico al paquete npm instalado', () => {
    return sha(path.join(root, 'vendor/astronomy-engine/astronomy.browser.min.js')) === sha(path.join(root, 'node_modules/astronomy-engine/astronomy.browser.min.js'));
});

const starsFile = path.join(root, 'data/sky/stars.json');
if (fs.existsSync(starsFile)) {
    const raw = JSON.parse(fs.readFileSync(starsFile, 'utf8'));
    const constelFile = path.join(root, 'data/sky/constellations.json');
    const cat = S.prepareCatalog(raw, fs.existsSync(constelFile) ? JSON.parse(fs.readFileSync(constelFile, 'utf8')) : null);
    const byHip = (hip) => cat.index.get(hip);

    check('catalogo: huella sha256 del manifiesto coincide con stars.json', () => {
        const m = JSON.parse(fs.readFileSync(path.join(root, 'data/sky/manifest.json'), 'utf8'));
        return m.files['stars.json'].sha256 === sha(starsFile);
    });
    check('catalogo: Sirio es la estrella mas brillante y esta donde debe (RA ~101,3 grados, Dec ~-16,7)', () => {
        const i = byHip(32349);
        if (i === undefined) throw new Error('falta HIP 32349');
        const brightest = Array.from(cat.mag).reduce((best, m, k) => (m < cat.mag[best] ? k : best), 0);
        return brightest === i && Math.abs(cat.ra[i] * 180 / Math.PI - 101.29) < 0.05 && Math.abs(cat.dec[i] * 180 / Math.PI + 16.72) < 0.05;
    });
    check('catalogo: Polaris esta a menos de 1 grado del polo en 2026 y Tuban a menos de 1 grado en 2787 a. C.', () => {
        const polaris = byHip(11767); const thuban = byHip(68756);
        if (polaris === undefined || thuban === undefined) throw new Error('faltan Polaris o Tuban');
        const distPole = (jd, idx) => 90 - S.starPositions(cat, new A.AstroTime(jd - 2451545), 0, 0).dec[idx];
        const now = S.calendarToJD({ year: 2026, month: 11, day: 1 }).jd;
        const then = S.calendarToJD({ year: -2786, month: 6, day: 1 }).jd;   // 2787 a. C. en numeracion astronomica
        return distPole(now, polaris) < 1.0 && distPole(then, thuban) < 1.0;
    });
    check('catalogo: todas las estrellas tienen posicion valida y magnitud <= limite', () => {
        for (let i = 0; i < cat.n; i++) {
            if (!(Math.abs(cat.dec[i]) <= Math.PI / 2) || !(cat.ra[i] >= 0 && cat.ra[i] < 2 * Math.PI) || !(cat.mag[i] <= 7)) throw new Error('estrella invalida ' + cat.hip[i]);
        }
        return cat.n > 5000;
    });
}

console.log('\nPASS ' + passes.length);
passes.forEach((p) => console.log('  ok  ' + p));
if (failures.length) {
    console.log('\nFAIL ' + failures.length);
    failures.forEach((f) => console.log('  XX  ' + f));
    process.exit(1);
}
console.log('\nCielo: todo verde.');
