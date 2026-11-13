#!/usr/bin/env node
// probe-shot.js - Fotografia la web REAL publicada (OpenFreeMap + datos reales) en una vista concreta, con variantes que
// apagan capas una a una para localizar de que capa viene un artefacto grafico. Solo diagnostico: no toca datos.
//   node scripts/probe-shot.js <url> <carpeta-salida>               -> SERIE FIJA de vistas (revision rutinaria, claro y oscuro)
//   node scripts/probe-shot.js <url> <carpeta-salida> lng lat zoom   -> diagnostico de una vista, con capas apagadas una a una
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Vistas de la revision rutinaria: las que ya dieron problemas o que protegen lo que mas se mira. Cada una se fotografia en claro y en oscuro.
const SUITE = [
    { id: 'pirineos-2026', year: 2026, lng: -1.35, lat: 43.05, zoom: 11 },
    { id: 'europa-1606', year: 1606, lng: 10, lat: 48, zoom: 3.3 },
    // Costa del color politico sobre la Tierra natural (2026-11-13: «estas costas aun no estan bien coloreadas o definidas»). Modo `costa`.
    // (por debajo de zoom 4,6 —4,2 si ya estaba— no hay detalle de OpenStreetMap y se ve la imagen de NASA; por encima, el agua de OSM pone la costa)
    { id: 'costa-natural-iberia-1924', costa: true, year: 1924, lng: 3, lat: 40.5, zoom: 4.3 },
    { id: 'costa-natural-valencia-1924', costa: true, year: 1924, lng: 1.5, lat: 39.6, zoom: 4.55 },
    { id: 'estrecho-2026', year: 2026, lng: -5.6, lat: 36, zoom: 8 },
    { id: 'europa-1945-lejos', year: 1945, lng: 12, lat: 50, zoom: 3 },
    { id: 'europa-1945', year: 1945, lng: 12, lat: 50, zoom: 4 },
    { id: 'europa-1945-oculto', year: 1945, lng: 12, lat: 50, zoom: 4, hide: true },
    { id: 'asia-2010-globo', year: 2010, lng: 105, lat: 35, zoom: 2.2 },
    { id: 'asia-2010-cerca', year: 2010, lng: 105, lat: 35, zoom: 5 },
    { id: 'mediterraneo-9010aC', year: -9010, lng: 20, lat: 38, zoom: 5 },
    { id: 'costa-9010aC-zoom', year: -9010, lng: 2.5, lat: 41.2, zoom: 9 },
    { id: 'globo-2026', year: 2026, lng: 0, lat: 20, zoom: 1.4 },
    { id: 'africa-2026-lejos', year: 2026, lng: 20, lat: 5, zoom: 2.2 },
    { id: 'africa-2026-cerca', year: 2026, lng: 20, lat: 5, zoom: 3.2 },
    { id: 'antartida-2026', year: 2026, lng: 0, lat: -75, zoom: 2 },
    { id: 'artico-2026', year: 2026, lng: 0, lat: 75, zoom: 2 },
    { id: 'pangea-250Ma', year: -250e6 + 2000, lng: 0, lat: 0, zoom: 1.4 },
    // Nombres con las fronteras puestas y apagadas: apagadas, solo accidentes geograficos (mares, lagos, rios, islas y picos con su altitud); ningun pais, estado, ciudad ni carretera
    { id: 'alpes-2026', names: true, year: 2026, lng: 7.2, lat: 45.9, zoom: 8 },
    { id: 'alpes-2026-sin-fronteras', names: true, year: 2026, lng: 7.2, lat: 45.9, zoom: 8, hide: true },
    { id: 'mediterraneo-2026', names: true, year: 2026, lng: 15, lat: 38, zoom: 5.2 },
    { id: 'mediterraneo-2026-sin-fronteras', names: true, year: 2026, lng: 15, lat: 38, zoom: 5.2, hide: true },
    { id: 'islandia-2026-sin-fronteras', names: true, year: 2026, lng: -19, lat: 64.9, zoom: 6.2, hide: true },
    // Carreteras (boton aparte, apagado por defecto): con ellas encendidas, y sin fronteras para ver que no se cuelan nombres politicos
    { id: 'carreteras-roma-2026', names: true, roads: true, year: 2026, lng: 12.49, lat: 41.9, zoom: 11 },
    { id: 'carreteras-alpes-2026-sin-fronteras', names: true, roads: true, year: 2026, lng: 7.2, lat: 45.9, zoom: 9, hide: true },
    // Iconos de sucesos (map/event-icons.js): tanque (>=1914), mosquete (1500-1913), espada (<1500). Se abre el panel de sucesos para que carguen los datos.
    { id: 'iconos-europa-1939', events: true, year: 1939, lng: 15, lat: 50, zoom: 4 },
    { id: 'iconos-europa-1805', events: true, year: 1805, lng: 10, lat: 48, zoom: 4.5 },
    { id: 'iconos-inglaterra-1066', events: true, year: 1066, lng: -1, lat: 51, zoom: 5 },
    // Reloj corriendo a ~1 año por segundo de pantalla durante 6 s: la ventana de sucesos es proporcional a la velocidad, con fundido por niveles
    { id: 'ventana-europa-1936-1-ano-s', events: true, run: true, yearsPerSec: 1, year: 1936, lng: 15, lat: 50, zoom: 4 },
    // Filtro de tipos de Ajustes: sin nacimientos ni muertes (el panel de Ajustes queda abierto en la imagen)
    { id: 'tipos-sin-personas-europa-1939', events: true, tipos: ['birth', 'death'], year: 1939, lng: 15, lat: 50, zoom: 4 },
    // Salto animado: la flecha con paso de 10 años barre el tramo; se fotografia a mitad de camino y al llegar
    { id: 'barrido-europa-1936-10-anos', events: true, barrido: true, year: 1936, lng: 15, lat: 50, zoom: 4 },
    // Ambientacion de epoca (map/eras.js) y maquetacion: modo `diseno` (solo estas). `abrir` = paneles abiertos; `vp` = tamano de ventana (movil/tableta). Se miden los solapes de los recuadros visibles.
    { id: 'epoca-hoy-2026', diseno: true, events: true, abrir: ['ajustes'], year: 2026, lng: 10, lat: 48, zoom: 3.5 },
    { id: 'epoca-siglo-xx-1939', diseno: true, events: true, year: 1939, lng: 15, lat: 50, zoom: 4 },
    { id: 'epoca-industrial-1860', diseno: true, events: true, year: 1860, lng: 10, lat: 48, zoom: 4 },
    { id: 'epoca-renacimiento-1520', diseno: true, events: true, year: 1520, lng: 10, lat: 48, zoom: 4 },
    { id: 'epoca-medieval-1215', diseno: true, events: true, year: 1215, lng: 5, lat: 48, zoom: 4 },
    { id: 'epoca-alta-edad-media-800', diseno: true, events: true, year: 800, lng: 10, lat: 48, zoom: 4 },
    { id: 'epoca-clasica-100', diseno: true, events: true, year: 100, lng: 15, lat: 40, zoom: 3.6 },
    { id: 'epoca-bronce-menos-1500', diseno: true, events: true, year: -1500, lng: 25, lat: 36, zoom: 4 },
    { id: 'epoca-neolitico-menos-6000', diseno: true, events: true, year: -6000, lng: 35, lat: 35, zoom: 4 },
    { id: 'epoca-paleolitico-menos-40000', diseno: true, events: true, year: -40000, lng: 10, lat: 40, zoom: 3.5 },
    { id: 'epoca-tiempo-profundo-menos-200Ma', diseno: true, year: -200e6 + 1950, lng: 0, lat: 0, zoom: 1.4 },
    { id: 'movil-390x844-sucesos-1939', diseno: true, events: true, vp: { width: 390, height: 844, touch: true }, year: 1939, lng: 15, lat: 50, zoom: 3 },
    { id: 'movil-390x844-ajustes', diseno: true, abrir: ['ajustes'], vp: { width: 390, height: 844, touch: true }, year: 1939, lng: 15, lat: 50, zoom: 3 },
    { id: 'movil-menu-capas', diseno: true, abrir: ['menu-capas'], vp: { width: 390, height: 844, touch: true }, year: 1939, lng: 15, lat: 50, zoom: 3 },
    { id: 'tableta-768x1024-sucesos-ajustes', diseno: true, events: true, abrir: ['ajustes'], vp: { width: 768, height: 1024, touch: true }, year: 1215, lng: 5, lat: 48, zoom: 3.4 },
    // Linea de tiempo compacta (2026-11-13): sus ventanitas abiertas, en tableta (la del creador) y en movil
    { id: 'tableta-834x1194-epocas', diseno: true, abrir: ['epocas'], vp: { width: 834, height: 1194, touch: true }, year: 1500, lng: 10, lat: 45, zoom: 3 },
    { id: 'movil-390x844-info', diseno: true, abrir: ['info-tl'], vp: { width: 390, height: 844, touch: true }, year: 100, lng: 15, lat: 40, zoom: 3 },
    { id: 'portatil-1024x768-todo-abierto', diseno: true, events: true, abrir: ['ajustes', 'ficha'], vp: { width: 1024, height: 768 }, year: 1939, lng: 15, lat: 50, zoom: 4 }
];

async function settle(page) {
    await page.waitForFunction(() => !state.bordersLoading, null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => new Promise((r) => { if (map.loaded()) r(); else map.once('idle', r); }));
    await page.waitForTimeout(3500);
}

// Tiempos REALES (red de verdad, cache frio) de cambiar de epoca: fronteras historicas (descarga + proceso + imagen del hueco) y costas de Pangea.
// Mide por fases desde que se pide el cambio y recoge de cada archivo el tamano transferido (comprimido) y el descomprimido.
async function runTiming(page, out) {
    const rows = [];
    await page.evaluate(() => map.jumpTo({ center: [10, 50], zoom: 4.6 }));
    const one = (label, year, kind) => page.evaluate(async ({ label, year, kind }) => {
        const t0 = performance.now(); const n0 = performance.getEntriesByType('resource').length;
        const prevB = state.borders; const prevL = state.land;
        const waitFor = (fn, ms) => new Promise((res) => { const s = performance.now(); (function p() { if (fn()) return res(Math.round(performance.now() - t0)); if (performance.now() - s > ms) return res(null); setTimeout(p, 10); })(); });
        setTime(yearToYbp(year), { immediate: false });
        const out = { label, year, kind };
        if (kind === 'borders') {
            out.msBordersApplied = await waitFor(() => !state.bordersLoading && state.borders && state.borders !== prevB, 60000);
            // la imagen de franjas es un lienzo (sin PNG): esta lista cuando se muestra y es de la fecha pedida
            out.msGapImage = await waitFor(() => GAP.shown && state.borders && state.borders !== prevB && GAP.year === state.borders.year, 60000);
            out.gapPhases = GAP.t;
        } else {
            out.msLandApplied = await waitFor(() => state.land !== prevL, 60000);
        }
        out.files = performance.getEntriesByType('resource').slice(n0).filter((e) => /geojson\/|paleocoastlines\//.test(e.name)).map((e) => ({ f: e.name.split('/').pop(), transferKB: Math.round(e.transferSize / 1024), encodedKB: Math.round(e.encodedBodySize / 1024), decodedKB: Math.round(e.decodedBodySize / 1024), fetchMs: Math.round(e.duration) }));
        return out;
    }, { label, year, kind });
    for (const [label, year] of [['frio', 1914], ['frio', 1880], ['frio', 1815], ['frio', 1783], ['en-memoria', 1914], ['en-memoria', 1880]]) rows.push(await one(label, year, 'borders'));
    for (const [label, year] of [['pangea', -250e6 + 2000], ['pangea-otro', -120e6 + 2000], ['pangea-otro', -66e6 + 2000]]) rows.push(await one(label, year, 'land'));
    fs.writeFileSync(path.join(out, 'timing.json'), JSON.stringify(rows, null, 2));
}

// Continuidad de lo politico en un cambio de fecha (regla 8: se mide en el render real, con red real). En cada fotograma se leen los pixeles de
// puntos que caen dentro de territorios y se cuenta en cuantos se distingue el color politico del mapa fisico solo (referencia con las fronteras
// ocultas). Si en algun fotograma baja, hay un instante de "geografico sin politico". Salida: continuity.json (minimos y serie comprimida).
async function runContinuity(page, out) {
    const res = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const until = async (fn, ms) => { const s = performance.now(); while (!fn()) { if (performance.now() - s > ms) return false; await sleep(50); } return true; };
        if (state.dark) document.getElementById('btn-theme').click();
        if (BR.off) document.getElementById('btn-borders').click();
        setTime(yearToYbp(1945), { immediate: true }); map.jumpTo({ center: [12, 47], zoom: 4.3, pitch: 0, bearing: 0 });
        if (!(await until(() => state.borders && state.borders.year === 1945 && !state.bordersLoading && GAP.shown && LBL.ready, 60000))) return { error: 'no llego a 1945 con imagen de franjas' };
        await sleep(2500);
        const box = map.getContainer(); const W = box.clientWidth; const H = box.clientHeight; const dpr = window.devicePixelRatio || 1;
        const pts = labelsData(state.borders).features.map((f) => map.project(f.geometry.coordinates)).filter((q) => q.x > W * 0.34 && q.x < W - 30 && q.y > 80 && q.y < H * 0.7).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
        for (let x = Math.round(W * 0.38); x < W - 40; x += 110) for (let y = 100; y < H * 0.68; y += 90) pts.push({ x, y });
        const gl = map.painter.context.gl; const buf = new Uint8Array(4);
        const readPts = () => pts.map((q) => { gl.readPixels(Math.round(q.x * dpr), Math.round(gl.drawingBufferHeight - q.y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf); return [buf[0], buf[1], buf[2]]; });
        const grab = () => new Promise((resolve) => { const h = () => { map.off('render', h); resolve(readPts()); }; map.on('render', h); map.triggerRepaint(); });
        const base = await grab();
        document.getElementById('btn-borders').click(); await sleep(1500); const phys = await grab(); document.getElementById('btn-borders').click(); await sleep(1500);
        const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        const land = base.map((c, k) => dist(c, phys[k]) > 40); const nLand = land.filter(Boolean).length;
        if (nLand < 10) return { error: 'pocos puntos donde se distinga politico de fisico: ' + nLand, W, H };
        const tinted = (px) => px.reduce((n, c, k) => n + (land[k] && dist(c, phys[k]) > 40 ? 1 : 0), 0) / nLand;
        const record = async (label, year, doneFn) => {
            const frames = []; const t0 = performance.now(); let loop = true;
            const onRender = () => frames.push({ t: Math.round(performance.now() - t0), pct: Math.round(tinted(readPts()) * 100), src: map.isSourceLoaded('borders'), gap: GAP.shown, by: state.borders && state.borders.year, load: state.bordersLoading, swap: Boolean(BR.swap) });
            map.on('render', onRender); (function tick() { if (!loop) return; map.triggerRepaint(); requestAnimationFrame(tick); })();
            setTime(yearToYbp(year), { immediate: false });
            const ok = await until(doneFn, 60000); await sleep(1500);
            loop = false; map.off('render', onRender);
            const series = []; let prev = ''; for (const f of frames) { const k = [f.pct, f.src, f.gap, f.by, f.load, f.swap].join('|'); if (k !== prev) { series.push(f); prev = k; } }
            return { label, year, completed: ok, frames: frames.length, minPct: frames.length ? Math.min(...frames.map((f) => f.pct)) : null, series };
        };
        const cold = state.polities.filter((p) => p.year > 1300 && p.year < 1715 && !cache.has(CFG.hbBase + 'geojson/' + p.file)).map((p) => p.year);
        const out = { W, H, points: pts.length, pointsWithPolitics: nLand, basePct: Math.round(tinted(base) * 100), runs: [] };
        if (cold.length) out.runs.push(await record('frio', cold[0], () => state.borders && state.borders.year !== 1945 && GAP.shown && !state.bordersLoading && !BR.swap));
        out.runs.push(await record('en-memoria', 1945, () => state.borders && state.borders.year === 1945 && GAP.shown && !state.bordersLoading && !BR.swap));
        return out;
    });
    fs.writeFileSync(path.join(out, 'continuity.json'), JSON.stringify(res, null, 2));
}

async function runSuite(page, out, only) {
    const rows = [];
    for (const dark of [true, false]) {
        await page.evaluate((d) => { if (state.dark !== d) document.getElementById('btn-theme').click(); }, dark);
        for (const v of SUITE.filter((x) => (only === 'diseno' ? x.diseno : only === 'costa' ? x.costa : (!x.diseno && (!only || (only === 'iconos' ? x.events : x.names)))))) {
            if (v.vp) { await page.setViewportSize({ width: v.vp.width, height: v.vp.height }); await page.waitForTimeout(800); }
            await page.evaluate(([y]) => setTime(yearToYbp(y), { immediate: true }), [v.year]);
            await page.evaluate(([a, b, z]) => map.jumpTo({ center: [a, b], zoom: z }), [v.lng, v.lat, v.zoom]);
            if (v.hide) await page.evaluate(() => { if (!BR.off) document.getElementById('btn-borders').click(); });
            if (v.roads) await page.evaluate(() => { if (!ROADS.on) document.getElementById('btn-roads').click(); });
            if (v.events) { await page.evaluate(() => { if (!events.open) document.getElementById('btn-events').click(); }); await page.waitForFunction(() => events.shown.length > 0, null, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(1500); }
            let ventana; let barrido; let tiposInfo;
            if (v.tipos) tiposInfo = await page.evaluate((hid) => { panelsUI.setSettingsOpen(true); typesSet(ChronosEventIcons.hiddenToMask(hid), false); typesRender(); return { mascara: etMask, casilleros: document.querySelectorAll('#st-types input').length, marcados: [...document.querySelectorAll('#st-types input')].filter((c) => c.checked).length }; }, v.tipos);
            if (v.barrido) {
                await page.waitForFunction(() => Number.isFinite(clock.jd), null, { timeout: 30000 }).catch(() => {});
                const ini = await page.evaluate(() => {
                    eventIconsAnimate(true); const jd0 = clock.jd; const sel = document.getElementById('key-step'); sel.value = '10y'; sel.dispatchEvent(new Event('change'));
                    const sl = document.getElementById('slider'); sl.focus(); sl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
                    return { jd0, activo: glideOn(), destino: glide.target(), anioIni: ChronosSky.jdToCalendar(jd0, 'auto').year };
                });
                await page.waitForTimeout(1100);
                const medio = await page.evaluate(() => ({ jd: clock.jd, activo: glideOn(), mostrados: events.shown.length, ventana: EV_ENTER.win, anio: ChronosSky.jdToCalendar(clock.jd, 'auto').year, toasts: events.toasts.size }));
                await page.screenshot({ path: path.join(out, v.id + (dark ? '-oscuro' : '-claro') + '-medio.png') });
                const fin = await page.evaluate(async () => { await new Promise((r) => { const iv = setInterval(() => { if (!glideOn()) { clearInterval(iv); r(); } }, 60); setTimeout(() => { clearInterval(iv); r(); }, 8000); }); await new Promise((r) => setTimeout(r, 1800)); return { jd: clock.jd, activo: glideOn(), anio: ChronosSky.jdToCalendar(clock.jd, 'auto').year, mostrados: events.shown.length, ventana: EV_ENTER.win }; });
                await page.evaluate(() => eventIconsAnimate(false));
                barrido = { ini, medio, fin, llegoExacto: fin.jd === ini.destino };
            }
            if (v.abrir) await page.evaluate((a) => {
                if (a.includes('ajustes')) panelsUI.setSettingsOpen(true);
                if (a.includes('ficha')) showInfo('Ficha de prueba con un titulo largo', Array.from({ length: 10 }, (_, i) => ({ label: 'Campo ' + i, value: 'valor de ejemplo '.repeat(4) })));
                if (a.includes('menu-capas')) document.getElementById('menu-layers-btn').click();
                if (a.includes('epocas')) document.getElementById('tl-jumps-btn').click();     // saltos de la linea de tiempo, cada uno con su epoca
                if (a.includes('info-tl')) document.getElementById('tl-info-btn').click();     // lo que ves ahora + fuentes y licencias
            }, v.abrir);
            if (v.run) await page.waitForFunction(() => Number.isFinite(clock.jd), null, { timeout: 30000 }).catch(() => {});   // el cielo (efemerides) carga aparte
            if (v.run) {   // el reloj avanza por su punto de entrada real (clockSet) a v.yearsPerSec; se mide la ventana y se fotografia sin esperar (al parar, la ventana vuelve a la minima en ~2,5 s)
                ventana = await page.evaluate(async (yps) => {
                    const YEAR = 31557600; let last = performance.now(); const rates = []; const sinReloj = !Number.isFinite(clock.jd);
                    if (sinReloj) return { sinReloj };
                    const jd0 = clock.jd;
                    for (let i = 0; i < 60; i++) {
                        await new Promise((r) => setTimeout(r, 100)); const now = performance.now(); const dt = (now - last) / 1000; last = now;
                        clockSet(clock.jd + yps * YEAR * dt / 86400, { tick: true }); rates.push(Math.round(evMotion.rate(performance.now()) / YEAR * 100) / 100);
                    }
                    eventsRefresh(); await new Promise((r) => setTimeout(r, 500));
                    const imp = events.shown.map((f) => f.properties.importance); const fades = [...new Set([...EV_ENTER.meta.values()].map((m) => m.alpha))].sort();
                    return { avanzoAnios: Math.round((clock.jd - jd0) / 365.25 * 100) / 100, tasaFinal: rates[rates.length - 1], ventana: EV_ENTER.win, dibujados: events.shown.length, impMin: imp.length ? Math.min(...imp) : null, niveles: fades };
                }, v.yearsPerSec);
            } else await settle(page);
            const name = v.id + (dark ? '-oscuro' : '-claro');
            await page.screenshot({ path: path.join(out, name + '.png') });
            // Que rotulos se dibujan de verdad: por capa de origen y clase (el hecho que importa con las fronteras apagadas; no se deduce de la imagen)
            const labels = await page.evaluate(() => {
                const ids = map.getStyle().layers.filter((l) => l.type === 'symbol' && l.id.startsWith('ofm-') && map.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
                const by = {}; if (!ids.length) return by;
                for (const f of map.queryRenderedFeatures({ layers: ids })) { const k = (f.sourceLayer || '?') + ':' + (f.properties.class || '-'); (by[k] = by[k] || new Set()).add(f.properties['name:latin'] || f.properties.name || '(sin nombre)'); }
                return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.size, ejemplos: [...v].slice(0, 6) }]));
            });
            const road = await page.evaluate(() => {
                const ids = map.getStyle().layers.filter((l) => l.id.startsWith('ofm-') && ['transportation', 'transportation_name'].includes(l['source-layer'])).map((l) => l.id);
                const vis = ids.filter((i) => map.getLayoutProperty(i, 'visibility') !== 'none');
                return { btnHidden: document.getElementById('btn-roads').hidden, on: ROADS.on, capas: ids.length, visibles: vis.length, dibujados: vis.length ? map.queryRenderedFeatures({ layers: vis }).length : 0 };
            });
            const ev = v.events ? await page.evaluate(() => {
                const q = (l) => map.queryRenderedFeatures({ layers: [l] });
                const feats = [...q('events-icon-bob'), ...q('events-icon-shake')]; const por = {};
                feats.forEach((f) => { por[f.properties.icon] = (por[f.properties.icon] || 0) + 1; });
                return { dibujados: events.shown.length, iconos: feats.length, por, capas: ['events-dot', 'events-pulse', 'events-icon-bob', 'events-icon-shake', 'events-circle'].map((l) => l + ':' + (map.getLayer(l) ? 'si' : 'NO')).join(' '), animacion: EVA.on };
            }) : undefined;
            const diseno = v.diseno ? await page.evaluate(() => {
                const sel = ['#topbar', '#events', '#changes', '#sky', '#settings', '#info', '#status', '#space-note', '#timeline', '#toasts .toast', '#menu-layers-pop', '.maplibregl-ctrl-bottom-right'];
                const bx = {}; sel.forEach((q) => { const e = document.querySelector(q); if (!e) return; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 2 || r.height < 2) return; bx[q] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; });
                const nombres = Object.keys(bx); const solapes = [];
                for (let i = 0; i < nombres.length; i++) for (let j = i + 1; j < nombres.length; j++) { const a = bx[nombres[i]], b = bx[nombres[j]]; if (nombres[i] === '#menu-layers-pop' || nombres[j] === '#menu-layers-pop') continue; if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1) solapes.push(nombres[i] + ' x ' + nombres[j]); }
                const cs = getComputedStyle(document.body);
                return { epoca: document.body.getAttribute('data-era'), insignia: document.getElementById('era-badge').hidden ? null : document.getElementById('era-badge').textContent, acento: cs.getPropertyValue('--accent').trim(), borde: getComputedStyle(document.getElementById('timeline')).borderTopStyle, mar: map.getPaintProperty('ocean', 'background-color'), puntos: map.getLayer('events-dot') ? map.getPaintProperty('events-dot', 'circle-stroke-color') : null, ventana: [innerWidth, innerHeight], cajas: bx, solapes };
            }) : undefined;
            rows.push({ name, ...(diseno ? { diseno } : {}), labels, road, ...(ev ? { eventos: ev } : {}), ...(ventana ? { ventana } : {}), ...(barrido ? { barrido } : {}), ...(tiposInfo ? { tipos: tiposInfo } : {}), ...(await page.evaluate(() => ({ z: map.getZoom(), detail: DETAIL.shown, gap: GAP.shown, borders: state.borders && state.borders.source, cut: BR.cut, far: BR.far, off: BR.off, natural: NAT.on, natFailed: NAT.failed, sphereCover: BR.cover === null ? null : Math.round(BR.cover * 1000) / 1000, lbl: LBL.ready ? map.getLayoutProperty('borders-labels', 'visibility') : (LBL.failed ? 'failed' : 'n/a'), lblFont: LBL.font || null, ofmCountryLayers: DETAIL.layers.filter((l) => l.country).length, ofmCountryShown: DETAIL.layers.filter((l) => l.country && map.getLayoutProperty(l.id, 'visibility') === 'visible').length, resKm: BR.resKm, btn: !document.getElementById('btn-borders').hidden, status: document.getElementById('status').textContent.slice(0, 200) }))) });
            if (v.roads) await page.evaluate(() => { if (ROADS.on) document.getElementById('btn-roads').click(); });
            if (v.tipos) await page.evaluate(() => { typesSet(0, false); typesRender(); panelsUI.setSettingsOpen(false); });
            if (v.abrir) await page.evaluate(() => { panelsUI.setSettingsOpen(false); hideInfo(); menus.closeAll(); });
            if (v.vp) { await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(500); }
            if (v.events) await page.evaluate(() => { if (events.open) document.getElementById('btn-events').click(); });
            fs.writeFileSync(path.join(out, 'suite.json'), JSON.stringify(rows, null, 2));   // parcial: si el proceso muere, queda lo medido hasta aqui
            if (v.hide) await page.evaluate(() => { if (BR.off) document.getElementById('btn-borders').click(); });
        }
    }
    if (only) { fs.writeFileSync(path.join(out, 'suite.json'), JSON.stringify(rows, null, 2)); return; }   // modos `nombres` e `iconos`: solo esas vistas
    try { await runTiming(page, out); } catch (e) { fs.writeFileSync(path.join(out, 'timing-error.txt'), String(e)); }
    try { await runContinuity(page, out); } catch (e) { fs.writeFileSync(path.join(out, 'continuity-error.txt'), String(e)); }
    // Alejar el zoom del globo (sin boton ni modo): del zoom minimo del mapa hacia el sistema solar, y a otros cuerpos. Claro y oscuro no cambian el espacio.
    await page.evaluate(() => { if (!state.dark) document.getElementById('btn-theme').click(); setTime(yearToYbp(2026), { immediate: true }); map.jumpTo({ center: [-3.7, 40.4], zoom: map.getMinZoom(), bearing: 0, pitch: 0 }); });
    await page.waitForTimeout(2500);
    const idle = () => page.evaluate(() => new Promise((res) => { const t = setTimeout(res, 15000); map.once('idle', () => { clearTimeout(t); requestAnimationFrame(() => requestAnimationFrame(res)); }); map.triggerRepaint(); }));
    const shotSolar = async (n) => { await page.waitForFunction(() => !solarView.state.flight && !solarView.state.raf, null, { timeout: 60000 }).catch(() => {}); await idle(); try { await page.screenshot({ path: path.join(out, 'solar-' + n + '.png'), timeout: 120000 }); } catch (e) { rows.push({ name: 'solar-' + n, error: 'captura: ' + e.message.split('\n')[0] }); return; } rows.push({ name: 'solar-' + n, open: await page.evaluate(() => solarView.isOpen), status: await page.evaluate(() => (document.getElementById('solar-info') ? document.getElementById('solar-info').innerText.slice(0, 300) : '')) }); };
    await shotSolar('0-mapa');
    for (const [n, step] of [['1-umbral', 0.0002], ['2-luna', 0.45], ['3-sol', 0.9], ['4-interior', 0.7], ['5-sistema', 0.9]]) { await page.evaluate((d) => solarZoomOut(d), step); await shotSolar(n); }
    for (const [n, fn] of [['sistema', () => solarView.goSystem()], ['jupiter', () => solarView.goTo('Jupiter')], ['luna', () => solarView.goTo('Moon')], ['sol', () => solarView.goTo('Sun')], ['tierra', () => solarView.goTo('Earth')]]) { await page.evaluate(fn); await shotSolar(n); }
    await page.evaluate(() => { map.jumpTo({ zoom: map.getMinZoom() }); setTime(yearToYbp(1492), { immediate: true }); solarZoomOut(0.9); }); await page.waitForTimeout(2000); await shotSolar('1492');
    await page.evaluate(() => { solarView.close(); setTime(yearToYbp(-5000), { immediate: true }); map.jumpTo({ zoom: map.getMinZoom() }); solarZoomOut(0.3); }); await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(out, 'solar-fuera-de-ventana.png'), timeout: 120000 });
    fs.writeFileSync(path.join(out, 'suite.json'), JSON.stringify(rows, null, 2));
}

(async () => {
    const url = process.argv[2]; const out = process.argv[3];
    const diag = process.argv.length > 4;
    const [lng, lat, zoom] = [process.argv[4] || -1.35, process.argv[5] || 43.05, process.argv[6] || 11].map(Number);
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Un mensaje repetido se guarda UNA vez con su recuento: un bucle de errores en la pagina agoto la memoria de este proceso (4 GB) y se perdio toda la captura
    const log = []; const counts = new Map();
    const note = (msg) => { const c = counts.get(msg) || 0; counts.set(msg, c + 1); if (c === 0 && log.length < 300) log.push(msg); };
    page.on('pageerror', (e) => note('PAGEERROR ' + String(e.message).slice(0, 300)));
    // Diagnostico: el proceso murio por memoria SIN que el recuento de errores creciera: se cuentan TODOS los mensajes de consola (tipo + texto), se vuelcan a disco cada 3 s
    // (sobrevive a una muerte por memoria) y, si hay una inundacion, se corta con el culpable ya escrito.
    const all = new Map(); let total = 0; const dump = () => { try { fs.writeFileSync(path.join(out, 'console-counts.json'), JSON.stringify({ total, top: [...all].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([m, n]) => ({ n, m })) }, null, 2)); } catch (e) { /* nada */ } };
    setInterval(dump, 3000).unref();
    page.on('console', (m) => {
        const k = m.type() + ' ' + m.text().slice(0, 160); total++; if (all.size < 5000 || all.has(k)) all.set(k, (all.get(k) || 0) + 1);
        if (m.type() === 'error') note('CONSOLE ' + m.text().slice(0, 200));
        if (total > 300000) { dump(); console.error('INUNDACION de consola: ' + total); process.exit(3); }
    });
    globalThis.__logCounts = () => [...counts].filter(([, c]) => c > 1).map(([m, c]) => ({ n: c, m }));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.land && typeof map !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(() => { if (window.eventIconsAnimate) eventIconsAnimate(false); });   // la animacion de los iconos impide que el mapa llegue a idle: las capturas son de un fotograma fijo
    if (process.argv[4] === 'nombres' || process.argv[4] === 'iconos' || process.argv[4] === 'diseno' || process.argv[4] === 'costa') { await runSuite(page, out, process.argv[4] === 'iconos' ? 'iconos' : process.argv[4] === 'diseno' ? 'diseno' : process.argv[4] === 'costa' ? 'costa' : true); fs.writeFileSync(path.join(out, 'shot.log.json'), JSON.stringify({ log, repetidos: globalThis.__logCounts() }, null, 2)); await browser.close(); return; }
    if (!diag) { await runSuite(page, out); await browser.close(); return; }
    await page.evaluate(() => { if (!state.dark) document.getElementById('btn-theme').click(); setTime(yearToYbp(2026), { immediate: true }); });
    await page.evaluate(([a, b, z]) => map.jumpTo({ center: [a, b], zoom: z }), [lng, lat, zoom]);
    await page.waitForFunction(() => !state.bordersLoading, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => new Promise((r) => { if (map.loaded()) r(); else map.once('idle', r); }));
    await page.waitForTimeout(4000);
    const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(out, name + '.png') }); };
    const info = await page.evaluate(() => ({
        zoom: map.getZoom(), detail: DETAIL.shown, gap: GAP.shown, borders: state.borders && state.borders.source,
        layers: map.getStyle().layers.map((l) => l.id + (map.getLayoutProperty(l.id, 'visibility') === 'none' ? ' (oculta)' : ''))
    }));
    // Que hay dibujado en puntos concretos de pantalla (capa + propiedades), y como son las capas de linea del detalle.
    const probes = await page.evaluate(() => {
        const pts = { banda: [330, 380], interior_francia: [560, 300], linea_interior: [352, 360], espana: [150, 450], cuña_espana: [700, 300] };
        const res = {};
        for (const [k, [x, y]] of Object.entries(pts)) {
            res[k] = map.queryRenderedFeatures([[x - 3, y - 3], [x + 3, y + 3]]).filter((f) => !/^ofm-(landuse|landcover)/.test(f.layer.id) || true)
                .map((f) => f.layer.id + ' | ' + (f.sourceLayer || f.source) + ' | ' + JSON.stringify(f.properties).slice(0, 160));
        }
        const lines = map.getStyle().layers.filter((l) => l.type === 'line' && l.id.startsWith('ofm-')).map((l) => ({ id: l.id, sl: l['source-layer'], filter: l.filter || null, dash: l.paint && l.paint['line-dasharray'] || null, vis: map.getLayoutProperty(l.id, 'visibility') }));
        const inner = map.querySourceFeatures('borders-inner').map((f) => ({ key: f.properties.key, n: f.geometry.coordinates.length, type: f.geometry.type }));
        return { res, lines, inner: inner.slice(0, 30), nInner: inner.length };
    });
    fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ info, probes, log, repetidos: globalThis.__logCounts() }, null, 2));
    await shot('1-completa-oscuro');
    const variants = [
        ['2-sin-relleno-gap', () => { map.setLayoutProperty('gap-raster', 'visibility', 'none'); map.setPaintProperty('borders-fill', 'fill-opacity', ['get', '_o']); }],
        ['3-sin-gap-ni-poligonos', () => { map.setLayoutProperty('borders-fill', 'visibility', 'none'); }],
        ['4-sin-linea-ne', () => { map.setLayoutProperty('borders-line', 'visibility', 'none'); }],
        ['5-sin-parques-ni-limites-ofm', () => { map.getStyle().layers.filter((l) => l.id.startsWith('ofm-') && (l['source-layer'] === 'park' || l['source-layer'] === 'boundary' || /park|boundary/.test(l.id))).forEach((l) => map.setLayoutProperty(l.id, 'visibility', 'none')); }],
        ['6-solo-fondo-ofm', () => { map.getStyle().layers.filter((l) => l.id.startsWith('ofm-') && l.type !== 'background').forEach((l) => map.setLayoutProperty(l.id, 'visibility', 'none')); }],
    ];
    for (const [name, fn] of variants) { await page.evaluate(fn); await shot(name); }
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
