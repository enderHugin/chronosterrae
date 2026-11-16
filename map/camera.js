/* camera.js - Giro del globo CON INERCIA hasta un punto: centrar en un suceso (lista de sucesos, rueda de la leyenda, doble clic) y
 * recorrer los resultados del buscador.
 *
 * El creador, 2026-11-16: «que el globo se centre en el evento cuando clicado en la lista, no de golpe sino elegantemente con una animación
 * que tenga inercia, tal y como me gustaría que girara también con los resultados de búsqueda».
 *
 * Es PURO (sin DOM ni MapLibre), asi que se prueba entero en Node (scripts/check-camera.js). index.html lo conecta con map.easeTo: la curva
 * de easing es la de aqui y todos los giros llevan el mismo easeId, para que encadenar uno tras otro no dispare 'moveend' en medio (cada
 * 'moveend' pone a trabajar fronteras, sucesos y leyenda, y el giro se veria a saltos).
 *
 * Que es «inercia» aqui:
 *  - El globo pesa: arranca con decision pero sin tiron, coge velocidad en el primer tercio y despues frena despacio hasta pararse sin
 *    brusquedad (al llegar, velocidad Y aceleracion nulas). Curva: polinomio de grado 4 con e(0)=0, e(1)=1, e'(1)=0, e''(1)=0 y e'(0)=m0.
 *    Su velocidad es e'(t) = (1-t)^2 ((12-4 m0) t + m0): con m0 = 0, maxima en t = 1/3.
 *  - Si se pide otro destino a mitad de giro (pasar por la lista del buscador con las flechas), NO se para para volver a arrancar: sale con
 *    la velocidad que llevaba, la parte que va hacia el nuevo destino (m0). Si el nuevo destino queda detras, se pasa un poco y vuelve, como
 *    una rueda pesada.
 *  - Dura mas cuanto mas lejos, en pantallas (lo que se ve pasar) y en grados (lo que gira la Tierra): de 0,7 s a 2,4 s.
 * Sin zoom: «el centrado en el mapa no debe incluir zoom» (el creador, 2026-11-12). Con «reducir movimiento» del sistema no se usa (salto).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosCamera = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MIN_MS = 700;                  // el giro mas corto (un vecino en pantalla)
    const MAX_MS = 2400;                 // el mas largo (las antipodas, o muchas pantallas de distancia con zoom)
    const PER_SCREEN_MS = 450;           // por cada duplicacion de la distancia en pantallas
    const PER_HALF_TURN_MS = 450;        // por girar media vuelta
    const RETARGET_MIN_MS = 300;         // un cambio de destino a mitad de giro nunca dura menos
    const M0_MAX = 4;                    // por encima, la curva se pasaria del destino
    const M0_MIN = -2;                   // hacia atras: se pasa ~9 % y vuelve; mas, seria un latigazo
    const SAMPLE_MS = 48;                // la velocidad se mide entre dos posiciones separadas al menos esto
    const RAD = Math.PI / 180;

    /** Diferencia de longitudes por el camino corto, en (-180, 180]. */
    function wrapLng(d) { const x = ((d % 360) + 540) % 360 - 180; return x === -180 ? 180 : x; }
    /** Grados de arco entre dos puntos [lng, lat] (circulo maximo). */
    function angleDeg(a, b) {
        const p1 = a[1] * RAD; const p2 = b[1] * RAD; const dl = wrapLng(b[0] - a[0]) * RAD;
        const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / RAD;
    }
    /** Desplazamiento de a a b en grados de arco locales: [este, norte] (la longitud encoge con el coseno de la latitud). */
    function metricDelta(a, b) {
        const lat = (a[1] + b[1]) / 2;
        return [wrapLng(b[0] - a[0]) * Math.cos(lat * RAD), b[1] - a[1]];
    }
    /** Pixeles de pantalla por grado de arco en el centro de la vista: MapLibre, globo y Mercator (tesela de 512 px). */
    function pxPerDegree(zoom, lat) { return 512 * Math.pow(2, zoom) / 360 / Math.max(0.05, Math.cos(lat * RAD)); }

    /** Punto a la fraccion u del camino corto entre a y b (circulo maximo): el globo, entre dos elementos de la rueda. */
    function lerp(a, b, u) {
        const t = Math.max(0, Math.min(1, u));
        const p1 = a[1] * RAD; const l1 = a[0] * RAD; const p2 = b[1] * RAD; const l2 = b[0] * RAD;
        const A = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)]; const B = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
        const d = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
        if (d < 1e-9) return [a[0], a[1]];
        const k1 = Math.sin((1 - t) * d) / Math.sin(d); const k2 = Math.sin(t * d) / Math.sin(d);
        const x = k1 * A[0] + k2 * B[0]; const y = k1 * A[1] + k2 * B[1]; const z = k1 * A[2] + k2 * B[2];
        return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
    }

    /** Duracion (ms) de un giro de angDeg grados, con pxPerDeg pixeles por grado y una vista de diag pixeles de diagonal. */
    function durationMs(angDeg, pxPerDeg, diag) {
        if (!(angDeg > 0)) return 0;
        const screens = (angDeg * (pxPerDeg > 0 ? pxPerDeg : 0)) / Math.max(1, diag || 0);
        const ms = MIN_MS + PER_SCREEN_MS * Math.log2(1 + screens) + PER_HALF_TURN_MS * Math.min(1, angDeg / 180);
        return Math.round(Math.min(MAX_MS, ms));
    }

    /** Curva del giro (fraccion del camino segun la fraccion del tiempo) que sale con pendiente m0. */
    function easing(m0) {
        const s = Number.isFinite(m0) ? m0 : 0;
        const a = 3 - s; const b = 3 * s - 8; const c = 6 - 3 * s;
        return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (((a * t + b) * t + c) * t + s) * t);
    }
    /** Su pendiente (velocidad relativa) en t. */
    function slope(m0, t) { const u = 1 - t; return u * u * ((12 - 4 * m0) * t + m0); }

    /**
     * Velocidad actual del centro de la vista, [este, norte] en grados de arco por ms, a partir de sus ultimas posiciones
     * ({ t, lng, lat }, de la mas antigua a la mas reciente). null si no hay al menos dos.
     */
    function velocity(samples) {
        if (!samples || samples.length < 2) return null;
        const L = samples[samples.length - 1];
        let S = samples[0];
        for (let i = samples.length - 2; i >= 0; i--) { if (L.t - samples[i].t >= SAMPLE_MS) { S = samples[i]; break; } }
        const dt = L.t - S.t; if (!(dt > 0)) return null;
        const d = metricDelta([S.lng, S.lat], [L.lng, L.lat]);
        return [d[0] / dt, d[1] / dt];
    }

    /**
     * Plan de un giro de `from` a `to` ([lng, lat]). opt: { zoom, diag (px), v (velocidad actual, de velocity(), o null si esta quieto) }.
     * Devuelve { ms, m0 } o null si ya esta alli. Con velocidad, m0 hace que el giro nuevo salga a la misma velocidad hacia el destino que
     * la que llevaba el anterior; si con esa velocidad se pasaria (m0 > 4), se acorta el giro (frena antes) en vez de pasarse.
     */
    function plan(from, to, opt) {
        const o = opt || {};
        const ang = angleDeg(from, to);
        if (!(ang > 1e-6)) return null;
        let ms = durationMs(ang, pxPerDegree(o.zoom || 0, from[1]), o.diag);
        let m0 = 0;
        const v = o.v;
        if (v && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
            const d = metricDelta(from, to); const dist2 = d[0] * d[0] + d[1] * d[1];
            const along = v[0] * d[0] + v[1] * d[1];            // velocidad hacia el destino x distancia (grados^2 / ms)
            if (dist2 > 0) {
                m0 = along * ms / dist2;
                if (m0 > M0_MAX) { ms = Math.max(RETARGET_MIN_MS, Math.round(M0_MAX * dist2 / along)); m0 = Math.min(M0_MAX, along * ms / dist2); }
                m0 = Math.max(M0_MIN, m0);
            }
        }
        return { ms, m0 };
    }

    return { MIN_MS, MAX_MS, RETARGET_MIN_MS, M0_MAX, M0_MIN, wrapLng, angleDeg, metricDelta, pxPerDegree, lerp, durationMs, easing, slope, velocity, plan };
});
