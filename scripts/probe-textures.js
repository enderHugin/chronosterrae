#!/usr/bin/env node
/* probe-textures.js - Sonda de fuentes de texturas planetarias (regla 6: no se supone nada de una URL externa).
 * Hace tres cosas, sin descargar archivos grandes:
 *   1. Lista los enlaces de paginas oficiales (SVS, USGS, Photojournal) para descubrir los nombres reales de archivo.
 *   2. Lista el indice de https://planetarymaps.usgs.gov/mosaic/ (si es un indice de directorio).
 *   3. Para cada URL candidata: estado HTTP, tipo, tamano y cabecera Access-Control-Allow-Origin.
 * Salida: JSON en stdout, progreso en stderr. Solo Node 18+, sin dependencias. */
'use strict';
// 2026-11-12 (2a ronda): la 1a dio 200 text/html para GIBS WMS con HEAD (un CGI no responde a HEAD como a GET) y solo
// paginas sin mapas o con licencias no comerciales para Saturno/Urano/Neptuno (Steve Albers: "personal non-commercial use only";
// Bjorn Jonsson en planetary.org: CC BY-NC-ND). Esta ronda: GET real (se leen los primeros bytes para ver si es JPEG/PNG o un
// error XML/HTML) y paginas de NASA y de otras fuentes cuya licencia hay que leer, no suponer.
const PAGES = [
    'https://science.nasa.gov/3d-resources/',
    'https://www.solarsystemscope.com/textures/',
    'https://photojournal.jpl.nasa.gov/target/saturn',
    'https://photojournal.jpl.nasa.gov/target/uranus',
    'https://photojournal.jpl.nasa.gov/target/neptune',
    'https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/'
];
const INDEXES = [];
const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024&STYLES=&';
const CANDIDATES = [
    WMS + 'VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=-90,-180,90,180',
    WMS + 'VERSION=1.1.1&LAYERS=BlueMarble_ShadedRelief_Bathymetry&SRS=EPSG:4326&BBOX=-180,-90,180,90',
    WMS + 'VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&CRS=EPSG:4326&BBOX=-90,-180,90,180',
    WMS + 'VERSION=1.1.1&LAYERS=BlueMarble_NextGeneration&SRS=EPSG:4326&BBOX=-180,-90,180,90',
    // la misma capa por WMTS (lo que ya usa el mapa, en 3857): una tesela del nivel 0 en 4326
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/0/0/0.jpeg',
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/0/0/0.jpeg'
];
// Para leer licencias y capas sin bajar todo: GetCapabilities del WMS (se extraen las capas BlueMarble y su <Abstract>/<Attribution>)
const CAPS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0';
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
const KEYWORDS = /saturn|uranus|neptune|earth|blue.?marble|texture|map|cylindr|license|licen|terms|copyright|usage|creative/i;
const interesting = (u) => !/favicon|apple-touch-icon|\.css(\?|$)|\.js(\?|$)|wp-json/i.test(u) && (KEYWORDS.test(u) || /\.(tif|tiff|jpg|jpeg|png|exr|lbl|cub|img|pdf|zip|txt|tab|csv)(\?|$)/i.test(u) || /planetarymaps|astropedia|assets\.science|svs\.gsfc|eoimages|photojournal|license|creative|copyright|usage/i.test(u));
(async () => {
    const report = { when: new Date().toISOString(), pages: [], indexes: [], candidates: [] };
    for (const p of PAGES) {
        log('pagina', p);
        const { r, err, ms } = await get(p);
        if (!r) { report.pages.push({ url: p, error: err, ms }); continue; }
        const html = await r.text();
        const lic = [...html.replace(/<[^>]+>/g, ' ').matchAll(/[^.]{0,160}(licen[cs]e|copyright|public domain|dominio p|courtesy|credit|attribution|terms of use|CC BY|non-?commercial)[^.]{0,200}/gi)].slice(0, 14).map((m) => m[0].replace(/\s+/g, ' ').trim());
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
        // GET real: se leen la cabecera y el cuerpo (como mucho 40 MB) y se mira la firma (JPEG FFD8FF, PNG 89504E47) y, si es texto, su inicio
        const { r, err, ms } = await get(u);
        if (!r) { report.candidates.push({ url: u, error: err, ms }); continue; }
        const h = (k) => r.headers.get(k);
        let size = 0, head = Buffer.alloc(0), dims = null;
        try {
            const buf = Buffer.from(await r.arrayBuffer()); size = buf.length; head = buf.subarray(0, 600);
            if (buf[0] === 0xff && buf[1] === 0xd8) {   // JPEG: dimensiones del primer SOFn
                for (let i = 2; i < buf.length - 9;) {
                    if (buf[i] !== 0xff) { i++; continue; }
                    const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
                    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { dims = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; }
                    i += 2 + len;
                }
            } else if (buf.readUInt32BE(0) === 0x89504e47) dims = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
        } catch (e) { report.candidates.push({ url: u, status: r.status, error: 'cuerpo: ' + String(e.message), ms }); continue; }
        const magic = head.subarray(0, 4).toString('hex');
        const kind = magic.startsWith('ffd8ff') ? 'jpeg' : magic === '89504e47' ? 'png' : 'otro';
        report.candidates.push({ url: u, finalUrl: r.url, status: r.status, ms, contentType: h('content-type'), bytes: size, magic, kind, dims,
            text: kind === 'otro' ? head.toString('utf8').replace(/\s+/g, ' ').slice(0, 500) : null, acao: h('access-control-allow-origin'), lastModified: h('last-modified') });
    }
    {
        log('capacidades', CAPS);
        const { r, err, ms } = await get(CAPS);
        if (!r) report.capabilities = { error: err, ms };
        else {
            const xml = await r.text();
            const layers = [...xml.matchAll(/<Layer[^>]*>\s*<Name>(BlueMarble[^<]*)<\/Name>([\s\S]*?)<\/Layer>/g)].map((m) => ({
                name: m[1], title: (m[2].match(/<Title>([^<]*)/) || [])[1] || null, abstract: ((m[2].match(/<Abstract>([\s\S]*?)<\/Abstract>/) || [])[1] || '').slice(0, 600),
                attribution: ((m[2].match(/<Attribution>([\s\S]*?)<\/Attribution>/) || [])[1] || '').replace(/\s+/g, ' ').slice(0, 400),
                formats: null }));
            const access = ((xml.match(/<AccessConstraints>([\s\S]*?)<\/AccessConstraints>/) || [])[1] || '').slice(0, 400);
            const fees = ((xml.match(/<Fees>([\s\S]*?)<\/Fees>/) || [])[1] || '').slice(0, 200);
            const getmapFormats = (((xml.match(/<GetMap>([\s\S]*?)<\/GetMap>/) || [])[1] || '').match(/<Format>[^<]*<\/Format>/g) || []).map((f) => f.replace(/<\/?Format>/g, ''));
            report.capabilities = { status: r.status, ms, bytes: xml.length, access, fees, getmapFormats, layers };
        }
    }
    process.stdout.write(JSON.stringify(report, null, 1) + '\n');
})().catch((e) => { log('fallo', e && e.stack || e); process.exit(1); });
