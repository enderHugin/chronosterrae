/* prehistory.js - Cielo ESTELAR de la prehistoria (+/-100.000 anos), solo estrellas. Sin DOM.
 *
 * Une tres piezas ya verificadas por separado:
 *   - sky/stars3d.js : posicion espacial de cada estrella (movimiento propio + velocidad radial + tiempo de luz) y brillo.
 *   - sky/ltp.js     : precesion de largo plazo (Vondrak, Capitaine y Wallace 2011; +/-200.000 anos), polo y origen CIO.
 *   - Angulo de rotacion terrestre ERA (definicion IAU 2000/2006): lo unico que liga el reloj (UT) con el cielo.
 *
 * Convencion: las ascensiones rectas salen medidas desde el CIO, de modo que el angulo horario es H = ERA + lon - RA.
 * No hay nutacion (es una precesion MEDIA): la nutacion es <~ 20" y no se modela.
 *
 * El reloj es UT. La ERA depende solo de UT: es EXACTA para el instante pedido. Lo unico que usa TT es la epoca de
 * precesion y de movimiento propio; TT - UT (Delta T) se pasa de fuera y, a estas edades, es una extrapolacion
 * teorica: su efecto sobre las estrellas es < 100" por cada ano de error en Delta T (precesion ~50"/ano; se mide en las pruebas).
 * Lo que Delta T NO resuelve aqui es la estacion: sin Sol no se afirma que dia del ano real es el de la fecha proleptica.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./ltp.js'), require('./stars3d.js'));
    else root.ChronosPrehistory = factory(root.ChronosLtp, root.ChronosStars3D);
})(typeof self !== 'undefined' ? self : this, function (Ltp, S3) {
    'use strict';

    const J2000_JD = 2451545.0;
    const WINDOW = { minYear: -100000, maxYear: -2001 };   // el cielo completo (Sol, Luna, planetas) ya cubre desde -2000

    /**
     * @param {{ltpTables:object, cat:object}} o  ltpTables = data/sky/ltp.json .tables; cat = S3.buildCatalogue(stars.json, stars3d.json)
     */
    function create(o) {
        const ltp = Ltp.make(o.ltpTables); const fr = Ltp.makeFrame(ltp, o.ltpTables);
        const prep = S3.prepare(o.cat); const n = prep.n;
        const dir = new Float64Array(3 * n);
        /**
         * @param {number} jdUT      dia juliano UT (proleptico, como el reloj del proyecto)
         * @param {number} dtSeconds TT - UT en segundos
         * @returns {{ra:Float64Array, dec:Float64Array, mag:Float64Array, era:number, epj:number, tYears:number}} ra/dec desde el CIO (rad), era en rad
         */
        function at(jdUT, dtSeconds) {
            const ut1Days = jdUT - J2000_JD; const ttDays = ut1Days + dtSeconds / 86400;
            const tYears = ttDays / 365.25; const epj = 2000 + tYears;
            const mag = new Float64Array(n); const ra = new Float64Array(n); const dec = new Float64Array(n);
            S3.observe(prep, tYears, dir, mag);
            const f = fr.frame(epj);
            for (let i = 0; i < n; i++) { const r = fr.toCIP(f, [dir[3 * i], dir[3 * i + 1], dir[3 * i + 2]]); ra[i] = r.ra; dec[i] = r.dec; }
            return { ra, dec, mag, era: fr.era(ut1Days), epj, tYears };
        }
        /** Posicion (rad) que puede errar la estrella i por su radial desconocida +/- sigma (km/s) en tYears. */
        const uncertainty = (i, tYears, sigmaKms) => S3.uncertaintyRad(prep, i, tYears, sigmaKms);
        return { n, prep, at, uncertainty, frame: fr, ltp };
    }

    return { create, WINDOW };
});
