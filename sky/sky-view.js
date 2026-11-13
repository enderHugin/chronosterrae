/* sky-view.js - Dibuja la carta de cielo completo (solo navegador).
 *
 * Proyeccion azimutal equidistante centrada en el cenit, como se ve al mirar hacia arriba:
 * el norte arriba y el este a la IZQUIERDA. El horizonte es el borde del circulo.
 * Los simbolos (Sol, Luna, planetas) NO estan a escala: son marcas para localizarlos.
 */
(function (root) {
    'use strict';

    const DEG = Math.PI / 180;

    const SKY_BG = {   // fondo segun la altura del Sol
        day: ['#8cc2f0', '#5a9bd8'],
        civil: ['#46689a', '#2c4672'],
        nautical: ['#22375c', '#162844'],
        astronomical: ['#101d36', '#0b1527'],
        night: ['#070b16', '#03060d']
    };
    // Magnitud limite visible a simple vista segun la luz del cielo (aproximacion, no una medida).
    const LIMIT_MAG = { day: -99, civil: 0.5, nautical: 3, astronomical: 5, night: 6.5 };

    // Color aproximado de la estrella a partir de B-V.
    function starColor(bv) {
        if (!Number.isFinite(bv)) return 'rgb(255,255,255)';
        const stops = [[-0.3, [155, 176, 255]], [0.0, [202, 215, 255]], [0.4, [248, 247, 255]], [0.8, [255, 244, 218]], [1.2, [255, 210, 161]], [1.6, [255, 170, 110]], [2.0, [255, 140, 95]]];
        if (bv <= stops[0][0]) return 'rgb(' + stops[0][1].join(',') + ')';
        for (let i = 1; i < stops.length; i++) {
            if (bv <= stops[i][0]) {
                const [b0, c0] = stops[i - 1]; const [b1, c1] = stops[i];
                const t = (bv - b0) / (b1 - b0);
                return 'rgb(' + c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',') + ')';
            }
        }
        return 'rgb(' + stops[stops.length - 1][1].join(',') + ')';
    }

    const PLANET_COLOR = { Mercury: '#c9b8a0', Venus: '#fff6d8', Mars: '#ff8a65', Jupiter: '#ffe0b2', Saturn: '#e8d28c', Uranus: '#9be7e7', Neptune: '#7fa0ff' };

    /** Luna con su fase, con el lado iluminado hacia el angulo theta (direccion al Sol en pantalla, radianes). */
    function drawMoon(ctx, x, y, r, theta, phaseFraction) {
        const k = Math.max(0, Math.min(1, phaseFraction));
        ctx.save();
        ctx.translate(x, y); ctx.rotate(theta);
        ctx.fillStyle = 'rgba(40,46,60,0.95)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#f4f1e6';
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);                      // semicirculo iluminado (lado del Sol)
        const rx = r * Math.abs(2 * k - 1);
        if (k > 0.5) ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, false);   // gibosa: el terminador cede hacia el lado oscuro
        else ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);            // creciente o menguante: lo recorta hacia el lado del Sol
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.stroke();
        ctx.restore();
    }

    /**
     * @param canvas  <canvas>
     * @param sky     resultado de ChronosSky.skyAt (con .stars si hay catalogo)
     * @param opts    { catalog, names: {id: texto}, cardinals: [N,E,S,O], showStars, showNames, showLines, dayStars, lang }
     * @returns lista de objetos dibujados {x, y, label} para el texto emergente
     */
    function draw(canvas, sky, opts) {
        const dpr = Math.min(2, root.devicePixelRatio || 1);
        const css = canvas.clientWidth || 320;
        if (canvas.width !== Math.round(css * dpr)) { canvas.width = Math.round(css * dpr); canvas.height = Math.round(css * dpr); }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, css, css);
        const cx = css / 2; const cy = css / 2; const R = css / 2 - 18;
        const toXY = (alt, az) => {
            const r = (90 - alt) / 90 * R;
            return [cx - r * Math.sin(az * DEG), cy - r * Math.cos(az * DEG)];
        };
        const drawn = [];

        // Fondo del cielo
        const [c0, c1] = SKY_BG[sky.twilight];
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, c0); g.addColorStop(1, c1);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();

        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.clip();

        // Anillos de altura
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        [30, 60].forEach((a) => { ctx.beginPath(); ctx.arc(cx, cy, (90 - a) / 90 * R, 0, 2 * Math.PI); ctx.stroke(); });
        ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
        ctx.setLineDash([]);

        const limit = opts.dayStars ? 6.5 : LIMIT_MAG[sky.twilight];
        const cat = opts.catalog;
        const st = sky.stars;

        // Constelaciones
        if (cat && st && opts.showStars && opts.showLines) {
            ctx.strokeStyle = 'rgba(160,190,255,0.30)'; ctx.lineWidth = 1;
            cat.constellations.forEach((c) => {
                ctx.beginPath();
                c.lines.forEach(([a, b]) => {
                    if (st.alt[a] <= 0 || st.alt[b] <= 0) return;
                    if (cat.mag[a] > limit + 0.5 && cat.mag[b] > limit + 0.5) return;
                    const [x1, y1] = toXY(st.alt[a], st.az[a]); const [x2, y2] = toXY(st.alt[b], st.az[b]);
                    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
                });
                ctx.stroke();
            });
        }

        // Nombres de constelaciones (si se piden): en el centro de sus estrellas sobre el horizonte
        if (cat && st && opts.showStars && opts.showConNames) {
            const px = new Float64Array(cat.n).fill(NaN), py = new Float64Array(cat.n).fill(NaN);
            for (let i = 0; i < cat.n; i++) if (st.alt[i] > 0) { const [x, y] = toXY(st.alt[i], st.az[i]); px[i] = x; py[i] = y; }
            drawSkyLabels(ctx, cat, px, py, { conNames: true, starNames: false, lang: opts.lang, w: css, h: css });
        }

        // Estrellas
        if (cat && st && opts.showStars) {
            for (let i = 0; i < cat.n; i++) {
                const mag = cat.mag[i];
                if (st.alt[i] <= 0 || mag > limit) continue;
                const [x, y] = toXY(st.alt[i], st.az[i]);
                const r = starRadius(cat, i, Math.max(0.55, 2.7 - 0.43 * mag));
                ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.globalAlpha = starAlpha(cat, i, 1);
                ctx.fillStyle = starColor(cat.bv[i]); ctx.fill();
                ctx.globalAlpha = 1;
                const nm = cat.names[cat.hip[i]];
                if (nm) {
                    const label = (opts.lang === 'es' && nm[1]) || nm[0];
                    drawn.push({ x, y, label: label + '  (' + mag.toFixed(1) + ')' });
                    if (opts.showNames && mag < 2.2) {
                        ctx.fillStyle = 'rgba(230,236,255,0.85)'; ctx.font = '10px system-ui, sans-serif';
                        ctx.fillText(label, x + r + 3, y - r - 1);
                    }
                }
            }
        }

        // Planetas
        sky.planets.forEach((p) => {
            if (p.alt <= 0) return;
            const [x, y] = toXY(p.alt, p.az);
            const r = Math.max(2.2, 4.2 - 0.38 * p.mag);
            ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = PLANET_COLOR[p.id]; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui, sans-serif';
            ctx.fillText(opts.names[p.id], x + r + 3, y + 4);
            drawn.push({ x, y, label: opts.names[p.id] + '  (' + p.mag.toFixed(1) + ')' });
        });

        // Sol
        const sun = sky.sun;
        if (sun.alt > -1) {
            const [x, y] = toXY(Math.max(sun.alt, 0), sun.az);
            const glow = ctx.createRadialGradient(x, y, 2, x, y, 20);
            glow.addColorStop(0, 'rgba(255,230,120,0.95)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 20, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.fill();
            drawn.push({ x, y, label: opts.names.Sun });
        }

        // Luna con su fase, con el lado iluminado hacia el Sol
        const moon = sky.moon;
        if (moon.alt > -1) {
            const [x, y] = toXY(Math.max(moon.alt, 0), moon.az);
            const [sx, sy] = toXY(sun.alt, sun.az);
            const theta = Math.atan2(sy - y, sx - x);
            const r = 7;
            drawMoon(ctx, x, y, r, theta, moon.phaseFraction);
            drawn.push({ x, y, label: opts.names.Moon + '  ' + Math.round(Math.max(0, Math.min(1, moon.phaseFraction)) * 100) + ' %' });
        }
        ctx.restore();

        // Horizonte y puntos cardinales
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = getComputedStyle(canvas).color || '#888'; ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const [n, e, s, w] = opts.cardinals;
        ctx.fillText(n, cx, cy - R - 9); ctx.fillText(s, cx, cy + R + 9);
        ctx.fillText(e, cx - R - 9, cy); ctx.fillText(w, cx + R + 9, cy);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        return drawn;
    }

    /** Tamano y opacidad con que se dibuja una estrella de esa magnitud (los comparten el cielo detras del globo y el sistema solar). */
    function starStyle(mag) { return { r: Math.max(0.7, Math.min(2.7, 2.5 - 0.36 * mag)), alpha: Math.max(0.6, Math.min(1, 1.15 - 0.13 * mag)) }; }

    /* Las constelaciones se leen aunque sus lineas esten apagadas (el creador, 2026-11-13): las estrellas que forman sus figuras conservan su
       brillo (y no bajan de FIGURE_MIN_ALPHA) y todas las demas van SIEMPRE mas transparentes (OFF_FIGURE_ALPHA), con lineas o sin ellas. */
    const FIGURE_MIN_ALPHA = 0.9;
    const FIGURE_MIN_R = 1.3;          // px: en las constelaciones debiles (Cuervo, Copa) las estrellas de la figura eran puntos de 1 px y no se leia
    const OFF_FIGURE_ALPHA = 0.35;
    const FIG = typeof WeakMap === 'function' ? new WeakMap() : null;
    /** Estrellas que forman las figuras (1 por indice del catalogo); se calcula una vez por catalogo. */
    function figureMask(cat) {
        if (!cat || !(cat.n > 0)) return null;
        const hit = FIG && FIG.get(cat); if (hit) return hit;
        const m = new Uint8Array(cat.n);
        (cat.constellations || []).forEach((c) => (c.lines || []).forEach(([a, b]) => { if (a >= 0 && a < cat.n) m[a] = 1; if (b >= 0 && b < cat.n) m[b] = 1; }));
        if (FIG) FIG.set(cat, m);
        return m;
    }
    /** Opacidad final de la estrella i: la de su magnitud, subida si forma figura y bajada si no. Sin figuras en el catalogo, la de siempre. */
    function starAlpha(cat, i, alpha) {
        const m = figureMask(cat); if (!m || !(cat.constellations && cat.constellations.length)) return alpha;
        return m[i] ? Math.max(alpha, FIGURE_MIN_ALPHA) : alpha * OFF_FIGURE_ALPHA;
    }
    /** Radio final de la estrella i: las de las figuras no bajan de FIGURE_MIN_R. */
    function starRadius(cat, i, r) {
        const m = figureMask(cat); if (!m || !(cat.constellations && cat.constellations.length)) return r;
        return m[i] ? Math.max(r, FIGURE_MIN_R) : r;
    }

    /* ---------------- Rotulos del cielo: nombres de estrellas y de constelaciones (los comparten el cielo tras el globo, el sistema solar y la carta) ----------------
     * Se colocan por prioridad (constelaciones primero, luego estrellas de la mas brillante a la mas debil) y se omite el que pisaria a otro ya puesto.
     * cat: catalogo (names {hip: [nombre, alias es]}, constellations [{id, es, en, la, lines}], mag, hip); px/py: posicion en pantalla de cada estrella (NaN = no visible).
     */
    function byMagOrder(cat) {
        if (cat._byMag && cat._byMag.length === cat.n) return cat._byMag;
        const idx = Array.from({ length: cat.n }, (_, i) => i).filter((i) => cat.names && cat.names[cat.hip[i]]);
        idx.sort((a, b) => cat.mag[a] - cat.mag[b]); cat._byMag = idx; return idx;
    }
    /** Punto de anclaje de cada constelacion: centro de sus estrellas en pantalla (solo si todas se ven y no estan repartidas por media pantalla). */
    function constellationAnchors(cat, px, py, w, h) {
        const out = [];
        (cat.constellations || []).forEach((c) => {
            const ids = new Set(); c.lines.forEach(([a, b]) => { ids.add(a); ids.add(b); });
            if (!ids.size) return;
            let sx = 0, sy = 0, n = 0, ok = true;
            ids.forEach((i) => { if (!ok) return; const x = px[i], y = py[i]; if (!Number.isFinite(x) || !Number.isFinite(y)) { ok = false; return; } sx += x; sy += y; n++; });
            if (!ok || !n) return;
            const cx = sx / n, cy = sy / n; let spread = 0;
            ids.forEach((i) => { spread = Math.max(spread, Math.hypot(px[i] - cx, py[i] - cy)); });
            if (spread > 0.4 * Math.max(w, h) || cx < 0 || cy < 0 || cx > w || cy > h) return;
            out.push({ id: c.id, x: cx, y: cy, c });
        });
        return out;
    }
    const overlaps = (r, placed) => placed.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    /** El rectangulo toca algun circulo de avoid [{x, y, r}] (p. ej. el disco de la Tierra, que tapa las estrellas que hay detras). */
    const hidden = (r, avoid) => (avoid || []).some((c) => {
        const dx = c.x - Math.max(r.x, Math.min(c.x, r.x + r.w)); const dy = c.y - Math.max(r.y, Math.min(c.y, r.y + r.h));
        return dx * dx + dy * dy < c.r * c.r;
    });
    /**
     * Dibuja los rotulos. opts: { starNames, conNames, lang, starMag (magnitud limite de los nombres), w, h, placed (rectangulos ya ocupados, opcional),
     *   avoid (circulos [{x, y, r}] que tapan el cielo, opcional: un rotulo que los pise no se pone) }.
     * Devuelve los rotulos puestos [{kind, text, x, y}].
     */
    function drawSkyLabels(ctx, cat, px, py, opts) {
        const placed = opts.placed || []; const out = []; const w = opts.w, h = opts.h; const es = opts.lang === 'es';
        if (opts.conNames) {
            ctx.save(); ctx.font = '600 10.5px system-ui, sans-serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
            ctx.fillStyle = 'rgba(150,178,240,0.62)'; ctx.textAlign = 'center';
            constellationAnchors(cat, px, py, w, h).forEach((a) => {
                // en espanol, el nombre espanol (Escorpio); en ingles, el nombre latino de la IAU (Scorpius), que es el que se usa, no el ingles comun (Scorpion)
                const text = String((es ? a.c.es : a.c.la) || a.c.en || a.id).toUpperCase(); const tw = ctx.measureText(text).width + 4;
                const r = { x: a.x - tw / 2, y: a.y - 8, w: tw, h: 12 }; if (r.x < 2 || r.x + r.w > w - 2 || r.y < 2 || r.y + r.h > h - 2 || overlaps(r, placed) || hidden(r, opts.avoid)) return;
                placed.push(r); ctx.fillText(text, a.x, a.y + 2); out.push({ kind: 'con', text, x: a.x, y: a.y });
            });
            ctx.restore();
        }
        if (opts.starNames) {
            ctx.save(); ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(214,224,248,0.78)';
            for (const i of byMagOrder(cat)) {
                if (cat.mag[i] > opts.starMag) break;
                const x = px[i], y = py[i]; if (!Number.isFinite(x) || x < 0 || y < 0 || x > w || y > h) continue;
                const nm = cat.names[cat.hip[i]]; const text = (es && nm[1]) || nm[0]; const tw = ctx.measureText(text).width;
                const r = { x: x + 5, y: y - 15, w: tw + 2, h: 13 }; if (r.x + r.w > w - 2 || r.y < 2 || overlaps(r, placed) || hidden({ x: x - 3, y: r.y, w: r.x + r.w - x + 3, h: y - r.y + 3 }, opts.avoid)) continue;
                placed.push(r); ctx.fillText(text, x + 6, y - 5); out.push({ kind: 'star', text, x, y });
            }
            ctx.restore();
        }
        return out;
    }

    root.ChronosSkyView = { draw, drawMoon, starColor, starStyle, figureMask, starAlpha, starRadius, FIGURE_MIN_ALPHA, FIGURE_MIN_R, OFF_FIGURE_ALPHA, LIMIT_MAG, PLANET_COLOR, constellationAnchors, drawSkyLabels, byMagOrder };
})(typeof self !== 'undefined' ? self : this);
