/* stars3d.js - Movimiento ESPACIAL de las estrellas (sin DOM: navegador y Node).
 *
 * Modelo (el unico que se puede afirmar con los datos que hay):
 *   - Cada estrella se mueve en LINEA RECTA y a velocidad constante respecto al Sol (3D: posicion J2000 + velocidad
 *     radial + movimiento propio). El potencial galactico cambia una velocidad tipica en < 1 km/s en 100.000 anos
 *     (desplazamiento < 0,1 pc): por debajo del error de las propias mediciones.
 *   - TIEMPO DE LUZ exacto: la direccion vista en el instante t es la de la posicion que la estrella ocupaba cuando
 *     salio la luz, te + |P(te)|/c = t. Se resuelve por iteracion (el factor de contraccion es v/c ~ 1e-4).
 *   - Brillo: la magnitud sube/baja con la distancia de emision, m = m0 + 5 log10(D / D0) (sin extincion nueva).
 *
 * Lo que NO hace (la interfaz lo dice): paralaje anual, aberracion, deflexion gravitatoria, estrellas variables,
 * novas/supernovas, y estrellas que HOY no estan en el catalogo y no tienen velocidad radial medida.
 *
 * Velocidad radial desconocida: el modelo usa 0 (movimiento solo tangencial, identico al antiguo de sky.js) y esa
 * estrella queda MARCADA; uncertaintyRad() da cuanto puede moverse su posicion si la radial real es +/- sigma.
 * Estrella sin paralaje: sin distancia no hay 3D; se mueve por su movimiento propio angular (rv = 0) y no cambia de brillo.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosStars3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAS = 4.84813681109536e-9;                 // 1 mas en rad
    const KMS_TO_PCYR = 1.0227121650537077e-6;       // 1 km/s en pc/ano (ano juliano; pc = 648000/pi ua)
    const C_PC_YR = 299792.458 * KMS_TO_PCYR;        // c en pc/ano
    const MAX_ITER = 40;

    /**
     * @param {{n:number, ra:ArrayLike<number>, dec:ArrayLike<number>, pmra:ArrayLike<number>, pmde:ArrayLike<number>, plx:ArrayLike<number>, rv:ArrayLike<number>, vmag:ArrayLike<number>}} cat
     *   ra/dec en rad (J2000.0), pm en mas/ano (pmra YA incluye cos dec), plx en mas (0 = desconocida), rv en km/s (NaN = desconocida).
     */
    function prepare(cat) {
        const n = cat.n;
        const p = {
            n, d0: new Float64Array(n), r: new Float64Array(3 * n), v: new Float64Array(3 * n),
            hasPlx: new Uint8Array(n), rvKnown: new Uint8Array(n), vmag: Float64Array.from(cat.vmag), cat
        };
        for (let i = 0; i < n; i++) {
            const sa = Math.sin(cat.ra[i]); const ca = Math.cos(cat.ra[i]); const sd = Math.sin(cat.dec[i]); const cd = Math.cos(cat.dec[i]);
            const rx = cd * ca; const ry = cd * sa; const rz = sd;
            const has = cat.plx[i] > 0; const d0 = has ? 1000 / cat.plx[i] : 1;      // sin paralaje: escala arbitraria (solo se usa la direccion)
            const known = has && Number.isFinite(cat.rv[i]);
            const mua = cat.pmra[i] * MAS; const mud = cat.pmde[i] * MAS;            // rad/ano
            const vr = known ? cat.rv[i] * KMS_TO_PCYR : 0;
            p.d0[i] = d0; p.hasPlx[i] = has ? 1 : 0; p.rvKnown[i] = known ? 1 : 0;
            p.r[3 * i] = rx * d0; p.r[3 * i + 1] = ry * d0; p.r[3 * i + 2] = rz * d0;
            // v = vr * rhat + d0 * (mu_alpha * e_alpha + mu_delta * e_delta)   (pc/ano)
            p.v[3 * i] = vr * rx + d0 * (mua * -sa + mud * -sd * ca);
            p.v[3 * i + 1] = vr * ry + d0 * (mua * ca + mud * -sd * sa);
            p.v[3 * i + 2] = vr * rz + d0 * (mud * cd);
        }
        return p;
    }

    /**
     * Direccion unitaria (GCRS) de la estrella i vista en el instante t (anos julianos desde J2000.0), con tiempo de luz.
     * Escribe en out[o..o+2] y devuelve la distancia de emision en pc (sin paralaje: d0 = 1, sin tiempo de luz).
     * rvOverride: usar esta radial (km/s) en lugar de la del catalogo (para medir la incertidumbre).
     */
    function directionAt(p, i, t, out, o, rvOverride) {
        const i3 = 3 * i; const d0 = p.d0[i];
        let vx = p.v[i3]; let vy = p.v[i3 + 1]; let vz = p.v[i3 + 2];
        const x0 = p.r[i3]; const y0 = p.r[i3 + 1]; const z0 = p.r[i3 + 2];
        if (rvOverride !== undefined && p.hasPlx[i]) {                 // cambia solo la componente radial
            const ux = x0 / d0; const uy = y0 / d0; const uz = z0 / d0;
            const cur = p.rvKnown[i] ? p.v[i3] * ux + p.v[i3 + 1] * uy + p.v[i3 + 2] * uz : 0;
            const dv = rvOverride * KMS_TO_PCYR - cur;
            vx += dv * ux; vy += dv * uy; vz += dv * uz;
        }
        if (!p.hasPlx[i]) {                                            // direccion con movimiento propio angular lineal
            const x = x0 + vx * t; const y = y0 + vy * t; const z = z0 + vz * t; const nrm = Math.hypot(x, y, z);
            out[o] = x / nrm; out[o + 1] = y / nrm; out[o + 2] = z / nrm; return d0;
        }
        // P(te) = P0 + v (te - te0), con te0 = -d0/c (el instante de emision de la luz que vemos en J2000.0)
        const te0 = -d0 / C_PC_YR;
        let te = t - d0 / C_PC_YR; let x = 0; let y = 0; let z = 0; let dist = d0;
        for (let k = 0; k < MAX_ITER; k++) {
            x = x0 + vx * (te - te0); y = y0 + vy * (te - te0); z = z0 + vz * (te - te0);
            dist = Math.sqrt(x * x + y * y + z * z);
            const next = t - dist / C_PC_YR;
            if (Math.abs(next - te) < 1e-13) { te = next; break; }
            te = next;
        }
        out[o] = x / dist; out[o + 1] = y / dist; out[o + 2] = z / dist;
        return dist;
    }

    /** Magnitud aparente a la distancia de emision dist (pc). Sin paralaje no cambia. */
    function magnitude(p, i, dist) { return p.hasPlx[i] ? p.vmag[i] + 5 * Math.log10(dist / p.d0[i]) : p.vmag[i]; }

    /** Todas las estrellas en el instante t: vectores unitarios (3n) y magnitudes (n). */
    function observe(p, t, outDir, outMag) {
        const dir = outDir || new Float64Array(3 * p.n); const mag = outMag || new Float64Array(p.n);
        for (let i = 0; i < p.n; i++) mag[i] = magnitude(p, i, directionAt(p, i, t, dir, 3 * i));
        return { dir, mag };
    }

    /**
     * Cuanto puede alejarse la posicion de la estrella i (rad) si su radial desconocida fuera +/- sigma (km/s):
     * la mitad del angulo entre las dos direcciones. 0 si la radial es conocida o no hay paralaje.
     */
    function uncertaintyRad(p, i, t, sigmaKms) {
        if (p.rvKnown[i] || !p.hasPlx[i]) return 0;
        const a = new Float64Array(3); const b = new Float64Array(3);
        directionAt(p, i, t, a, 0, sigmaKms); directionAt(p, i, t, b, 0, -sigmaKms);
        const cx = a[1] * b[2] - a[2] * b[1]; const cy = a[2] * b[0] - a[0] * b[2]; const cz = a[0] * b[1] - a[1] * b[0];
        return 0.5 * Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    }

    /** Une stars.json + stars3d.json en el catalogo que espera prepare(). Las extra se anaden al final. */
    function buildCatalogue(stars, s3d) {
        const DEG = Math.PI / 180;
        const rows = stars.stars.map((s) => ({ hip: s[0], ra: s[1], dec: s[2], pmra: s[3], pmde: s[4], plx: s[5], vmag: s[6], bv: s[7], con: s[8], rv: s3d.rv[s[0]] }));
        for (const s of s3d.extra) rows.push({ hip: s[0], ra: s[1], dec: s[2], pmra: s[3], pmde: s[4], plx: s[5], vmag: s[6], bv: s[7], con: s[8], rv: s[9], extra: true });
        const n = rows.length;
        const cat = { n, hip: new Int32Array(n), ra: new Float64Array(n), dec: new Float64Array(n), pmra: new Float64Array(n), pmde: new Float64Array(n), plx: new Float64Array(n), rv: new Float64Array(n), vmag: new Float64Array(n), bv: new Float64Array(n), con: new Array(n), extra: new Uint8Array(n) };
        rows.forEach((r, i) => {
            cat.hip[i] = r.hip; cat.ra[i] = r.ra * DEG; cat.dec[i] = r.dec * DEG; cat.pmra[i] = r.pmra; cat.pmde[i] = r.pmde; cat.plx[i] = r.plx;
            cat.rv[i] = Number.isFinite(r.rv) ? r.rv : NaN; cat.vmag[i] = r.vmag; cat.bv[i] = r.bv === null || r.bv === undefined ? NaN : r.bv; cat.con[i] = r.con; cat.extra[i] = r.extra ? 1 : 0;
        });
        return cat;
    }

    return { prepare, directionAt, magnitude, observe, uncertaintyRad, buildCatalogue, C_PC_YR, KMS_TO_PCYR };
});
