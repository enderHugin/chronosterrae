/* Cuanto del lienzo ocupa la esfera (el resto es cielo). Puro, sin DOM, para poder probarlo.
 *
 * La Tierra se ve como un disco de centro (cx, cy) y radio r en pixeles sobre un lienzo de w x h. `diskCoverage` da la fraccion del AREA del lienzo
 * que cae dentro del disco (1 = todo esfera, 0 = todo cielo). Se integra por columnas (el disco recortado por el lienzo no tiene formula simple
 * cuando corta los cuatro lados) y con 512 columnas el error es < 0,1 %. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSphere = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const fail = (code, msg) => Object.assign(new Error(msg), { code });

    function diskCoverage(cx, cy, r, w, h, columns = 512) {
        if (![cx, cy, r, w, h].every(Number.isFinite)) throw fail('BAD_INPUT', 'disco o lienzo con valores no numericos');
        if (w <= 0 || h <= 0) throw fail('BAD_CANVAS', 'el lienzo no tiene area');
        if (r <= 0) return 0;
        const dx = w / columns; let area = 0;
        for (let i = 0; i < columns; i++) {
            const x = (i + 0.5) * dx - cx;
            if (Math.abs(x) >= r) continue;
            const half = Math.sqrt(r * r - x * x);
            const lo = Math.max(0, cy - half); const hi = Math.min(h, cy + half);
            if (hi > lo) area += (hi - lo) * dx;
        }
        return Math.min(1, area / (w * h));
    }

    /** Radio en pixeles del contorno de la esfera vista desde la camara (perspectiva): tangente desde el ojo. D = distancia camara->superficie, R = radio, ambos en px. */
    function silhouetteRadiusPx(cameraDistancePx, globeRadiusPx) {
        if (!(cameraDistancePx > 0) || !(globeRadiusPx > 0)) throw fail('BAD_GEOMETRY', 'distancia o radio no positivos');
        return cameraDistancePx / Math.sqrt(Math.pow((cameraDistancePx + globeRadiusPx) / globeRadiusPx, 2) - 1);
    }

    return { diskCoverage, silhouetteRadiusPx };
});
