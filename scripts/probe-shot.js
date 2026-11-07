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
    { id: 'pangea-250Ma', year: -250e6 + 2000, lng: 0, lat: 0, zoom: 1.4 }
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

async function runSuite(page, out) {
    const rows = [];
    for (const dark of [true, false]) {
        await page.evaluate((d) => { if (state.dark !== d) document.getElementById('btn-theme').click(); }, dark);
        for (const v of SUITE) {
            await page.evaluate(([y]) => setTime(yearToYbp(y), { immediate: true }), [v.year]);
            await page.evaluate(([a, b, z]) => map.jumpTo({ center: [a, b], zoom: z }), [v.lng, v.lat, v.zoom]);
            if (v.hide) await page.evaluate(() => { if (!BR.off) document.getElementById('btn-borders').click(); });
            await settle(page);
            const name = v.id + (dark ? '-oscuro' : '-claro');
            await page.screenshot({ path: path.join(out, name + '.png') });
            rows.push({ name, ...(await page.evaluate(() => ({ z: map.getZoom(), detail: DETAIL.shown, gap: GAP.shown, borders: state.borders && state.borders.source, cut: BR.cut, far: BR.far, off: BR.off, natural: NAT.on, natFailed: NAT.failed, sphereCover: BR.cover === null ? null : Math.round(BR.cover * 1000) / 1000, lbl: LBL.ready ? map.getLayoutProperty('borders-labels', 'visibility') : (LBL.failed ? 'failed' : 'n/a'), lblFont: LBL.font || null, ofmCountryLayers: DETAIL.layers.filter((l) => l.country).length, ofmCountryShown: DETAIL.layers.filter((l) => l.country && map.getLayoutProperty(l.id, 'visibility') === 'visible').length, resKm: BR.resKm, btn: !document.getElementById('btn-borders').hidden, status: document.getElementById('status').textContent.slice(0, 200) }))) });
            if (v.hide) await page.evaluate(() => { if (BR.off) document.getElementById('btn-borders').click(); });
        }
    }
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
    const log = [];
    page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') log.push('CONSOLE ' + m.text().slice(0, 200)); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.land && typeof map !== 'undefined', null, { timeout: 60000 });
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
    fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ info, probes, log }, null, 2));
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
