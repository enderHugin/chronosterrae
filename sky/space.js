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
     * Direccion del marco del globo -> direccion ecuatorial J2000 (la de las coordenadas ICRS de los catalogos y de la textura de la Via Lactea).
     * Inversa exacta de modelDirection + la rotacion J2000 -> fecha de starsOfDate (sin movimiento propio: es para fondos difusos).
     * rot = Astronomy.Rotation_EQJ_EQD(time).rot; gastRad como en modelDirection.
     */
    function j2000FromModel(mx, my, mz, gastRad, rot, out) {
        const dec = Math.asin(Math.max(-1, Math.min(1, my))); const ra = Math.atan2(mx, mz) + gastRad;    // ra = lam + gast; lam = atan2(sin, cos)
        const cd = Math.cos(dec); const ex = cd * Math.cos(ra); const ey = cd * Math.sin(ra); const ez = Math.sin(dec);
        out[0] = rot[0][0] * ex + rot[0][1] * ey + rot[0][2] * ez;
        out[1] = rot[1][0] * ex + rot[1][1] * ey + rot[1][2] * ez;
        out[2] = rot[2][0] * ex + rot[2][1] * ey + rot[2][2] * ez;
        return out;
    }

    /**
     * Lo mismo para el marco de la prehistoria (sky/ltp.js): ra desde el CIO y ERA en lugar del tiempo sidereo.
     * fr = { n, sigma, e2 } (ejes del CIP y el CIO en el GCRS, de Ltp.makeFrame(...).frame(epj)). Devuelve el vector GCRS (= J2000 con la precision de un fondo difuso).
     */
    function j2000FromModelCio(mx, my, mz, eraRad, fr, out) {
        const dec = Math.asin(Math.max(-1, Math.min(1, my))); const ra = Math.atan2(mx, mz) + eraRad;
        const cd = Math.cos(dec); const a = cd * Math.cos(ra); const b = cd * Math.sin(ra); const c = Math.sin(dec);
        out[0] = a * fr.sigma[0] + b * fr.e2[0] + c * fr.n[0];
        out[1] = a * fr.sigma[1] + b * fr.e2[1] + c * fr.n[1];
        out[2] = a * fr.sigma[2] + b * fr.e2[2] + c * fr.n[2];
        return out;
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
            /** Inversa de infinity: pixel de pantalla -> direccion unitaria en el marco del globo (siempre existe: es el rayo que pasa por ese pixel). */
            unproject(sx, sy, out) {
                let x = (sx - W / 2) / (f * (H / 2)); let y = (H / 2 - sy) / (f * (H / 2)); let z = -1;
                const n = Math.sqrt(x * x + y * y + 1); x /= n; y /= n; z /= n;
                let t = x * c5 + y * s5; y = -x * s5 + y * c5; x = t;             // rotZ(roll)^-1
                t = y * c4 + z * s4; z = -y * s4 + z * c4; y = t;                 // rotX(-pitch)^-1
                t = x * c3 + y * s3; y = -x * s3 + y * c3; x = t;                 // rotZ(bearing)^-1
                t = y * c2 + z * s2; z = -y * s2 + z * c2; y = t;                 // rotX(lat)^-1
                t = x * c1 - z * s1; z = x * s1 + z * c1; x = t;                  // rotY(-lng)^-1
                out[0] = x; out[1] = y; out[2] = z;
                return out;
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

    /**
     * Un punto J2000 (ra, dec en radianes, sin movimiento propio: galaxias, nebulosas, lo que llega de Wikidata) -> ra, dec de la fecha.
     * rot = Astronomy.Rotation_EQJ_EQD(time).rot, la misma rotacion que starsOfDate.
     */
    function pointOfDate(raRad, decRad, rot) {
        const cd = Math.cos(decRad); const x = cd * Math.cos(raRad); const y = cd * Math.sin(raRad); const z = Math.sin(decRad);
        const ex = rot[0][0] * x + rot[1][0] * y + rot[2][0] * z;
        const ey = rot[0][1] * x + rot[1][1] * y + rot[2][1] * z;
        const ez = rot[0][2] * x + rot[1][2] * y + rot[2][2] * z;
        return { ra: Math.atan2(ey, ex), dec: Math.asin(Math.max(-1, Math.min(1, ez))) };
    }
    /** Lo mismo en el marco de la prehistoria (inversa de j2000FromModelCio): ra desde el CIO, para usar con el ERA. fr = { n, sigma, e2 }. */
    function pointOfDateCio(raRad, decRad, fr) {
        const cd = Math.cos(decRad); const v = [cd * Math.cos(raRad), cd * Math.sin(raRad), Math.sin(decRad)];
        const dot = (u) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        return { ra: Math.atan2(dot(fr.e2), dot(fr.sigma)), dec: Math.asin(Math.max(-1, Math.min(1, dot(fr.n)))) };
    }

    /**
     * Centro del globo (lng, lat en grados) que pone la direccion s (unitaria, marco del globo) en el pixel (sx, sy), con la orientacion de
     * cam (bearing, pitch, roll, fovDeg, width, height; el zoom no influye en lo que esta en el infinito). Es la inversa exacta de infinity: con
     * lng = lat = 0, unproject da el rayo del pixel w sin las dos rotaciones del centro, y se resuelve rotX(lat) rotY(-lng) s = w (dos soluciones;
     * vale la mas cercana a cam.lng, cam.lat con |lat| <= maxLatDeg). null si ninguna (el pixel pide una direccion que ningun centro alcanza).
     */
    function aimAt(s, cam, sx, sy, maxLatDeg) {
        const maxLat = (maxLatDeg === undefined ? 85 : maxLatDeg) * DEG;
        const w = makeProjector(Object.assign({}, cam, { lng: 0, lat: 0, worldSize: 512 })).unproject(sx, sy, [0, 0, 0]);
        const rho = Math.hypot(s[0], s[2]); if (rho < 1e-12 || Math.abs(w[0]) > rho) return null;
        const phi = Math.atan2(s[2], s[0]); const b = Math.acos(Math.max(-1, Math.min(1, w[0] / rho)));
        const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
        const lat0 = (cam.lat || 0) * DEG; const lng0 = (cam.lng || 0) * DEG;
        let best = null;
        [b, -b].forEach((u) => {
            const L = wrap(u - phi); const z1 = rho * Math.sin(phi + L);
            const la = wrap(Math.atan2(w[2], w[1]) - Math.atan2(z1, s[1]));
            if (Math.abs(la) > maxLat) return;
            // distancia angular desde el centro de ahora: se gira lo menos posible
            const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(lat0) + Math.cos(la) * Math.cos(lat0) * Math.cos(L - lng0))));
            if (!best || d < best.d) best = { lng: L / DEG, lat: la / DEG, d };
        });
        return best ? { lng: best.lng, lat: best.lat } : null;
    }
    /** Disco de la Tierra en pantalla (centro y radio de la silueta, px) con la camara cam a esa latitud y zoom. */
    function diskAt(cam, latDeg, zoom) {
        const pr = makeProjector(Object.assign({}, cam, { lng: 0, lat: latDeg, worldSize: 512 * Math.pow(2, zoom) }));
        const c = pr.near(0, 0, 0); const R = pr.globeRadiusPx; const D = pr.cameraDistancePx;
        return c ? { x: c.x, y: c.y, r: D / Math.sqrt(Math.pow((D + R) / R, 2) - 1) } : null;
    }
    /**
     * Girar el globo para ver algo del cielo (una estrella, una constelacion) AL LADO de la Tierra, no detras: centro y zoom con los que la
     * direccion s cae en mitad del hueco entre el borde del disco y el de la pantalla, a la derecha o izquierda (pantalla apaisada) o arriba o
     * abajo (vertical). Si con el zoom de ahora la Tierra no deja hueco, se aleja (de 0,25 en 0,25, hasta opts.minZoom). La latitud cambia el
     * tamaño del globo de MapLibre (radio / cos(lat)), asi que se itera: disco con la latitud supuesta -> centro -> latitud nueva.
     * cam: { lng, lat, zoom, bearing, pitch, roll, fovDeg, width, height }. opts: { minZoom, margin (px), minGap (px), inset: { top, bottom,
     * left, right } (lo que tapan las barras de la web), avoid: [{ x0, y0, x1, y1 }] (recuadros abiertos: el punto no puede caer debajo),
     * sides: orden de los lados a probar }. Si con avoid no hay sitio, se repite sin el. Devuelve { lng, lat, zoom, x, y } (x, y: donde
     * queda s en pantalla) o null.
     */
    function aimBeside(s, cam, opts) {
        const o = Object.assign({ minZoom: 0, margin: 16, minGap: 72, avoid: [] }, opts || {});
        const W = cam.width; const H = cam.height;
        const ins = Object.assign({ top: o.margin, bottom: o.margin, left: o.margin, right: o.margin }, o.inset || {});
        const sides = o.sides || (W >= H ? ['r', 'l', 't', 'b'] : ['t', 'b', 'r', 'l']);
        const free = (x, y) => o.avoid.every((r) => x < r.x0 - 24 || x > r.x1 + 24 || y < r.y0 - 24 || y > r.y1 + 24);
        for (let zoom = cam.zoom; zoom >= o.minZoom - 1e-9; zoom -= 0.25) {
            for (const side of sides) {
                let lat = cam.lat || 0;
                for (let it = 0; it < 6; it++) {
                    const d = diskAt(cam, lat, zoom); if (!d) break;
                    let a, b2;      // el hueco [a, b2] a lo largo del eje de ese lado
                    if (side === 'r') { a = d.x + d.r; b2 = W - ins.right; } else if (side === 'l') { a = ins.left; b2 = d.x - d.r; }
                    else if (side === 't') { a = ins.top; b2 = d.y - d.r; } else { a = d.y + d.r; b2 = H - ins.bottom; }
                    if (b2 - a < o.minGap) break;
                    const m = (a + b2) / 2; const px = side === 'r' || side === 'l' ? m : d.x;
                    const py = side === 'r' || side === 'l' ? Math.min(H - ins.bottom - o.minGap / 2, Math.max(ins.top + o.minGap / 2, d.y)) : m;
                    if (!free(px, py)) break;
                    const at = aimAt(s, cam, px, py);
                    if (!at) break;
                    if (Math.abs(at.lat - lat) < 0.2) return { lng: at.lng, lat: at.lat, zoom, x: px, y: py };
                    lat = at.lat;
                }
            }
        }
        return o.avoid.length ? aimBeside(s, cam, Object.assign({}, o, { avoid: [] })) : null;
    }

    return { starsOfDate, bodiesGeocentric, modelDirection, j2000FromModel, j2000FromModelCio, pointOfDate, pointOfDateCio, makeProjector, nightPolygon, aimAt, aimBeside, diskAt, EARTH_RADIUS_AU };
});
