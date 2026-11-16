#!/usr/bin/env node
// Pruebas de map/camera.js (giro del globo con inercia) y de como lo usa index.html. Sin red ni navegador.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../map/camera.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? 'ok   ' : 'FALLA') + ' ' + name + (extra ? ' -> ' + extra : '')); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);
const M0S = [-2, -1, 0, 0.5, 1, 2, 3, 4];

/* ---------------------------- curva ---------------------------- */
check('easing: sale de 0 y llega a 1 con cualquier pendiente de salida (y no se sale de ahi fuera de [0, 1])', () => M0S.every((m) => { const e = C.easing(m); return e(0) === 0 && near(e(1), 1) && e(-1) === 0 && e(2) === 1 && near(e(1 - 1e-9), 1, 1e-6); }));
check('slope: es la derivada de la curva, sale con m0 y llega con velocidad 0', () => M0S.every((m) => {
    const e = C.easing(m); const h = 1e-6;
    for (let t = 0.05; t < 1; t += 0.05) { const num = (e(t + h) - e(t - h)) / (2 * h); if (!near(num, C.slope(m, t), 1e-5)) return false; }
    return near(C.slope(m, 0), m) && near(C.slope(m, 1), 0);
}));
check('llega SIN tiron: aceleracion nula al final (la velocidad se apaga poco a poco)', () => M0S.every((m) => { const h = 1e-4; return Math.abs((C.slope(m, 1) - C.slope(m, 1 - h)) / h) < 1e-2; }));
check('con m0 entre 0 y 4 nunca se pasa del destino ni retrocede', () => [0, 0.5, 1, 2, 3, 4].every((m) => { const e = C.easing(m); let prev = 0; for (let i = 1; i <= 1000; i++) { const v = e(i / 1000); if (v < prev - 1e-12 || v > 1 + 1e-12) return false; prev = v; } return true; }));
check('desde quieto: coge velocidad en el primer tercio y frena despacio (la mitad del camino antes de la mitad del tiempo)', () => {
    const e = C.easing(0); let tMax = 0; let vMax = 0;
    for (let i = 0; i <= 1000; i++) { const v = C.slope(0, i / 1000); if (v > vMax) { vMax = v; tMax = i / 1000; } }
    let t90 = 0; for (let i = 0; i <= 1000; i++) if (e(i / 1000) < 0.9) t90 = i / 1000;
    return near(tMax, 1 / 3, 0.002) && e(0.5) > 0.6 && 1 - t90 >= 0.25 ? true : 'tMax ' + tMax + ' e(0.5) ' + e(0.5) + ' ultimo 10 %: ' + (1 - t90);
});
check('arranque sin tiron desde quieto: el primer 2 % del tiempo recorre menos del 0,3 % del camino', () => C.easing(0)(0.02) < 0.003);
check('hacia atras (m0 = -2): se pasa como mucho un 10 % y vuelve', () => { const e = C.easing(-2); let min = 0; for (let i = 0; i <= 1000; i++) min = Math.min(min, e(i / 1000)); return min < -0.05 && min > -0.1 ? true : String(min); });

/* ---------------------------- distancias ---------------------------- */
check('wrapLng y angleDeg: por el camino corto, tambien a traves del antimeridiano', () => near(C.wrapLng(358), -2) && near(C.wrapLng(-181), 179) && near(C.angleDeg([179, 0], [-179, 0]), 2, 1e-9) && near(C.angleDeg([0, 0], [180, 0]), 180, 1e-9) && near(C.angleDeg([0, 89], [180, 89]), 2, 1e-9));
check('metricDelta: la longitud encoge con la latitud', () => { const d = C.metricDelta([0, 60], [2, 60]); const w = C.metricDelta([179, 0], [-179, 0]); return near(d[0], 1, 1e-9) && near(d[1], 0) && near(w[0], 2, 1e-9); });
check('pxPerDegree: se dobla con cada nivel de zoom', () => near(C.pxPerDegree(5, 0) / C.pxPerDegree(4, 0), 2, 1e-12) && near(C.pxPerDegree(0, 0), 512 / 360, 1e-12));

check('lerp: por el circulo maximo, de a (0) a b (1), tambien a traves del antimeridiano', () => {
    const m = C.lerp([0, 0], [90, 0], 0.5); const w = C.lerp([179, 10], [-179, 10], 0.5); const e = C.lerp([2, 41], [12, 45], 0);
    return near(m[0], 45, 1e-9) && near(m[1], 0, 1e-9) && Math.abs(Math.abs(w[0]) - 180) < 1e-6 && w[1] > 10 && near(e[0], 2, 1e-9) && near(e[1], 41, 1e-9) && near(C.angleDeg(C.lerp([2, 41], [12, 45], 0.3), [2, 41]), 0.3 * C.angleDeg([2, 41], [12, 45]), 1e-9);
});

/* ---------------------------- duracion ---------------------------- */
const DIAG = Math.hypot(1280, 800);
check('durationMs: entre 0,7 y 2,4 s, y 0 si no hay que moverse', () => C.durationMs(0, 100, DIAG) === 0 && [[0.01, 1], [3, 4.6], [40, 2], [180, 1.3], [180, 9]].every(([a, z]) => { const m = C.durationMs(a, C.pxPerDegree(z, 0), DIAG); return m >= C.MIN_MS && m <= C.MAX_MS; }));
check('durationMs: crece con la distancia', () => { let prev = 0; for (const a of [0.1, 1, 3, 10, 30, 90, 180]) { const m = C.durationMs(a, C.pxPerDegree(3, 0), DIAG); if (m < prev) return false; prev = m; } return true; });
check('un vecino en pantalla (3° con zoom 4,6) tarda menos de 1 s; las antipodas con la Tierra entera a la vista, mas de 1,1 s; con mucho zoom, el maximo', () => {
    const a = C.durationMs(3, C.pxPerDegree(4.6, 45), DIAG); const b = C.durationMs(180, C.pxPerDegree(1.3, 0), DIAG); const c = C.durationMs(150, C.pxPerDegree(9, 40), DIAG);
    return a < 1000 && b > 1100 && b < C.MAX_MS && c === C.MAX_MS ? true : a + ' ' + b + ' ' + c;
});

/* ---------------------------- velocidad medida ---------------------------- */
check('velocity: este a 1° por 100 ms en el ecuador; elige una posicion de al menos 48 ms antes', () => {
    const s = []; for (let i = 0; i <= 10; i++) s.push({ t: i * 16, lng: i * 0.16, lat: 0 });
    const v = C.velocity(s); return near(v[0], 0.01, 1e-12) && near(v[1], 0, 1e-12) && C.velocity(s.slice(0, 1)) === null && C.velocity(null) === null;
});
check('velocity: a traves del antimeridiano no da un salto de 360°', () => { const v = C.velocity([{ t: 0, lng: 179.9, lat: 0 }, { t: 100, lng: -179.9, lat: 0 }]); return near(v[0], 0.002, 1e-9); });

/* ---------------------------- plan ---------------------------- */
check('plan: null si ya se esta alli; desde quieto sale con m0 = 0 y la duracion de durationMs', () => {
    const p = C.plan([2, 41], [12, 45], { zoom: 4, diag: DIAG }); const q = C.plan([2, 41], [2, 41], { zoom: 4, diag: DIAG });
    return q === null && p.m0 === 0 && p.ms === C.durationMs(C.angleDeg([2, 41], [12, 45]), C.pxPerDegree(4, 41), DIAG);
});

/** Simulacion: la vista va por la recta lng/lat de cada giro (como MapLibre en distancias cortas), muestreada cada 16 ms; en los instantes
 *  de `retargets` se pide otro destino con la velocidad medida. Devuelve las posiciones y velocidades fotograma a fotograma. */
function simulate(start, targets, every, opt) {
    const o = Object.assign({ zoom: 4.6, diag: DIAG }, opt || {});
    let seg = null; const frames = []; const samples = []; let pos = start.slice(); let k = 0;
    // el giro nuevo sale de la posicion del ultimo fotograma, en el instante de ese fotograma (como easeTo: parte de donde esta la vista)
    const go = (t, to) => { const p = C.plan(pos, to, { zoom: o.zoom, diag: o.diag, v: seg ? C.velocity(samples) : null }); if (!p) return; seg = { from: pos.slice(), d: [C.wrapLng(to[0] - pos[0]), to[1] - pos[1]], ms: p.ms, e: C.easing(p.m0), m0: p.m0, t0: Math.max(0, t - 16) }; };
    for (let t = 0; t < 20000; t += 16) {
        if (k < targets.length && t >= k * every) go(t, targets[k++]);
        if (seg) { const u = Math.min(1, (t - seg.t0) / seg.ms); const f = seg.e(u); pos = [seg.from[0] + seg.d[0] * f, seg.from[1] + seg.d[1] * f]; if (u >= 1 && k >= targets.length) { frames.push({ t, pos: pos.slice(), m0: seg.m0 }); break; } }
        frames.push({ t, pos: pos.slice(), m0: seg ? seg.m0 : 0 }); samples.push({ t, lng: pos[0], lat: pos[1] }); if (samples.length > 8) samples.shift();
    }
    for (let i = 1; i < frames.length; i++) { const d = C.metricDelta(frames[i - 1].pos, frames[i].pos); frames[i].speed = Math.hypot(d[0], d[1]) / 16; }
    return frames;
}
check('recorrer resultados hacia delante (uno cada 170 ms): no se para entre uno y otro y llega al ultimo', () => {
    const T = [[4, 42], [6, 43], [8, 44], [10, 45], [12, 46]];
    const f = simulate([2, 41], T, 170);
    // desde el primer cambio de destino hasta el ultimo, nunca baja de un tercio del pico (antes se paraba y volvia a arrancar en cada uno)
    const last = f[f.length - 1].pos; const mid = f.filter((x) => x.t >= 170 && x.t <= 4 * 170 + 16);
    const minMid = Math.min(...mid.map((x) => x.speed)); const peak = Math.max(...f.slice(1).map((x) => x.speed || 0));
    return C.angleDeg(last, T[4]) < 1e-6 && minMid > peak / 3 ? true : 'velocidad minima entre destinos ' + minMid.toFixed(5) + ' (pico ' + peak.toFixed(5) + ')';
});
check('al cambiar de destino la velocidad no da saltos (ningun fotograma cambia mas del 12 % del pico)', () => {
    const T = [[4, 42], [6, 43], [8, 44], [10, 45], [12, 46]];
    const f = simulate([2, 41], T, 170);
    const sp = f.slice(2).map((x) => x.speed); const peak = Math.max(...sp); let worst = 0;
    for (let i = 1; i < sp.length; i++) worst = Math.max(worst, Math.abs(sp[i] - sp[i - 1]));
    return worst <= 0.12 * peak ? true : 'salto ' + (worst / peak * 100).toFixed(1) + ' % del pico';
});
check('el giro nuevo sale exactamente a la velocidad que llevaba hacia el destino (si no tiene que acortarse)', () => {
    const from = [2, 41]; const to = [14, 45]; const p = C.plan(from, to, { zoom: 3, diag: DIAG }); const e = C.easing(p.m0); const d = C.metricDelta(from, to);
    const u = 0.25; const cur = [from[0] + C.wrapLng(to[0] - from[0]) * e(u), from[1] + (to[1] - from[1]) * e(u)];
    const sl = C.slope(p.m0, u) / p.ms; const v = [d[0] * sl, d[1] * sl];
    const nxt = [18, 47]; const q = C.plan(cur, nxt, { zoom: 3, diag: DIAG, v }); const d2 = C.metricDelta(cur, nxt);
    const want = (v[0] * d2[0] + v[1] * d2[1]) / Math.hypot(d2[0], d2[1]); const got = C.slope(q.m0, 0) / q.ms * Math.hypot(d2[0], d2[1]);
    return q.m0 > 0 && q.m0 < C.M0_MAX && near(got, want, 1e-9) ? true : 'm0 ' + q.m0 + ' quiere ' + want + ' sale ' + got;
});
check('destino cerca y delante yendo deprisa: frena antes (m0 <= 4, sin pasarse) y no dura menos de 0,3 s', () => {
    const v = [0.05, 0]; const q = C.plan([0, 0], [0.5, 0], { zoom: 5, diag: DIAG, v });
    return q.m0 <= C.M0_MAX + 1e-12 && q.ms >= C.RETARGET_MIN_MS && q.ms < C.durationMs(0.5, C.pxPerDegree(5, 0), DIAG) ? true : JSON.stringify(q);
});
check('destino detras: se pasa un poco y vuelve (m0 negativo, nunca por debajo de -2)', () => { const q = C.plan([0, 0], [-3, 0], { zoom: 4, diag: DIAG, v: [0.02, 0] }); return q.m0 < 0 && q.m0 >= C.M0_MIN; });
check('destino de lado: la velocidad de lado no empuja (m0 = 0)', () => near(C.plan([0, 0], [0, 3], { zoom: 4, diag: DIAG, v: [0.02, 0] }).m0, 0, 1e-12));

/* ---------------------------- index.html ---------------------------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const body = (name) => { const i = html.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return ''; };
check('index.html carga map/camera.js', () => /<script src="\.\/map\/camera\.js"><\/script>/.test(html));
check('camGlide: usa el plan y la curva de camera.js, con un easeId comun (encadenar sin moveend en medio) y essential (el movimiento reducido lo decide la web)', () => {
    const b = body('camGlide'); return /ChronosCamera\.plan\(/.test(b) && /ChronosCamera\.easing\(/.test(b) && /easeId:\s*CAM\.ID/.test(b) && /essential:\s*true/.test(b) && /SRCH_REDUCED\(\)/.test(b) && !/zoom:/.test(b.replace(/zoom:\s*map\.getZoom\(\)/, ''));
});
check('el buscador y la lista de sucesos giran con camGlide (ya no con la curva fija de antes)', () => /camGlide\(tg\.center/.test(body('srchGo')) && !/map\.easeTo\(/.test(body('srchGo')) && /srchGo\(/.test(body('eventFocus')));
check('la rueda de la leyenda: moverse por ella (arrastre, rueda, flechas, toque) centra el globo; lo que viene del mapa (señalar, tocar un icono), no', () => {
    const frame = body('lgFrame'); const keys = html.slice(html.indexOf("list.addEventListener('keydown'"), html.indexOf("list.addEventListener('keydown'") + 900);
    return /lgCenterSoon\(id\)/.test(frame) && /lgCenterSoon\(id\)/.test(keys) && /camGlide\(/.test(body('lgCenter')) && /lgCenter\(/.test(body('lgCenterSoon'))
        && !/lgCenter/.test(body('lgFromMap')) && !/lgCenter/.test(body('lgMapClick')) && !/lgCenter/.test(body('lgSpinTo'));
});
check('un clic en el mapa no centra (se quito «Centrar al hacer clic»)', () => !/CENTER\.on/.test(html) && !/id="btn-center"/.test(html));
check('ningun centrado usa ya map.easeTo con duracion fija', () => { const bad = html.match(/map\.easeTo\(\{\s*center:[^\n]*duration:\s*\d+/g); return !bad ? true : bad.join(' | '); });

if (fails) { console.log('\n' + fails + ' prueba(s) fallida(s)'); process.exit(1); }
console.log('\nCamara: todo verde.');
