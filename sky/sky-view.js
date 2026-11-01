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

        // Estrellas
        if (cat && st && opts.showStars) {
            for (let i = 0; i < cat.n; i++) {
                const mag = cat.mag[i];
                if (st.alt[i] <= 0 || mag > limit) continue;
                const [x, y] = toXY(st.alt[i], st.az[i]);
                const r = Math.max(0.55, 2.7 - 0.43 * mag);
                ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.fillStyle = starColor(cat.bv[i]); ctx.fill();
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
            const r = 7; const k = Math.max(0, Math.min(1, moon.phaseFraction));
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
            drawn.push({ x, y, label: opts.names.Moon + '  ' + Math.round(k * 100) + ' %' });
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

    root.ChronosSkyView = { draw, starColor, LIMIT_MAG };
})(typeof self !== 'undefined' ? self : this);
