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

    /**
     * Lista entera por APARTADOS (el creador, 2026-11-15: la lista «puede ser dificil de navegar… podria haber apartados titulados», con
     * «un cambio en el color de fondo para cada pais»). items: [{ id, y, ... }]; keyOf(it) -> { key, name, color } o null (sin pais).
     * Apartados en el orden en que aparecen de arriba abajo en pantalla (el de su punto mas alto); dentro, por altura. Sin pais, al final.
     * Devuelve [{ key, name, color, items }].
     */
    function groupRows(items, keyOf) {
        const groups = new Map();
        for (const it of items || []) {
            const g = keyOf(it); const key = g && g.key ? g.key : '';
            if (!groups.has(key)) groups.set(key, { key, name: g && g.key ? g.name || g.key : '', color: g && g.key ? g.color || null : null, items: [] });
            groups.get(key).items.push(it);
        }
        const out = [...groups.values()];
        out.forEach((g) => g.items.sort((a, b) => a.y - b.y || String(a.id).localeCompare(String(b.id))));
        out.sort((a, b) => (a.key === '') - (b.key === '') || a.items[0].y - b.items[0].y || a.key.localeCompare(b.key));
        return out;
    }

    /* ---- Rueda (el creador, 2026-11-15) ----
     * «Agrupar en la lista de la derecha. Colapsar paises. Colapsar por tipos… dentro de cada pais. Expandir automaticamente solo lo
     * necesario. Para tener vision mas amplia de todo. Reducir tamaño de items a la lejania del central. El central es el seleccionado.
     * Como si fuera una rueda con inercia.» Y: la seleccion sigue al centro EN TODO MOMENTO; en la columna y en la lista entera.
     * La rueda recorre los ELEMENTOS en orden (pais, tipo, altura en pantalla); la posicion es un numero continuo f (indice en esa
     * secuencia). Solo se despliega la rama del elemento del centro; lo demas queda en filas resumen («Francia · 34», «Batallas · 5»). */

    /**
     * Arbol: paises > tipos > elementos. items: [{ id, y }]; countryOf(it) -> { key, name, color } o null (sin pais); typeOf(it) ->
     * { key, name }. Paises en el orden en que aparecen de arriba abajo (su punto mas alto), sin pais al final; dentro, los tipos igual;
     * dentro, por altura. Devuelve { countries: [{ key, name, color, n, types: [{ key, name, n, items }] }], seq, at } con seq = elementos en
     * el orden de la rueda y at: Map id -> { c, t, k } (indices de pais, tipo y posicion en seq).
     */
    function buildTree(items, countryOf, typeOf) {
        const cs = new Map(); const seen = new Set();
        for (const it of items || []) {
            if (!it || it.id == null || seen.has(it.id) || !Number.isFinite(it.y)) continue; seen.add(it.id);
            const g = countryOf(it) || null; const ck = g && g.key ? g.key : '';
            if (!cs.has(ck)) cs.set(ck, { key: ck, name: ck ? g.name || ck : '', color: ck ? g.color || null : null, top: Infinity, tmap: new Map() });
            const c = cs.get(ck); c.top = Math.min(c.top, it.y);
            const ty = typeOf(it) || {}; const tk = ty.key || '?';
            if (!c.tmap.has(tk)) c.tmap.set(tk, { key: tk, name: ty.name || tk, top: Infinity, items: [] });
            const t = c.tmap.get(tk); t.top = Math.min(t.top, it.y); t.items.push(it);
        }
        const byTop = (a, b) => a.top - b.top || String(a.key).localeCompare(String(b.key));
        const countries = [...cs.values()].sort((a, b) => (a.key === '') - (b.key === '') || byTop(a, b)).map((c) => {
            const types = [...c.tmap.values()].sort(byTop).map((t) => ({ key: t.key, name: t.name, n: t.items.length, items: t.items.sort((a, b) => a.y - b.y || String(a.id).localeCompare(String(b.id))) }));
            return { key: c.key, name: c.name, color: c.color, n: types.reduce((s, t) => s + t.n, 0), types };
        });
        const seq = []; const at = new Map();
        countries.forEach((c, ci) => c.types.forEach((t, ti) => t.items.forEach((it) => { at.set(it.id, { c: ci, t: ti, k: seq.length }); seq.push(it); })));
        return { countries, seq, at };
    }

    /** Filas para un juego dado de paises abiertos (open: indices) y tipos desplegados (exp: "ci/ti"); anchor: fila de seq[kk]. */
    function wheelBuild(tree, kk, open, exp) {
        const rows = []; let anchor = -1; const id = tree.seq[kk].id; const flat = tree.countries.length === 1;
        tree.countries.forEach((c, ci) => {
            const copen = flat || open.has(ci);
            if (!flat) rows.push({ key: 'c:' + c.key, kind: 'country', open: copen, ci, n: c.n });
            if (!copen) return;
            c.types.forEach((t, ti) => {
                const topen = exp.has(ci + '/' + ti);
                rows.push({ key: 't:' + c.key + '/' + t.key, kind: 'type', open: topen, ci, ti, n: t.n });
                if (!topen) return;
                t.items.forEach((it) => { if (it.id === id) anchor = rows.length; rows.push({ key: 'i:' + it.id, kind: 'item', open: false, ci, ti, it, n: 1 }); });
            });
        });
        return { rows, anchor };
    }

    /**
     * Que se despliega (el creador, 2026-11-16: «igual aqui no es necesario contraer todo lo que se esta contrayendo… si sobra tanto
     * espacio… hacia arriba y hacia abajo»). Siempre, la rama del elemento del centro (su pais y su tipo). Con fit = { above, below } (px
     * libres a cada lado del centro), h = { item, type, country } (alto natural de cada clase de fila) y place (opciones de wheelPlace), lo
     * que quepa, medido con la colocacion real (las filas lejanas encogen): primero se abren los demas paises (su lista de tipos: la vista
     * mas amplia por menos sitio), del mas cercano al mas lejano; despues se despliegan los tipos en elementos, primero los del pais del
     * centro y luego los de los paises mas cercanos. Cada cosa ocupa sitio solo en su lado (arriba lo de antes, abajo lo de despues): lo que
     * no cabe en su lado se queda plegado, aunque sobre en el otro.
     */
    function wheelOpen(tree, kk, fit) {
        const pos = tree.at.get(tree.seq[kk].id);
        const open = new Set([pos.c]); const exp = new Set([pos.c + '/' + pos.t]);
        if (!fit) return { open, exp };
        const H = fit.h || { item: 26, type: 26, country: 22 };
        const room = { above: Math.max(0, fit.above || 0), below: Math.max(0, fit.below || 0) };
        const ext = () => {
            const { rows, anchor } = wheelBuild(tree, kk, open, exp); const p = wheelPlace(rows.map((r) => H[r.kind] || 0), anchor, 0, 0, fit.place);
            return { above: -p[0].y, below: p[p.length - 1].y + p[p.length - 1].h };
        };
        const side = (ci, ti) => (ci !== pos.c ? (ci < pos.c ? 'above' : 'below') : ti < pos.t ? 'above' : 'below');
        const fits = (sd) => ext()[sd] <= room[sd] + 0.5;
        // 1) paises, del mas cercano al mas lejano (a igual distancia, primero el de abajo: se lee hacia abajo)
        const cs = tree.countries.map((c, ci) => ci).filter((ci) => ci !== pos.c).sort((x, y) => Math.abs(x - pos.c) - Math.abs(y - pos.c) || y - x);
        if (tree.countries.length > 1) cs.forEach((ci) => { open.add(ci); if (!fits(side(ci, 0))) open.delete(ci); });
        // 2) tipos: los del pais del centro por cercania al tipo del centro; despues los de los paises abiertos, por cercania del pais
        const ts = [];
        tree.countries[pos.c].types.forEach((t, ti) => { if (ti !== pos.t) ts.push([pos.c, ti, Math.abs(ti - pos.t)]); });
        tree.countries.forEach((c, ci) => {
            if (ci === pos.c || !open.has(ci)) return; const dc = 1000 * Math.abs(ci - pos.c);
            c.types.forEach((t, ti) => ts.push([ci, ti, dc + (ci < pos.c ? c.types.length - 1 - ti : ti)]));      // de su lado mas cercano hacia fuera
        });
        ts.sort((x, y) => x[2] - y[2] || y[0] - x[0]);
        ts.forEach(([ci, ti]) => { const key = ci + '/' + ti; exp.add(key); if (!fits(side(ci, ti))) exp.delete(key); });
        return { open, exp };
    }

    /**
     * Filas de la rueda con el elemento seq[k] en el centro. Cada pais cerrado es UNA fila; el abierto, su cabecera y sus tipos; cada tipo
     * plegado es una fila; el desplegado, su cabecera y sus elementos. Siempre esta abierta la rama del elemento del centro (marcada cur);
     * con `fit`, ademas lo que quepa (wheelOpen). Con un solo pais no se pone fila de pais.
     * Devuelve { rows: [{ key, kind: 'country'|'type'|'item', open, cur, ci, ti, it, n }], anchor } (anchor: fila del elemento k, o -1).
     */
    function wheelRows(tree, k, fit) {
        if (!tree || !tree.seq.length) return { rows: [], anchor: -1 };
        const kk = Math.max(0, Math.min(tree.seq.length - 1, Math.round(k) || 0));
        const { open, exp } = wheelOpen(tree, kk, fit);
        const out = wheelBuild(tree, kk, open, exp); const pos = tree.at.get(tree.seq[kk].id);
        out.rows.forEach((r) => { r.cur = r.kind !== 'item' && r.ci === pos.c && (r.kind === 'country' || r.ti === pos.t); });
        return out;
    }

    /**
     * Donde va cada fila: la del ancla centrada en centerY (desplazada `frac` hacia la siguiente o la anterior mientras gira); las demas
     * apiladas hacia arriba y abajo, cada una mas pequeña y tenue cuanto mas lejos del centro (en filas): escala max(minS, 1 - kS·d),
     * opacidad max(minO, 1 - kO·d). heights[i]: alto natural de cada fila. Devuelve [{ y (borde de arriba), h (alto ya escalado), s, o, d }].
     */
    function wheelPlace(heights, anchor, frac, centerY, opts) {
        const o = opts || {}; const kS = o.kS == null ? 0.07 : o.kS; const minS = o.minS == null ? 0.62 : o.minS;
        const kO = o.kO == null ? 0.1 : o.kO; const minO = o.minO == null ? 0.38 : o.minO;
        const n = heights.length; const out = new Array(n); if (!n) return out;
        const a = Math.max(0, Math.min(n - 1, anchor | 0)); const fr = Number.isFinite(frac) ? frac : 0;
        const sc = (d) => Math.max(minS, 1 - kS * Math.abs(d)); const op = (d) => Math.max(minO, 1 - kO * Math.abs(d));
        const put = (i, cy, d) => { const s = sc(d); const h = heights[i] * s; out[i] = { y: cy - h / 2, h, s, o: op(d), d }; return h; };
        // el centro de la rueda cae `fr` filas por debajo del centro del ancla: el ancla sube fr veces la distancia a su vecina
        const nb = fr >= 0 ? Math.min(n - 1, a + 1) : Math.max(0, a - 1);
        const gap = nb === a ? heights[a] : (heights[a] + heights[nb]) / 2;
        let hA = put(a, centerY - fr * gap, -fr);
        let cy = centerY - fr * gap; let hPrev = hA;
        for (let i = a + 1; i < n; i++) { const d = i - a - fr; const s = sc(d); cy += (hPrev + heights[i] * s) / 2; hPrev = put(i, cy, d); }
        cy = centerY - fr * gap; hPrev = hA;
        for (let i = a - 1; i >= 0; i--) { const d = i - a - fr; const s = sc(d); cy -= (hPrev + heights[i] * s) / 2; hPrev = put(i, cy, d); }
        return out;
    }

    /**
     * Un paso de la inercia (dt en segundos). st: { f, v (filas por segundo), to (destino, o null si gira libre) }; n: cuantos elementos.
     * Libre: avanza y frena (como el desplazamiento del sistema, ~0,33 s de constante); cuando va despacio, encaja en el entero mas cercano.
     * Con destino (un toque, o señalado en el globo): se acerca a el. Nunca sale de [0, n-1]. Devuelve el estado nuevo con done (parado).
     */
    const TAU_FREE = 0.33; const V_SNAP = 1.6; const TAU_SNAP = 0.085;
    function spinStep(st, dt, n) {
        const hi = Math.max(0, (n | 0) - 1); let f = Number.isFinite(st.f) ? st.f : 0; let v = Number.isFinite(st.v) ? st.v : 0; let to = st.to == null ? null : Math.max(0, Math.min(hi, Math.round(st.to)));
        const t = Math.max(0, Math.min(0.1, dt || 0));
        if (to == null) {
            f += v * t; v *= Math.exp(-t / TAU_FREE);
            if (f <= 0) { f = 0; v = Math.max(0, v); } else if (f >= hi) { f = hi; v = Math.min(0, v); }
            if (Math.abs(v) < V_SNAP) { to = Math.max(0, Math.min(hi, Math.round(f))); v = 0; }
        }
        if (to != null) { f = to + (f - to) * Math.exp(-t / TAU_SNAP); if (Math.abs(f - to) < 0.004) f = to; }
        f = Math.max(0, Math.min(hi, f));
        return { f, v, to, done: to != null && f === to };
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

    return { LANE_PX, pickRows, placeRows, placeRowsPinned, bubblePlace, scrollFor, groupRows, buildTree, wheelRows, wheelPlace, spinStep, wirePath, wireSegments, segmentsCross };
}));
