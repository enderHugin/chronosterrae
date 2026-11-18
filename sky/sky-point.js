/* sky-point.js - El cielo que hay detras del movil: se apunta con el telefono y se ven las estrellas, constelaciones, planetas, Sol y Luna
 * que hay en esa direccion (brujula y giroscopio del dispositivo).
 *
 * El creador, 2026-11-18: «en dispositivos móviles, ¿se puede hacer que el mapa estelar se vea ajustado a brújula y giroscopio de forma que si
 * lo miro con móvil apunta a las constelaciones?».
 *
 * Orientacion (W3C DeviceOrientation): la Tierra en ejes ENU (x este, y norte, z arriba); el telefono, x a la derecha de la pantalla, y hacia
 * su borde de arriba, z saliendo de la pantalla hacia quien la mira. R = Rz(alpha) * Rx(beta) * Ry(gamma) lleva del telefono a la Tierra (con
 * alpha absoluta: 0 = el borde de arriba al norte cuando esta plano). La camara de atras mira hacia -z: eso es lo que se ve «a traves» del
 * movil. Con la pantalla girada (apaisada), su «arriba» es otro eje del telefono (screenAngle).
 * Proyeccion estereografica centrada en la direccion a la que se apunta: conserva las formas (las constelaciones se reconocen) y lleva los
 * circulos de la esfera a circulos (el horizonte es una circunferencia o una recta en pantalla: asi se pinta el suelo).
 * Es PURO salvo draw (canvas); la geometria se prueba en Node (scripts/check-sky-point.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSkyPoint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEG = Math.PI / 180;
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    /** Direccion (ENU) de altura alt y acimut az (grados; acimut desde el norte hacia el este). */
    function altAzVec(alt, az) { const ca = Math.cos(alt * DEG); return [ca * Math.sin(az * DEG), ca * Math.cos(az * DEG), Math.sin(alt * DEG)]; }
    /** Altura y acimut (grados, acimut en [0, 360)) de una direccion ENU. */
    function vecAltAz(v) { const n = norm(v); let az = Math.atan2(n[0], n[1]) / DEG; if (az < 0) az += 360; return { alt: Math.asin(Math.max(-1, Math.min(1, n[2]))) / DEG, az }; }

    /**
     * Marco de vista a partir de la orientacion del telefono (grados) y del giro de la pantalla (screen.orientation.angle).
     * Devuelve { look, up, right } en ENU: hacia donde mira la camara de atras, el «arriba» y la «derecha» de la pantalla tal como se ve.
     */
    function frameFromOrientation(alpha, beta, gamma, screenAngle) {
        const a = (alpha || 0) * DEG; const b = (beta || 0) * DEG; const g = (gamma || 0) * DEG;
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
        // R = Rz(a) Rx(b) Ry(g), por columnas
        const R = [
            [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
            [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
            [-cb * sg, sb, cb * cg]
        ];
        const mul = (v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
        const t = (screenAngle || 0) * DEG;      // pantalla girada t en sentido antihorario: su arriba es (sin t, cos t) del telefono
        const look = norm(mul([0, 0, -1]));
        const up = norm(mul([Math.sin(t), Math.cos(t), 0]));
        return { look, up, right: norm(cross(look, up)) };
    }
    /** Marco mirando a (alt, az) con la pantalla derecha (sin alabeo): para mirar arrastrando, sin sensores. */
    function frameFromAltAz(alt, az) {
        const a = Math.max(-89.9, Math.min(89.9, alt));
        const look = altAzVec(a, az); const up = altAzVec(a + 90, az);      // pasado el cenit, el coseno negativo ya lo vuelve hacia atras
        return { look, up: norm(up), right: norm(cross(look, up)) };
    }
    /** El marco girado alrededor de la vertical: el acimut aumenta en offset grados (brujula corregida: declinacion, alineado con un astro). */
    function rotateAz(fr, offset) {
        if (!offset) return fr;
        const o = offset * DEG; const c = Math.cos(o), s = Math.sin(o);
        const r = (v) => [v[0] * c + v[1] * s, v[1] * c - v[0] * s, v[2]];
        return { look: r(fr.look), up: r(fr.up), right: r(fr.right) };
    }
    // Marco <-> cuaternion (columnas: derecha, arriba y detras = -mirada; base de mano derecha)
    function toQuat(f) {
        const m00 = f.right[0], m01 = f.up[0], m02 = -f.look[0], m10 = f.right[1], m11 = f.up[1], m12 = -f.look[1], m20 = f.right[2], m21 = f.up[2], m22 = -f.look[2];
        const tr = m00 + m11 + m22; let q;
        if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; q = [0.25 * S, (m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S]; }
        else if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [(m21 - m12) / S, 0.25 * S, (m01 + m10) / S, (m02 + m20) / S]; }
        else if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m02 - m20) / S, (m01 + m10) / S, 0.25 * S, (m12 + m21) / S]; }
        else { const S = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m10 - m01) / S, (m02 + m20) / S, (m12 + m21) / S, 0.25 * S]; }
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((x) => x / l);
    }
    function fromQuat(q) {
        const [w, x, y, z] = q;
        const right = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
        const up = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
        const back = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
        return { look: norm([-back[0], -back[1], -back[2]]), up: norm(up), right: norm(right) };
    }
    /**
     * Suavizado: un paso de cur hacia tgt (k en (0, 1]; 1 = sin suavizar), girando por el camino corto (cuaterniones). El ruido de los sensores
     * tiembla; el telefono, no. (Mezclar los vectores sin mas se quedaba boca abajo al pasar por el cenit: el «arriba» de la pantalla da la
     * vuelta y la mezcla de dos vectores opuestos no sale de ahi. Se vio en la prueba, mirando al norte.)
     */
    function smooth(cur, tgt, k) {
        if (!cur) return tgt;
        if (k >= 1) return tgt;
        const a = toQuat(cur); let b = toQuat(tgt);
        let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        if (d < 0) { b = b.map((x) => -x); d = -d; }
        let q;
        if (d > 0.9995) q = a.map((x, i) => x + (b[i] - x) * k);
        else { const th = Math.acos(Math.min(1, d)); const s = Math.sin(th); const wa = Math.sin((1 - k) * th) / s; const wb = Math.sin(k * th) / s; q = a.map((x, i) => wa * x + wb * b[i]); }
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return fromQuat(q.map((x) => x / l));
    }
    /** Angulo (grados) entre dos marcos: cuanto se ha movido la mirada. */
    function angleBetween(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(a.look, b.look)))) / DEG; }

    /**
     * Proyector de la vista: (alt, az) -> [x, y, z] en pixeles de un lienzo w x h con campo de vision fov (grados, en el lado corto); z es el
     * coseno del angulo con la direccion de la mirada (1 en el centro, <0 detras). null si cae casi en la nuca (no se dibuja).
     */
    function projector(fr, fov, w, h) {
        const scale = (Math.min(w, h) / 2) / (2 * Math.tan(Math.max(5, Math.min(150, fov)) * DEG / 4));
        const cx = w / 2; const cy = h / 2;
        const fn = (v) => {
            const z = dot(v, fr.look); if (z < -0.75) return null;
            const k = 2 / (1 + z);
            return [cx + dot(v, fr.right) * k * scale, cy - dot(v, fr.up) * k * scale, z];
        };
        const p = (alt, az) => fn(altAzVec(alt, az));
        p.vec = fn; p.scale = scale;
        return p;
    }
    /**
     * El horizonte en pantalla y de que lado queda el suelo. En estereografica la circunferencia del horizonte es una circunferencia (o una
     * recta) del plano: { kind: 'circle', x, y, r, groundInside } o { kind: 'line', x1, y1, x2, y2, gx, gy } (g: un punto del lado del suelo).
     */
    function horizon(fr, fov, w, h) {
        const scale = (Math.min(w, h) / 2) / (2 * Math.tan(Math.max(5, Math.min(150, fov)) * DEG / 4)); const cx = w / 2; const cy = h / 2;
        const raw = (v) => { const z = dot(v, fr.look); const k = 2 / (1 + Math.max(z, -0.999999)); return [cx + dot(v, fr.right) * k * scale, cy - dot(v, fr.up) * k * scale]; };
        // tres puntos del horizonte lejos del punto opuesto a la mirada (que va al infinito)
        const back = vecAltAz([-fr.look[0], -fr.look[1], -fr.look[2]]).az;
        const P = [back + 90, back + 180, back + 270].map((az) => raw(altAzVec(0, az)));
        const [a, b, c] = P;
        const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        const nadir = [0, 0, -1]; const zn = dot(nadir, fr.look);
        if (Math.abs(d) < 1e-6 * scale * scale || Math.abs(fr.look[2]) < 1e-4) {        // horizonte recto: mirando al horizonte
            const g = zn > -0.999 ? raw(nadir) : [cx, cy + scale];
            return { kind: 'line', x1: a[0], y1: a[1], x2: c[0], y2: c[1], gx: g[0], gy: g[1] };
        }
        const s = (q) => q[0] * q[0] + q[1] * q[1];
        const ux = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
        const uy = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
        const r = Math.hypot(a[0] - ux, a[1] - uy);
        // el suelo es el lado del nadir; si el nadir es justo el punto opuesto a la mirada (se mira al cenit), el suelo queda fuera
        let groundInside = false;
        if (zn > -0.999) { const g = raw(nadir); groundInside = Math.hypot(g[0] - ux, g[1] - uy) < r; }
        return { kind: 'circle', x: ux, y: uy, r, groundInside };
    }

    const CARD = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];

    /**
     * Dibuja lo que hay en la direccion de la mirada. sky: ChronosSky.skyAt (con .stars si hay catalogo); fr: marco; opts: { fov, catalog,
     * names (Sol, Luna, planetas), cardinals ([N, NE, E, SE, S, SO, O, NO]), showStars, showLines, showNames, showConNames, dayStars, lang,
     * view (ChronosSkyView: colores y estilos compartidos con la carta) }. Devuelve lo dibujado [{ x, y, label, alt, az }] (para tocarlo).
     */
    function draw(canvas, sky, fr, opts) {
        const V = opts.view; const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
        const w = canvas.clientWidth || 320; const h = canvas.clientHeight || 480;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fov = opts.fov || 60; const P = projector(fr, fov, w, h); const drawn = [];
        const inView = (p, m) => p && p[0] > -m && p[1] > -m && p[0] < w + m && p[1] < h + m;
        // cielo
        const bg = (V.SKY_BG || {})[sky.twilight] || ['#070b16', '#03060d'];
        const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg[1]); gr.addColorStop(1, bg[0]);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
        const limit = opts.dayStars ? 6.5 : (V.LIMIT_MAG || {})[sky.twilight] ?? 6.5;
        const cat = opts.catalog; const st = sky.stars;
        const px = cat ? new Float64Array(cat.n).fill(NaN) : null; const py = cat ? new Float64Array(cat.n).fill(NaN) : null;
        if (cat && st && opts.showStars) for (let i = 0; i < cat.n; i++) { if (st.alt[i] <= 0) continue; const p = P(st.alt[i], st.az[i]); if (inView(p, 40)) { px[i] = p[0]; py[i] = p[1]; } }
        // dibujos de las constelaciones (sky/sky-art.js), debajo de lineas y estrellas
        if (cat && st && opts.showStars && opts.art && opts.artLib) {
            const placed = opts.artLib.place(opts.art, cat, (i) => altAzVec(st.alt[i], st.az[i]), P.vec, w, h);      // pegados a la esfera
            opts.artLib.draw(ctx, placed, opts.artImg, 0.28, opts.artOff); drawn.art = placed;
            if (opts.artCredit && placed.length) { ctx.save(); ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,228,255,0.55)'; ctx.textAlign = 'right'; ctx.fillText(opts.artCredit, w - 10, 84); ctx.restore(); }      // arriba, bajo la barra: abajo la tapaba la de los avisos
        }
        // lineas de constelaciones
        if (cat && st && opts.showStars && opts.showLines) {
            ctx.strokeStyle = 'rgba(160,190,255,0.38)'; ctx.lineWidth = 1.1; ctx.beginPath();
            cat.constellations.forEach((c) => c.lines.forEach(([a, b]) => {
                if (st.alt[a] <= 0 || st.alt[b] <= 0) return;
                const p = P(st.alt[a], st.az[a]); const q = P(st.alt[b], st.az[b]); if (!p || !q || (!inView(p, 0) && !inView(q, 0))) return;
                if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.5 * Math.max(w, h)) return;
                ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
            }));
            ctx.stroke();
        }
        const placed = [];      // los rotulos de constelaciones y de estrellas se reparten el sitio (si no, se pisaban: Menkalinan sobre AURIGA)
        if (cat && st && opts.showStars && opts.showConNames) V.drawSkyLabels(ctx, cat, px, py, { conNames: true, starNames: false, lang: opts.lang, w, h, placed });
        // estrellas (mas grandes que en la carta: se miran de una en una)
        if (cat && st && opts.showStars) {
            const zoom = Math.max(0.8, Math.min(2.2, 60 / fov));
            for (let i = 0; i < cat.n; i++) {
                const x = px[i]; if (!Number.isFinite(x)) continue; const mag = cat.mag[i]; if (mag > limit) continue; const y = py[i];
                const r = V.starRadius(cat, i, Math.max(0.6, 3.2 - 0.5 * mag)) * zoom;
                ctx.globalAlpha = V.starAlpha(cat, i, 1); ctx.fillStyle = V.starColor(cat.bv[i]);
                ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
                const nm = cat.names[cat.hip[i]];
                if (nm) { const label = (opts.lang === 'es' && nm[1]) || nm[0]; drawn.push({ x, y, label: label + '  (' + mag.toFixed(1) + ')', alt: st.alt[i], az: st.az[i] }); }
            }
            ctx.globalAlpha = 1;
            if (opts.showNames) V.drawSkyLabels(ctx, cat, px, py, { conNames: false, starNames: true, lang: opts.lang, starMag: 2.6, w, h, placed });
        }
        // planetas, Sol y Luna
        (sky.planets || []).forEach((pl) => {
            if (pl.alt <= 0) return; const p = P(pl.alt, pl.az); if (!inView(p, 20)) return;
            const r = Math.max(3, 5.2 - 0.4 * pl.mag);
            ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI); ctx.fillStyle = (V.PLANET_COLOR || {})[pl.id] || '#fff'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(opts.names[pl.id], p[0] + r + 4, p[1] + 4);
            drawn.push({ x: p[0], y: p[1], label: opts.names[pl.id] + '  (' + pl.mag.toFixed(1) + ')', alt: pl.alt, az: pl.az });
        });
        const sun = sky.sun; const moon = sky.moon;
        if (sun && sun.alt > -1) {
            const p = P(Math.max(0, sun.alt), sun.az);
            if (inView(p, 40)) {
                const glow = ctx.createRadialGradient(p[0], p[1], 3, p[0], p[1], 34); glow.addColorStop(0, 'rgba(255,230,120,0.95)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p[0], p[1], 34, 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.fill();
                drawn.push({ x: p[0], y: p[1], label: opts.names.Sun, alt: sun.alt, az: sun.az });
            }
        }
        if (moon && moon.alt > -1) {
            const p = P(Math.max(0, moon.alt), moon.az);
            if (inView(p, 30)) {
                const s = P(sun.alt, sun.az); const theta = s ? Math.atan2(s[1] - p[1], s[0] - p[0]) : 0;
                V.drawMoon(ctx, p[0], p[1], 11, theta, moon.phaseFraction);
                drawn.push({ x: p[0], y: p[1], label: opts.names.Moon + '  ' + Math.round(Math.max(0, Math.min(1, moon.phaseFraction)) * 100) + ' %', alt: moon.alt, az: moon.az });
            }
        }
        // suelo (lo que queda bajo el horizonte) y la linea del horizonte
        const hz = horizon(fr, fov, w, h);
        ctx.save(); ctx.fillStyle = 'rgba(14,18,14,0.86)'; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        if (hz.kind === 'circle') {
            ctx.beginPath(); if (!hz.groundInside) ctx.rect(0, 0, w, h); ctx.arc(hz.x, hz.y, hz.r, 0, 2 * Math.PI); ctx.fill(hz.groundInside ? 'nonzero' : 'evenodd');
            ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, 2 * Math.PI); ctx.stroke();
        } else {
            // media pantalla del lado del suelo: el poligono de la recta prolongada
            const dx = hz.x2 - hz.x1; const dy = hz.y2 - hz.y1; const L = Math.hypot(dx, dy) || 1; const ex = dx / L * 4 * (w + h); const ey = dy / L * 4 * (w + h);
            let nx = -dy / L; let ny = dx / L; if ((hz.gx - hz.x1) * nx + (hz.gy - hz.y1) * ny < 0) { nx = -nx; ny = -ny; }
            const A = [hz.x1 - ex, hz.y1 - ey]; const B = [hz.x1 + ex, hz.y1 + ey]; const k = 4 * (w + h);
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B[0] + nx * k, B[1] + ny * k); ctx.lineTo(A[0] + nx * k, A[1] + ny * k); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        }
        ctx.restore();
        // puntos cardinales sobre el horizonte
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        CARD.forEach(([az, k], i) => {
            const p = P(0, az); if (!inView(p, 0)) return; const main = i % 2 === 0;
            ctx.font = (main ? '700 15px' : '600 11px') + ' system-ui, sans-serif'; ctx.fillStyle = main ? '#ffd27a' : 'rgba(255,220,150,0.8)';
            ctx.fillText((opts.cardinals && opts.cardinals[i]) || k, p[0], p[1] - 12);
            ctx.fillRect(p[0] - 0.75, p[1] - 4, 1.5, 8);
        });
        ctx.restore();
        // mira en el centro
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 14, 0, 2 * Math.PI); ctx.moveTo(w / 2 - 22, h / 2); ctx.lineTo(w / 2 - 16, h / 2); ctx.moveTo(w / 2 + 16, h / 2); ctx.lineTo(w / 2 + 22, h / 2);
        ctx.moveTo(w / 2, h / 2 - 22); ctx.lineTo(w / 2, h / 2 - 16); ctx.moveTo(w / 2, h / 2 + 16); ctx.lineTo(w / 2, h / 2 + 22); ctx.stroke(); ctx.restore();
        return drawn;
    }

    return { altAzVec, vecAltAz, toQuat, fromQuat, frameFromOrientation, frameFromAltAz, rotateAz, smooth, angleBetween, projector, horizon, draw };
});
