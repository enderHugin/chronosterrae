// legend.js - Leyenda viva: que filas caben, en que orden y por donde va cada cable (logica pura, sin DOM; la usa index.html).
//
// Pedido del creador (2026-11-13): «lista al margen derecho de todos los iconos que aparecen en tiempo real, con un cable punteado desde su
// posicion en el globo hasta su posicion en la lista», sin tapar ni llenar de basura visual, ligera para un iPad de 2015.
//  - Filas: si no caben todos, se quedan los mas notorios; despues se ordenan por su altura en pantalla (asi cada cable va casi en horizontal).
//  - Cable en dos tramos («po-leader»): horizontal desde el punto hasta un carril junto a la columna y un tramo corto hasta su fila. Con las
//    filas en el mismo orden vertical que los puntos, dos cables NUNCA se cruzan: los horizontales son paralelos y los tramos cortos van
//    ordenados entre el carril y la columna.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosLegend = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LANE_PX = 16;      // distancia del carril (donde el cable deja de ir en horizontal) a la columna

    /**
     * items: [{ id, x, y, importance }] (posicion en pantalla del punto). o: { max } filas que caben.
     * Devuelve { rows: items elegidos ordenados por y, extra: cuantos no caben }.
     */
    function pickRows(items, o) {
        const max = Math.max(0, Math.floor((o && o.max) || 0));
        const seen = new Set(); const uniq = [];
        for (const it of items || []) { if (!it || seen.has(it.id) || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue; seen.add(it.id); uniq.push(it); }
        let chosen = uniq;
        if (uniq.length > max) chosen = uniq.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0) || String(a.id).localeCompare(String(b.id))).slice(0, max);
        chosen = chosen.slice().sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
        return { rows: chosen, extra: uniq.length - chosen.length };
    }

    /**
     * Altura de cada fila: lo mas cerca posible de la de su punto (deseadas, ya ordenadas), sin solaparse (separacion rowH) y dentro de
     * [top, bottom - rowH]. Asi cada cable queda casi en horizontal. Dos pasadas: hacia abajo empuja lo que se solapa; si se sale por abajo,
     * hacia arriba. Devuelve la y de la parte de arriba de cada fila.
     */
    function placeRows(desired, top, bottom, rowH) {
        const n = desired.length; const out = new Array(n); if (!n) return out;
        const lo = top; const hi = Math.max(top, bottom - rowH);
        for (let i = 0; i < n; i++) out[i] = Math.max(lo, Math.min(hi, desired[i] - rowH / 2), i ? out[i - 1] + rowH : -Infinity);
        for (let i = n - 1; i >= 0; i--) out[i] = Math.min(out[i], i < n - 1 ? out[i + 1] - rowH : hi);
        for (let i = 0; i < n; i++) out[i] = Math.max(out[i], i ? out[i - 1] + rowH : lo);       // si no caben todos, manda el orden (el llamante ya limita a los que caben)
        return out;
    }

    /**
     * Como placeRows, pero la fila k (la SEÑALADA desde el globo) va justo a la altura de su punto, y las demas se apartan lo justo.
     * Pedido del creador (2026-11-14): la lista «mucho mas dinamica… para mostrar el elemento seleccionado»: asi su cable va en horizontal
     * y no cruza ningun texto. Si no cabe a esa altura (punto muy arriba o abajo), lo mas cerca posible dejando sitio a las demas.
     */
    function placeRowsPinned(desired, top, bottom, rowH, k) {
        const n = desired.length; if (!(k >= 0 && k < n)) return placeRows(desired, top, bottom, rowH);
        const out = new Array(n);
        out[k] = Math.max(top + k * rowH, Math.min(bottom - (n - k) * rowH, desired[k] - rowH / 2));
        for (let i = k - 1; i >= 0; i--) out[i] = Math.min(Math.max(desired[i] - rowH / 2, top + i * rowH), out[i + 1] - rowH);
        for (let i = k + 1; i < n; i++) out[i] = Math.max(Math.min(desired[i] - rowH / 2, bottom - (n - i) * rowH), out[i - 1] + rowH);
        return out;
    }

    /**
     * Donde va el recuadro con el nombre de la fila señalada, para que el cable NUNCA lo cruce (el creador, 2026-11-14: el cable «termina
     * superponiendose sobre el texto»). Se mira en pantalla: punto (px,py), fila (colLeft = borde izquierdo de la columna, rowTop, rowH),
     * recuadro (w, h).
     *  - 'left' (a la izquierda de la fila, a su altura) si el punto queda claramente a la izquierda del recuadro: el cable acaba en el
     *    borde izquierdo del recuadro (anchor), sin entrar en el.
     *  - si no (el punto esta debajo o muy cerca del recuadro), el recuadro va encima de la fila si el cable llega por abajo, o debajo si
     *    llega por arriba; el cable acaba en el borde de la columna.
     *  - si en ese lado no hay sitio: 'far', a la altura de la fila pero a la IZQUIERDA del punto y del carril (el cable, que va del punto
     *    hacia la derecha, no lo toca).
     * Devuelve { side: 'left'|'up'|'down'|'far', ax, ay, right } (ax, ay: donde acaba el cable; right: distancia del borde derecho del
     * recuadro al borde izquierdo de la columna).
     */
    function bubblePlace(o) {
        const cy = o.rowTop + o.rowH / 2; const gap = o.gap == null ? 6 : o.gap;
        const left = o.colLeft - gap - o.w;
        if (o.px <= left - LANE_PX - 4) return { side: 'left', ax: left, ay: cy, right: gap };
        const side = o.py > cy ? 'up' : 'down';
        const room = side === 'up' ? o.rowTop - o.h - 2 >= (o.top || 0) : o.rowTop + o.rowH + o.h + 2 <= (o.bottom == null ? Infinity : o.bottom);
        if (room) return { side, ax: o.colLeft, ay: cy, right: gap };
        const r = o.colLeft - (Math.min(o.px, o.colLeft - LANE_PX) - 8);
        return { side: 'far', ax: o.colLeft, ay: cy, right: r };
    }

    /**
     * Lista desplegada (con barra): cuanto desplazarla para que la fila i quede a la altura de su punto (targetY, relativo a la ventana de
     * la lista) o, si el punto cae fuera, en el centro. Si la fila ya esta a esa altura (+- media fila), no se mueve (devuelve null).
     */
    function scrollFor(i, rowH, viewH, total, scrollTop, targetY) {
        const t = targetY >= 0 && targetY <= viewH ? targetY : viewH / 2;
        const now = i * rowH - scrollTop + rowH / 2;
        if (Math.abs(now - t) <= rowH / 2) return null;
        return Math.max(0, Math.min(Math.max(0, total - viewH), i * rowH + rowH / 2 - t));
    }

    /** Ruta SVG del cable: del punto (px,py) a la fila (ax,ay), con el tramo horizontal hasta el carril (ax - LANE_PX). */
    function wirePath(px, py, ax, ay) {
        const r = (v) => Math.round(v * 10) / 10;
        const lane = ax - LANE_PX;
        if (px >= lane) return 'M' + r(px) + ' ' + r(py) + 'L' + r(ax) + ' ' + r(ay);
        return 'M' + r(px) + ' ' + r(py) + 'H' + r(lane) + 'L' + r(ax) + ' ' + r(ay);
    }

    /** Segmentos de un cable (para las pruebas: comprobar que no se cruzan). */
    function wireSegments(px, py, ax, ay) {
        const lane = ax - LANE_PX;
        return px >= lane ? [[px, py, ax, ay]] : [[px, py, lane, py], [lane, py, ax, ay]];
    }
    function segmentsCross(a, b) {
        const [x1, y1, x2, y2] = a; const [x3, y3, x4, y4] = b;
        const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3); if (Math.abs(d) < 1e-9) return false;
        const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d; const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
        return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
    }

    return { LANE_PX, pickRows, placeRows, placeRowsPinned, bubblePlace, scrollFor, wirePath, wireSegments, segmentsCross };
}));
