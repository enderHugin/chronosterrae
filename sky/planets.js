/* planets.js - ORIENTACION y FORMA de los planetas (sin DOM: navegador y Node).
 *
 * Que da: el sistema de ejes de cada planeta en el instante pedido (polo norte y meridiano origen segun el informe del Grupo de
 * Trabajo de la IAU sobre coordenadas cartograficas y elementos de rotacion, 2015, tal como lo implementa astronomy-engine),
 * el punto sub-observador visto desde la Tierra (con tiempo de luz) y los radios ecuatorial y polar. Todo se valida contra JPL
 * Horizons en scripts/check-rotation.js (data/sky/validation-rotation.json).
 *
 * Que NO da: texturas ni relieve (no hay datos cargados), rotacion diferencial (la atmosfera de los gigantes gira a distinta
 * velocidad que el sistema de referencia: aqui se da el sistema de referencia, no las nubes), ni nutaciones de los planetas
 * mas alla de las que trae el informe de la IAU.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'));
    else root.ChronosPlanets = factory(root.Astronomy);
})(typeof self !== 'undefined' ? self : this, function (Astronomy) {
    'use strict';

    const DEG = Math.PI / 180;
    const C_KM_S = 299792.458; const AU_KM = 149597870.7;
    const J2000_JD = 2451545.0;
    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    // Radios (km) y sentido de las longitudes: los que usa JPL Horizons para cada cuerpo ("Target radii" y "{West|East}-longitude
    // positive" de su cabecera, consultados el 2026-11-06). scripts/check-rotation.js comprueba que coinciden con
    // data/sky/validation-rotation.json. Oeste positivo para los de rotacion directa, este positivo para Venus y Urano (retrogrados).
    const SHAPE = {
        Mercury: { a: 2440.53, c: 2438.26, lon: 'west' },
        Venus: { a: 6051.8, c: 6051.8, lon: 'east' },
        Mars: { a: 3396.19, c: 3376.2, lon: 'west' },
        Jupiter: { a: 71492, c: 66854, lon: 'west' },
        Saturn: { a: 60268, c: 54364, lon: 'west' },
        Uranus: { a: 25559, c: 24973, lon: 'east' },
        Neptune: { a: 24764, c: 24341, lon: 'west' }
    };
    const ids = Object.keys(SHAPE);

    // Tiempo terrestre desde UT. La fase de rotacion de un planeta rapido depende del segundo: 5 s son 0,05 grados en Jupiter. Entre 1972 y
    // hoy se usa ΔT = 32,184 s + (TAI-UTC) con los segundos intercalares de IERS (UT1-UTC < 0,9 s: error < 0,01 grados); fuera de esa ventana, el
    // modelo de astronomy-engine (Espenak & Meeus), que antes de 1972 va bien (~1 s desde 1900) y a futuro solo extrapola.
    const LEAP = [[1972, 1, 10], [1972, 7, 11], [1973, 1, 12], [1974, 1, 13], [1975, 1, 14], [1976, 1, 15], [1977, 1, 16], [1978, 1, 17], [1979, 1, 18], [1980, 1, 19], [1981, 7, 20],
        [1982, 7, 21], [1983, 7, 22], [1985, 7, 23], [1988, 1, 24], [1990, 1, 25], [1991, 1, 26], [1992, 7, 27], [1993, 7, 28], [1994, 7, 29], [1996, 1, 30], [1997, 7, 31], [1999, 1, 32],
        [2006, 1, 33], [2009, 1, 34], [2012, 7, 35], [2015, 7, 36], [2017, 1, 37]].map(([y, m, n]) => [Date.UTC(y, m - 1, 1) / 86400000 + 2440587.5, n]);
    const LEAP_END_JD = Date.UTC(2027, 0, 1) / 86400000 + 2440587.5;      // hasta aqui no se conoce un segundo intercalar posterior
    function deltaTSeconds(jdUT) {
        if (jdUT >= LEAP[0][0] && jdUT < LEAP_END_JD) { let n = LEAP[0][1]; for (const [jd, k] of LEAP) if (jdUT >= jd) n = k; return 32.184 + n; }
        return null;
    }
    /** Instante del motor tal que su TT sea el correcto (ver arriba). */
    function engineTime(jdUT, deltaTOverride) {
        const d = Number.isFinite(deltaTOverride) ? deltaTOverride : deltaTSeconds(jdUT); const t0 = new Astronomy.AstroTime(jdUT - J2000_JD);
        if (d === null) return t0;
        return new Astronomy.AstroTime(jdUT - J2000_JD + (d - (t0.tt - t0.ut) * 86400) / 86400);
    }

    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    const mod360 = (x) => ((x % 360) + 360) % 360;

    function check(id) { if (!SHAPE[id]) throw fail('BAD_BODY', 'sin orientacion para ' + id); }
    // La Luna tiene ejes IAU en el motor pero no esta en SHAPE (SHAPE es lo que se valida contra Horizons y lo que recorren las pruebas): solo se admite en frame().
    function checkFrame(id) { if (id !== 'Moon') check(id); }

    /** Ejes del planeta en el sistema ecuatorial J2000 (EQJ): z = polo norte, x = meridiano origen (en el ecuador), y = z x x. */
    function frame(id, time) {
        checkFrame(id);
        const ax = Astronomy.RotationAxis(Astronomy.Body[id], time);
        const a = ax.ra * 15 * DEG; const d = ax.dec * DEG; const W = ax.spin * DEG;
        const z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
        const n = [-Math.sin(a), Math.cos(a), 0];                 // nodo: ecuador del planeta con el ecuador J2000 (ascension a + 90 grados)
        const m = cross(z, n);
        const x = [Math.cos(W) * n[0] + Math.sin(W) * m[0], Math.cos(W) * n[1] + Math.sin(W) * m[1], Math.cos(W) * n[2] + Math.sin(W) * m[2]];
        const y = [-Math.sin(W) * n[0] + Math.cos(W) * m[0], -Math.sin(W) * n[1] + Math.cos(W) * m[1], -Math.sin(W) * n[2] + Math.cos(W) * m[2]];
        return { x, y, z, raDeg: ax.ra * 15, decDeg: ax.dec, wDeg: mod360(ax.spin) };
    }

    /** Latitud planetografica (la que usa Horizons) desde la planetocentrica, para un elipsoide de revolucion. */
    function graphicLat(latCDeg, id) { const f = SHAPE[id].a / SHAPE[id].c; return Math.atan(f * f * Math.tan(latCDeg * DEG)) / DEG; }

    /**
     * Punto sub-observador visto desde la Tierra (centro) en el instante UT dado, con tiempo de luz (la orientacion es la del
     * instante en que salio la luz). Devuelve longitudes en el sentido positivo de la IAU para ese cuerpo y latitudes planetografica
     * y planetocentrica, el angulo de posicion del polo norte (desde el norte celeste hacia el este) y el diametro angular.
     * opts.deltaT: fuerza ΔT (s) en vez del modelo (las pruebas lo usan para reproducir la convencion de Horizons en el futuro).
     */
    function subObserver(id, jdUT, opts) {
        check(id);
        const dT = opts && opts.deltaT;                                        // segundos; solo para reproducir la convencion de otra fuente (ver las pruebas)
        const t = engineTime(jdUT, dT);
        const g = Astronomy.GeoVector(Astronomy.Body[id], t, false);          // Tierra -> planeta (posicion retardada), au, EQJ
        const geo = [g.x, g.y, g.z]; const distKm = Math.hypot(geo[0], geo[1], geo[2]) * AU_KM;
        const tau = distKm / C_KM_S / 86400;                                   // dias
        const f = frame(id, engineTime(jdUT - tau, dT));
        const obs = norm([-geo[0], -geo[1], -geo[2]]);                         // planeta -> Tierra
        const lonE = mod360(Math.atan2(dot(obs, f.y), dot(obs, f.x)) / DEG);
        const latC = Math.asin(dot(obs, f.z)) / DEG;
        // Angulo de posicion del polo: en el plano del cielo (perpendicular a la visual), medido desde el norte celeste hacia el este
        // Horizons da este angulo respecto al norte celeste de la FECHA (ecuador verdadero), no del J2000: se pasan a ese sistema
        const R = Astronomy.Rotation_EQJ_EQD(t).rot;
        const rot = (v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
        const los = norm(rot(geo)); const zD = rot(f.z);                       // hacia el planeta; polo del planeta
        const north = [0, 0, 1]; const east = norm(cross(north, los));
        const nCel = cross(los, east);                                          // norte celeste proyectado
        const pole = [zD[0] - dot(zD, los) * los[0], zD[1] - dot(zD, los) * los[1], zD[2] - dot(zD, los) * los[2]];
        const np = mod360(Math.atan2(dot(pole, east), dot(pole, nCel)) / DEG);
        return {
            lightTimeDays: tau, distKm,
            lonDeg: SHAPE[id].lon === 'west' ? mod360(-lonE) : lonE,
            latCDeg: latC, latGDeg: graphicLat(latC, id),
            npAngDeg: np, angDiamArcsec: 2 * Math.asin(SHAPE[id].a / distKm) / DEG * 3600
        };
    }

    return { SHAPE, ids, frame, subObserver, graphicLat, engineTime, deltaTSeconds };
});
