/* panels.js - Logica de los recuadros informativos: ocultacion automatica con niveles, historial deshacer/rehacer y posiciones.
 *
 * Es PURO (sin DOM): el temporizador y el reloj se inyectan, asi que se prueba entero en Node (scripts/check-panels.js).
 * index.html solo conecta esto con el DOM (fundido por CSS, arrastre, boton de ocultar, ajustes).
 *
 * Recuadros informativos (ids estables, tambien en la cookie de preferencias):
 *   info       ficha del elemento seleccionado          (nivel 1)
 *   status     avisos y notas de estado (abajo izda.)   (nivel 2)
 *   space-note nota del fondo espacial                  (nivel 2)
 *   solar-note nota de la vista del sistema solar       (nivel 2)
 *   solar-info ficha del cuerpo celeste                 (nivel 3)
 * Niveles de ocultacion automatica: 0 = nunca; 1 = solo el elemento seleccionado; 2 = ademas notas y avisos; 3 = ademas la ficha del cuerpo celeste.
 * Un recuadro "fijado" (mostrar siempre) nunca se oculta solo, sea cual sea el nivel.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosPanels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const IDS = ['info', 'status', 'space-note', 'solar-note', 'solar-info'];
    const LEVEL_OF = { info: 1, status: 2, 'space-note': 2, 'solar-note': 2, 'solar-info': 3 };
    const MAX_LEVEL = 3;
    const DELAY_MS = 2000;
    const MAX_OFFSET = 4000;          // tope de un desplazamiento guardado (px): lo que no sea razonable se descarta
    const HISTORY_LIMIT = 100;

    const isId = (id) => IDS.indexOf(id) >= 0;
    const isLevel = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_LEVEL;

    /** ¿Se oculta solo este recuadro con este nivel y esta lista de fijados? */
    function autoHides(id, level, pinned) {
        if (!isId(id) || !isLevel(level) || level === 0) return false;
        if (pinned && pinned.has && pinned.has(id)) return false;
        return level >= LEVEL_OF[id];
    }

    /* ---------------------------- Ocultacion automatica ---------------------------- */
    /**
     * @param o.delay       ms hasta ocultar (2000 por defecto)
     * @param o.setTimer    (fn, ms) -> handle     (por defecto setTimeout)
     * @param o.clearTimer  (handle)               (por defecto clearTimeout)
     * @param o.onFade      (id, faded:boolean)    se llama SOLO cuando el estado cambia
     */
    function createAutoHide(o) {
        const delay = (o && o.delay) || DELAY_MS;
        const setT = (o && o.setTimer) || ((fn, ms) => setTimeout(fn, ms));
        const clearT = (o && o.clearTimer) || ((h) => clearTimeout(h));
        const onFade = (o && o.onFade) || (() => {});
        let level = 0; const pinned = new Set();
        const st = {};       // id -> { active, hovered, protectedNow, faded, timer }
        const get = (id) => st[id] || (st[id] = { active: false, hovered: false, protectedNow: false, faded: false, timer: null });

        function clearTimer(s) { if (s.timer !== null) { clearT(s.timer); s.timer = null; } }
        function setFaded(id, s, v) { if (s.faded !== v) { s.faded = v; onFade(id, v); } }
        function arm(id) {
            const s = get(id); clearTimer(s);
            if (!s.active || s.hovered || s.protectedNow || s.faded || !autoHides(id, level, pinned)) return;
            s.timer = setT(() => { s.timer = null; if (s.active && !s.hovered && !s.protectedNow && autoHides(id, level, pinned)) setFaded(id, s, true); }, delay);
        }
        /** Revisa un recuadro tras un cambio de nivel/fijado/proteccion: si ya no aplica se muestra; si aplica y esta visible, arranca la cuenta. */
        function refresh(id) {
            const s = get(id);
            if (!autoHides(id, level, pinned) || s.protectedNow) { clearTimer(s); setFaded(id, s, false); } else arm(id);
        }
        return {
            delay,
            /** El contenido del recuadro se muestra o cambia: reaparece y empieza la cuenta atras. */
            touch(id) { if (!isId(id)) return; const s = get(id); s.active = true; clearTimer(s); setFaded(id, s, false); arm(id); },
            /** El recuadro deja de estar en pantalla (la app lo cierra). */
            release(id) { if (!isId(id)) return; const s = get(id); s.active = false; s.hovered = false; clearTimer(s); setFaded(id, s, false); },
            /** El cursor / el dedo esta (o deja de estar) sobre el recuadro, o tiene el foco. */
            hover(id, on) {
                if (!isId(id)) return; const s = get(id); on = Boolean(on); if (s.hovered === on) return; s.hovered = on;
                if (on) { clearTimer(s); setFaded(id, s, false); } else arm(id);
            },
            /** Un aviso importante (error, advertencia) no se oculta nunca solo. */
            setProtected(id, on) { if (!isId(id)) return; const s = get(id); on = Boolean(on); if (s.protectedNow === on) return; s.protectedNow = on; refresh(id); },
            setLevel(n) { if (!isLevel(n)) return false; level = n; IDS.forEach(refresh); return true; },
            setPinned(id, on) { if (!isId(id)) return; if (on) pinned.add(id); else pinned.delete(id); refresh(id); },
            setPinnedSet(list) { pinned.clear(); (list || []).forEach((id) => { if (isId(id)) pinned.add(id); }); IDS.forEach(refresh); },
            isFaded: (id) => Boolean(st[id] && st[id].faded),
            level: () => level,
            pinned: () => IDS.filter((id) => pinned.has(id))
        };
    }

    /* ---------------------------- Historial deshacer / rehacer ---------------------------- */
    /**
     * Acciones: { type: 'hide', id, hidden: true } y { type: 'move', id, from: {dx,dy}, to: {dx,dy} }.
     * `apply(action, dir)` la da quien usa el historial; dir es 'undo' o 'redo'. Una accion nueva borra lo rehacible.
     */
    function createHistory(o) {
        const apply = (o && o.apply) || (() => {}); const limit = (o && o.limit) || HISTORY_LIMIT; const onChange = (o && o.onChange) || (() => {});
        let undo = []; let redo = [];
        const notify = () => onChange({ canUndo: undo.length > 0, canRedo: redo.length > 0 });
        return {
            push(a) {
                if (!a || (a.type !== 'hide' && a.type !== 'move') || !isId(a.id)) return false;
                if (a.type === 'move' && a.from.dx === a.to.dx && a.from.dy === a.to.dy) return false;   // un arrastre que no mueve nada no es una accion
                undo.push(a); if (undo.length > limit) undo.shift(); redo = []; notify(); return true;
            },
            undo() { const a = undo.pop(); if (!a) return false; apply(a, 'undo'); redo.push(a); notify(); return true; },
            redo() { const a = redo.pop(); if (!a) return false; apply(a, 'redo'); undo.push(a); notify(); return true; },
            clear() { undo = []; redo = []; notify(); },
            canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
            sizes: () => ({ undo: undo.length, redo: redo.length })
        };
    }

    /* ---------------------------- Posiciones ---------------------------- */
    /**
     * Desplazamiento (dx, dy) respecto a la posicion de origen, limitado para que SIEMPRE quede visible un asa de `keep` px.
     * rect0 = caja del recuadro SIN desplazamiento { left, top, width, height }; vw, vh = ventana.
     */
    function clampOffset(dx, dy, rect0, vw, vh, keep) {
        const k = keep === undefined ? 48 : keep;
        const kx = Math.min(k, rect0.width); const ky = Math.min(k, rect0.height);
        const minDx = kx - rect0.width - rect0.left; const maxDx = vw - kx - rect0.left;
        const minDy = -rect0.top; const maxDy = vh - ky - rect0.top;
        const cl = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0)));
        return { dx: cl(dx, Math.min(minDx, maxDx), Math.max(minDx, maxDx)), dy: cl(dy, Math.min(minDy, maxDy), Math.max(minDy, maxDy)) };
    }

    /** { id: {dx,dy} } -> "info:12,-30;status:0,8" (solo ids conocidos y desplazamientos no nulos). */
    function serializeLayout(map) {
        return IDS.filter((id) => map && map[id] && (map[id].dx || map[id].dy)).map((id) => id + ':' + Math.round(map[id].dx) + ',' + Math.round(map[id].dy)).join(';');
    }
    /** Inversa de serializeLayout; lo que no cuadre se descarta pieza a pieza (una mala no invalida las demas). */
    function parseLayout(str) {
        const out = {};
        if (typeof str !== 'string' || str.length > 400) return out;
        for (const part of str.split(';')) {
            const m = /^([a-z-]+):(-?\d{1,5}),(-?\d{1,5})$/.exec(part);
            if (!m || !isId(m[1])) continue;
            const dx = parseInt(m[2], 10); const dy = parseInt(m[3], 10);
            if (Math.abs(dx) > MAX_OFFSET || Math.abs(dy) > MAX_OFFSET) continue;
            if (dx || dy) out[m[1]] = { dx, dy };
        }
        return out;
    }
    /** Fijados <-> mascara de bits (un bit por id, en el orden de IDS). */
    const pinsToMask = (list) => IDS.reduce((m, id, i) => (list && list.indexOf(id) >= 0 ? m | (1 << i) : m), 0);
    const maskToPins = (m) => (Number.isInteger(m) && m >= 0 && m < (1 << IDS.length) ? IDS.filter((id, i) => m & (1 << i)) : []);

    return { IDS, LEVEL_OF, MAX_LEVEL, DELAY_MS, MAX_OFFSET, autoHides, createAutoHide, createHistory, clampOffset, serializeLayout, parseLayout, pinsToMask, maskToPins, isLevel, isId };
});
