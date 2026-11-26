/* sky-art.js - Dibujos de las constelaciones sobre el cielo (el creador, 2026-11-18: «mete una capa de dibujos que se ajusten al nombre de cada
 * constelación (toggle para enable/disable en config). Si se toca ese dibujo/constelación debe aparecer algo de historia acerca de cómo se
 * llegó a llamar así»).
 *
 * Los dibujos son las ilustraciones de Johan Meuris para Stellarium (Free Art License), que se cargan en ejecucion desde el repositorio de
 * Stellarium (no estan copiadas aqui). Cada una trae tres estrellas de anclaje (data/sky/constellation-art.json, CC BY-SA): el pixel de la
 * imagen que cae sobre cada estrella. Con las tres posiciones en pantalla queda fijada la transformacion afin de la imagen; vale para
 * cualquier proyeccion (la carta del cenit, la vista al apuntar con el movil) porque una constelacion es pequeña frente a la esfera.
 * Las imagenes son dibujo gris sobre negro: se suman a la luz del cielo (mezcla «screen»), el negro no tapa nada. Al cargarlas se les sube el
 * contraste (toneImage: enfoque y curva) y se suman con poca opacidad (ALPHA).
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
     * PEGADO A LA ESFERA (el creador, 2026-11-18: «no se quedan ajustados a las estrellas. Están cambiando de forma según el ángulo desde el
     * que se ven»). Antes cada dibujo era una imagen plana estirada (afin) para que sus tres estrellas cayeran en su sitio en pantalla: con
     * perspectiva, al girar, el resto del dibujo se torcia respecto a las demas estrellas. Ahora, como Stellarium, la imagen va a la ESFERA:
     * una aplicacion lineal L lleva (u, v, 1) de la imagen a R3 con L(u_i, v_i, 1) = direccion de la estrella de anclaje i, y cada punto de la
     * imagen es la direccion normalize(L(u, v, 1)) (el plano de la imagen proyectado desde el centro de la esfera). Esa direccion se proyecta
     * a pantalla igual que las estrellas, asi que el dibujo se deforma exactamente como ellas al mirarlo desde otro angulo.
     */
    function inv3(m) {
        const [a, b, c] = m[0]; const [d, e, f] = m[1]; const [g, h, i] = m[2];
        const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
        const det = a * A + b * B + c * C; if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
        return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
    }
    /** L (3x3) con L * [u_i, v_i, 1] = dirs[i] para los tres anclajes; null si los puntos de la imagen estan alineados. */
    function sphereMap(uv, dirs) {
        const Ai = inv3([[uv[0][0], uv[1][0], uv[2][0]], [uv[0][1], uv[1][1], uv[2][1]], [1, 1, 1]]); if (!Ai) return null;
        const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) L[r][c] = dirs[0][r] * Ai[0][c] + dirs[1][r] * Ai[1][c] + dirs[2][r] * Ai[2][c];
        return L;
    }
    /** Direccion (unitaria) del punto (u, v) de la imagen. */
    function dirAt(L, u, v) {
        const x = L[0][0] * u + L[0][1] * v + L[0][2]; const y = L[1][0] * u + L[1][1] * v + L[1][2]; const z = L[2][0] * u + L[2][1] * v + L[2][2];
        const n = Math.hypot(x, y, z) || 1; return [x / n, y / n, z / n];
    }

    /**
     * Malla de cada dibujo en pantalla: [{ iau, w, h, g, pts }] con pts[(j * (g + 1) + i)] = [x, y] (o null) del punto (i/g, j/g) de la
     * imagen. dir(i): direccion de la estrella i del catalogo (en el marco que use quien dibuja) o null; proj(v): esa direccion en pantalla
     * [x, y] o null (detras de la camara). Fuera los que no tocan la pantalla (w x h).
     */
    function place(data, cat, dir, proj, w, h, grid) {
        if (!data || !data.art || !cat) return [];
        const idx = hipIndex(cat); const out = []; const g = grid || 3;      // 3 x 3: error de un par de pixeles, la mitad de trabajo que 4 x 4 (se redibuja en cada fotograma al girar)
        for (const iau of Object.keys(data.art)) {
            const a = data.art[iau]; const ds = []; let ok = true;
            for (const [, , hip] of a.anchors) { const i = idx.get(hip); const d = i === undefined ? null : dir(i); if (!d) { ok = false; break; } const n = Math.hypot(d[0], d[1], d[2]) || 1; ds.push([d[0] / n, d[1] / n, d[2] / n]); }
            if (!ok) continue;
            const L = sphereMap(a.anchors.map((x) => [x[0], x[1]]), ds); if (!L) continue;
            const W = a.size[0]; const H = a.size[1]; const pts = []; let any = false; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let j = 0; j <= g; j++) for (let i = 0; i <= g; i++) {
                const p = proj(dirAt(L, W * i / g, H * j / g));
                if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) { pts.push([p[0], p[1]]); any = true; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } else pts.push(null);
            }
            if (!any || x1 < 0 || x0 > w || y1 < 0 || y0 > h) continue;
            out.push({ iau, w: W, h: H, g, pts, L });
        }
        return out;
    }
    /** Los triangulos de la malla: [[u, v] x3 de la imagen, [x, y] x3 de pantalla]. */
    function triangles(p) {
        const out = []; const g = p.g; const at = (i, j) => p.pts[j * (g + 1) + i]; const uv = (i, j) => [p.w * i / g, p.h * j / g];
        for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
            const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
            if (a && b && c) out.push([[uv(i, j), uv(i + 1, j), uv(i + 1, j + 1)], [a, b, c]]);
            if (a && c && d) out.push([[uv(i, j), uv(i + 1, j + 1), uv(i, j + 1)], [a, c, d]]);
        }
        return out;
    }

    /**
     * Dibuja las mallas (place) que ya tengan imagen (img(iau) -> imagen o null): cada triangulo de la imagen en su triangulo de pantalla.
     * Para que no se vean costuras ni se sumen los bordes, la malla de cada dibujo se pinta opaca en un lienzo aparte (off, del mismo tamaño
     * que el de destino) y se suma una sola vez a la luz del cielo (mezcla «screen») con la opacidad alpha, dibujo a dibujo.
     */
    /*
     * Tono de los dibujos (el creador, 2026-11-26: «que las figuras de las constelaciones se vean menos y algo más contrastadas»). Las
     * ilustraciones son gris plano (~98 de 255) con sombras (~56) y trazos negros, sobre negro: sumadas al cielo al 25 % quedaban como manchas
     * grises lavadas. Bajar solo la opacidad las apagaba sin hacerlas mas nitidas (probado). Ahora, una vez por imagen al cargarla (toneImage):
     *   1) mascara de enfoque (unsharp mask, sigma TONE.sigma px en una imagen de 512, fuerza TONE.k): junto a los trazos el relleno se aclara
     *      y el trazo se queda negro, el interior liso no cambia: los trazos y los contornos resaltan;
     *   2) curva (TONE.lo .. TONE.hi -> 0 .. 255): lo oscuro a negro;
     * y se suman al cielo con menos opacidad (ALPHA, antes 0,25). Medido en la Osa Mayor, en luz sumada al cielo: el interior pasa de ~24 a ~14
     * (de 255) y la luz total baja ~38 %; los bordes junto a los trazos quedan como antes o algo por encima. Se ven menos y se leen mejor.
     */
    const TONE = { lo: 30, hi: 180, sigma: 6, k: 1.5 };
    // 0,12 el 26-11 a las 3:00; a las 3:20, con solo el dibujo del centro: «y no tanto. menos»
    const ALPHA = 0.085;

    /*
     * Solo el dibujo del centro (el creador, 2026-11-26: «haz que a medida que se aproxima al centro, se vaya viendo la constelación central, y
     * las demás desaparezcan… me refiero solo al dibujo», «cuando se ve el cielo solo se vea la central»). Peso de cada dibujo segun la
     * distancia en pantalla de su centro al centro de la vista (R = medio lado menor):
     *   - se va viendo al acercarse: 0 a mas de FOCUS.far R, entero a menos de FOCUS.near R;
     *   - solo el central: el que no es el mas cercano se apaga en cuanto esta FOCUS.band R mas lejos que el (cuando dos estan casi igual de
     *     cerca, se cruzan sin saltos).
     * Las lineas y los nombres de las constelaciones no cambian.
     */
    const FOCUS = { near: 0.2, far: 0.9, band: 0.12 };
    const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    /** Centro en pantalla de un dibujo colocado (media de los puntos de su malla). */
    function centerOf(p) {
        let x = 0, y = 0, n = 0; (p.pts || p.quad || []).forEach((q) => { if (q) { x += q[0]; y += q[1]; n++; } });
        return n ? [x / n, y / n] : null;
    }
    /** Pesos (0..1) de los dibujos con la vista centrada en (cx, cy) y lado menor m, por level (0..1, el de motion; 1 si no se da); los deja
     *  tambien en p.wt (hit no ve los apagados). Devuelve la opacidad de cada uno: peso x alpha (ALPHA si no se da). */
    function focus(placed, cx, cy, m, alpha, level) {
        const R = 0.5 * m; const a = alpha == null ? ALPHA : alpha; const lv = level == null ? 1 : Math.max(0, Math.min(1, level));
        const d = placed.map((p) => { const c = centerOf(p); return c ? Math.hypot(c[0] - cx, c[1] - cy) : Infinity; });
        const dmin = Math.min(Infinity, ...d);
        return placed.map((p, k) => {
            p.wt = Number.isFinite(d[k]) ? lv * (1 - smooth(FOCUS.near * R, FOCUS.far * R, d[k])) * (1 - smooth(0, FOCUS.band * R, d[k] - dmin)) : 0;
            return p.wt * a;
        });
    }

    /*
     * Solo mientras se mueve (el creador, 2026-11-26, 3:36: «haz que si se suelta el arrastre, o se deja de mover, la imagen de la constelación
     * desaparezca lentamente»). Un nivel 0..1 por vista: al moverse sube en MOTION.fadeIn ms; al soltar el arrastre (stop) o tras MOTION.hold
     * ms sin moverse, baja a 0 en MOTION.fadeOut ms. Sin saltos: cada cambio parte del nivel que habia. PURO: el tiempo lo da quien llama.
     */
    const MOTION = { fadeIn: 300, hold: 200, fadeOut: 2600 };
    function motion() { return { on: false, last: -Infinity, t0: -Infinity, from: 0 }; }
    function motionRaw(m, now) {
        const e = smooth(0, 1, (now - m.t0) / (m.on ? MOTION.fadeIn : MOTION.fadeOut));
        return m.on ? m.from + (1 - m.from) * e : m.from * (1 - e);
    }
    function motionTick(m, now) { if (m.on && now - m.last > MOTION.hold) { const t = m.last + MOTION.hold; m.from = motionRaw(m, t); m.on = false; m.t0 = t; } }
    /** Nivel ahora. */
    function motionLevel(m, now) { motionTick(m, now); return motionRaw(m, now); }
    /** Se ha movido ahora. */
    function motionMove(m, now) { motionTick(m, now); if (!m.on) { m.from = motionRaw(m, now); m.on = true; m.t0 = now; } m.last = now; }
    /** Se ha soltado el arrastre: empieza a desaparecer ya (aunque el globo siga girando por inercia). */
    function motionStop(m, now) { motionTick(m, now); if (m.on) { m.from = motionRaw(m, now); m.on = false; m.t0 = now; } }
    /** Si aun hay que redibujar (subiendo, quieto en alto mientras se mueve, o bajando). */
    function motionBusy(m, now) { return m.on || motionLevel(m, now) > 0.002; }
    /** Tabla de 256 valores con la curva: (v - lo) / (hi - lo), recortada a [0, 1], por 255. */
    function toneLut(o) {
        const t = Object.assign({}, TONE, o || {}); const lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.max(0, Math.min(1, (v - t.lo) / (t.hi - t.lo))));
        return lut;
    }
    /** Desenfoque casi gaussiano (tres pasadas de caja, horizontal y vertical) de una imagen gris w x h (Float32Array). */
    function blur(src, w, h, sigma) {
        const r = Math.max(1, Math.round(Math.sqrt(12 * sigma * sigma / 3 + 1) / 2));
        let a = Float32Array.from(src); let b = new Float32Array(src.length); const n = 2 * r + 1;
        const pass = (from, to, len, count, step, stride) => {
            for (let c = 0; c < count; c++) {
                const o = c * stride; let sum = 0;
                for (let i = -r; i <= r; i++) sum += from[o + Math.min(len - 1, Math.max(0, i)) * step];
                for (let i = 0; i < len; i++) {
                    to[o + i * step] = sum / n;
                    sum += from[o + Math.min(len - 1, i + r + 1) * step] - from[o + Math.max(0, i - r) * step];
                }
            }
        };
        for (let k = 0; k < 3; k++) { pass(a, b, w, h, 1, w); [a, b] = [b, a]; pass(a, b, h, w, w, 1); [a, b] = [b, a]; }
        return a;
    }
    /** Contraste a unos pixeles RGBA (ImageData.data) de w x h: enfoque y curva; el resultado es gris (las ilustraciones ya lo son). Devuelve
     *  los mismos pixeles. */
    function toneImage(data, w, h, o) {
        const t = Object.assign({}, TONE, o || {}); const lut = toneLut(t); const g = new Float32Array(w * h);
        for (let i = 0; i < g.length; i++) g[i] = (data[4 * i] + data[4 * i + 1] + data[4 * i + 2]) / 3;
        const bl = blur(g, w, h, t.sigma * Math.max(w, h) / 512);
        for (let i = 0; i < g.length; i++) {
            const v = lut[Math.max(0, Math.min(255, Math.round(g[i] + t.k * (g[i] - bl[i]))))];
            data[4 * i] = v; data[4 * i + 1] = v; data[4 * i + 2] = v;
        }
        return data;
    }

    /** alpha: un numero para todos, o uno por dibujo (focus). Los que quedan casi a 0 no se pintan (ni se pide su imagen). */
    function draw(ctx, placed, img, alpha, off) {
        if (!placed.length) return;
        const al = (k) => (Array.isArray(alpha) ? alpha[k] : alpha == null ? ALPHA : alpha);
        const tri = (c2, im, k, p) => triangles(p).forEach(([s, d]) => {
            const M = affine3(s, d); if (!M) return;
            // el triangulo de pantalla, medio pixel mas grande (sin rendijas entre vecinos del mismo dibujo)
            const cx = (d[0][0] + d[1][0] + d[2][0]) / 3; const cy = (d[0][1] + d[1][1] + d[2][1]) / 3;
            const grow = (q) => { const dx = q[0] - cx; const dy = q[1] - cy; const l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * 0.6, q[1] + dy / l * 0.6]; };
            const e = d.map(grow);
            const su = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]) - 1)); const sv = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]) - 1));
            const sw = Math.min(p.w, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]) + 1)) - su; const sh = Math.min(p.h, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1]) + 1)) - sv;
            if (!(sw > 0 && sh > 0)) return;
            c2.save(); c2.beginPath(); c2.moveTo(e[0][0], e[0][1]); c2.lineTo(e[1][0], e[1][1]); c2.lineTo(e[2][0], e[2][1]); c2.closePath(); c2.clip();
            c2.transform(M[0], M[1], M[2], M[3], M[4], M[5]); c2.drawImage(im, su * k, sv * k, sw * k, sh * k, su, sv, sw, sh); c2.restore();
        });
        if (!off) {        // sin lienzo aparte (pruebas): directo, con costuras
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            placed.forEach((p, k) => { if (!(al(k) > 0.002)) return; const im = img(p.iau); if (im) { ctx.globalAlpha = al(k); tri(ctx, im, (im.naturalWidth || im.width) / p.w, p); } });
            ctx.restore(); return;
        }
        if (off.width !== ctx.canvas.width || off.height !== ctx.canvas.height) { off.width = ctx.canvas.width; off.height = ctx.canvas.height; }
        const c2 = off.getContext('2d'); const T = ctx.getTransform(); const W = off.width; const H = off.height;
        // UNO A UNO (2026-11-18): las imagenes llevan fondo negro opaco; pintadas todas en el mismo lienzo, el negro de una tapaba a la que
        // quedaba debajo (Capricornio solo asomaba fuera de la malla de Acuario, cortado en recta). Cada dibujo se pinta solo en su recuadro
        // y se suma al cielo antes del siguiente: los que se solapan se ven los dos.
        placed.forEach((p, k) => {
            const a = al(k); if (!(a > 0.002)) return;
            const im = img(p.iau); if (!im) return;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            p.pts.forEach((q) => { if (!q) return; const X = T.a * q[0] + T.c * q[1] + T.e; const Y = T.b * q[0] + T.d * q[1] + T.f; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; });
            const bx = Math.max(0, Math.floor(x0) - 2); const by = Math.max(0, Math.floor(y0) - 2); const bw = Math.min(W, Math.ceil(x1) + 2) - bx; const bh = Math.min(H, Math.ceil(y1) + 2) - by;
            if (!(bw > 0 && bh > 0)) return;
            c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(bx, by, bw, bh); c2.setTransform(T);
            tri(c2, im, (im.naturalWidth || im.width) / p.w, p);
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a;
            ctx.drawImage(off, bx, by, bw, bh, bx, by, bw, bh); ctx.restore();
        });
    }

    /** Dentro de un triangulo. */
    function inTri(t, x, y) {
        const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        const d1 = s(t[0], t[1]); const d2 = s(t[1], t[2]); const d3 = s(t[2], t[0]);
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
    /** Dentro de un cuadrilatero convexo (en cualquier sentido de giro). */
    function inQuad(q, x, y) { return inTri([q[0], q[1], q[2]], x, y) || inTri([q[0], q[2], q[3]], x, y); }
    /** Que dibujo hay en (x, y): de los que lo contienen, aquel cuyo centro queda mas cerca (los dibujos se solapan). */
    function hit(placed, x, y) {
        let best = null; let bd = Infinity;
        (placed || []).forEach((p) => {
            if (p.wt !== undefined && p.wt < 0.25) return;      // apagado (focus): no se toca
            const tris = p.pts ? triangles(p).map((t) => t[1]) : [[p.quad[0], p.quad[1], p.quad[2]], [p.quad[0], p.quad[2], p.quad[3]]];
            if (!tris.some((t) => inTri(t, x, y))) return;
            const pts = tris.flat(); const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length; const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length; const d = Math.hypot(cx - x, cy - y);
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

    return { affine3, hipIndex, sphereMap, dirAt, place, triangles, draw, inQuad, hit, pickSection, TONE, ALPHA, toneLut, blur, toneImage, FOCUS, focus, centerOf, MOTION, motion, motionLevel, motionMove, motionStop, motionBusy };
});
