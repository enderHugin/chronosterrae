/* solar-view.js - El SISTEMA SOLAR como continuacion del zoom del globo: al alejarse de la Tierra mas alla del zoom minimo del mapa, la Tierra
 * (el propio mapa, escalado y orientado) queda en medio del sistema, con el Sol, la Luna, los planetas y las estrellas donde estan; se puede
 * tocar un cuerpo para ir hasta el. No es un modo aparte: la distancia al cuerpo central es una sola cantidad, y a partir de cierta distancia
 * (la del zoom 0 del globo) lo que se ve ES el mapa. Solo dibuja; el calculo esta en sky/solar.js (que se prueba en Node) y el reloj es el de la web.
 *
 * Lo que se ve es un CALCULO (efemerides), no una observacion: posiciones y fases reales para la fecha del reloj, discos a su tamano
 * real, trayectorias reales de una revolucion. Los colores de los demas cuerpos son ilustrativos (sin texturas) y la pantalla lo dice.
 */
(function (root, factory) { root.ChronosSolarView = factory(root.ChronosSolar); })(typeof self !== 'undefined' ? self : this, function (Solar) {
    'use strict';

    const AU = Solar.AU_KM;
    const R_EARTH = Solar.byId.Earth.radiusKm;
    const MAX_LOG_D = Math.log10(120 * AU);
    const SYSTEM_LOG_D = Math.log10(75 * AU);
    const MIN_FACTOR = 1.6;                       // distancia minima al centro del cuerpo: 1,6 radios
    const DEFAULT_FACTOR = 6;                     // al ir a un cuerpo: 6 radios (el disco ocupa ~ 1/6 de la altura)
    const MAP_MIN_SCALE = 0.02;                   // por debajo (contorno de la Tierra de unos 2-4 px) el mapa ya no aporta: queda el punto
    const DRAG_RAD_PER_PX = 0.006;
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
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]; };
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // Interpolacion esferica de direcciones unitarias (camino mas corto; si son opuestas, se pasa por un meridiano cualquiera)
    function slerp(a, b, t) {
        const d = clamp(dot3(a, b), -1, 1); const om = Math.acos(d);
        if (om < 1e-9) return a.slice();
        if (Math.PI - om < 1e-6) {
            let p = cross3(a, [0, 0, 1]); if (Math.hypot(p[0], p[1], p[2]) < 1e-6) p = cross3(a, [1, 0, 0]);
            p = norm3(p); const c = Math.cos(t * Math.PI); const sn = Math.sin(t * Math.PI);
            return [a[0] * c + p[0] * sn, a[1] * c + p[1] * sn, a[2] * c + p[2] * sn];
        }
        const sn = Math.sin(om); const wa = Math.sin((1 - t) * om) / sn; const wb = Math.sin(t * om) / sn;
        return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    }
    // "arriba" interpolado y ortogonalizado respecto a la direccion
    function blendUp(u0, u1, dir, t) {
        let u = [lerp(u0[0], u1[0], t), lerp(u0[1], u1[1], t), lerp(u0[2], u1[2], t)];
        const k = dot3(u, dir); u = [u[0] - k * dir[0], u[1] - k * dir[1], u[2] - k * dir[2]];
        return Math.hypot(u[0], u[1], u[2]) < 1e-6 ? u1 : norm3(u);
    }

    /**
     * o = { root, back (canvas bajo el mapa), earthMap: { size() -> {w,h}, fovDeg(), minZoom(), place(p), handOff(p) },
     *       getJD(), getCatalog(), starColor(bv), starStyle(mag), skyOptions() -> {lines}, t(key), fmt(key, vars), lang(), nf(),
     *       loadAccuracy() -> Promise<report|null>, onClose(), onUnavailable() }
     */
    function create(o) {
        const st = {
            open: false, focus: 'Earth', mode: 'earth',                       // mode 'earth': la camara es la del mapa (lng, lat, bearing); 'free': yaw/pitch en la ecliptica
            eo: { lng: 0, lat: 0, bearing: 0 }, yaw: 0.6, pitch: 0.5, logD: Math.log10(R_EARTH * DEFAULT_FACTOR),
            flight: null, raf: 0, dirty: true, report: undefined, trails: {}, stars: null, starsJD: NaN, shapes: [], drag: null, pointers: new Map(), mapOn: false
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
        const fov = () => o.earthMap.fovDeg();
        const minLogD = () => Math.log10(Solar.byId[st.focus].radiusKm * MIN_FACTOR);
        const sliderToLog = (v) => lerp(minLogD(), MAX_LOG_D, v / 1000);
        const logToSlider = (l) => Math.round(clamp((l - minLogD()) / (MAX_LOG_D - minLogD()), 0, 1) * 1000);
        // Geometria del globo del mapa con el zoom minimo y la latitud dada: a esa distancia lo que se ve ES el mapa sin escalar.
        const globe0 = (lat) => { const sz = o.earthMap.size(); return Solar.globe({ zoom: o.earthMap.minZoom(), latDeg: lat, width: sz.w, height: sz.h, fovDeg: fov() }); };

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

        /* ---------------- camara ---------------- */
        function freeBasis(yaw, pitch) { const cp = Math.cos(pitch); return { dir: [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch)], up: [0, 0, 1] }; }
        // Base (direccion cuerpo -> camara, arriba) en el marco ecliptico para el estado actual, sin vuelo.
        function basisNow(jd) {
            if (st.mode === 'earth') {
                const F = Solar.earthFrame(jd); const b = Solar.mapBasis(st.eo.lng, st.eo.lat, st.eo.bearing);
                return { dir: Solar.globeToEcl(F, b.dir), up: Solar.globeToEcl(F, b.up) };
            }
            return freeBasis(st.yaw, st.pitch);
        }
        function currentTarget(P) { return st.flight ? st.flight.cur : P[st.focus]; }

        // Orientacion de llegada: la camara queda ~50 grados al lado de la direccion al Sol, asi se ve una fase gibosa y no un disco negro.
        function arrivalAngles(id, P) {
            if (id === 'Sun') { const b = basisNow(o.getJD()); return [Math.atan2(b.dir[1], b.dir[0]), clamp(Math.asin(clamp(b.dir[2], -1, 1)), -1.5, 1.5)]; }
            const d = P[id]; return [Math.atan2(-d[1], -d[0]) + 0.87, 0.3];
        }

        function startFlight(id, toLogD) {
            const jd = o.getJD(); if (!Number.isFinite(jd)) { st.focus = id; st.logD = toLogD; invalidate(); return; }
            let P; try { P = Solar.positions(jd); } catch (e) { st.focus = id; st.logD = toLogD; invalidate(); return; }
            const from = st.flight ? st.flight.cur.slice() : P[st.focus].slice();
            const b0 = st.flight ? st.flight.basisAt(ease(clamp((performance.now() - st.flight.t0) / st.flight.dur, 0, 1))) : basisNow(jd);
            let b1; let toAngles = null; const earthOnly = id === 'Earth' && st.mode === 'earth' && st.focus === 'Earth' && !st.flight;
            if (earthOnly) b1 = b0;                                                                              // ya mirando la Tierra: solo se acerca, sin cambiar la orientacion
            else { toAngles = arrivalAngles(id, P); b1 = freeBasis(toAngles[0], toAngles[1]); }
            const f = { t0: performance.now(), dur: 900, from, fromLogD: st.logD, to: id, toLogD, cur: from.slice(), b0, b1, toAngles, earthOnly };
            f.basisAt = (e) => { const dir = slerp(f.b0.dir, f.b1.dir, e); return { dir, up: blendUp(f.b0.up, f.b1.up, dir, e) }; };
            st.flight = f;
            st.focus = id;
            frame();
        }
        function goTo(id) { startFlight(id, Math.log10(Solar.byId[id].radiusKm * DEFAULT_FACTOR)); }
        function goSystem() { startFlight('Sun', SYSTEM_LOG_D); }

        function invalidate() { st.dirty = true; if (st.open && !st.raf) st.raf = requestAnimationFrame(frame); }
        function zoomBy(dLog) { st.logD = clamp(st.logD + dLog, minLogD(), MAX_LOG_D); invalidate(); }

        /* ---------------- entrada ---------------- */
        slider.addEventListener('input', () => { st.logD = sliderToLog(parseInt(slider.value, 10)); invalidate(); });
        cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY * 0.0014 * (e.deltaMode === 1 ? 16 : 1)); }, { passive: false });
        cv.addEventListener('contextmenu', (e) => e.preventDefault());
        const pinchDist = () => { const a = [...st.pointers.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; };
        cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); st.drag = { x: e.clientX, y: e.clientY, moved: 0, rotate: e.button === 2 || e.ctrlKey, pinch: st.pointers.size > 1 ? pinchDist() : 0 }; });
        // Arrastrar la Tierra del mapa: el punto central se desplaza como en el mapa (bearing fijo respecto al norte), sin pasar de 85 grados de latitud.
        function dragEarth(dx, dy) {
            const k = DRAG_RAD_PER_PX * 180 / Math.PI; const b = st.eo.bearing * Math.PI / 180;
            const dEast = k * (-dx * Math.cos(b) + dy * Math.sin(b)); const dNorth = k * (dx * Math.sin(b) + dy * Math.cos(b));
            st.eo.lat = clamp(st.eo.lat + dNorth, -85, 85);
            st.eo.lng += dEast / Math.max(0.2, Math.cos(st.eo.lat * Math.PI / 180));
            st.eo.lng = ((st.eo.lng + 540) % 360) - 180;
        }
        cv.addEventListener('pointermove', (e) => {
            if (!st.pointers.has(e.pointerId)) return;
            const prev = st.pointers.get(e.pointerId); st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pointers.size > 1) { const d = pinchDist(); if (st.drag && st.drag.pinch > 0 && d > 0) { zoomBy(-Math.log10(d / st.drag.pinch)); st.drag.pinch = d; st.drag.moved = 99; } return; }
            const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
            if (st.drag) st.drag.moved += Math.abs(dx) + Math.abs(dy);
            if (st.flight) return;
            if (st.mode === 'earth') {
                if (st.drag && st.drag.rotate) st.eo.bearing = ((st.eo.bearing + dx * 0.4 + 540) % 360) - 180;       // giro del mapa (boton derecho o Ctrl)
                else dragEarth(dx, dy);
            } else { st.yaw -= dx * DRAG_RAD_PER_PX; st.pitch = clamp(st.pitch + dy * DRAG_RAD_PER_PX, -1.5, 1.5); }
            invalidate();
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
        back.addEventListener('click', () => goTo('Earth'));
        window.addEventListener('resize', () => { if (st.open) invalidate(); });
        window.addEventListener('keydown', (e) => {
            if (!st.open || (e.target.closest && e.target.closest('input, select, textarea'))) return;
            if (e.key === 'Escape') { goTo('Earth'); e.preventDefault(); }
        });

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

        function sizeCanvas(c, w, h, dpr) { if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return x; }

        function frame() {
            st.raf = 0;
            if (!st.open) return;
            const sz = o.earthMap.size(); const w = Math.max(2, sz.w); const h = Math.max(2, sz.h);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const ctxF = sizeCanvas(cv, w, h, dpr); ctxF.clearRect(0, 0, w, h);           // delante del mapa: rotulos y lo que pasa entre la camara y la Tierra
            const ctxB = sizeCanvas(o.back, w, h, dpr);                                   // detras del mapa: fondo, estrellas, trayectorias, cuerpos
            const bg = ctxB.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2); bg.addColorStop(0, '#0b1224'); bg.addColorStop(1, '#03050b');
            ctxB.fillStyle = bg; ctxB.fillRect(0, 0, w, h);
            st.shapes = [];
            const jd = o.getJD();
            let P = null;
            if (Number.isFinite(jd)) { try { P = Solar.positions(jd); } catch (e) { if (e.code !== 'OUT_OF_WINDOW') throw e; } }
            if (!P) { leave(true); return; }       // el reloj salio de la ventana calculada: se vuelve al mapa (no hay posiciones que mostrar)

            // vuelo hacia otro cuerpo: el objetivo y la distancia se mueven juntos (la distancia en escala logaritmica)
            let basis;
            if (st.flight) {
                const f = st.flight; const s = clamp((performance.now() - f.t0) / f.dur, 0, 1); const e = ease(s); const dest = P[f.to];
                f.cur = [lerp(f.from[0], dest[0], e), lerp(f.from[1], dest[1], e), lerp(f.from[2], dest[2], e)];
                st.logD = lerp(f.fromLogD, f.toLogD, e);
                basis = f.earthOnly ? basisNow(jd) : f.basisAt(e);                          // acercarse a la Tierra desde la propia vista del mapa: la base es la del mapa en cada instante
                if (s >= 1) {                                                              // llegada: el estado pasa de "vuelo" a camara normal, sin saltos (misma base)
                    st.flight = null;
                    if (f.to === 'Earth') { const F = Solar.earthFrame(jd); st.eo = Solar.mapFromBasis(Solar.eclToGlobe(F, f.b1.dir), Solar.eclToGlobe(F, f.b1.up)); st.mode = 'earth'; }
                    else { st.mode = 'free'; st.yaw = f.toAngles[0]; st.pitch = f.toAngles[1]; }
                }
            } else basis = basisNow(jd);
            st.logD = clamp(st.logD, minLogD(), MAX_LOG_D);
            const target = currentTarget(P);
            const cam = Solar.makeCamera({ target, eyeDir: basis.dir, up: basis.up, distance: Math.pow(10, st.logD), fovDeg: fov(), width: w, height: h });

            // La Tierra: el mapa. Su contorno en pantalla es el de la esfera real; el mapa se escala para que coincida y se orienta con la camara.
            const eq = cam.project(P.Earth); const eDisc = cam.discPx(P.Earth, R_EARTH);
            let earthZ = Infinity; let mapOn = false;
            if (eq && Number.isFinite(eDisc)) {
                earthZ = eq[2];
                const g0 = globe0(st.eo.lat); const scale = eDisc / g0.silPx;
                if (st.mode === 'earth' && st.focus === 'Earth' && (!st.flight || st.flight.earthOnly) && scale >= 1 - 1e-9) {     // alcanzada la distancia del zoom minimo: vuelve el mapa normal
                    const dER = Math.pow(10, st.logD) / R_EARTH;
                    const z = Math.max(o.earthMap.minZoom(), Solar.zoomForDistance({ dER, latDeg: st.eo.lat, height: h, fovDeg: fov() }));
                    leave(false, { lng: st.eo.lng, lat: st.eo.lat, bearing: st.eo.bearing, zoom: z });
                    return;
                }
                mapOn = st.mode === 'earth' && st.focus === 'Earth' && (!st.flight || st.flight.earthOnly) && scale >= MAP_MIN_SCALE;
                o.earthMap.place({ active: mapOn, scale, dx: eq[0] - w / 2, dy: eq[1] - h / 2, orientation: st.mode === 'earth' ? st.eo : null });
            } else o.earthMap.place({ active: false, scale: 0, dx: 0, dy: 0, orientation: null });
            st.mapOn = mapOn;

            // estrellas (en el infinito), con el mismo estilo que el cielo detras del globo
            const S = starsEcl(jd);
            if (S) {
                const n = S.cat.n; const px = new Float32Array(n); const py = new Float32Array(n);
                for (let i = 0; i < n; i++) {
                    const dx = S.dir[3 * i]; const dy = S.dir[3 * i + 1]; const dz = S.dir[3 * i + 2];
                    const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
                    if (z <= 0.01) { px[i] = NaN; continue; }
                    px[i] = w / 2 + cam.fpx * (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) / z; py[i] = h / 2 - cam.fpx * (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) / z;
                }
                if (o.skyOptions().lines && S.cat.constellations && S.cat.constellations.length) {
                    ctxB.strokeStyle = 'rgba(150,175,235,0.16)'; ctxB.lineWidth = 1; ctxB.beginPath();
                    S.cat.constellations.forEach((cn) => cn.lines.forEach(([a, b]) => { if (Number.isNaN(px[a]) || Number.isNaN(px[b])) return; ctxB.moveTo(px[a], py[a]); ctxB.lineTo(px[b], py[b]); }));
                    ctxB.stroke();
                }
                for (let i = 0; i < n; i++) {
                    const x = px[i]; const y = py[i];
                    if (Number.isNaN(x) || x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
                    const sty = o.starStyle(S.cat.mag[i]);
                    ctxB.fillStyle = S.colors[i]; ctxB.globalAlpha = sty.alpha;
                    if (sty.r < 1.1) ctxB.fillRect(x - sty.r, y - sty.r, 2 * sty.r, 2 * sty.r); else { ctxB.beginPath(); ctxB.arc(x, y, sty.r, 0, 2 * Math.PI); ctxB.fill(); }
                }
                ctxB.globalAlpha = 1;
                ctxF.font = '11px system-ui, sans-serif';
                for (let i = 0; i < n; i++) {
                    if (S.cat.mag[i] >= 1.0) continue;
                    const nm = S.cat.names && S.cat.names[S.cat.hip[i]];
                    if (nm && !Number.isNaN(px[i]) && px[i] > 0 && py[i] > 0 && px[i] < w && py[i] < h) { ctxF.fillStyle = 'rgba(214,224,248,0.7)'; ctxF.fillText((o.lang() === 'es' && nm[1]) || nm[0], px[i] + 6, py[i] - 5); }
                }
            }

            // trayectorias reales (una revolucion centrada en la fecha). La de la Luna, con el mapa puesto, se parte en lo que pasa detras y delante de la Tierra.
            const clampPx = (v) => clamp(v, -1e6, 1e6);
            for (const id of [...Solar.PLANETS, 'Moon']) {
                const tr = trailOf(id, jd); const base = tr.relativeTo === 'Earth' ? P.Earth : [0, 0, 0];
                const col = rgba(hexRgb(Solar.byId[id].color), id === st.focus ? 0.8 : 0.32); const lw = id === st.focus ? 1.4 : 1;
                const split = mapOn && id === 'Moon';
                for (const pass of split ? [0, 1] : [2]) {
                    const ctx = pass === 1 ? ctxF : ctxB; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
                    let pen = false;
                    for (const p of tr.points) {
                        const q = cam.project([p[0] + base[0], p[1] + base[1], p[2] + base[2]]);
                        if (!q || (pass === 0 && q[2] < earthZ) || (pass === 1 && q[2] >= earthZ)) { pen = false; continue; }
                        if (pen) ctx.lineTo(clampPx(q[0]), clampPx(q[1])); else ctx.moveTo(clampPx(q[0]), clampPx(q[1])); pen = true;
                    }
                    ctx.stroke();
                }
            }

            // cuerpos: de lejos a cerca. Con el mapa puesto, la Tierra es el mapa y lo que esta mas cerca de la camara que ella se dibuja delante.
            const items = Solar.BODIES.map((b) => ({ b, q: cam.project(P[b.id]) })).filter((it) => it.q).sort((a, c) => c.q[2] - a.q[2]);
            const labels = [];
            for (const { b, q } of items) {
                const r = cam.discPx(P[b.id], b.radiusKm); if (!Number.isFinite(r)) continue;
                const px = Math.max(r, 2.2); const scaled = r >= 2.2;
                if (q[0] < -r - 50 || q[1] < -r - 50 || q[0] > w + r + 50 || q[1] > h + r + 50) continue;
                if (!(mapOn && b.id === 'Earth')) {
                    const ctx = mapOn && q[2] < earthZ ? ctxF : ctxB;
                    sphere(ctx, q[0], q[1], px, b, Solar.lighting(cam, P[b.id], [0, 0, 0]));   // el Sol es el origen del marco
                    if (!scaled && !b.emissive) { ctx.strokeStyle = rgba(hexRgb(b.color), 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], px + 4, 0, 2 * Math.PI); ctx.stroke(); }
                }
                st.shapes.push({ id: b.id, x: q[0], y: q[1], r: px });
                labels.push({ id: b.id, x: q[0], y: q[1], r: px, scaled });
            }
            ctxF.font = '12px system-ui, sans-serif';
            const earth = st.shapes.find((s) => s.id === 'Earth');
            for (const l of labels) {
                if (l.id === 'Moon' && earth && st.focus !== 'Moon' && Math.hypot(l.x - earth.x, l.y - earth.y) < 26) continue;   // la Luna tapa el rotulo de la Tierra
                ctxF.fillStyle = l.id === st.focus ? '#ffffff' : 'rgba(214,224,248,0.8)';
                ctxF.fillText(nameOf(l.id) + (l.scaled ? '' : ' ·'), l.x + l.r + (l.scaled ? 6 : 9), l.y + 4);
            }

            // lecturas
            const fb = Solar.byId[st.focus]; const dist = Math.pow(10, st.logD); const nf = o.nf();
            title.textContent = nameOf(st.focus);
            const out = [];
            out.push(o.fmt('solar.dist', { d: fmtDist(dist), name: nameOf(st.focus) }));
            const bar = niceLength(dist / cam.fpx * 110); const bw = bar / (dist / cam.fpx);        // barra de escala en el plano del cuerpo central
            ctxF.strokeStyle = 'rgba(214,224,248,0.9)'; ctxF.lineWidth = 2; ctxF.beginPath(); ctxF.moveTo(w - 16 - bw, 78); ctxF.lineTo(w - 16, 78); ctxF.moveTo(w - 16 - bw, 73); ctxF.lineTo(w - 16 - bw, 83); ctxF.moveTo(w - 16, 73); ctxF.lineTo(w - 16, 83); ctxF.stroke();
            ctxF.fillStyle = 'rgba(214,224,248,0.9)'; ctxF.font = '12px system-ui, sans-serif'; ctxF.textAlign = 'right'; ctxF.fillText(fmtDist(bar), w - 16, 98); ctxF.textAlign = 'start';
            if (st.focus !== 'Sun') { const dsun = Math.hypot(...P[st.focus]); out.push(o.fmt('solar.sunDist', { au: nf.format(Math.round(dsun / AU * 1000) / 1000), light: fmtMinutes(Solar.lightMinutes(dsun)) })); }
            out.push(o.fmt('solar.radius', { r: nf.format(fb.radiusKm), src: fb.source }));
            if (mapOn) out.push(o.t('solar.earthIsMap'));
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

        /** Salir de la escena: con `orientation` se devuelve el mapa normal exactamente en esa vista; sin ella (reloj fuera de ventana) se deja el mapa como estaba. */
        function leave(unavailable, orientation) {
            st.open = false; root.hidden = true; st.flight = null; st.mapOn = false;
            if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
            o.earthMap.handOff(orientation || { lng: st.eo.lng, lat: st.eo.lat, bearing: st.eo.bearing, zoom: o.earthMap.minZoom() });
            o.onClose();
            if (unavailable) o.onUnavailable();
        }

        function texts() {
            chipsBuild(); back.textContent = o.t('solar.back'); slider.setAttribute('aria-label', o.t('solar.zoom'));
            note.textContent = o.t('solar.note');
            if (st.open) invalidate();
        }

        return {
            /** Entra desde el mapa (zoom minimo): la camara arranca exactamente en la vista del mapa, y `deltaLog` (>0) es lo que se aleja de entrada. */
            enter({ orientation, deltaLog = 0.05 }) {
                st.open = true; st.mode = 'earth'; st.focus = 'Earth'; st.flight = null; st.eo = { lng: orientation.lng, lat: orientation.lat, bearing: orientation.bearing };
                st.logD = Math.log10(globe0(st.eo.lat).dER * R_EARTH) + Math.max(deltaLog, 1e-4);
                root.hidden = false; texts(); invalidate();
            },
            get isOpen() { return st.open; },
            zoomBy,
            /** Poner el norte arriba (brujula). */
            northUp() { if (st.mode === 'earth') { st.eo.bearing = 0; invalidate(); } },
            close() { if (st.open) leave(false); },
            invalidate, texts, goTo, goSystem,
            get state() { return st; }
        };
    }

    return { create, NAMES };
});
