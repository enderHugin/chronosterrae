/* ltp.js - Precesion de largo plazo (Vondrak, Capitaine y Wallace 2011, A&A 534, A22; corrigendum A&A 541, C1),
 * valida para +/-200.000 anos desde J2000.0. Es un port de eraLtpequ, eraLtpecl, eraLtp y eraLtpb de ERFA
 * (BSD-3, derivado de SOFA del IAU); las TABLAS no estan aqui: vienen de data/sky/ltp.json, que se extrae por
 * programa del texto de ERFA (scripts/build-ltp.js), sin teclear coeficientes.
 *
 * Es precesion MEDIA: sin nutacion. Precision segun ERFA: igual que IAU 2006 en J2000.0, unos segundos de arco en
 * el periodo historico, y unas decimas de grado en los extremos de +/-200.000 anos.
 * Sin dependencias; funciona en el navegador y en Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosLtp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const D2PI = 6.283185307179586476925287;

    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = (a) => { const w = Math.hypot(a[0], a[1], a[2]); return w ? [a[0] / w, a[1] / w, a[2] / w] : [0, 0, 0]; };

    /** tables: el campo `tables` de data/sky/ltp.json. */
    function make(tables) {
        const { xypol, xyper, pqpol, pqper, bias_arcsec: bias, eps0_arcsec: eps0Arcsec, obl06_arcsec: obl06, das2r } = tables;
        const eps0 = eps0Arcsec * das2r;

        function series(pol, per, t) {        // x, y en segundos de arco
            let x = 0; let y = 0; const w = D2PI * t;
            for (const p of per) { const a = w / p[0]; const s = Math.sin(a); const c = Math.cos(a); x += c * p[1] + s * p[3]; y += c * p[2] + s * p[4]; }
            let wt = 1;
            for (let i = 0; i < pol[0].length; i++) { x += pol[0][i] * wt; y += pol[1][i] * wt; wt *= t; }
            return [x, y];
        }
        /** Polo del ecuador de la fecha, en coordenadas J2000 (eraLtpequ). epj: epoca juliana (TT) en anos. */
        function equatorPole(epj) {
            const [x0, y0] = series(xypol, xyper, (epj - 2000) / 100); const x = x0 * das2r; const y = y0 * das2r;
            const w = 1 - x * x - y * y; return [x, y, w < 0 ? 0 : Math.sqrt(w)];
        }
        /** Polo de la eclíptica de la fecha, en coordenadas J2000 (eraLtpecl). */
        function eclipticPole(epj) {
            const [p0, q0] = series(pqpol, pqper, (epj - 2000) / 100); const p = p0 * das2r; const q = q0 * das2r;
            let w = 1 - p * p - q * q; w = w < 0 ? 0 : Math.sqrt(w);
            const s = Math.sin(eps0); const c = Math.cos(eps0);
            return [p, -q * c - w * s, -q * s + w * c];
        }
        /** Matriz de precesion J2000 -> ecuador y equinoccio medios de la fecha (eraLtp), sin sesgo de marco. Filas = ejes. */
        function matrix(epj) {
            const peqr = equatorPole(epj); const pecl = eclipticPole(epj);
            const eqx = unit(cross(peqr, pecl)); const mid = cross(peqr, eqx);
            return [eqx, mid, peqr];
        }
        /** Igual que matrix pero con el sesgo del marco ICRS (eraLtpb). */
        function matrixBias(epj) {
            const rp = matrix(epj); const dx = bias.dx * das2r; const de = bias.de * das2r; const dr = bias.dr * das2r;
            return rp.map((r) => [r[0] - r[1] * dr + r[2] * dx, r[0] * dr + r[1] + r[2] * de, -r[0] * dx - r[1] * de + r[2]]);
        }
        /** Oblicuidad media IAU 2006 (eraObl06), en radianes, para contraste. */
        function obliquityIAU2006(epj) { const t = (epj - 2000) / 100; let v = 0; for (let i = obl06.length - 1; i >= 0; i--) v = v * t + obl06[i]; return v * das2r; }
        return { equatorPole, eclipticPole, matrix, matrixBias, obliquityIAU2006 };
    }

    /** Aplica la matriz m (filas = ejes) al vector v: v' = m v. */
    const apply = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

    return { make, apply, VALID_YEARS: 200000 };
});
