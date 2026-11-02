/* solar-view.js - Pantalla del SISTEMA SOLAR: el cuerpo central se elige (Sol, planetas, Tierra, Luna) y se puede uno acercar desde
 * todo el sistema hasta el propio cuerpo. Solo dibuja; el calculo esta en sky/solar.js (que se prueba en Node) y el reloj es el de la web.
 *
 * Lo que se ve es un CALCULO (efemerides), no una observacion: posiciones y fases reales para la fecha del reloj, discos a su tamano
 * real, trayectorias reales de una revolucion. Los colores son ilustrativos (sin texturas) y la pantalla lo dice.
 */
(function (root, factory) { root.ChronosSolarView = factory(root.ChronosSolar); })(typeof self !== 'undefined' ? self : this, function (Solar) {
    'use strict';

    const AU = Solar.AU_KM;
    const MAX_LOG_D = Math.log10(120 * AU);
    const SYSTEM_LOG_D = Math.log10(75 * AU);
    const MIN_FACTOR = 1.6;                       // distancia minima al centro del cuerpo: 1,6 radios
    const DEFAULT_FACTOR = 6;                     // al ir a un cuerpo: 6 radios (el disco ocupa ~ 1/6 de la altura)
    const NAMES = {
        es: { Sun: 'Sol', Mercury: 'Mercurio', Venus: 'Venus', Earth: 'Tierra', Moon: 'Luna', Mars: 'Marte', Jupiter: 'Júpiter', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Neptuno' },
        en: { Sun: 'Sun', Mercury: 'Mercury', Venus: 'Venus', Earth: 'Earth', Moon: 'Moon', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune' }
    };

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, s) => a + (b - a) * s;
    const ease = (s) => s * s * (3 - 2 * s);
    const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    const shade = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];

    /**
     * o = { root, getJD(), getCatalog(), starColor(bv), t(key), fmt(key, vars), lang(), nf(), loadAccuracy() -> Promise<report|null>, onExit() }
     */
    function create(o) {
        const st = {
            open: false, focus: 'Earth', yaw: 0.6, pitch: 0.5, logD: Math.log10(Solar.byId.Earth.radiusKm * DEFAULT_FACTOR),
            flight: null, raf: 0, dirty: true, report: undefined, trails: {}, stars: null, starsJD: NaN, shapes: [], drag: null, pointers: new Map(), lastJD: NaN
        };
        const root = o.root;
        root.innerHTML = '';
        const cv = document.createElement('canvas'); cv.id = 'solar-canvas'; cv.setAttribute('aria-label', 'solar system');
        const chips = document.createElement('div'); chips.id = 'solar-chips';
        const panel = document.createElement('div'); panel.id = 'solar-info'; panel.className = 'panel';
        const note = document.createElement('div'); note.id = 'solar-note'; note.className = 'panel';
        const slider = document.createElement('input'); slider.type = 'range'; slider.id = 'solar-zoom'; slider.min = '0'; slider.max = '1000'; slider.step = '1';
        const title = document.createElement('h2'); const lines = document.createElement('div'); lines.className = 'solar-lines';
        const back = document.createElement('button'); back.type = 'button'; back.className = 'btn'; back.id = 'solar-back';
        panel.append(title, lines, slider, back);
        root.append(cv, chips, panel, note);

        const nameOf = (id) => NAMES[o.lang() === 'es' ? 'es' : 'en'][id];
        const minLogD = () => Math.log10(Solar.byId[st.focus].radiusKm * MIN_FACTOR);
        const sliderToLog = (v) => lerp(minLogD(), MAX_LOG_D, v / 1000);
        const logToSlider = (l) => Math.round(clamp((l - minLogD()) / (MAX_LOG_D - minLogD()), 0, 1) * 1000);

        function chipsBuild() {
            chips.innerHTML = '';
            const mk = (id, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.id = id; b.textContent = label; b.addEventListener('click', () => (id === '*' ? goSystem() : goTo(id))); chips.appendChild(b); };
            mk('*', o.t('solar.system'));
            Solar.BODIES.forEach((b) => mk(b.id, nameOf(b.id)));
            chipsMark();
        }
        // "Sistema" y "Sol" comparten cuerpo central: se distingue por la distancia (mas de 5 AU = vista de todo el sistema)
        function chipsMark() {
            const wide = st.focus === 'Sun' && st.logD > Math.log10(5 * AU);
            chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === '*' ? wide : (b.dataset.id === st.focus && !wide)));
        }

        function currentTarget(P) { return st.flight ? st.flight.cur : P[st.focus]; }

        // Orientacion de llegada: la camara queda ~50 grados al lado de la direccion al Sol, asi se ve una fase gibosa y no un disco negro.
        // Al Sol se conserva la orientacion actual.
        function arrival(id, P) {
            if (id === 'Sun') return [st.yaw, st.pitch];
            const d = P[id]; return [Math.atan2(-d[1], -d[0]) + 0.87, 0.3];
        }

        function startFlight(id, toLogD) {
            const jd = o.getJD(); if (!Number.isFinite(jd)) { st.focus = id; st.logD = toLogD; invalidate(); return; }
            let P; try { P = Solar.positions(jd); } catch (e) { st.focus = id; st.logD = toLogD; invalidate(); return; }
            const from = st.flight ? st.flight.cur.slice() : P[st.focus].slice();
            const [toYaw, toPitch] = arrival(id, P);
            st.flight = { t0: performance.now(), dur: 900, from, fromLogD: st.logD, to: id, toLogD, cur: from.slice(), fromYaw: st.yaw, toYaw, fromPitch: st.pitch, toPitch };
            st.focus = id;
            frame();
        }
        function goTo(id) { startFlight(id, Math.log10(Solar.byId[id].radiusKm * DEFAULT_FACTOR)); }
        function goSystem() { startFlight('Sun', SYSTEM_LOG_D); }

        function invalidate() { st.dirty = true; if (st.open && !st.raf) st.raf = requestAnimationFrame(frame); }

        /* ---------------- entrada ---------------- */
        slider.addEventListener('input', () => { st.logD = sliderToLog(parseInt(slider.value, 10)); invalidate(); });
        cv.addEventListener('wheel', (e) => { e.preventDefault(); st.logD = clamp(st.logD + e.deltaY * 0.0012 * (e.deltaMode === 1 ? 16 : 1), minLogD(), MAX_LOG_D); invalidate(); }, { passive: false });
        cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); st.drag = { x: e.clientX, y: e.clientY, moved: 0, pinch: st.pointers.size > 1 ? pinchDist() : 0 }; });
        const pinchDist = () => { const a = [...st.pointers.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; };
        cv.addEventListener('pointermove', (e) => {
            if (!st.pointers.has(e.pointerId)) return;
            const prev = st.pointers.get(e.pointerId); st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pointers.size > 1) { const d = pinchDist(); if (st.drag && st.drag.pinch > 0 && d > 0) { st.logD = clamp(st.logD - Math.log10(d / st.drag.pinch), minLogD(), MAX_LOG_D); st.drag.pinch = d; st.drag.moved = 99; invalidate(); } return; }
            const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
            if (st.drag) st.drag.moved += Math.abs(dx) + Math.abs(dy);
            st.yaw -= dx * 0.006; st.pitch = clamp(st.pitch + dy * 0.006, -1.5, 1.5); invalidate();
        });
        const up = (e) => {
            const d = st.drag; st.pointers.delete(e.pointerId);
            if (d && d.moved < 5 && st.pointers.size === 0) {                      // un toque, no un arrastre: ir al cuerpo mas cercano
                const r = cv.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top; let best = null; let bd = 1e9;
                st.shapes.forEach((s) => { const dd = Math.hypot(s.x - x, s.y - y); if (dd < Math.max(18, s.r + 4) && dd < bd) { bd = dd; best = s.id; } });
                if (best && best !== st.focus) goTo(best);
            }
            if (st.pointers.size === 0) st.drag = null;
        };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        back.addEventListener('click', () => o.onExit());
        window.addEventListener('resize', () => { if (st.open) invalidate(); });

        /* ---------------- estrellas ---------------- */
        function starsEcl(jd) {
            const cat = o.getCatalog();
            if (!cat) return null;
            if (st.stars && st.stars.cat === cat && Math.abs(jd - st.starsJD) < 300) return st.stars;
            const n = cat.n; const dir = new Float32Array(3 * n); const dt = (jd - cat.epochJD) / 365.25;
            for (let i = 0; i < n; i++) {
                const sa = Math.sin(cat.ra[i]); const ca = Math.cos(cat.ra[i]); const sd = Math.sin(cat.dec[i]); const cd = Math.cos(cat.dec[i]);
                let x = cd * ca + dt * (-cat.pmra[i] * sa - cat.pmde[i] * sd * ca); let y = cd * sa + dt * (cat.pmra[i] * ca - cat.pmde[i] * sd * sa); let z = sd + dt * cat.pmde[i] * cd;
                const l = Math.sqrt(x * x + y * y + z * z); x /= l; y /= l; z /= l;
                const e = Solar.eclFromEq(x, y, z); dir[3 * i] = e[0]; dir[3 * i + 1] = e[1]; dir[3 * i + 2] = e[2];
            }
            st.stars = { cat, dir, colors: Array.from(cat.bv, (bv) => o.starColor(bv)) }; st.starsJD = jd;
            return st.stars;
        }

        /* ---------------- trayectorias ---------------- */
        function trailOf(id, jd) {
            const c = st.trails[id]; const period = Solar.periodDays(id);
            if (c && Math.abs(jd - c.jd) < period / (id === 'Moon' ? 27 : 80)) return c;
            st.trails[id] = { jd, ...Solar.trail(id, jd, id === 'Moon' ? 120 : 240) };
            return st.trails[id];
        }

        /* ---------------- dibujo ---------------- */
        function sphere(ctx, x, y, r, body, lit) {
            const c = hexRgb(body.color);
            if (body.emissive) {
                const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, Math.min(r * 3.2, 4000));
                g.addColorStop(0, rgba(c, 0.55)); g.addColorStop(1, rgba(c, 0));
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Math.min(r * 3.2, 4000), 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = rgba(c, 1); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
                return;
            }
            ctx.fillStyle = rgba(shade(c, 0.2), 1); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();   // lado nocturno: oscuro, no invisible
            ctx.strokeStyle = rgba(c, 0.28); ctx.lineWidth = 1; ctx.stroke();
            if (lit.fraction < 0.0005) return;
            ctx.fillStyle = rgba(c, 1);
            if (lit.fraction > 0.9995) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); return; }
            ctx.save(); ctx.translate(x, y); ctx.rotate(lit.angle);
            ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);                        // media esfera del lado del Sol
            if (lit.front > 0) ctx.ellipse(0, 0, lit.front * r, r, 0, Math.PI / 2, 1.5 * Math.PI, false);  // gibosa: el terminador se aleja del Sol
            else ctx.ellipse(0, 0, -lit.front * r, r, 0, Math.PI / 2, -Math.PI / 2, true);                  // creciente: el terminador se acerca al Sol
            ctx.closePath(); ctx.fill(); ctx.restore();
        }

        function niceLength(km) {
            const p = Math.pow(10, Math.floor(Math.log10(km))); const m = km / p;
            return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
        }
        function fmtDist(km) {
            const nf = o.nf();
            if (km >= 0.05 * AU) return nf.format(Math.round(km / AU * 1000) / 1000) + ' AU';
            return nf.format(Math.round(km)) + ' km';
        }
        function fmtMinutes(m) { return m >= 90 ? o.nf().format(Math.round(m / 6) / 10) + ' h' : o.nf().format(Math.round(m * 10) / 10) + ' min'; }

        function frame() {
            st.raf = 0;
            if (!st.open) return;
            const rect = root.getBoundingClientRect(); const w = Math.max(2, rect.width); const h = Math.max(2, rect.height);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
            const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2); bg.addColorStop(0, '#0b1224'); bg.addColorStop(1, '#03050b');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
            st.shapes = [];
            const jd = o.getJD();
            let P = null;
            if (Number.isFinite(jd)) { try { P = Solar.positions(jd); } catch (e) { if (e.code !== 'OUT_OF_WINDOW') throw e; } }
            if (!P) {
                lines.textContent = '';
                title.textContent = o.t('solar.title');
                const W = Solar.WINDOW;
                ctx.fillStyle = 'rgba(214,224,248,0.85)'; ctx.font = '15px system-ui, sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(o.fmt('solar.outOfRange', { a: W.minYear, b: W.maxYear }), w / 2, h / 2); ctx.textAlign = 'start';
                st.dirty = false; return;
            }
            // vuelo hacia otro cuerpo: el objetivo y la distancia se mueven juntos (la distancia en escala logaritmica)
            if (st.flight) {
                const s = clamp((performance.now() - st.flight.t0) / st.flight.dur, 0, 1); const e = ease(s); const dest = P[st.flight.to];
                st.flight.cur = [lerp(st.flight.from[0], dest[0], e), lerp(st.flight.from[1], dest[1], e), lerp(st.flight.from[2], dest[2], e)];
                st.logD = lerp(st.flight.fromLogD, st.flight.toLogD, e);
                const dy = Math.atan2(Math.sin(st.flight.toYaw - st.flight.fromYaw), Math.cos(st.flight.toYaw - st.flight.fromYaw));   // giro por el camino corto
                st.yaw = st.flight.fromYaw + dy * e; st.pitch = lerp(st.flight.fromPitch, st.flight.toPitch, e);
                if (s >= 1) st.flight = null;
            }
            if (st.orient) { st.orient = false; const a = arrival(st.focus, P); st.yaw = a[0]; st.pitch = a[1]; }   // primera vez al abrir
            st.logD = clamp(st.logD, minLogD(), MAX_LOG_D);
            const target = currentTarget(P);
            const cam = Solar.makeCamera({ target, yaw: st.yaw, pitch: st.pitch, distance: Math.pow(10, st.logD), width: w, height: h });

            // estrellas (en el infinito)
            const S = starsEcl(jd);
            if (S) {
                for (let i = 0; i < S.cat.n; i++) {
                    const dx = S.dir[3 * i]; const dy = S.dir[3 * i + 1]; const dz = S.dir[3 * i + 2];
                    const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]; if (z <= 0.01) continue;
                    const x = w / 2 + cam.fpx * (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) / z; const y = h / 2 - cam.fpx * (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) / z;
                    if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
                    const rr = 0.35 + Math.max(0, 6.5 - S.cat.mag[i]) * 0.3;
                    ctx.fillStyle = S.colors[i]; ctx.globalAlpha = clamp(0.35 + (6.5 - S.cat.mag[i]) * 0.18, 0.3, 1); ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
                }
                ctx.globalAlpha = 1;
            }

            // trayectorias reales (una revolucion centrada en la fecha)
            const clampPx = (v) => clamp(v, -1e6, 1e6);
            for (const id of [...Solar.PLANETS, 'Moon']) {
                const tr = trailOf(id, jd); const base = tr.relativeTo === 'Earth' ? P.Earth : [0, 0, 0];
                ctx.strokeStyle = rgba(hexRgb(Solar.byId[id].color), id === st.focus ? 0.8 : 0.32); ctx.lineWidth = id === st.focus ? 1.4 : 1; ctx.beginPath();
                let pen = false;
                for (const p of tr.points) {
                    const q = cam.project([p[0] + base[0], p[1] + base[1], p[2] + base[2]]);
                    if (!q) { pen = false; continue; }
                    if (pen) ctx.lineTo(clampPx(q[0]), clampPx(q[1])); else ctx.moveTo(clampPx(q[0]), clampPx(q[1])); pen = true;
                }
                ctx.stroke();
            }

            // cuerpos: de lejos a cerca
            const items = Solar.BODIES.map((b) => ({ b, q: cam.project(P[b.id]) })).filter((it) => it.q).sort((a, c) => c.q[2] - a.q[2]);
            const labels = [];
            for (const { b, q } of items) {
                const r = cam.discPx(P[b.id], b.radiusKm); if (!Number.isFinite(r)) continue;
                const px = Math.max(r, 2.2); const scaled = r >= 2.2;
                if (q[0] < -r - 50 || q[1] < -r - 50 || q[0] > w + r + 50 || q[1] > h + r + 50) continue;
                sphere(ctx, q[0], q[1], px, b, Solar.lighting(cam, P[b.id], [0, 0, 0]));   // el Sol es el origen del marco
                if (!scaled && !b.emissive) { ctx.strokeStyle = rgba(hexRgb(b.color), 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], px + 4, 0, 2 * Math.PI); ctx.stroke(); }
                st.shapes.push({ id: b.id, x: q[0], y: q[1], r: px });
                labels.push({ id: b.id, x: q[0], y: q[1], r: px, scaled });
            }
            ctx.font = '12px system-ui, sans-serif';
            const earth = st.shapes.find((s) => s.id === 'Earth');
            for (const l of labels) {
                if (l.id === 'Moon' && earth && st.focus !== 'Moon' && st.focus !== 'Earth' && Math.hypot(l.x - earth.x, l.y - earth.y) < 26) continue;   // la Luna tapa el rotulo de la Tierra
                ctx.fillStyle = l.id === st.focus ? '#ffffff' : 'rgba(214,224,248,0.8)';
                ctx.fillText(nameOf(l.id) + (l.scaled ? '' : ' ·'), l.x + l.r + (l.scaled ? 6 : 9), l.y + 4);
            }

            // lecturas
            const fb = Solar.byId[st.focus]; const dist = Math.pow(10, st.logD); const nf = o.nf();
            title.textContent = nameOf(st.focus);
            const out = [];
            out.push(o.fmt('solar.dist', { d: fmtDist(dist), name: nameOf(st.focus) }));
            const bar = niceLength(dist / cam.fpx * 110); const bw = bar / (dist / cam.fpx);        // barra de escala en el plano del cuerpo central
            ctx.strokeStyle = 'rgba(214,224,248,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w - 16 - bw, 78); ctx.lineTo(w - 16, 78); ctx.moveTo(w - 16 - bw, 73); ctx.lineTo(w - 16 - bw, 83); ctx.moveTo(w - 16, 73); ctx.lineTo(w - 16, 83); ctx.stroke();
            ctx.fillStyle = 'rgba(214,224,248,0.9)'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(fmtDist(bar), w - 16, 98); ctx.textAlign = 'start';
            if (st.focus !== 'Sun') { const dsun = Math.hypot(...P[st.focus]); out.push(o.fmt('solar.sunDist', { au: nf.format(Math.round(dsun / AU * 1000) / 1000), light: fmtMinutes(Solar.lightMinutes(dsun)) })); }
            out.push(o.fmt('solar.radius', { r: nf.format(fb.radiusKm), src: fb.source }));
            const unscaled = labels.filter((l) => !l.scaled).length;
            if (unscaled) out.push(o.t('solar.dots'));
            const year = yearOf(jd);
            if (st.report === undefined) { st.report = null; o.loadAccuracy().then((r) => { st.report = r || false; invalidate(); }); }
            if (st.report) {
                const a = Solar.accuracy(st.report, st.focus === 'Sun' ? null : st.focus, year);
                out.push(a ? o.fmt('solar.acc', { km: nf.format(a.km), band: a.band }) + (a.barycenter ? ' ' + o.t('solar.accBary') : '') : (st.focus === 'Sun' ? o.t('solar.accSun') : o.t('solar.accNone')));
            } else if (st.report === false) out.push(o.t('solar.accFail'));
            lines.innerHTML = ''; out.forEach((t) => { const d = document.createElement('div'); d.textContent = t; lines.appendChild(d); });
            const v = logToSlider(st.logD); if (document.activeElement !== slider && String(v) !== slider.value) slider.value = String(v);
            chipsMark();
            st.dirty = false;
            if (st.flight) st.raf = requestAnimationFrame(frame);
        }
        // año astronomico aproximado del instante (solo para elegir la franja de exactitud medida)
        function yearOf(jd) { return 2000 + (jd - 2451545.0) / 365.25; }

        function texts() {
            chipsBuild(); back.textContent = o.t('solar.back'); slider.setAttribute('aria-label', o.t('solar.zoom'));
            note.textContent = o.t('solar.note');
            if (st.open) invalidate();
        }

        return {
            open() { st.open = true; st.orient = true; root.hidden = false; texts(); invalidate(); },
            close() { st.open = false; root.hidden = true; if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } },
            invalidate, texts, goTo, goSystem,
            get state() { return st; }
        };
    }

    return { create, NAMES };
});
