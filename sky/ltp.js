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


    /* ------------------------------------------------------------------------------------------------
     * Marco del polo: origen NO ROTATORIO (CIO) por transporte paralelo.
     * La serie estandar del localizador s solo vale unos siglos. Pero el origen no rotatorio se define
     * cinematicamente: es la direccion del ecuador que NO gira sobre el polo (CIP) cuando este se mueve, es decir,
     * el TRANSPORTE PARALELO de una direccion a lo largo de la trayectoria del polo sobre la esfera. Se integra por
     * pasos de rotacion minima (Rodrigues), desde J2000.0. Con el polo (n) y este origen (sigma) la ascension recta se
     * mide desde sigma y el angulo horario es H = ERA + lon - RA, sin precesion ni equinoccio de por medio.
     * ---------------------------------------------------------------------------------------------- */
    const sub = (a, p) => [a[0] - p[0], a[1] - p[1], a[2] - p[2]];
    const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    /** Un paso de transporte paralelo: gira sigma (perpendicular a n1) por la rotacion minima n1 -> n2. */
    function transportStep(sigma, n1, n2) {
        const ax = cross(n1, n2); const sinP = Math.hypot(ax[0], ax[1], ax[2]); const cosP = dotv(n1, n2);
        let out;
        if (sinP < 1e-300) out = sigma;
        else {
            const k = scale(ax, 1 / sinP); const kxs = cross(k, sigma); const kd = dotv(k, sigma);
            out = [sigma[0] * cosP + kxs[0] * sinP + k[0] * kd * (1 - cosP), sigma[1] * cosP + kxs[1] * sinP + k[1] * kd * (1 - cosP), sigma[2] * cosP + kxs[2] * sinP + k[2] * kd * (1 - cosP)];
        }
        return unit(sub(out, scale(n2, dotv(out, n2))));     // re-proyecta: perpendicular a n2 y de norma 1
    }
    /** Transporta sigma0 a lo largo de una lista de polos [n0, n1, ...]; devuelve el sigma final. */
    function transportAlong(poles, sigma0) { let s = sigma0; for (let i = 1; i < poles.length; i++) s = transportStep(s, poles[i - 1], poles[i]); return s; }

    /**
     * ltp: el resultado de make(tables). Devuelve { pole, sigma, frame, era }.
     * stepYears: paso de integracion (anos). Los terminos periodicos mas rapidos son de ~15.800 anos: 
     */
    function makeFrame(ltp, tables, stepYears) {
        const h = stepYears || 5;   // error ~ h^2: 0,09" a +/-100.000 anos (medido contra h = 1,25)
        const pole = (epj) => unit(ltp.matrixBias(epj)[2]);       // CIP en el GCRS
        const n0 = pole(2000);
        const sigma0 = unit(sub([1, 0, 0], scale(n0, n0[0])));    // CIO en J2000.0: eje x del GCRS proyectado al ecuador (s = 94 microsegundos de arco, despreciable)
        const nodes = { pos: [sigma0], neg: [sigma0] };           // sigma en 2000 + k h (pos) y 2000 - k h (neg)
        const polesAt = { pos: [n0], neg: [n0] };
        function grow(dir, k) {
            const list = nodes[dir]; const ps = polesAt[dir]; const sign = dir === 'pos' ? 1 : -1;
            while (list.length <= k) { const i = list.length; const n = pole(2000 + sign * i * h); list.push(transportStep(list[i - 1], ps[i - 1], n)); ps.push(n); }
        }
        function sigma(epj) {
            const d = epj - 2000; const dir = d >= 0 ? 'pos' : 'neg'; const k = Math.floor(Math.abs(d) / h);
            grow(dir, k + 1);
            const base = nodes[dir][k]; const nb = polesAt[dir][k];
            return transportStep(base, nb, pole(epj));            // ultimo tramo parcial, hasta la fecha exacta
        }
        /** Ejes del marco celeste del polo en la fecha epj (anos julianos TT): n, sigma, e2 = n x sigma. */
        function frame(epj) { const n = pole(epj); const sg = sigma(epj); return { n, sigma: sg, e2: cross(n, sg) }; }
        /** Angulo de rotacion terrestre (rad) para UT1 = dias desde J2000.0. ERA = 2 pi (f + a + b Tu), f = fraccion de Tu (ERFA era00). */
        function era(ut1Days) {
            const f = ut1Days - Math.trunc(ut1Days); const turns = f + tables.era.a + tables.era.b * ut1Days;
            let v = (turns % 1) * D2PI; if (v < 0) v += D2PI; return v;
        }
        /** Ascension recta (desde el CIO, rad en [0,2pi)) y declinacion (rad) de un vector del GCRS. */
        function toCIP(fr, v) {
            const x = dotv(v, fr.sigma); const y = dotv(v, fr.e2); const z = dotv(v, fr.n); let ra = Math.atan2(y, x); if (ra < 0) ra += D2PI;
            return { ra, dec: Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) };
        }
        return { pole, sigma, frame, era, toCIP };
    }

    /** Aplica la matriz m (filas = ejes) al vector v: v' = m v. */
    const apply = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

    return { make, makeFrame, transportStep, transportAlong, apply, VALID_YEARS: 200000 };
});
