/* space.js - El cielo visto DESDE EL ESPACIO, detras del globo (sin DOM; igual en navegador y en Node).
 *
 * Al alejarse del planeta se ven las estrellas, el Sol, la Luna y los planetas donde estan en ese instante,
 * con la orientacion de la camara del mapa. Aqui solo hay geometria:
 *   - posiciones geocentricas "de la fecha" (precesion + nutacion) de estrellas y cuerpos,
 *   - su direccion en el marco del globo de MapLibre (x = cos(lat) sin(lng), y = sin(lat), z = cos(lat) cos(lng)),
 *   - la proyeccion a pantalla con la MISMA cadena de matrices que MapLibre usa para el globo
 *     (translate(-D) rotZ(roll) rotX(-pitch) rotZ(bearing) translate(-R) rotX(lat) rotY(-lng)),
 *   - el terminador dia/noche.
 *
 * Las estrellas estan "en el infinito" (sin paralaje); la Luna, que esta a ~60 radios terrestres, se proyecta
 * con su distancia real desde la posicion de la camara. Es un modelo, no una observacion.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'), require('./sky.js'));
    else root.ChronosSpace = factory(root.Astronomy, root.ChronosSky);
})(typeof self !== 'undefined' ? self : this, function (Astronomy, ChronosSky) {
    'use strict';

    const DEG = Math.PI / 180;
    const EARTH_RADIUS_AU = 6378.137 / 149597870.7;
    const BODIES = ChronosSky.BODIES;

    /** Ascension recta y declinacion de la FECHA (radianes) de todas las estrellas del catalogo. */
    function starsOfDate(cat, time) {
        const n = cat.n;
        const ra = new Float64Array(n); const dec = new Float64Array(n);
        const dtYears = ((time.tt + ChronosSky.J2000_JD) - cat.epochJD) / 365.25;
        const rot = Astronomy.Rotation_EQJ_EQD(time).rot;
        for (let i = 0; i < n; i++) {
            const sa = Math.sin(cat.ra[i]); const ca = Math.cos(cat.ra[i]); const sd = Math.sin(cat.dec[i]); const cd = Math.cos(cat.dec[i]);
            const pa = cat.pmra[i]; const pd = cat.pmde[i];
            let x = cd * ca + dtYears * (-pa * sa - pd * sd * ca);
            let y = cd * sa + dtYears * (pa * ca - pd * sd * sa);
            let z = sd + dtYears * (pd * cd);
            const norm = Math.sqrt(x * x + y * y + z * z);
            x /= norm; y /= norm; z /= norm;
            const ex = rot[0][0] * x + rot[1][0] * y + rot[2][0] * z;
            const ey = rot[0][1] * x + rot[1][1] * y + rot[2][1] * z;
            const ez = rot[0][2] * x + rot[1][2] * y + rot[2][2] * z;
            let r = Math.atan2(ey, ex); if (r < 0) r += 2 * Math.PI;
            ra[i] = r; dec[i] = Math.asin(Math.max(-1, Math.min(1, ez)));
        }
        return { ra, dec };
    }

    /** Sol, Luna y planetas vistos desde el CENTRO de la Tierra: ra/dec de la fecha (rad), distancia en radios terrestres. */
    function bodiesGeocentric(time) {
        const rot = Astronomy.Rotation_EQJ_EQD(time);
        return BODIES.map((id) => {
            const body = Astronomy.Body[id];
            const v = Astronomy.RotateVector(rot, Astronomy.GeoVector(body, time, true));
            const eq = Astronomy.EquatorFromVector(v);
            const ill = Astronomy.Illumination(body, time);
            const out = { id, ra: eq.ra * 15 * DEG, dec: eq.dec * DEG, distER: eq.dist / EARTH_RADIUS_AU, mag: ill.mag, phaseFraction: ill.phase_fraction };
            if (id === 'Moon') out.phaseAngle = Astronomy.MoonPhase(time);
            return out;
        });
    }

    /** Direccion (marco del globo) de un punto del cielo de la fecha, dado el tiempo sidereo aparente de Greenwich (rad). */
    function modelDirection(raRad, decRad, gastRad, out, offset) {
        const lam = raRad - gastRad;              // longitud este del punto subestelar
        const cd = Math.cos(decRad);
        out[offset] = cd * Math.sin(lam);
        out[offset + 1] = Math.sin(decRad);
        out[offset + 2] = cd * Math.cos(lam);
    }

    /**
     * Camara del globo de MapLibre.
     * @param cam {lng, lat, bearing, pitch, roll, worldSize, fovDeg, width, height}  grados; worldSize = 512 * 2^zoom
     */
    function makeProjector(cam) {
        const lat = cam.lat * DEG; const lng = cam.lng * DEG;
        const bearing = (cam.bearing || 0) * DEG; const pitch = (cam.pitch || 0) * DEG; const roll = (cam.roll || 0) * DEG;
        const fov = (cam.fovDeg || 36.86989764584402) * DEG;
        const f = 1 / Math.tan(fov / 2);
        const W = cam.width; const H = cam.height;
        const Rpx = cam.worldSize / (2 * Math.PI) / Math.cos(lat);          // radio del globo en pixeles
        const Dpx = 0.5 / Math.tan(fov / 2) * H;                            // camara -> centro
        const c1 = Math.cos(-lng); const s1 = Math.sin(-lng);
        const c2 = Math.cos(lat); const s2 = Math.sin(lat);
        const c3 = Math.cos(bearing); const s3 = Math.sin(bearing);
        const c4 = Math.cos(-pitch); const s4 = Math.sin(-pitch);
        const c5 = Math.cos(roll); const s5 = Math.sin(roll);
        // x,y,z -> marco de vista (sin traslaciones); devuelve [x,y,z]
        const rotate = (x, y, z, translate) => {
            let t = x * c1 + z * s1; z = -x * s1 + z * c1; x = t;             // rotY(-lng)
            t = y * c2 - z * s2; z = y * s2 + z * c2; y = t;                  // rotX(lat)
            if (translate) z -= translate.R;                                   // translate(0,0,-R)
            t = x * c3 - y * s3; y = x * s3 + y * c3; x = t;                  // rotZ(bearing)
            t = y * c4 - z * s4; z = y * s4 + z * c4; y = t;                  // rotX(-pitch)
            t = x * c5 - y * s5; y = x * s5 + y * c5; x = t;                  // rotZ(roll)
            if (translate) z -= translate.D;                                   // translate(0,0,-D)
            return [x, y, z];
        };
        const toScreen = (x, y, z) => [W / 2 + f * (H / 2) * x / -z, H / 2 - f * (H / 2) * y / -z];
        return {
            globeRadiusPx: Rpx, cameraDistancePx: Dpx,
            /** Punto de la superficie (lng, lat en grados) -> pantalla. Sirve para contrastar con map.project. */
            surface(lngDeg, latDeg) {
                const la = latDeg * DEG; const lo = lngDeg * DEG;
                const v = rotate(Math.cos(la) * Math.sin(lo) * Rpx, Math.sin(la) * Rpx, Math.cos(la) * Math.cos(lo) * Rpx, { R: Rpx, D: Dpx });
                return v[2] < 0 ? toScreen(v[0], v[1], v[2]) : null;
            },
            /** Direccion al infinito (estrellas, Sol, planetas): [x,y,z] unitario del marco del globo. */
            infinity(x, y, z) {
                const v = rotate(x, y, z, null);
                if (v[2] >= -1e-9) return null;                                // detras de la camara
                const s = toScreen(v[0], v[1], v[2]);
                return [s[0], s[1], -v[2]];
            },
            /** Punto a distancia finita (radios terrestres, marco del globo), p. ej. la Luna. Devuelve {x, y, pxPerER}. */
            near(x, y, z) {
                const v = rotate(x * Rpx, y * Rpx, z * Rpx, { R: Rpx, D: Dpx });
                if (v[2] >= -1e-9) return null;
                const s = toScreen(v[0], v[1], v[2]);
                return { x: s[0], y: s[1], pxPerER: f * (H / 2) * Rpx / -v[2] };
            }
        };
    }

    /**
     * Anillo del lado nocturno como poligono GeoJSON (lng, lat). El terminador es el circulo maximo a 90 grados del Sol:
     * lat(lng) = atan(-cos(lng - lngSol) / tan(decSol)).
     */
    function nightPolygon(sunLatDeg, sunLngDeg) {
        const dec = Math.abs(sunLatDeg) < 0.01 ? (sunLatDeg < 0 ? -0.01 : 0.01) : sunLatDeg;
        const ring = [];
        for (let lng = -180; lng <= 180; lng += 2) {
            const lat = Math.atan(-Math.cos((lng - sunLngDeg) * DEG) / Math.tan(dec * DEG)) / DEG;
            ring.push([lng, Math.round(lat * 1000) / 1000]);
        }
        const pole = dec > 0 ? -89.9 : 89.9;      // el polo que queda en la noche es el opuesto al Sol
        ring.push([180, pole], [-180, pole], ring[0]);
        return { type: 'Polygon', coordinates: [ring] };
    }

    return { starsOfDate, bodiesGeocentric, modelDirection, makeProjector, nightPolygon, EARTH_RADIUS_AU };
});
