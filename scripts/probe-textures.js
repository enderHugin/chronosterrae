#!/usr/bin/env node
/* probe-textures.js - Sonda de fuentes de texturas planetarias (regla 6: no se supone nada de una URL externa).
 * Hace tres cosas, sin descargar archivos grandes:
 *   1. Lista los enlaces de paginas oficiales (SVS, USGS, Photojournal) para descubrir los nombres reales de archivo.
 *   2. Lista el indice de https://planetarymaps.usgs.gov/mosaic/ (si es un indice de directorio).
 *   3. Para cada URL candidata: estado HTTP, tipo, tamano y cabecera Access-Control-Allow-Origin.
 * Salida: JSON en stdout, progreso en stderr. Solo Node 18+, sin dependencias. */
'use strict';
const PAGES = [
    'https://svs.gsfc.nasa.gov/4720/',
    'https://svs.gsfc.nasa.gov/4851/',
    'https://astrogeology.usgs.gov/search/map/mercury_messenger_global_mosaic_166m',
    'https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_enhanced_color_global_mosaic_665m',
    'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m',
    'https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_mosaic_2025m',
    'https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/'
];
const INDEXES = ['https://planetarymaps.usgs.gov/mosaic/', 'https://planetarymaps.usgs.gov/'];
const CANDIDATES = [
    'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.jpg',
    'https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_C3-MDIR_Global_Mosaic_2025m.tif',
    'https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_print.jpg',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k.exr',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k_print.jpg'
];
const UA = 'ChronosTerrae-probe/1.0 (+https://github.com/enderHugin/chronosterrae)';
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
async function get(url, init) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, Object.assign({ redirect: 'follow', headers: { 'User-Agent': UA, Origin: 'https://enderhugin.github.io' } }, init));
        return { r, ms: Date.now() - t0 };
    } catch (e) { return { err: String(e && e.cause && e.cause.code || e.message), ms: Date.now() - t0 }; }
}
function links(html, base) {
    const out = new Set();
    for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
        try { out.add(new URL(m[1], base).href); } catch (e) { /* ignorar */ }
    }
    return [...out];
}
const interesting = (u) => /\.(tif|tiff|jpg|jpeg|png|exr|lbl|cub|img|pdf|zip|txt|tab|csv)(\?|$)/i.test(u) || /planetarymaps|astropedia|assets\.science|svs\.gsfc/i.test(u);
(async () => {
    const report = { when: new Date().toISOString(), pages: [], indexes: [], candidates: [] };
    for (const p of PAGES) {
        log('pagina', p);
        const { r, err, ms } = await get(p);
        if (!r) { report.pages.push({ url: p, error: err, ms }); continue; }
        const html = await r.text();
        report.pages.push({ url: p, status: r.status, ms, bytes: html.length, title: (html.match(/<title>([^<]*)/i) || [])[1] || null, links: links(html, r.url).filter(interesting).slice(0, 400) });
    }
    for (const p of INDEXES) {
        log('indice', p);
        const { r, err, ms } = await get(p);
        if (!r) { report.indexes.push({ url: p, error: err, ms }); continue; }
        const html = await r.text();
        report.indexes.push({ url: p, status: r.status, ms, bytes: html.length, contentType: r.headers.get('content-type'), links: links(html, r.url).slice(0, 2000) });
    }
    for (const u of CANDIDATES) {
        log('candidata', u);
        // HEAD y, si no responde bien, GET de 1 byte (Range) para no bajar el archivo
        let { r, err, ms } = await get(u, { method: 'HEAD' });
        if (r && (r.status === 405 || r.status === 403 || r.status === 501)) ({ r, err, ms } = await get(u, { headers: { 'User-Agent': UA, Origin: 'https://enderhugin.github.io', Range: 'bytes=0-0' } }));
        if (!r) { report.candidates.push({ url: u, error: err, ms }); continue; }
        const h = (k) => r.headers.get(k);
        report.candidates.push({ url: u, finalUrl: r.url, status: r.status, ms, contentType: h('content-type'), contentLength: h('content-length'), contentRange: h('content-range'),
            acceptRanges: h('accept-ranges'), acao: h('access-control-allow-origin'), lastModified: h('last-modified') });
    }
    process.stdout.write(JSON.stringify(report, null, 1) + '\n');
})().catch((e) => { log('fallo', e && e.stack || e); process.exit(1); });
