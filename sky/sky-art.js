/* sky-art.js - Dibujos de las constelaciones sobre el cielo (el creador, 2026-11-18: «mete una capa de dibujos que se ajusten al nombre de cada
 * constelación (toggle para enable/disable en config). Si se toca ese dibujo/constelación debe aparecer algo de historia acerca de cómo se
 * llegó a llamar así»).
 *
 * Los dibujos son las ilustraciones de Johan Meuris para Stellarium (Free Art License), que se cargan en ejecucion desde el repositorio de
 * Stellarium (no estan copiadas aqui). Cada una trae tres estrellas de anclaje (data/sky/constellation-art.json, CC BY-SA): el pixel de la
 * imagen que cae sobre cada estrella. Con las tres posiciones en pantalla queda fijada la transformacion afin de la imagen; vale para
 * cualquier proyeccion (la carta del cenit, la vista al apuntar con el movil) porque una constelacion es pequeña frente a la esfera.
 * Las imagenes son dibujo gris sobre negro: se suman a la luz del cielo (mezcla «screen»), el negro no tapa nada.
 * PURO salvo draw (canvas); la geometria se prueba en Node (scripts/check-sky-art.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSkyArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Transformacion afin [a, b, c, d, e, f] (x = a u + c v + e, y = b u + d v + f) que lleva los tres puntos src [u, v] a dst [x, y]; null si
     *  los tres puntos de origen estan alineados. */
    function affine3(src, dst) {
        const [[u1, v1], [u2, v2], [u3, v3]] = src;
        const det = u1 * (v2 - v3) + u2 * (v3 - v1) + u3 * (v1 - v2);
        if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
        const solve = (k) => {
            const [y1, y2, y3] = dst.map((p) => p[k]);
            const A = (y1 * (v2 - v3) + y2 * (v3 - v1) + y3 * (v1 - v2)) / det;
            const C = (u1 * (y2 - y3) + u2 * (y3 - y1) + u3 * (y1 - y2)) / det;
            const E = (u1 * (v2 * y3 - v3 * y2) + u2 * (v3 * y1 - v1 * y3) + u3 * (v1 * y2 - v2 * y1)) / det;
            return [A, C, E];
        };
        const [a, c, e] = solve(0); const [b, d, f] = solve(1);
        return [a, b, c, d, e, f];
    }
    const apply = (M, u, v) => [M[0] * u + M[2] * v + M[4], M[1] * u + M[3] * v + M[5]];

    const HIPIDX = typeof WeakMap === 'function' ? new WeakMap() : null;
    /** Indice del catalogo de cada HIP (se calcula una vez por catalogo). */
    function hipIndex(cat) {
        const hit = HIPIDX && HIPIDX.get(cat); if (hit) return hit;
        const m = new Map(); for (let i = 0; i < cat.n; i++) m.set(cat.hip[i], i);
        if (HIPIDX) HIPIDX.set(cat, m); return m;
    }

    /**
     * Donde va cada dibujo en pantalla: [{ iau, M, quad: [[x, y] x 4], w, h }]. proj(i): posicion en pantalla de la estrella i del catalogo o
     * null. Se descartan los que se deformarian demasiado (cerca del borde de la proyeccion) o caen fuera de la pantalla (w x h).
     */
    function place(data, cat, proj, w, h) {
        if (!data || !data.art || !cat) return [];
        const idx = hipIndex(cat); const out = [];
        for (const iau of Object.keys(data.art)) {
            const a = data.art[iau]; const pts = []; let ok = true;
            for (const [, , hip] of a.anchors) { const i = idx.get(hip); const p = i === undefined ? null : proj(i); if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { ok = false; break; } pts.push([p[0], p[1]]); }
            if (!ok) continue;
            const M = affine3(a.anchors.map((x) => [x[0], x[1]]), pts); if (!M) continue;
            const W = a.size[0]; const H = a.size[1];
            const quad = [apply(M, 0, 0), apply(M, W, 0), apply(M, W, H), apply(M, 0, H)];
            // deformacion: la razon entre los dos ejes de la imagen en pantalla; muy estirada (o volteada), fuera
            const sx = Math.hypot(M[0], M[1]); const sy = Math.hypot(M[2], M[3]); const det = M[0] * M[3] - M[1] * M[2];
            if (!(sx > 0 && sy > 0) || Math.max(sx / sy, sy / sx) > 3 || Math.abs(det) / (sx * sy) < 0.35) continue;
            const xs = quad.map((q) => q[0]); const ys = quad.map((q) => q[1]);
            const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
            if (Math.max(...xs) < 0 || Math.min(...xs) > w || Math.max(...ys) < 0 || Math.min(...ys) > h || bw > 6 * Math.max(w, h) || bh > 6 * Math.max(w, h)) continue;
            out.push({ iau, M, quad, w: W, h: H, mirrored: det < 0 });
        }
        return out;
    }

    /** Dibuja los colocados (place) que ya tengan imagen (img(iau) -> imagen cargada o null). alpha: opacidad. */
    function draw(ctx, placed, img, alpha) {
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = alpha == null ? 0.6 : alpha;
        placed.forEach((p) => {
            const im = img(p.iau); if (!im) return;
            ctx.save(); ctx.transform(p.M[0], p.M[1], p.M[2], p.M[3], p.M[4], p.M[5]); ctx.drawImage(im, 0, 0, p.w, p.h); ctx.restore();
        });
        ctx.restore();
    }

    /** Dentro de un cuadrilatero convexo (en cualquier sentido de giro). */
    function inQuad(q, x, y) {
        let sgn = 0;
        for (let i = 0; i < 4; i++) {
            const [x1, y1] = q[i]; const [x2, y2] = q[(i + 1) % 4];
            const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
            if (c !== 0) { const s = c > 0 ? 1 : -1; if (sgn && s !== sgn) return false; sgn = s; }
        }
        return true;
    }
    /** Que dibujo hay en (x, y): de los que lo contienen, aquel cuyo centro queda mas cerca (los dibujos se solapan). */
    function hit(placed, x, y) {
        let best = null; let bd = Infinity;
        (placed || []).forEach((p) => {
            if (!inQuad(p.quad, x, y)) return;
            const cx = p.quad.reduce((s, q) => s + q[0], 0) / 4; const cy = p.quad.reduce((s, q) => s + q[1], 0) / 4; const d = Math.hypot(cx - x, cy - y);
            if (d < bd) { bd = d; best = p.iau; }
        });
        return best;
    }

    /**
     * La seccion que cuenta de donde viene el nombre, del texto plano de un articulo de Wikipedia con las secciones marcadas (== Titulo ==):
     * la primera cuyo titulo hable de historia, mitologia, etimologia o nombre; si no hay, la introduccion. Se corta en un parrafo, sin pasar
     * de max caracteres. Devuelve { section: titulo o null, text }.
     */
    const SECTION_RE = /histor|mitolog|mytholog|etimolog|etymolog|nombre|name|origen|origin/i;
    function pickSection(extract, max) {
        const lim = max || 1100;
        const parts = String(extract || '').split(/\n(?===+[^=\n]+=+\s*\n)/);
        const intro = parts[0].trim();
        const secs = parts.slice(1).map((p) => /^(=+)\s*([^=\n]+?)\s*=+\s*\n([\s\S]*)$/.exec(p)).filter(Boolean).map((m) => ({ level: m[1].length, title: m[2], text: m[3].trim() }));
        let title = null; let body = '';
        for (let i = 0; i < secs.length; i++) {
            if (!SECTION_RE.test(secs[i].title)) continue;
            // con sus subsecciones (las de nivel mas hondo que la siguen), sin sus titulos
            const out = [secs[i].text]; for (let j = i + 1; j < secs.length && secs[j].level > secs[i].level; j++) out.push(secs[j].text);
            const b = out.filter(Boolean).join('\n\n').trim(); if (b.length < 80) continue;
            title = secs[i].title; body = b; break;
        }
        const txt = (body || intro).trim();
        if (txt.length <= lim) return { section: title, text: txt };
        const cut = txt.slice(0, lim); const at = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
        return { section: title, text: (at > lim * 0.5 ? cut.slice(0, at + 1) : cut).trim() + ' …' };
    }

    return { affine3, hipIndex, place, draw, inQuad, hit, pickSection };
});
