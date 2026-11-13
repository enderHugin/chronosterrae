#!/usr/bin/env node
// Pruebas de map/glide.js (salto de tiempo animado) y de las ventanas de barrido de sky/timed.js. Sin red, con reloj y temporizador falsos.
'use strict';
const G = require('../map/glide.js');
const T = require('../sky/timed.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };

/** Reloj de pared y temporizador falsos: `run(ms)` avanza de 16 en 16 ms ejecutando lo programado. */
function fake() {
    let now = 1000; let q = null; let seq = 1;
    return {
        now: () => now, schedule: (fn) => { q = { fn, h: seq++ }; return q.h; }, cancel: (h) => { if (q && q.h === h) q = null; },
        run(ms) { const end = now + ms; while (q && now < end) { now += 16; const f = q.fn; q = null; f(); } },
        pending: () => q !== null
    };
}
function make(opt) {
    const c = fake(); const frames = []; const done = [];
    const g = G.createGlide({ now: c.now, schedule: c.schedule, cancel: c.cancel, onFrame: (jd, i) => frames.push({ jd, t: c.now(), ...i }), onDone: (i) => done.push(i) });
    return { c, g, frames, done };
}
const JD0 = 2451545.25;

/* ---------------------------- duracion ---------------------------- */
check('durationMs: 0 por debajo de 1 hora y por encima de 120 años (salto directo)', () => G.durationMs(1 / 48) === 0 && G.durationMs(0) === 0 && G.durationMs(121 * 365.25) === 0 && G.durationMs(NaN) === 0);
check('durationMs: crece con el tramo, sin pasar de 3,2 s', () => { let prev = 0; for (const d of [1 / 24, 0.25, 1, 7, 30, 365, 3652, 36525, 43000]) { const m = G.durationMs(d); if (m < prev || m > G.MAX_MS) return d + ':' + m; prev = m; } return true; });
check('durationMs: 10 años tarda entre 2 y 3 s; 1 dia entre 0,6 y 1,4 s; es simetrica', () => { const a = G.durationMs(3652.5); const b = G.durationMs(1); return a >= 2000 && a <= 3000 && b >= 600 && b <= 1400 && G.durationMs(-3652.5) === a ? true : a + ' ' + b; });

/* ---------------------------- perfil de velocidad ---------------------------- */
check('profile: empieza en 0, acaba en 1 y se sale del rango sin romperse', () => G.profile(0) === 0 && Math.abs(G.profile(1) - 1) < 1e-12 && G.profile(-5) === 0 && Math.abs(G.profile(9) - 1) < 1e-12 && G.profile(NaN) === 0);
check('profile: monotona y continua (ningun salto de mas de 0,01 entre milesimas)', () => { let prev = 0; for (let i = 1; i <= 1000; i++) { const p = G.profile(i / 1000); if (p < prev || p - prev > 0.01) return i; prev = p; } return true; });
check('profile: velocidad CONSTANTE en el tramo central (las fechas se reparten en proporcion al tiempo)', () => {
    const a = G.RAMP_IN; const b = G.RAMP_OUT; const v = 1 / (1 - (a + b) / 2);
    for (const [x, y] of [[0.1, 0.3], [0.3, 0.5], [0.5, 0.79]]) { const dv = (G.profile(y) - G.profile(x)) / (y - x); if (Math.abs(dv - v) > 1e-9) return x + ':' + dv; }
    return true;
});
check('profile: arranque y frenada suaves (velocidad al principio y al final menor que la central)', () => { const mid = (G.profile(0.4) - G.profile(0.3)) / 0.1; return (G.profile(0.01) / 0.01) < mid && ((1 - G.profile(0.99)) / 0.01) < mid; });

/* ---------------------------- interpolacion de fecha y hora ---------------------------- */
check('jdAt: extremos exactos (tramo corto, largo y hacia atras)', () => [[JD0, JD0 + 0.3], [JD0, JD0 + 3650.75], [JD0 + 3650, JD0 - 12.4]].every(([a, b]) => G.jdAt(a, b, 0) === a && G.jdAt(a, b, 1) === b));
check('jdAt: tramo de hasta 1,5 dias se interpola tal cual (la Tierra gira de verdad)', () => Math.abs(G.jdAt(JD0, JD0 + 1, 0.5) - (JD0 + 0.5)) < 1e-12 && Math.abs(G.jdAt(JD0, JD0 + 1.4, 0.25) - (JD0 + 0.35)) < 1e-12);
check('jdAt: tramo largo -> los dias avanzan enteros y la hora se interpola por el camino corto (sin peonza)', () => {
    const to = JD0 + 3650.75;          // 3651 dias menos 0,25: la hora retrocede 6 h por el camino corto
    for (let i = 1; i < 100; i++) {
        const p = i / 100; const jd = G.jdAt(JD0, to, p); const phase = jd - JD0 - Math.round(jd - JD0 - (-0.25 * p));
        if (Math.abs(phase - (-0.25 * p)) > 1e-9) return p + ':' + phase;
    }
    return true;
});
check('jdAt: la hora nunca da mas de media vuelta entre salida y llegada (camino corto, tambien hacia atras)', () => {
    const to = JD0 - 400.9;           // -401 + 0,1
    for (let i = 1; i < 100; i++) { const p = i / 100; const jd = G.jdAt(JD0, to, p); const frac = (jd - JD0) - Math.round(jd - JD0); if (Math.abs(frac) > 0.5 + 1e-9) return p; }
    return true;
});

/* ---------------------------- el barrido ---------------------------- */
check('start: false si no merece animacion (menos de 1 h, igual, NaN, mas de 120 años) y no deja nada programado', () => {
    const { g, c } = make();
    return g.start(JD0, JD0 + 1 / 48) === false && g.start(JD0, JD0) === false && g.start(NaN, JD0) === false && g.start(JD0, JD0 + 121 * 365.25) === false && !g.active() && !c.pending();
});
check('barrido adelante de 10 años: fotogramas crecientes, el ultimo es EXACTAMENTE el destino y onDone llega una sola vez', () => {
    const { g, c, frames, done } = make(); const to = JD0 + 3652.5;
    if (!g.start(JD0, to)) return 'no empezo'; c.run(5000);
    const last = frames[frames.length - 1];
    for (let i = 1; i < frames.length; i++) if (frames[i].jd < frames[i - 1].jd) return 'retrocede en ' + i;
    return last.jd === to && last.u === 1 && done.length === 1 && done[0].canceled === false && done[0].to === to && !g.active() && frames.length > 60 ? true : JSON.stringify({ last, done, n: frames.length });
});
check('barrido hacia atras: fotogramas decrecientes y llega exacto', () => {
    const { g, c, frames, done } = make(); const to = JD0 - 3652.5;
    g.start(JD0, to); c.run(5000);
    for (let i = 1; i < frames.length; i++) if (frames[i].jd > frames[i - 1].jd) return 'avanza en ' + i;
    return frames[frames.length - 1].jd === to && done.length === 1 && frames[0].dir === -1 ? true : JSON.stringify(done);
});
check('la interpolacion de la hora SOLA retrocederia (por eso el barrido recorta): sin recorte seria no monotona, con recorte no', () => {
    const to = JD0 + 5.7;             // k = 6, r = -0,3: entre saltos de dia la hora retrocede
    let raw = false; let prev = -Infinity; for (let i = 0; i <= 200; i++) { const jd = G.jdAt(JD0, to, G.profile(i / 200)); if (jd < prev) raw = true; prev = jd; }
    const { g, c, frames } = make(); g.start(JD0, to, { ms: 1000 }); c.run(2000);
    let mono = true; for (let i = 1; i < frames.length; i++) if (frames[i].jd < frames[i - 1].jd) mono = false;
    return raw === true && mono === true ? true : JSON.stringify({ raw, mono });
});
check('el barrido nunca rebasa la meta ni el origen (con diferencia de hora negativa, adelante y atras)', () => {
    for (const to of [JD0 + 5.7, JD0 + 3650.75, JD0 - 5.7, JD0 - 3650.75, JD0 + 400.1, JD0 - 400.1]) {
        const { g, c, frames } = make(); g.start(JD0, to); c.run(6000);
        const lo = Math.min(JD0, to); const hi = Math.max(JD0, to);
        if (frames.some((f) => f.jd < lo || f.jd > hi)) return 'se sale en ' + (to - JD0);
    }
    return true;
});
check('orden y proporcion: sucesos a 30, 50 y 70 % del tramo se cruzan en ese orden y con tiempos proporcionales a sus distancias', () => {
    const { g, c, frames } = make(); const span = 3652.5; g.start(JD0, JD0 + span); c.run(5000);
    const when = (f) => frames.find((x) => x.jd >= JD0 + span * f).t;
    const t30 = when(0.3); const t50 = when(0.5); const t70 = when(0.7);
    const r = (t70 - t50) / (t50 - t30);
    return t30 < t50 && t50 < t70 && Math.abs(r - 1) < 0.15 ? true : 'r=' + r;
});
check('hacia atras, el orden cronologico es el inverso (primero el mas reciente)', () => {
    const { g, c, frames } = make(); const span = 3652.5; g.start(JD0, JD0 - span); c.run(5000);
    const when = (f) => frames.find((x) => x.jd <= JD0 - span * f).t;
    return when(0.3) < when(0.5) && when(0.5) < when(0.7);
});
check('cancelar a mitad: para en el instante actual, avisa con canceled, y no llegan mas fotogramas', () => {
    const { g, c, frames, done } = make(); g.start(JD0, JD0 + 3652.5); c.run(800);
    const n = frames.length; const info = g.cancel(); c.run(3000);
    return info && info.canceled === true && info.at === frames[n - 1].jd && frames.length === n && done.length === 1 && done[0].canceled === true && !g.active() && !c.pending() && g.cancel() === null ? true : JSON.stringify({ info, n, after: frames.length });
});
check('empezar otro barrido con uno en marcha: el primero se cancela en silencio y el segundo parte de donde se dio la orden', () => {
    const { g, c, frames, done } = make(); g.start(JD0, JD0 + 3652.5); c.run(600);
    const from = frames[frames.length - 1].jd; g.start(from, from + 3652.5); c.run(5000);
    return done.length === 1 && done[0].canceled === false && done[0].from === from && frames[frames.length - 1].jd === from + 3652.5 ? true : JSON.stringify(done);
});
check('target/current/info reflejan el barrido en marcha y quedan vacios al acabar', () => {
    const { g, c } = make(); g.start(JD0, JD0 + 100); c.run(100);
    const a = g.target() === JD0 + 100 && g.info().dir === 1 && g.info().spanDays === 100 && g.current() >= JD0; c.run(5000);
    return a && Number.isNaN(g.target()) && g.info() === null ? true : 'fallo';
});
check('la duracion se respeta: 10 años acaban a los ~2,3 s (no antes, no mucho despues)', () => {
    const { g, c, frames } = make(); g.start(JD0, JD0 + 3652.5); c.run(6000);
    const ms = frames[frames.length - 1].t - 1000; return ms >= G.durationMs(3652.5) - 1 && ms <= G.durationMs(3652.5) + 32 ? true : ms;
});

/* ---------------------------- ventana de sucesos durante el barrido ---------------------------- */
check('windowForGlide: dentro del tramo (nunca mayor que el), cada suceso se queda el 40 % del recorrido', () => {
    const w = T.windowForGlide(3652.5, 1);
    return w.flowing === true && Math.abs(w.pastDays - 0.4 * 3652.5) < 1e-9 && w.pastDays < 3652.5 && w.futureDays < w.pastDays && w.futureDays >= 1 ? true : JSON.stringify(w);
});
check('windowForGlide: hacia atras la ventana larga queda del lado contrario', () => { const w = T.windowForGlide(3652.5, -1); return w.futureDays > w.pastDays && w.flowing === true; });
check('windowForGlide: escala con el tramo (100 años -> unos 40 años; 30 dias -> unos 12) y un tramo corto usa la ventana normal', () => {
    const a = T.windowForGlide(36525, 1).pastDays / 365.25; const b = T.windowForGlide(30, 1).pastDays; const c = T.windowForGlide(3, 1);
    return Math.abs(a - 40) < 0.01 && Math.abs(b - 12) < 1e-9 && c.flowing === false && c.pastDays === T.REST_PAST_DAYS && c.futureDays === 0 ? true : [a, b, JSON.stringify(c)].join(' ');
});
check('shrinkWindow: f=1 la deja igual; f=0 vuelve a la normal; en medio es monotona y nunca mayor que la original', () => {
    const w = T.windowForGlide(3652.5, 1); const one = T.shrinkWindow(w, 1); const zero = T.shrinkWindow(w, 0);
    let prev = Infinity; for (let i = 10; i >= 0; i--) { const p = T.shrinkWindow(w, i / 10).pastDays; if (p > prev + 1e-9 || p > w.pastDays + 1e-9) return i; prev = p; }
    return one.pastDays === w.pastDays && one.futureDays === T.REST_FUTURE_DAYS && zero.flowing === false && zero.pastDays === T.REST_PAST_DAYS ? true : JSON.stringify({ one, zero });
});
check('shrinkWindow: al acabar un barrido hacia delante lo de delante se cierra al momento (era anticipo); hacia atras la estela, que queda en el futuro, se acorta poco a poco', () => {
    const f = T.shrinkWindow(T.windowForGlide(3652.5, 1), 0.7); const wb = T.windowForGlide(3652.5, -1); const b = T.shrinkWindow(wb, 0.7);
    return f.futureDays === 0 && b.futureDays > 0 && b.futureDays < wb.futureDays ? true : JSON.stringify({ f, b });
});
check('shrinkWindow: una ventana ya normal o invalida sigue siendo la normal', () => T.shrinkWindow({ flowing: false, pastDays: 5, futureDays: 5 }, 1).flowing === false && T.shrinkWindow(null, 1).pastDays === T.REST_PAST_DAYS && T.shrinkWindow(T.windowForGlide(3652.5, 1), NaN).flowing === false);

console.log(fails ? '\n' + fails + ' FALLO(S)' : '\nTodo en orden (glide).');
process.exit(fails ? 1 : 0);
