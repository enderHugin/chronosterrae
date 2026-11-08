/* glide.js - Salto de tiempo ANIMADO: en vez de poner el reloj en la fecha nueva de golpe, lo hace barrer el tramo.
 *
 * Es PURO (sin DOM): el reloj de pared y el temporizador se inyectan, asi que se prueba entero en Node (scripts/check-glide.js).
 * index.html solo conecta onFrame con clockSet().
 *
 * Que consigue:
 *  - Los sucesos del tramo se ven pasar en orden cronologico (en el sentido en que se movio el tiempo) y a distancias entre si
 *    proporcionales a las de sus fechas: la velocidad es casi constante (perfil trapezoidal: arranque y frenada cortos).
 *  - La luz dia/noche no gira como una peonza: en tramos largos las horas del dia se INTERPOLAN por el camino corto entre la hora de
 *    salida y la de llegada (los dias avanzan enteros), de modo que la fecha cambia y el terminador se desplaza con suavidad.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosGlide = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MIN_SPAN_DAYS = 1 / 24;                // menos de 1 hora: no hace falta animar
    const MAX_SPAN_DAYS = 120 * 365.25;          // mas de 120 años: salto directo (barrer siglos serian cientos de cambios de fronteras)
    const MAX_MS = 3200;
    const RAMP_IN = 0.08;                        // fraccion del tiempo que se tarda en coger velocidad
    const RAMP_OUT = 0.2;                        // y en frenar
    const LINEAR_DAYS = 1.5;                     // hasta este tramo el reloj se interpola tal cual (a lo sumo una vuelta y media de la Tierra)

    /** Duracion (ms) de un barrido de spanDays dias: crece con el logaritmo del tramo (1 h ≈ 0,45 s; 1 dia ≈ 1 s; 10 años ≈ 2,3 s; 100 años ≈ 2,7 s). */
    function durationMs(spanDays) {
        const d = Math.abs(spanDays);
        if (!(d >= MIN_SPAN_DAYS) || d > MAX_SPAN_DAYS) return 0;
        return Math.round(Math.min(MAX_MS, 450 + 380 * Math.log10(Math.max(1, d * 24))));
    }

    /** Fraccion recorrida del tramo (0..1) en el instante normalizado u (0..1): trapecio de velocidad, monotona y continua. */
    function profile(u) {
        const x = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0)); const a = RAMP_IN; const b = RAMP_OUT;
        const vmax = 1 / (1 - (a + b) / 2);
        if (x < a) return vmax * x * x / (2 * a);
        if (x <= 1 - b) return vmax * (a / 2 + (x - a));
        return 1 - vmax * (1 - x) * (1 - x) / (2 * b);
    }

    /**
     * Instante (dia juliano) del barrido jd0 -> jd1 cuando ya se ha recorrido la fraccion p.
     * Tramos largos: los dias avanzan enteros y la fraccion de dia (la hora) se interpola por el camino corto; asi el terminador no da vueltas.
     */
    function jdAt(jd0, jd1, p) {
        const d = jd1 - jd0; const q = Math.max(0, Math.min(1, p));
        if (q >= 1) return jd1;
        if (Math.abs(d) <= LINEAR_DAYS) return jd0 + d * q;
        const k = Math.round(d); const r = d - k;          // k dias enteros + r (|r| <= 0,5) de diferencia de hora
        return jd0 + Math.round(k * q) + r * q;
    }

    /**
     * @param o.now        () -> ms           (por defecto Date.now)
     * @param o.schedule   (fn) -> handle      (por defecto setTimeout de 16 ms)
     * @param o.cancel     (handle)
     * @param o.onFrame    (jd, info)          cada fotograma; info = { u, p, from, to, dir, spanDays }
     * @param o.onDone     (info)              al llegar o al cancelarse: { from, to, at, canceled }
     */
    function createGlide(o) {
        const now = (o && o.now) || (() => Date.now());
        const schedule = (o && o.schedule) || ((fn) => setTimeout(fn, 16));
        const cancelT = (o && o.cancel) || ((h) => clearTimeout(h));
        const onFrame = (o && o.onFrame) || (() => {}); const onDone = (o && o.onDone) || (() => {});
        let g = null; let timer = null;

        function step() {
            timer = null; if (!g) return;
            const u = Math.min(1, Math.max(0, (now() - g.t0) / g.ms));
            let jd = u >= 1 ? g.to : jdAt(g.from, g.to, profile(u));
            // La interpolacion de la hora puede retroceder entre saltos de dia o pasarse un poco del destino: el reloj solo va en un sentido y nunca rebasa la meta
            if (u < 1) jd = g.dir > 0 ? Math.min(g.to, Math.max(jd, g.last)) : Math.max(g.to, Math.min(jd, g.last));
            g.last = jd;
            onFrame(jd, { u, p: u >= 1 ? 1 : profile(u), from: g.from, to: g.to, dir: g.dir, spanDays: g.span });
            if (u >= 1) { const d = g; g = null; onDone({ from: d.from, to: d.to, at: d.to, canceled: false }); } else if (g) timer = schedule(step);
        }
        return {
            /** Empieza un barrido; false si el tramo no merece animacion (el llamador salta directamente). Si ya habia uno, parte de donde iba. */
            start(from, to, opt) {
                if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
                const span = to - from; const ms = opt && opt.ms !== undefined ? opt.ms : durationMs(span);
                if (!(ms > 0) || span === 0) return false;
                if (g) this.cancel(true);
                g = { from, to, ms, t0: now(), dir: span > 0 ? 1 : -1, span: Math.abs(span), last: from };
                timer = schedule(step); return true;
            },
            /** Para el barrido en el instante actual (sin llegar). quiet = no avisa a onDone (se va a empezar otro enseguida). */
            cancel(quiet) {
                if (!g) return null;
                const d = g; g = null; if (timer !== null) { cancelT(timer); timer = null; }
                const info = { from: d.from, to: d.to, at: d.last, canceled: true };
                if (!quiet) onDone(info); return info;
            },
            active: () => g !== null,
            target: () => (g ? g.to : NaN),
            current: () => (g ? g.last : NaN),
            info: () => (g ? { from: g.from, to: g.to, dir: g.dir, spanDays: g.span, ms: g.ms } : null)
        };
    }

    return { MIN_SPAN_DAYS, MAX_SPAN_DAYS, MAX_MS, RAMP_IN, RAMP_OUT, LINEAR_DAYS, durationMs, profile, jdAt, createGlide };
});
