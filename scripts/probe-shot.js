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
    { id: 'europa-1945', year: 1945, lng: 12, lat: 50, zoom: 4 },
    { id: 'mediterraneo-9010aC', year: -9010, lng: 20, lat: 38, zoom: 5 },
    { id: 'costa-9010aC-zoom', year: -9010, lng: 2.5, lat: 41.2, zoom: 9 },
    { id: 'globo-2026', year: 2026, lng: 0, lat: 20, zoom: 1.4 },
    { id: 'pangea-250Ma', year: -250e6 + 2000, lng: 0, lat: 0, zoom: 1.4 }
];

async function settle(page) {
    await page.waitForFunction(() => !state.bordersLoading, null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => new Promise((r) => { if (map.loaded()) r(); else map.once('idle', r); }));
    await page.waitForTimeout(3500);
}

async function runSuite(page, out) {
    const rows = [];
    for (const dark of [true, false]) {
        await page.evaluate((d) => { if (state.dark !== d) document.getElementById('btn-theme').click(); }, dark);
        for (const v of SUITE) {
            await page.evaluate(([y]) => setTime(yearToYbp(y), { immediate: true }), [v.year]);
            await page.evaluate(([a, b, z]) => map.jumpTo({ center: [a, b], zoom: z }), [v.lng, v.lat, v.zoom]);
            await settle(page);
            const name = v.id + (dark ? '-oscuro' : '-claro');
            await page.screenshot({ path: path.join(out, name + '.png') });
            rows.push({ name, ...(await page.evaluate(() => ({ z: map.getZoom(), detail: DETAIL.shown, gap: GAP.shown, borders: state.borders && state.borders.source, status: document.getElementById('status').textContent.slice(0, 200) }))) });
        }
    }
    // Alejar el zoom del globo (sin boton ni modo): del zoom minimo del mapa hacia el sistema solar, y a otros cuerpos. Claro y oscuro no cambian el espacio.
    await page.evaluate(() => { if (!state.dark) document.getElementById('btn-theme').click(); setTime(yearToYbp(2026), { immediate: true }); map.jumpTo({ center: [-3.7, 40.4], zoom: map.getMinZoom(), bearing: 0, pitch: 0 }); });
    await page.waitForTimeout(2500);
    const idle = () => page.evaluate(() => new Promise((res) => { const t = setTimeout(res, 15000); map.once('idle', () => { clearTimeout(t); requestAnimationFrame(() => requestAnimationFrame(res)); }); map.triggerRepaint(); }));
    const shotSolar = async (n) => { await page.waitForFunction(() => !solarView.state.flight && !solarView.state.raf, null, { timeout: 60000 }).catch(() => {}); await idle(); await page.screenshot({ path: path.join(out, 'solar-' + n + '.png') }); rows.push({ name: 'solar-' + n, open: await page.evaluate(() => solarView.isOpen), status: await page.evaluate(() => (document.getElementById('solar-info') ? document.getElementById('solar-info').innerText.slice(0, 300) : '')) }); };
    await shotSolar('0-mapa');
    for (const [n, step] of [['1-umbral', 0.0002], ['2-luna', 0.45], ['3-sol', 0.9], ['4-interior', 0.7], ['5-sistema', 0.9]]) { await page.evaluate((d) => solarZoomOut(d), step); await shotSolar(n); }
    for (const [n, fn] of [['sistema', () => solarView.goSystem()], ['jupiter', () => solarView.goTo('Jupiter')], ['luna', () => solarView.goTo('Moon')], ['sol', () => solarView.goTo('Sun')], ['tierra', () => solarView.goTo('Earth')]]) { await page.evaluate(fn); await shotSolar(n); }
    await page.evaluate(() => { map.jumpTo({ zoom: map.getMinZoom() }); setTime(yearToYbp(1492), { immediate: true }); solarZoomOut(0.9); }); await page.waitForTimeout(2000); await shotSolar('1492');
    await page.evaluate(() => { solarView.close(); setTime(yearToYbp(-5000), { immediate: true }); map.jumpTo({ zoom: map.getMinZoom() }); solarZoomOut(0.3); }); await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(out, 'solar-fuera-de-ventana.png') });
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
