#!/usr/bin/env node
/* probe-textures.js - Sonda de fuentes de texturas planetarias (regla 6: no se supone nada de una URL externa).
 * Hace tres cosas, sin descargar archivos grandes:
 *   1. Lista los enlaces de paginas oficiales (SVS, USGS, Photojournal) para descubrir los nombres reales de archivo.
 *   2. Lista el indice de https://planetarymaps.usgs.gov/mosaic/ (si es un indice de directorio).
 *   3. Para cada URL candidata: estado HTTP, tipo, tamano y cabecera Access-Control-Allow-Origin.
 * Salida: JSON en stdout, progreso en stderr. Solo Node 18+, sin dependencias. */
'use strict';
// 2026-11-12: Tierra vista de lejos (Blue Marble) y mapas globales de Saturno, Urano y Neptuno. Las anteriores (Mercurio, lunas de
// Jupiter...) ya estan comprobadas y construidas (ver manifest.json); esta ronda solo busca lo que falta.
const PAGES = [
    'https://svs.gsfc.nasa.gov/12564/',
    'https://www.visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography',
    'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/',
    'https://photojournal.jpl.nasa.gov/catalog/PIA00046',
    'https://photojournal.jpl.nasa.gov/catalog/PIA01492',
    'https://photojournal.jpl.nasa.gov/catalog/PIA00011',
    'https://photojournal.jpl.nasa.gov/catalog/PIA14914',
    'https://www.planetary.org/space-images/neptune_voyager_global_bjorn',
    'https://www.planetary.org/articles/1210-revisiting-uranus-with-voyager-2',
    'https://stevealbers.net/albers/sos/sos.html'
];
const INDEXES = [];
// GIBS (el mismo servicio que ya da las imagenes del mapa): la capa Blue Marble entera en una sola imagen 2048x1024 equirectangular
const CANDIDATES = [
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg',
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg'
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
const interesting = (u) => /\.(tif|tiff|jpg|jpeg|png|exr|lbl|cub|img|pdf|zip|txt|tab|csv)(\?|$)/i.test(u) || /planetarymaps|astropedia|assets\.science|svs\.gsfc|eoimages|photojournal|license|creative|copyright|usage/i.test(u);
(async () => {
    const report = { when: new Date().toISOString(), pages: [], indexes: [], candidates: [] };
    for (const p of PAGES) {
        log('pagina', p);
        const { r, err, ms } = await get(p);
        if (!r) { report.pages.push({ url: p, error: err, ms }); continue; }
        const html = await r.text();
        const lic = [...html.replace(/<[^>]+>/g, ' ').matchAll(/[^.]{0,160}(licen[cs]e|copyright|public domain|dominio p|courtesy|credit)[^.]{0,200}/gi)].slice(0, 8).map((m) => m[0].replace(/\s+/g, ' ').trim());
        report.pages.push({ url: p, status: r.status, ms, bytes: html.length, title: (html.match(/<title>([^<]*)/i) || [])[1] || null, license: lic, links: links(html, r.url).filter(interesting).slice(0, 400) });
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
