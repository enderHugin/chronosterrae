/* solar.js - El SISTEMA SOLAR visto desde donde se quiera (sin DOM: navegador y Node).
 *
 * Que da: posiciones del Sol, la Tierra, la Luna y los planetas en un instante (marco ECLIPTICO de J2000, km, origen en el
 * centro del Sol), trayectorias reales de una revolucion, una camara en perspectiva centrada en cualquier cuerpo, la fase
 * iluminada vista desde la camara y la exactitud medida contra JPL Horizons (data/sky/validation-helio.json).
 *
 * Fuente del calculo: astronomy-engine (MIT; VSOP87 para planetas, serie de la Luna). Posiciones GEOMETRICAS en el instante
 * pedido (sin tiempo de luz, que a estas escalas es de minutos u horas y no cambia lo que se ve). Marte y los gigantes: el
 * motor da el planeta; Horizons, al validar, da el baricentro de su sistema (la diferencia se declara).
 *
 * Que NO hace (la interfaz lo dice): orientacion de los ejes de rotacion, relieve y texturas, anillos de Saturno, lunas de otros
 * planetas, el Sol como esfera con granulacion. Los radios son los de referencia de NASA (ficha NSSDCA) y IAU 2015 (Sol).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'));
    else root.ChronosSolar = factory(root.Astronomy);
})(typeof self !== 'undefined' ? self : this, function (Astronomy) {
    'use strict';

    const AU_KM = 149597870.7;
    const C_KM_S = 299792.458;
    const J2000_JD = 2451545.0;
    // Misma ventana que el cielo (ChronosSky.WINDOW): la que se ha medido contra Horizons.
    const WINDOW = { minYear: -2000, maxYear: 3000 };

    // Radios en km. Sol: valor nominal de la Resolucion B3 de la IAU 2015. Resto: mitad del diametro de la ficha de planetas de la
    // NASA (https://nssdc.gsfc.nasa.gov/planetary/factsheet/, actualizada el 18-03-2025). El color es ILUSTRATIVO (no hay texturas).
    const BODIES = [
        { id: 'Sun', radiusKm: 695700, color: '#ffd27a', emissive: true, source: 'IAU 2015 B3 (nominal)' },
        { id: 'Mercury', radiusKm: 2439.5, color: '#a89c8f', source: 'NASA NSSDCA' },
        { id: 'Venus', radiusKm: 6052, color: '#e3c88c', source: 'NASA NSSDCA' },
        { id: 'Earth', radiusKm: 6378, color: '#4f86c6', source: 'NASA NSSDCA' },
        { id: 'Moon', radiusKm: 1737.5, color: '#b9b6ae', source: 'NASA NSSDCA', parent: 'Earth' },
        { id: 'Mars', radiusKm: 3396, color: '#c1613c', source: 'NASA NSSDCA' },
        { id: 'Jupiter', radiusKm: 71492, color: '#cfa57d', source: 'NASA NSSDCA' },
        { id: 'Saturn', radiusKm: 60268, color: '#d9c38f', source: 'NASA NSSDCA' },
        { id: 'Uranus', radiusKm: 25559, color: '#9fd4dc', source: 'NASA NSSDCA' },
        { id: 'Neptune', radiusKm: 24764, color: '#4b6fd6', source: 'NASA NSSDCA' }
    ];
    const byId = Object.fromEntries(BODIES.map((b) => [b.id, b]));
    const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    const MOON_PERIOD_DAYS = 27.321661;       // mes sidereo medio: solo decide cuanto trayecto se dibuja, no la posicion

    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    /** Instante del motor desde un dia juliano UT. Rechaza fechas fuera de la ventana validada (OUT_OF_WINDOW). */
    function timeFromJD(jdUT) {
        if (!Number.isFinite(jdUT)) throw fail('BAD_TIME', 'instante no numerico');
        const year = 2000 + (jdUT - J2000_JD) / 365.25;
        if (year < WINDOW.minYear || year > WINDOW.maxYear) throw fail('OUT_OF_WINDOW', 'sin efemeride validada fuera de ' + WINDOW.minYear + '..' + WINDOW.maxYear);
        return new Astronomy.AstroTime(jdUT - J2000_JD);
    }

    // Equatorial J2000 (EQJ) -> ecliptico J2000 (la matriz es la del motor).
    const ECL = Astronomy.Rotation_EQJ_ECL().rot;
    const toEcl = (x, y, z) => [
        ECL[0][0] * x + ECL[1][0] * y + ECL[2][0] * z,
        ECL[0][1] * x + ECL[1][1] * y + ECL[2][1] * z,
        ECL[0][2] * x + ECL[1][2] * y + ECL[2][2] * z
    ];

    function helio(id, time) {
        if (id === 'Sun') return [0, 0, 0];
        if (id === 'Moon') {
            const e = Astronomy.HelioVector(Astronomy.Body.Earth, time); const m = Astronomy.GeoVector('Moon', time, false);
            const p = toEcl(e.x + m.x, e.y + m.y, e.z + m.z); return [p[0] * AU_KM, p[1] * AU_KM, p[2] * AU_KM];
        }
        if (!PLANETS.includes(id)) throw fail('BAD_BODY', 'cuerpo desconocido: ' + id);
        const v = Astronomy.HelioVector(Astronomy.Body[id], time);
        const p = toEcl(v.x, v.y, v.z); return [p[0] * AU_KM, p[1] * AU_KM, p[2] * AU_KM];
    }

    /** Posiciones (km, ecliptico J2000, centro del Sol) de todos los cuerpos en el instante. */
    function positions(jdUT) {
        const time = timeFromJD(jdUT);
        const out = {};
        for (const b of BODIES) out[b.id] = helio(b.id, time);
        return out;
    }

    /**
     * Trayectoria real de una revolucion centrada en la fecha (n puntos): planetas respecto al Sol; la Luna respecto a la Tierra.
     * Devuelve { points: [[x,y,z],...], relativeTo, spanDays }.
     */
    function trail(id, jdUT, n = 240) {
        const moon = id === 'Moon';
        if (!moon && !PLANETS.includes(id)) throw fail('BAD_BODY', 'sin trayectoria para ' + id);
        const period = moon ? MOON_PERIOD_DAYS : Astronomy.PlanetOrbitalPeriod(id);
        const points = [];
        for (let k = 0; k <= n; k++) {
            const t = new Astronomy.AstroTime(jdUT - J2000_JD + (k / n - 0.5) * period);
            if (moon) { const m = Astronomy.GeoVector('Moon', t, false); const p = toEcl(m.x, m.y, m.z); points.push([p[0] * AU_KM, p[1] * AU_KM, p[2] * AU_KM]); }
            else points.push(helio(id, t));
        }
        return { points, relativeTo: moon ? 'Earth' : 'Sun', spanDays: period };
    }

    /* ---------------------------------------------------------------- */
    /* Camara                                                            */
    /* ---------------------------------------------------------------- */
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

    /**
     * Camara en perspectiva que mira a `target` (km) desde `distance` km, con yaw/pitch (rad) respecto al plano de la ecliptica.
     * pitch > 0 mira desde el norte de la ecliptica. width/height en px; fovDeg vertical.
     */
    function makeCamera({ target, yaw = 0, pitch = 0.4, eyeDir = null, up = null, distance, fovDeg = 40, width, height }) {
        // Orientacion: o bien yaw/pitch (arriba = polo de la ecliptica), o bien una base explicita: eyeDir (unitario, del cuerpo hacia la
        // camara) y up (hacia donde queda "arriba" en pantalla; se ortogonaliza). La base es lo que usa el mapa de la Tierra.
        let dir;
        if (eyeDir) dir = norm(eyeDir);
        else { const cp = Math.cos(pitch); dir = [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch)]; }
        const eye = [target[0] + distance * dir[0], target[1] + distance * dir[1], target[2] + distance * dir[2]];
        const f = [-dir[0], -dir[1], -dir[2]];
        const r = norm(cross(f, up || [0, 0, 1]));
        const u = cross(r, f);
        const fpx = (height / 2) / Math.tan(fovDeg * Math.PI / 360);
        return {
            eye, f, r, u, fpx, width, height,
            /** Punto (km) -> [x, y, profundidad km] en pantalla, o null si esta detras de la camara. */
            project(p) {
                const d = sub(p, eye); const z = dot(d, f);
                if (z <= distance * 1e-9) return null;
                return [width / 2 + fpx * dot(d, r) / z, height / 2 - fpx * dot(d, u) / z, z];
            },
            /** Radio aparente en px de una esfera de radius km a profundidad z km (aproximacion de lejos: R / z). */
            radiusPx(radiusKm, z) { return fpx * radiusKm / z; },
            /** Radio del disco en px de una esfera con centro en p: usa el radio angular exacto asin(R / distancia). Infinity si la camara esta dentro. */
            discPx(p, radiusKm) {
                const dist = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
                return dist <= radiusKm ? Infinity : fpx * Math.tan(Math.asin(radiusKm / dist));
            },
            /** Componentes de un vector direccion en la base de la camara: [derecha, arriba, hacia el observador]. */
            basis(v) { return [dot(v, r), dot(v, u), -dot(v, f)]; }
        };
    }

    /**
     * Iluminacion de un cuerpo vista desde la camara. Devuelve { fraction, front, angle }: fraction = parte iluminada del disco
     * (0..1), front = componente del Sol hacia el observador (-1..1; terminador = elipse de semieje menor |front| * radio),
     * angle = direccion en pantalla (rad, y hacia ABAJO) hacia donde esta el Sol.
     */
    function lighting(cam, bodyPos, sunPos) {
        const s = norm(sub(sunPos, bodyPos));
        const b = cam.basis(s);
        return { fraction: (1 + b[2]) / 2, front: b[2], angle: Math.atan2(-b[1], b[0]) };
    }

    /* ---------------------------------------------------------------- */
    /* La Tierra: el mapa dentro de la escena                              */
    /* ---------------------------------------------------------------- */
    // El mapa (globo de MapLibre) vive en su propio marco: x hacia el este del meridiano 0, y hacia el polo norte, z hacia (lng 0, lat 0)
    // (ver ChronosSpace.modelDirection). Para dibujar la Tierra del mapa en medio del sistema solar hay que pasar del marco ecliptico J2000
    // al del globo en el instante pedido: ecliptico -> ecuador medio de la fecha (precesion) -> giro del tiempo sidereo aparente (GAST).
    const DEG = Math.PI / 180;
    const T_ECL_EQJ = Astronomy.Rotation_ECL_EQJ();

    /** Matriz M (filas) tal que v_globo = M * v_ecliptico, y el tiempo sidereo aparente de Greenwich (rad). */
    function earthFrame(jdUT) {
        const time = timeFromJD(jdUT);
        const rot = Astronomy.CombineRotation(T_ECL_EQJ, Astronomy.Rotation_EQJ_EQD(time));
        const gast = Astronomy.SiderealTime(time) * 15 * DEG;
        const sg = Math.sin(gast); const cg = Math.cos(gast);
        const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => {
            const w = Astronomy.RotateVector(rot, new Astronomy.Vector(e[0], e[1], e[2], time));
            return [w.y * cg - w.x * sg, w.z, w.x * cg + w.y * sg];            // misma cuenta que ChronosSpace.modelDirection
        });
        const M = [[cols[0][0], cols[1][0], cols[2][0]], [cols[0][1], cols[1][1], cols[2][1]], [cols[0][2], cols[1][2], cols[2][2]]];
        return { M, gast };
    }
    const mulM = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
    const mulMt = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
    /** Vector del marco ecliptico al del globo y al reves (M es una rotacion: la inversa es la traspuesta). */
    const eclToGlobe = (frame, v) => mulM(frame.M, v);
    const globeToEcl = (frame, v) => mulMt(frame.M, v);

    /**
     * Orientacion del mapa (lng, lat, bearing en grados; pitch 0) -> base en el marco del globo: dir = hacia donde esta la camara
     * (el punto central del mapa visto desde el centro de la Tierra) y up = lo que queda arriba en pantalla.
     * Arriba en pantalla = norte local girado `bearing` hacia el este.
     */
    function mapBasis(lngDeg, latDeg, bearingDeg) {
        const lo = lngDeg * DEG; const la = latDeg * DEG; const b = bearingDeg * DEG;
        const dir = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
        const north = [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)];
        const east = [Math.cos(lo), 0, -Math.sin(lo)];
        return { dir, up: [north[0] * Math.cos(b) + east[0] * Math.sin(b), north[1] * Math.cos(b) + east[1] * Math.sin(b), north[2] * Math.cos(b) + east[2] * Math.sin(b)] };
    }
    /** Inversa de mapBasis: base en el marco del globo -> {lng, lat, bearing} (grados; bearing en (-180, 180]). */
    function mapFromBasis(dir, up) {
        const d = norm(dir);
        const la = Math.asin(clampUnit(d[1])); const lo = Math.atan2(d[0], d[2]);
        const north = [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)];
        const east = [Math.cos(lo), 0, -Math.sin(lo)];
        return { lng: lo / DEG, lat: la / DEG, bearing: Math.atan2(dot(up, east), dot(up, north)) / DEG };
    }
    const clampUnit = (v) => Math.max(-1, Math.min(1, v));

    /**
     * El globo de MapLibre como camara en perspectiva (la misma cuenta que ChronosSpace.makeProjector): el centro del mapa esta a
     * Dpx de la camara y el centro de la Tierra a Dpx + Rpx, con Rpx = 512 * 2^zoom / (2 pi) / cos(lat). Devuelve la distancia de la camara al
     * centro de la Tierra en radios terrestres (dER) y el radio en pantalla del contorno de la Tierra (silPx).
     */
    function globe({ zoom, latDeg, width, height, fovDeg = 36.86989764584402 }) {
        const half = Math.tan(fovDeg * DEG / 2);
        const Dpx = 0.5 / half * height;
        const Rpx = 512 * Math.pow(2, zoom) / (2 * Math.PI) / Math.cos(latDeg * DEG);
        const dER = 1 + Dpx / Rpx;
        return { Rpx, Dpx, dER, silPx: (height / 2 / half) / Math.sqrt(dER * dER - 1) };
    }
    /** Zoom del mapa que da esa distancia (radios terrestres) al centro de la Tierra: inversa de globe(). */
    function zoomForDistance({ dER, latDeg, height, fovDeg = 36.86989764584402 }) {
        const Dpx = 0.5 / Math.tan(fovDeg * DEG / 2) * height;
        const Rpx = Dpx / (dER - 1);
        return Math.log2(Rpx * 2 * Math.PI * Math.cos(latDeg * DEG) / 512);
    }

    /* ---------------------------------------------------------------- */
    /* Exactitud medida                                                  */
    /* ---------------------------------------------------------------- */
    function bandOf(year) { return year > 2200 ? 'despues de 2200' : year >= 1700 ? '1700-2200' : year >= 0 ? '0-1699' : 'antes de 0'; }

    /**
     * Error maximo medido (km) del cuerpo en la franja de esa epoca, a partir del informe de validate-helio.js.
     * Devuelve null si el informe no trae ese dato (no se inventa).
     */
    function accuracy(report, id, year) {
        if (!report || !report.summary || !report.summary[id]) return null;
        const band = bandOf(year); const km = report.summary[id][band];
        if (!Number.isFinite(km)) return null;
        const barycenter = id !== 'Moon' && ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(id);
        return { km, band, barycenter };
    }

    const lightMinutes = (km) => km / C_KM_S / 60;
    /** Periodo (dias) usado solo para decidir cuanto trayecto se dibuja. */
    const periodDays = (id) => (id === 'Moon' ? MOON_PERIOD_DAYS : Astronomy.PlanetOrbitalPeriod(id));
    /** Direccion ecuatorial J2000 (x, y, z) -> ecliptica J2000, para dibujar las estrellas en el mismo marco que los cuerpos. */
    const eclFromEq = (x, y, z) => toEcl(x, y, z);

    return { BODIES, PLANETS, byId, WINDOW, AU_KM, positions, trail, timeFromJD, makeCamera, lighting, accuracy, bandOf, lightMinutes, periodDays, eclFromEq,
        earthFrame, eclToGlobe, globeToEcl, mapBasis, mapFromBasis, globe, zoomForDistance };
});
