#!/usr/bin/env node
// Pruebas de map/panels.js (ocultacion automatica, historial deshacer/rehacer, posiciones). Sin red, con temporizador falso.
'use strict';
const P = require('../map/panels.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };

/** Reloj falso: setTimer/clearTimer controlados a mano. */
function fakeClock() {
    let now = 0; let seq = 1; const timers = new Map();
    return {
        setTimer: (fn, ms) => { const h = seq++; timers.set(h, { at: now + ms, fn }); return h; },
        clearTimer: (h) => { timers.delete(h); },
        tick(ms) { const end = now + ms; for (;;) { let best = null; for (const [h, t] of timers) if (t.at <= end && (!best || t.at < best.t.at)) best = { h, t }; if (!best) break; now = best.t.at; timers.delete(best.h); best.t.fn(); } now = end; },
        pending: () => timers.size
    };
}
function make(level, pins) {
    const clk = fakeClock(); const log = [];
    const ah = P.createAutoHide({ setTimer: clk.setTimer, clearTimer: clk.clearTimer, onFade: (id, f) => log.push(id + ':' + (f ? 'off' : 'on')) });
    if (pins) ah.setPinnedSet(pins);
    ah.setLevel(level);
    return { clk, log, ah };
}

// ---- Tabla de niveles
check('hay 5 recuadros y 3 niveles; cada recuadro pertenece a un nivel valido', () => P.IDS.length === 5 && P.MAX_LEVEL === 3 && P.IDS.every((id) => P.isLevel(P.LEVEL_OF[id]) && P.LEVEL_OF[id] >= 1));
check('nivel 0: nada se oculta solo', () => P.IDS.every((id) => !P.autoHides(id, 0, new Set())));
check('nivel 1: solo la ficha del elemento seleccionado', () => P.IDS.filter((id) => P.autoHides(id, 1, new Set())).join() === 'info');
check('nivel 2: ficha + avisos y notas, no la ficha del cuerpo celeste', () => P.IDS.filter((id) => P.autoHides(id, 2, new Set())).sort().join() === ['info', 'solar-note', 'space-note', 'status'].sort().join());
check('nivel 3: todos', () => P.IDS.every((id) => P.autoHides(id, 3, new Set())));
check('un recuadro fijado no se oculta en ningun nivel', () => [0, 1, 2, 3].every((n) => !P.autoHides('info', n, new Set(['info']))));
check('ids o niveles desconocidos no ocultan (rechazado, no roto)', () => !P.autoHides('nada', 3, new Set()) && !P.autoHides('info', 7, new Set()) && !P.autoHides('info', -1, new Set()) && !P.autoHides('info', 1.5, new Set()) && !P.autoHides('info', '1', new Set()));

// ---- Ocultacion automatica
check('a los 2 s exactos se oculta; a los 1999 ms aun no', () => {
    const { clk, ah, log } = make(1); ah.touch('info');
    clk.tick(1999); const antes = ah.isFaded('info'); clk.tick(1);
    return !antes && ah.isFaded('info') && log.join() === 'info:off' ? true : antes + ' ' + log.join();
});
check('en nivel 0 nunca se oculta', () => { const { clk, ah } = make(0); ah.touch('info'); clk.tick(60000); return !ah.isFaded('info') && clk.pending() === 0; });
check('un recuadro de nivel superior no se oculta con un nivel inferior', () => { const { clk, ah } = make(1); ah.touch('status'); ah.touch('solar-info'); clk.tick(60000); return !ah.isFaded('status') && !ah.isFaded('solar-info'); });
check('touch (contenido nuevo) reaparece y reinicia la cuenta', () => {
    const { clk, ah } = make(1); ah.touch('info'); clk.tick(2000); const oculto = ah.isFaded('info');
    ah.touch('info'); const visible = !ah.isFaded('info'); clk.tick(1999); const aun = !ah.isFaded('info'); clk.tick(1);
    return oculto && visible && aun && ah.isFaded('info') ? true : [oculto, visible, aun].join();
});
check('touch repetido antes del plazo retrasa la ocultacion (no se acumulan temporizadores)', () => {
    const { clk, ah } = make(1); ah.touch('info'); clk.tick(1500); ah.touch('info'); clk.tick(1500);
    const a = !ah.isFaded('info') && clk.pending() === 1; clk.tick(500); return a && ah.isFaded('info');
});
check('con el cursor encima no se oculta; al salir, 2 s mas tarde', () => {
    const { clk, ah } = make(1); ah.touch('info'); ah.hover('info', true); clk.tick(10000); const a = !ah.isFaded('info');
    ah.hover('info', false); clk.tick(1999); const b = !ah.isFaded('info'); clk.tick(1); return a && b && ah.isFaded('info');
});
check('si se oculta y se pasa el cursor por encima, reaparece', () => {
    const { clk, ah } = make(1); ah.touch('info'); clk.tick(2000); ah.hover('info', true); return !ah.isFaded('info') && clk.pending() === 0 ? true : 'no reaparece';
});
check('un aviso protegido no se oculta; al dejar de serlo, cuenta 2 s', () => {
    const { clk, ah } = make(2); ah.touch('status'); ah.setProtected('status', true); clk.tick(10000); const a = !ah.isFaded('status');
    ah.setProtected('status', false); clk.tick(2000); return a && ah.isFaded('status');
});
check('proteger un recuadro ya oculto lo muestra', () => { const { clk, ah } = make(2); ah.touch('status'); clk.tick(2000); ah.setProtected('status', true); return !ah.isFaded('status'); });
check('fijar un recuadro oculto lo muestra y cancela la cuenta; desfijarlo reinicia la cuenta', () => {
    const { clk, ah } = make(1); ah.touch('info'); clk.tick(2000); ah.setPinned('info', true); const a = !ah.isFaded('info') && clk.pending() === 0; clk.tick(60000);
    const b = !ah.isFaded('info'); ah.setPinned('info', false); clk.tick(2000); return a && b && ah.isFaded('info');
});
check('bajar el nivel muestra lo que ya no aplica; subirlo oculta tras 2 s lo que sigue en pantalla', () => {
    const { clk, ah } = make(2); ah.touch('status'); clk.tick(2000); const a = ah.isFaded('status'); ah.setLevel(1); const b = !ah.isFaded('status'); clk.tick(60000);
    ah.setLevel(3); const c = !ah.isFaded('status'); clk.tick(2000); return a && b && c && ah.isFaded('status');
});
check('release (cierra el recuadro): cancela la cuenta y deja de estar oculto', () => {
    const { clk, ah } = make(1); ah.touch('info'); ah.release('info'); const a = clk.pending() === 0 && !ah.isFaded('info'); clk.tick(60000); return a && !ah.isFaded('info');
});
check('un recuadro no activo no se oculta aunque cambie el nivel', () => { const { clk, ah } = make(0); ah.setLevel(3); clk.tick(60000); return P.IDS.every((id) => !ah.isFaded(id)) && clk.pending() === 0; });
check('onFade solo se llama cuando el estado cambia', () => {
    const { clk, ah, log } = make(1); ah.touch('info'); ah.touch('info'); clk.tick(2000); ah.hover('info', true); ah.hover('info', true); ah.release('info'); ah.release('info');
    return log.join() === 'info:off,info:on' ? true : log.join();
});
check('los recuadros son independientes', () => {
    const { clk, ah } = make(3); ah.touch('info'); clk.tick(1000); ah.touch('status'); clk.tick(1000);
    const a = ah.isFaded('info') && !ah.isFaded('status'); clk.tick(1000); return a && ah.isFaded('status');
});
check('setLevel con valor invalido se rechaza y no cambia el nivel', () => { const { ah } = make(2); return ah.setLevel(9) === false && ah.setLevel('1') === false && ah.setLevel(1.2) === false && ah.level() === 2 && ah.setLevel(3) === true && ah.level() === 3; });
check('ids desconocidos se ignoran sin romper', () => { const { ah } = make(1); ah.touch('x'); ah.release('x'); ah.hover('x', true); ah.setPinned('x', true); ah.setProtected('x', true); return ah.pinned().length === 0 && !ah.isFaded('x'); });
check('setPinnedSet descarta ids falsos y se lee en orden canonico', () => { const { ah } = make(1); ah.setPinnedSet(['status', 'zzz', 'info']); return ah.pinned().join() === 'info,status'; });

// ---- Historial
function histo() {
    const state = { hidden: {}, off: {} }; const events = [];
    const h = P.createHistory({ apply: (a, dir) => { events.push(dir + ':' + a.type + ':' + a.id); if (a.type === 'hide') state.hidden[a.id] = dir === 'redo'; else state.off[a.id] = dir === 'redo' ? a.to : a.from; }, onChange: (s) => { state.can = s; } });
    return { h, state, events };
}
const mv = (id, fx, fy, tx, ty) => ({ type: 'move', id, from: { dx: fx, dy: fy }, to: { dx: tx, dy: ty } });
check('ocultar y mover se deshacen y rehacen en orden inverso', () => {
    const { h, state, events } = histo(); h.push({ type: 'hide', id: 'info' }); h.push(mv('info', 0, 0, 30, -10));
    h.undo(); h.undo(); h.redo(); h.redo();
    return events.join() === 'undo:move:info,undo:hide:info,redo:hide:info,redo:move:info' && state.hidden.info === true && state.off.info.dx === 30 ? true : events.join();
});
check('deshacer/rehacer sin nada devuelve false y no llama a apply', () => { const { h, events } = histo(); return h.undo() === false && h.redo() === false && events.length === 0; });
check('una accion nueva borra lo rehacible', () => { const { h } = histo(); h.push({ type: 'hide', id: 'info' }); h.undo(); const a = h.canRedo(); h.push(mv('info', 0, 0, 5, 5)); return a && !h.canRedo() && h.canUndo(); });
check('un arrastre que no mueve nada no entra en el historial', () => { const { h } = histo(); return h.push(mv('info', 4, 4, 4, 4)) === false && !h.canUndo(); });
check('acciones mal formadas se rechazan (tipo, id, nulo)', () => { const { h } = histo(); return h.push(null) === false && h.push({ type: 'otra', id: 'info' }) === false && h.push({ type: 'hide', id: 'zzz' }) === false && !h.canUndo(); });
check('el historial tiene tope: la mas antigua se descarta', () => {
    const { h } = histo(); for (let i = 1; i <= 130; i++) h.push(mv('info', 0, 0, i, 0)); return h.sizes().undo === 100 ? true : h.sizes().undo;
});
check('onChange informa de canUndo/canRedo tras cada operacion', () => {
    const { h, state } = histo(); h.push({ type: 'hide', id: 'info' }); const a = state.can.canUndo && !state.can.canRedo; h.undo(); const b = !state.can.canUndo && state.can.canRedo; h.clear(); return a && b && !state.can.canRedo;
});

// ---- Posiciones
const R = { left: 100, top: 80, width: 300, height: 200 };
check('clampOffset deja pasar un desplazamiento razonable', () => { const o = P.clampOffset(40, 30, R, 1200, 800); return o.dx === 40 && o.dy === 30; });
check('clampOffset impide sacar el recuadro de la ventana (queda un asa de 48 px)', () => {
    const o = P.clampOffset(99999, 99999, R, 1200, 800); const x = R.left + o.dx; const y = R.top + o.dy;
    const o2 = P.clampOffset(-99999, -99999, R, 1200, 800); const x2 = R.left + o2.dx + R.width; const y2 = R.top + o2.dy;
    return x === 1200 - 48 && y === 800 - 48 && x2 === 48 && y2 === 0 ? true : [x, y, x2, y2].join();
});
check('clampOffset con NaN/Infinity no produce NaN', () => { const o = P.clampOffset(NaN, Infinity, R, 1200, 800); return Number.isFinite(o.dx) && Number.isFinite(o.dy); });
check('clampOffset con ventana pequena no da rangos invertidos', () => { const o = P.clampOffset(500, 500, { left: 10, top: 10, width: 400, height: 400 }, 300, 300); return Number.isFinite(o.dx) && Number.isFinite(o.dy) && o.dx + 10 <= 300 && o.dy + 10 <= 300; });

// ---- Serializacion
check('serializeLayout/parseLayout hacen viaje de ida y vuelta', () => {
    const m = { info: { dx: 12, dy: -30 }, 'solar-info': { dx: -400, dy: 8 }, status: { dx: 0, dy: 0 } };
    const s = P.serializeLayout(m); const b = P.parseLayout(s);
    return s === 'info:12,-30;solar-info:-400,8' && b.info.dx === 12 && b.info.dy === -30 && b['solar-info'].dx === -400 && !b.status ? true : s;
});
check('parseLayout descarta pieza a pieza lo invalido (id desconocido, no numerico, fuera de tope) y conserva lo bueno', () => {
    const b = P.parseLayout('info:5,6;zzz:1,1;status:a,b;space-note:99999,0;solar-note:1.5,2;solar-info:-7,9');
    return Object.keys(b).sort().join() === 'info,solar-info' && b.info.dx === 5 && b['solar-info'].dy === 9 ? true : JSON.stringify(b);
});
check('parseLayout rechaza entradas que no son cadenas o son demasiado largas, sin lanzar', () => {
    return Object.keys(P.parseLayout(undefined)).length === 0 && Object.keys(P.parseLayout(42)).length === 0 && Object.keys(P.parseLayout('')).length === 0 && Object.keys(P.parseLayout('info:1,1;'.repeat(100))).length === 0;
});
check('parseLayout ignora desplazamientos nulos (0,0)', () => Object.keys(P.parseLayout('info:0,0')).length === 0);
check('pinsToMask/maskToPins: ida y vuelta, y mascaras invalidas dan lista vacia', () => {
    const l = ['info', 'solar-note']; const m = P.pinsToMask(l);
    return P.maskToPins(m).join() === 'info,solar-note' && P.pinsToMask([]) === 0 && P.maskToPins(31).length === 5 && P.maskToPins(32).length === 0 && P.maskToPins(-1).length === 0 && P.maskToPins(1.5).length === 0 && P.maskToPins('3').length === 0 && P.pinsToMask(['zzz']) === 0 ? true : m;
});

console.log(fails ? '\n' + fails + ' FALLO(S)' : '\nTodo en orden (' + 'panels' + ').');
process.exit(fails ? 1 : 0);
