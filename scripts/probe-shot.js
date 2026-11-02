#!/usr/bin/env node
// probe-shot.js - Fotografia la web REAL publicada (OpenFreeMap + datos reales) en una vista concreta, con variantes que
// apagan capas una a una para localizar de que capa viene un artefacto grafico. Solo diagnostico: no toca datos.
//   node scripts/probe-shot.js <url> <carpeta-salida> [lng lat zoom]
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    const url = process.argv[2]; const out = process.argv[3];
    const [lng, lat, zoom] = [process.argv[4] || -1.35, process.argv[5] || 43.05, process.argv[6] || 11].map(Number);
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const log = [];
    page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') log.push('CONSOLE ' + m.text().slice(0, 200)); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.land && typeof map !== 'undefined', null, { timeout: 60000 });
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
